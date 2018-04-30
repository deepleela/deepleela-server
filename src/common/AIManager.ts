import { Controller } from '@sabaki/gtp';

export type LeelaConfiguration = {
    exec: string,
    weights: string,
    playouts: number,
};

export default class AIManager {

    static readonly instance;

    static maxInstances: number;
    static configs: Map<string, LeelaConfiguration>;
    static onlineUsers = 0;
    private static readonly controllers = new Set<Controller>();

    static createController(ai: string = 'leela') {
        
        ai = ai ? ai.toLowerCase() : 'leela';
        if (AIManager.controllers.size >= AIManager.maxInstances) return null;
        if (!AIManager.configs.has(ai)) return null;

        let leelaConfigs = AIManager.configs.get('leela');
        let leelaArgs = ['--gtp', '--noponder'];
        if (leelaConfigs) {
            if (leelaConfigs.playouts) leelaArgs.push('--playouts', `${leelaConfigs ? leelaConfigs.playouts || 1000 : 1000}`);
        }

        let leelazeroConfigs = AIManager.configs.get('leelazero');
        let leelazeroArgs = ['--gtp', '--noponder', '-w', leelazeroConfigs.weights];
        if (leelazeroConfigs) {
            if (leelazeroConfigs.playouts) leelazeroArgs.push('--playouts', `${leelazeroConfigs ? leelazeroConfigs.playouts || 2000 : 2000}`);
        }

        let argsMap = new Map([['leela', leelaArgs], ['leelazero', leelazeroArgs]]);
        
        let engine = new Controller(AIManager.configs.get(ai).exec, argsMap.get(ai) || []);
        AIManager.controllers.add(engine);

        return engine;
    }

    static async releaseController(controller: Controller) {
        if (!controller) return;
        await controller.stop();
        AIManager.controllers.delete(controller);
    }

}