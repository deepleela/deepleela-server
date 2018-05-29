
import { Telnet, Connection } from 'telnet-rxjs';
import * as WebSocket from 'ws';


type ObservedGame = { setup: string, updates: string[], count: number };

export default class CGOSViewer {

    static default = new CGOSViewer();
    private buffer = '';
    telnet: Connection;
    ready = false;
    matches: string[] = [];
    observers = new Map<WebSocket, string[]>();
    clients = new Set<WebSocket>();
    observedGames = new Map<string, ObservedGame>();

    private constructor() {
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

        this.observers.clear();
        this.clients.forEach(c => c.close());
        this.clients.clear();

        this.telnet = Telnet.client('yss-aya.com:6819');
        this.telnet.filter((event) => event instanceof Telnet.Event.Ended).subscribe((event) => this.reconnectCGOS());
        this.telnet.filter(e => e instanceof Error).subscribe(err => this.reconnectCGOS());
        this.telnet.data.subscribe(this.handleTelnetData, err => console.info(err.message));
        this.telnet.connect();
        this.telnet.socket.on('error', this.handleTelnetError);
        this.telnet.socket.on('close', this.handleTelnetClose);
        console.log('connect to cgos');
    }

    handleTelnetError = (err: Error) => {
        console.log(err.message);
        this.reconnectCGOS();
    }

    handleTelnetClose = () => {
        this.reconnectCGOS();
    }

    handleTelnetData = (data: string) => {
        if (data.includes('protocol') && this.telnet.socket.writable) {
            this.telnet.sendln('v1 cgosview 0.33 deepleela');
            this.ready = true;
            this.clients.forEach(c => c.send('cgos-ready-deepleela'));
            return;
        }

        this.buffer += data;

        if (!this.buffer.endsWith('\r\n')) return;

        let contents = this.buffer.split('\r\n');

        contents.filter(v => v.startsWith('match')).forEach(m => this.matches.push(m));
        while (this.matches.length > 100) {
            this.matches.shift();
        }

        contents.filter(v => v.startsWith('gameover')).forEach(go => {
            let [_, id, result] = go.split(' ');
            let match = this.matches.find(m => m.includes(id));
            if (!match) return;
            let [cmd, gid, date, time, size, komi, white, black, r] = match.split(' ');
            let now = new Date();
            date = `${now.getFullYear()}-${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getDate().toString().padStart(2, '0')}`;
            time = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            match = `${cmd} ${gid} ${date} ${time} ${size} ${komi} ${white} ${black} ${result}`;

            this.clients.forEach(c => { if (c.readyState === c.OPEN) c.send(go) });
        });

        contents.filter(v => v.startsWith('update')).forEach(u => {
            let [_, id,] = u.split(' ');
            this.observers.forEach((ids, client) => {
                if (!ids.includes(id)) return;
                client.send(u);
            });

            let game = this.observedGames.get(id);
            if (!game) return;
            game.updates.push(u);
        });

        contents.filter(v => v.startsWith('setup')).forEach(s => {
            let [_, id,] = s.split(' ');
            let obj: ObservedGame = this.observedGames.get(id) || <ObservedGame>{};
            obj.setup = s;
            obj.updates = obj.updates || [];
            this.observedGames.set(id, obj);

            this.observers.forEach((ids, client) => {
                if (!ids.includes(id)) return;
                client.send(s);
                obj.updates.forEach(u => client.send(u));
            });
        })

        this.buffer = '';
    }

    addClient(client: WebSocket) {
        this.clients.add(client);

        if (this.ready) {
            client.send('cgos-ready-deepleela');
        }

        this.matches.forEach(m => client.send(m));
        client.once('error', () => this.handleClientClose(client));
        client.once('close', () => this.handleClientClose(client));
        client.on('message', (msg: string) => this.handleMessage(msg, client));
    }

    handleMessage = (msg: string, client: WebSocket) => {
        if (!msg || !msg.startsWith('observe')) return;
        let [cmd, gid] = msg.replace('\r\n', '').split(' ');
        if (!Number.parseInt(gid)) return;

        let game = this.observedGames.get(gid);
        if (game) {
            game.count++;
            client.send(game.setup);
            game.updates.forEach(u => client.send(u));
        } else {
            this.telnet.sendln(`observe ${gid}`);
            game = { setup: '', updates: [], count: 1 };
            this.observedGames.set(gid, game);
        }

        let observedGames: string[] = this.observers.get(client) || [];
        if (observedGames.includes(gid)) return;
        observedGames.push(gid);
        this.observers.set(client, observedGames);
    }

    handleClientClose = (client: WebSocket) => {
        this.clients.delete(client);

        let observedGames = this.observers.get(client);
        this.observers.delete(client);

        observedGames.forEach(id => {
            let game = this.observedGames.get(id);
            if (!game) return;
            game.count--;
            if (game.count > 0) return;
            this.observedGames.delete(id);
        });

        console.log('cgos stats:', 'clients', this.clients.size, 'observed games', this.observedGames.size, 'observers', this.observers.size);
    }

}