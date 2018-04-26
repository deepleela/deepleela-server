import { Controller, Command, Response } from '@sabaki/gtp';
import { spawn } from 'child_process';
import CommandBuilder from './lib/CommandBuilder';

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

main();
process.title = 'deepleela-server';