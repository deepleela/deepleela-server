import * as WebSocket from 'ws';
import { Command, Controller, Response } from '@sabaki/gtp';
import { EventEmitter } from 'events';
import { Protocol, ProtocolDef } from 'deepleela-common';
import AIManager from './AIManager';
import ReadableLogger from '../lib/ReadableLogger';
import LineReadable from '../lib/LineReadable';
import CommandBuilder, { StoneColor } from './CommandBuilder';
import { coord2point } from '../lib/CoordHelper';

export default class LeelaGoServer extends EventEmitter {

    private client: WebSocket;
    private keepaliveTimer: NodeJS.Timer;
    private engine: Controller;
    private ai: string;
    private sysHanlders: Map<string, Function>;

    private stderrReadable: LineReadable;
    private engineLogger: ReadableLogger;

    constructor(client: WebSocket) {
        super();
        this.client = client;

        this.client.on('message', this.handleMessage);
        this.client.on('close', this.handleClose);
        this.client.on('error', this.handleError);

        this.keepaliveTimer = setInterval(() => this.client.ping(), 15 * 1000);

        this.sysHanlders = new Map([
            [Protocol.sys.requestAI, this.handleRequestAI],
            [Protocol.sys.loadMoves, this.handleLoadMoves],
        ]);
    }

    private handleMessage = (data: WebSocket.Data) => {
        let msg: ProtocolDef = null;

        try {
            msg = JSON.parse(data.toString()) as ProtocolDef;

            if (!msg.type) {
                this.close();
                return;
            }

            switch (msg.type) {
                case 'gtp':
                    this.handleGtpMessages(msg.data as any);
                    break;
                case 'sys':
                    this.handleSysMessages(msg.data as any);
                    break;
            }

        } catch (error) {
            this.close();
        }
    }

    private handleClose = (code: number, reason: string) => {
        this.close();
    }

    private handleError = (error: Error) => {
        this.close();
    }

    onClose(callback: (sender: LeelaGoServer) => void) {
        super.addListener('close', callback);
    }

    private close() {
        clearInterval(this.keepaliveTimer);
        super.emit('close', this);

        this.client.terminate();
        this.client.removeAllListeners();

        if (!this.engine) return;
        AIManager.releaseController(this.engine);
        this.engine = null;
    }

    sendSysResponse(cmd: Command) {
        if (this.client.readyState !== this.client.OPEN) return;
        let msg: ProtocolDef = { type: 'sys', data: cmd };
        this.client.send(JSON.stringify(msg));
    }

    sendGtpResponse(resp: Response) {
        if (this.client.readyState !== this.client.OPEN) return;
        let msg: ProtocolDef = { type: 'gtp', data: Response.toString(resp) };
        this.client.send(JSON.stringify(msg));
    }

    private handleSysMessages(cmd: Command) {
        let handler = this.sysHanlders.get(cmd.name);
        if (!handler) return;
        handler(cmd);
    }

    private handleRequestAI = (cmd: Command) => {
        if (this.engine && this.engine.process && cmd.args === this.ai) {
            this.sendSysResponse({ id: cmd.id, name: cmd.name, args: [true, 0] });
            return;
        }

        AIManager.releaseController(this.engine);
        this.engine = null;
        if (this.engineLogger) this.engineLogger.release();
        if (this.stderrReadable) this.stderrReadable.release();

        let ai = AIManager.createController(cmd.args);

        if (!ai) {
            let pending = Math.max(AIManager.onlineUsers - AIManager.maxInstances, 0);
            this.sendSysResponse({ id: cmd.id, name: cmd.name, args: [false, pending] });
            return;
        }

        ai.on('stopped', (args) => { AIManager.releaseController(ai), console.info(cmd.args, 'exits') });
        ai.start();

        let success = ai.process != null;
        this.engine = success ? ai : null;
        this.ai = success ? cmd.args : undefined;

        if (success) {
            this.stderrReadable = new LineReadable(ai.process.stderr);
            this.engineLogger = new ReadableLogger(this.stderrReadable);
        }

        this.sendSysResponse({ id: cmd.id, name: cmd.name, args: [success, 0] });
    }

    private handleLoadMoves = async (cmd: Command) => {
        let moves = cmd.args as [string, string][];
        if (!moves || moves.length === 0) {
            this.sendSysResponse({ id: cmd.id, name: cmd.name, args: 'bad moves' });
            return;
        }

        for (let move of moves) {
            let gtpcmd = CommandBuilder.play(move[0] as StoneColor, move[1]);
            await this.engine.sendCommand(gtpcmd);
        }
        
        this.sendSysResponse({ id: cmd.id, name: cmd.name, args: 'ok' });
    };

    private async handleGtpMessages(cmdstr: string) {
        if (!this.engine || !this.engineLogger) return;

        let cmd = Command.fromString(cmdstr);

        if (['heatmap', 'genmove'].includes(cmd.name)) {
            this.engineLogger.start();

            switch (cmd.name) {
                case 'heatmap':
                    await this.genHeatmap(cmd.id);
                    break;
                case 'genmove':
                    await this.genMove(cmd);
                    break;
            }

            this.engineLogger.stop();
            return;
        }

        let res = await this.engine.sendCommand(cmd);
        this.sendGtpResponse(res);
    }

    private async genHeatmap(id?: number) {
        let heatmap = new Promise(resolve => {
            let counter = 19;
            let dataHandler = (chunk: string) => {
                if (chunk.match(/^\s*(\d+\s+)+$/) != null) {
                    counter--;
                }

                if (counter === 0) {
                    this.stderrReadable.removeListener('data', dataHandler);
                    resolve();
                }
            }

            this.stderrReadable.on('data', dataHandler);
        });

        await Promise.all([
            heatmap,
            this.engine.sendCommand(CommandBuilder.leela_heatmap())
        ]);

        let log = this.engineLogger.log;

        let lines = log.split('\n');

        let startIndex = lines.findIndex(line => line.match(/^\s*(\d+\s+)+$/) != null);
        if (startIndex < 0) startIndex = lines.length;

        let data = lines.slice(startIndex, startIndex + 19).map(line => line.trim().split(/\s+/).map(x => +x));
        let max = Math.max(...data.map(x => Math.max(...x)));
        let result = data.map(x => x.map(y => Math.floor(y * 9.9 / max)));

        this.sendSysResponse({ name: 'heatmap', id, args: JSON.stringify(result) });
    }

    private async genMove(cmd: Command) {
        let res = await this.engine.sendCommand(cmd);
        let respstr = Response.toString(res);

        let log = this.engineLogger.log;

        let lines = log.split('\n');

        let startIndex = lines.findIndex(line => line.includes('MC winrate=') || line.includes('NN eval='));
        if (startIndex < 0) startIndex = lines.length;

        let colors = [cmd.args[0], cmd.args[0] === 'B' ? 'W' : 'B'];

        let variations = lines
            .slice(startIndex)
            .filter(line => line.includes('->'))
            .map(line => ({
                visits: +line.slice(line.indexOf('->') + 2, line.indexOf('(')).trim(),
                stats: line.slice(line.indexOf('('), line.indexOf('PV: ')).trim()
                    .replace(/\s+/g, ' ').slice(1, -1).split(') (')
                    .reduce((acc, x) => Object.assign(acc, { [x[0]]: x.slice(x.indexOf(':') + 2) }), {}),
                variation: line.slice(line.indexOf('PV: ') + 4).trim().split(/\s+/)
            }));


        let result = {
            respstr,
            variations
        };

        this.sendSysResponse({ name: 'genmove', id: cmd.id!, args: JSON.stringify(result) });
    }
}
