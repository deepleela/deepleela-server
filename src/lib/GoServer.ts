import * as WebSocket from 'ws';
import { Command } from '@sabaki/gtp';
import { EventEmitter } from 'events';
import { Protocol, ProtocolDef } from 'deepleela-common';

export default class GoServer extends EventEmitter {

    private client: WebSocket;
    private keepaliveTimer: NodeJS.Timer;

    constructor(client: WebSocket) {
        super();
        this.client = client;

        this.client.on('message', this.handleMessage.bind(this));
        this.client.on('close', this.handleClose.bind(this));
        this.client.on('error', this.handleError.bind(this));

        this.keepaliveTimer = setInterval(() => this.client.ping(), 15 * 1000);
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
    }

    private handleSysMessages(cmd: Command) {

    }

    private handleGtpMessages(cmd: Command) {

    }
}
