import * as WebSocket from 'ws';
import { Command, Controller, Response } from '@sabaki/gtp';
import { EventEmitter } from 'events';
import { Protocol, ProtocolDef } from 'deepleela-common';
import AIManager from './AIManager';
import ReadableLogger from '../lib/ReadableLogger';
import LineReadable from '../lib/LineReadable';

export default class LeelaGoServer extends EventEmitter {

    private client: WebSocket;
    private keepaliveTimer: NodeJS.Timer;
    private engine: Controller;
    private ai: string;
    private sysHanlders: Map<string, Function>;

    private engineLogger: ReadableLogger;

    constructor(client: WebSocket) {
        super();
        this.client = client;

        this.client.on('message', this.handleMessage);
        this.client.on('close', this.handleClose);
        this.client.on('error', this.handleError);

        this.keepaliveTimer = setInterval(() => this.client.ping(), 15 * 1000);

        this.sysHanlders = new Map([[Protocol.sys.requestAI, this.handleRequestAI]]);
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
                    this.handleGtpMessages(msg.data);
                    break;
                case 'sys':
                    this.handleSysMessages(msg.data);
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
        let msg: ProtocolDef = { type: 'sys', data: cmd };
        this.client.send(JSON.stringify(msg));
    }

    sendGtpResponse(resp: Response) {
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

        let ai = AIManager.createController(cmd.args);

        if (!ai) {
            let pending = Math.max(AIManager.onlineUsers - AIManager.maxInstances, 0);
            this.sendSysResponse({ id: cmd.id, name: cmd.name, args: [false, pending] });
            return;
        }

        ai.on('stopped', (args) => { AIManager.releaseController(ai), console.info(cmd.args, 'exists') });
        ai.start();

        let success = ai.process != null;
        this.engine = success ? ai : null;
        this.ai = success ? cmd.args : undefined;

        if (success) {
            let readableStderr = new LineReadable(ai.process.stderr);
            this.engineLogger = new ReadableLogger(readableStderr);
        }

        this.sendSysResponse({ id: cmd.id, name: cmd.name, args: [success, 0] });
    }

    private async handleGtpMessages(cmdstr: string) {
        if (!this.engine) return;
        let cmd = Command.fromString(cmdstr);

        let res = await this.engine.sendCommand(cmd);
        
        this.sendGtpResponse(res);
    }
}
