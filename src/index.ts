import { Controller, Command, Response } from '@sabaki/gtp';
import { spawn } from 'child_process';
import CommandBuilder from './common/CommandBuilder';
import * as ws from 'ws';
import * as os from 'os';
import * as cluster from 'cluster';
import * as fs from 'fs';
import * as winston from 'winston';
import LeelaGoServer, * as LeelaServer from './common/LeelaGoServer';
import AIManager, { LeelaConfiguration } from './common/AIManager';
import ReviewServer from './common/ReviewServer';
import CGOSViewer from './common/CGOSViewer';

type Configuration = {
    listen: number,
    host?: string,
    max_players: number,
    leela?: LeelaConfiguration,
    leelazero?: LeelaConfiguration,
    redis: {
        host: string;
        port?: number;
    },
    cgos: {
        host: string;
        port?: number;
    },
    review: {
        host: string;
        port?: number;
    }
};

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
    AIManager.configs = new Map([['leela', config.leela], ['leelazero', config.leelazero]]);

    ReviewServer.setRedis(config.redis);

    const deepleelaWs = new ws.Server({ port: config.listen || 3301, host: config.host || 'localhost' });
    deepleelaWs.on('connection', client => {
        AIManager.onlineUsers++;
        client.once('close', () => AIManager.onlineUsers--);
        new LeelaGoServer(client as any);
    });

    const cgosWs = new ws.Server({ port: config.cgos.port || 3302, host: config.cgos.host || 'localhost' });
    cgosWs.on('connection', client => {
        CGOSViewer.default.addClient(client as any);
    });

    const reviewWs = new ws.Server({ port: config.review.port || 3303, host: config.review.host || 'localhost' });
    reviewWs.on('connection', client => {
        new ReviewServer(client as any);
    });

}

process.title = `deepleela-server-${cluster.isMaster ? 'master' : 'worker'}`;
process.on('uncaughtException', err => console.log(err));