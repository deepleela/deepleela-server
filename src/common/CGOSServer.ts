
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
        console.log(this.client.url, 'close');
        this.close();
    }

    handleError = (err) => {
        console.log(err.message);
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
            try {
                console.log('reconnecting cgos');
                this.telnet.socket.removeListener('error', this.handleTelnetError);
                this.telnet.socket.removeListener('close', this.handleTelnetClose);
                this.telnet.socket.removeAllListeners();
                this.telnet.socket.destroy();
                this.telnet.unsubscribe();
                console.log('clean cgos connection');
            } catch { }
        }

        this.telnet = Telnet.client('yss-aya.com:6819');
        this.telnet.filter((event) => event instanceof Telnet.Event.Ended).subscribe((event) => this.reconnectCGOS());
        this.telnet.filter(e => e instanceof Error).subscribe(err => this.reconnectCGOS());
        this.telnet.data.subscribe(this.handleTelnetData, err => console.info(err.message));
        this.telnet.connect();
        this.telnet.socket.on('error', this.handleTelnetError);
        this.telnet.socket.on('close', this.handleTelnetClose);
        console.log('connect to cgos');
    }

    close() {
        try {
            this.client.terminate();
            this.client.removeAllListeners();
            this.telnet.sendln('quit');
            this.telnet.disconnect();
            this.telnet.socket.destroy();
            console.log('close cgos socket');
        }
        catch{ }
    }

    handleTelnetData = (data: string) => {
        if (data.includes('protocol') && this.telnet.socket.writable) {
            this.telnet.sendln('v1 cgosview 0.33 deepleela');
            return;
        }

        if (this.client.readyState !== this.client.OPEN) return;

        if (!this.ready) {
            this.ready = true;
            this.client.send('cgos-ready-deepleela');
        }

        this.buffer += data;

        if (!this.buffer.endsWith('\r\n')) return;

        let msgs = this.buffer.split('\r\n').filter(v => v.length > 0);
        msgs.forEach(line => this.client.send(line));

        this.buffer = '';
    }
}