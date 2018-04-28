import * as WebSocket from 'ws';
import { Command, Controller, Response } from '@sabaki/gtp';
import { EventEmitter } from 'events';
import { Protocol, ProtocolDef } from 'deepleela-common';
import AIManager from './AIManager';

export default class GoServer extends EventEmitter {

    private client: WebSocket;
    private keepaliveTimer: NodeJS.Timer;
    private ai: Controller;
    private sysHanlders: Map<string, Function>;

    constructor(client: WebSocket) {
        super();
        this.client = client;

        this.client.on('message', this.handleMessage.bind(this));
        this.client.on('close', this.handleClose.bind(this));
        this.client.on('error', this.handleError.bind(this));

        this.keepaliveTimer = setInterval(() => this.client.ping(), 15 * 1000);

        this.sysHanlders = new Map([[Protocol.sys.requestAI, this.handleRequestAI]]);
    }

    private handleMessage(data: WebSocket.Data) {
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

    private handleClose(code: number, reason: string) {
        this.close();
    }

    private handleError(error: Error) {
        this.close();
    }

    onClose(callback: (sender: GoServer) => void) {
        super.addListener('close', callback);
    }

    private close() {
        clearInterval(this.keepaliveTimer);
        super.emit('close', this);

        this.client.terminate();
        this.client.removeAllListeners();

        if (!this.ai) return;
        AIManager.releaseController(this.ai);
        this.ai = null;
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
        if (this.ai && this.ai.process) {
            this.sendSysResponse({ id: cmd.id, name: cmd.name, args: [true, 0] });
            return;
        }

        let ai = AIManager.createController();

        if (!ai) {
            let pending = Math.max(AIManager.onlineUsers - AIManager.maxInstances, 0);
            this.sendSysResponse({ id: cmd.id, name: cmd.name, args: [false, pending] });
            return;
        }

        ai.on('stopped', () => { AIManager.releaseController(ai), this.ai = null });
        ai.start();

        this.ai = ai;

        this.sendSysResponse({ id: cmd.id, name: cmd.name, args: [ai.process != null, 0] });
    }

    private async handleGtpMessages(cmdstr: string) {
        if (!this.ai) return;

        let cmd = Command.fromString(cmdstr);
        let res = await this.ai.sendCommand(cmd);
        this.sendGtpResponse(res);
    }
}
