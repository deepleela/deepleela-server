import * as ws from 'ws';
import { } from '@sabaki/gtp';

export type LeelaConfiguration = {
    exec: string,
    weights: string,
    playouts: number,
};

export default class GoServer {

    private client: ws;

    constructor(client: ws) {
        this.client = client;
        this.client.on('message', this.onMessage.bind(this));
        this.client.on('close', this.onClose.bind(this));
        this.client.on('error', this.onError.bind(this));
    }

    private onMessage(client: ws, data: ws.Data) {

    }

    private onClose(client: ws, code: number, reason: string) {

    }

    private onError(client: ws, error: Error) {

    }
}