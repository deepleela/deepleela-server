import * as WebSocket from 'ws';
import { } from '@sabaki/gtp';
import { EventEmitter } from 'events';

export type LeelaConfiguration = {
    exec: string,
    weights: string,
    playouts: number,
};

export interface Protocol {
    type: 'gtp' | 'sys',
    data: any;
}

export default class GoServer extends EventEmitter {

    private client: WebSocket;
    private keepaliveTimer: NodeJS.Timer;

    constructor(client: WebSocket, leela: LeelaConfiguration) {
        super();
        this.client = client;

        this.client.on('message', this.handleMessage.bind(this));
        this.client.on('close', this.handleClose.bind(this));
        this.client.on('error', this.handleError.bind(this));

        this.keepaliveTimer = setInterval(() => this.client.ping(), 15 * 1000);
    }

    private handleMessage(data: WebSocket.Data) {
        let msg: Protocol = null;

        try {
            msg = JSON.parse(data.toString()) as Protocol;
            if (!msg.type) {
                this.close();
                return;
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
}