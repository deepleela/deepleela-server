
import { Telnet, Connection } from 'telnet-rxjs';
import * as WebSocket from 'ws';

export default class CGOSServer {

    client: WebSocket;
    ready = false;
    private buffer = '';

    constructor(client: WebSocket) {
        this.client = client;
        this.client.on('message', this.handleMessage);
        this.client.on('error', this.handleError);
        this.client.on('close', this.handleClose);
    }

    handleMessage = (data: WebSocket.Data) => {
        // this.telnet.sendln(data.toString());
    }

    handleClose = () => {
        console.log(this.client.url, 'close');
        this.close();
    }

    handleError = (err) => {
        console.log(err.message);
        this.close();
    }

    close() {
        try {
            this.client.terminate();
            this.client.removeAllListeners();
        }
        catch{ }
    }

    
}