
import { Telnet, Connection } from 'telnet-rxjs';
import * as WebSocket from 'ws';

export default class CGOSServer {

    client: WebSocket;
    telnet: Connection;
    ready = false;
    private buffer = '';

    constructor(client: WebSocket) {
        this.client = client;
        this.client.on('message', this.handleMessage);
        this.client.on('error', this.handleError);
        this.client.on('close', this.handleClose);
        this.reconnectCGOS();
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

    handleTelnetError = (err: Error) => {
        console.log(err.message);
        this.reconnectCGOS();
    }

    handleTelnetClose = () => {
        this.reconnectCGOS();
    }

    reconnectCGOS = () => {
        if (this.telnet) {
            this.telnet.socket.removeListener('error', this.handleTelnetError);
            this.telnet.socket.removeListener('close', this.handleTelnetClose);
            this.telnet.unsubscribe();
        }

        // this.telnet.socket.removeAllListeners();

        this.telnet = Telnet.client('yss-aya.com:6819');
        this.telnet.filter((event) => event instanceof Telnet.Event.Ended).subscribe((event) => this.telnet.connect());
        this.telnet.filter(e => e instanceof Error).subscribe(err => this.telnet.connect());
        this.telnet.data.subscribe(this.handleTelnetData, err => console.info(err.message));
        this.telnet.connect();
        this.telnet.socket.on('error', this.handleTelnetError);
        this.telnet.socket.on('close', this.handleTelnetClose);
    }

    close() {
        this.client.terminate();
        this.client.removeAllListeners();
        this.telnet.sendln('quit');
        this.telnet.disconnect();
    }

    handleTelnetData = (data: string) => {
        if (data.includes('protocol') && this.telnet.socket.writable) {
            this.telnet.sendln('v1 cgosview 0.32 deepleela');
            return;
        }

        if (this.client.readyState !== this.client.OPEN) return;

        if (!this.ready) {
            this.ready = true;
            this.client.send('cgos-ready-deepleela');
        }

        this.buffer += data;

        if (!this.buffer.endsWith('\r\n')) return;

        console.log(this.buffer);

        let msgs = this.buffer.split('\r\n').filter(v => v.length > 0);
        msgs.forEach(line => this.client.send(line));

        this.buffer = '';
    }
}