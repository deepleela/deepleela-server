import { Controller, Command, Response } from '@sabaki/gtp';
import { spawn } from 'child_process';
import CommandBuilder from './lib/CommandBuilder';

async function main() {

    let leela = new Controller('../leela-zero/src/leelaz', ['--gtp', '--noponder', '-w', '/Volumes/Zone/Go/bn.txt']);
    leela.on('stopped', e => console.log(e));
    leela.start();
    leela.process.stdout.on('data', chunk => console.log(chunk));

    console.log(await leela.sendCommand(CommandBuilder.list_commands()));
    let { id, content, error } = await leela.sendCommand({ name: 'genmove', args: ['B'] });
    console.log(id, content, error);


}

main();