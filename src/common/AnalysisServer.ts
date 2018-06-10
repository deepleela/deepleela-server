const express = require('express');
const cors = require('cors')
import { Application, Request, Response } from 'express';
import * as bodyParser from 'body-parser';
import AIManager from './AIManager';
import { Controller } from '@sabaki/gtp';
import LineReadable from '../lib/LineReadable';
import ReadableLogger from '../lib/ReadableLogger';
import LeelaGoServer from './LeelaGoServer';
import CommandBuilder, { StoneColor } from './CommandBuilder';

const app = express() as Application;
app.use(cors());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

const engines = new Map<string, Controller>();

export default class AnalysisServer {


    start(port = 3304, host = 'localhost') {
        app.listen(port, host);
        app.post('/analysis', this.handleAnalysis);
    }

    handleAnalysis = async (req: Request, res: Response) => {
        let { moves, playouts, engine, size, komi, genmove } = req.body as { moves: [string, string][], playouts?: number, engine?: string, size?: number, komi?: number, genmove: StoneColor };
        playouts = playouts || 1000;
        engine = engine || 'leela';
        size = size || 19;
        komi = komi || 6.5;

        if (!moves || moves.length === 0) {
            res.end();
            return;
        }

        let controller = engines.get(engine);
        if (!controller) {
            controller = AIManager.createController(engine);
            controller.start();
            engines.set(engine, controller);

            if (!controller || !controller.process) {
                res.end();
                return;
            }
        }

        let stderrReadable = new LineReadable(controller.process.stderr);
        let engineLogger = new ReadableLogger(stderrReadable);

        await controller.sendCommand({ name: 'clear_board' });
        await controller.sendCommand({ name: 'boardsize', args: [size] });
        await controller.sendCommand({ name: 'komi', args: [komi] });

        for (let move of moves) {
            let gtpcmd = CommandBuilder.play(move[0] as StoneColor, move[1]);
            await controller.sendCommand(gtpcmd);
        }

        engineLogger.start();

        let result = await LeelaGoServer.genMove({ name: 'genmove', args: [genmove] }, controller, engineLogger);

        engineLogger.stop();
        engineLogger.release();
        stderrReadable.release();

        res.json(result);
    }
}