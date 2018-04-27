import { Controller } from '@sabaki/gtp';

export type LeelaConfiguration = {
    exec: string,
    weights: string,
    playouts: number,
};

export default class AIManager {

    static readonly instance;

    static maxInstances: number;
    static configs: LeelaConfiguration;

    static createController() {

    }
}