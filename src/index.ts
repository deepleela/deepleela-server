import { Controller, Command, Response } from '@sabaki/gtp';
import { spawn } from 'child_process';
import CommandBuilder from './lib/CommandBuilder';
import * as ws from 'ws';
import * as os from 'os';
import * as cluster from 'cluster';
import * as fs from 'fs';
import * as winston from 'winston';
import GoServer from './lib/GoServer';
import AIManager, { LeelaConfiguration } from './lib/AIManager';

type Configuration = {
    listen: number,
    max_players: number,
    leela: LeelaConfiguration,
};

async function main() {

    let leela = new Controller('../leela-zero/src/leelaz', ['--gtp', '--noponder', '--playouts', '1200', '-w', '/Volumes/Zone/Go/bn.txt']);
    leela.on('stopped', e => console.log('stopped', e));
    leela.start();
    leela.process.stdout.on('data', (chunk: Buffer) => console.log(chunk.toString('utf8')));
    await leela.sendCommand(CommandBuilder.boardsize(19));
    console.log(await leela.sendCommand(CommandBuilder.play('B', 'Q17')))
    console.log(await leela.sendCommand(CommandBuilder.nameCommand()));
    let { id, content, error } = await leela.sendCommand({ name: 'genmove', args: ['W'] });
    console.log(id, content, error);

    console.log(await leela.sendCommand(CommandBuilder.showboard()));

}

// main();

const cpus = os.cpus().length;

function forkSelf() {
    let worker = cluster.fork();
    worker.once('exit', (code, signal) => forkSelf());
}

if (cluster.isMaster) {
    for (let i = 0; i < cpus; i++) {
        forkSelf();
    }
} else {
    if (!fs.existsSync('./config.json')) {
        winston.error('The configuration file does not exist, copy config.json.example to config.json, and try agian.');
        process.exit(-1);
    }

    const config = JSON.parse(fs.readFileSync('./config.json').toString()) as Configuration;
    const players = (config.max_players || cpus) / cpus;

    AIManager.maxInstances = players;
    AIManager.configs = config.leela;

    const server = new ws.Server({ port: config.listen || 3301 });
    server.on('connection', (client) => {
        AIManager.onlineUsers++;
        client.once('close', () => AIManager.onlineUsers--);
        new GoServer(client as any);
    });
}

process.title = `deepleela-server-${cluster.isMaster ? 'master' : 'worker'}`;