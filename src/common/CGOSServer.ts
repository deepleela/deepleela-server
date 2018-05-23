
import { Telnet, Connection } from 'telnet-rxjs';
import * as WebSocket from 'ws';

export default class CGOSServer {

    client: WebSocket;
    telnet: Connection;

    constructor(client: WebSocket) {
        this.client = client;
        this.client.on('message', this.handleMessage);
        this.client.on('error', this.handleError);
        this.client.on('close', this.handleClose);
        this.telnet = Telnet.client('yss-aya.com:6819');
        this.telnet.filter((event) => event instanceof Telnet.Event.Ended).subscribe((event) => this.telnet.connect());
        this.telnet.data.subscribe(this.handleTelnetData, err => console.info(err.message));
        this.telnet.connect();
    }

    handleMessage = (data: WebSocket.Data) => {
        this.telnet.sendln(data.toString());
    }

    handleClose = () => {
        this.close();
    }

    handleError = () => {
        this.close();
    }

    close() {
        this.client.terminate();
        this.client.removeAllListeners();
        this.telnet.disconnect();
    }

    handleTelnetData = (data: string) => {
        if (data.includes('protocol')) {
            this.telnet.sendln('v1 cgosview 0.32 deepleela');
            return;
        }

        if (this.client.readyState !== this.client.OPEN) return;
        data.split('\n').forEach(line => this.client.send(line));
    }
}