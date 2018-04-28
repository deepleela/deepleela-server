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
    static onlineUsers = 0;
    private static readonly controllers = new Set<Controller>();

    static createController() {
        if (AIManager.controllers.size >= AIManager.maxInstances) return null;

        let leela = new Controller(AIManager.configs.exec, ['--gtp', '--noponder', '--playouts', `${AIManager.configs.playouts || 100}`, '-w', `${AIManager.configs.weights}`]);
        AIManager.controllers.add(leela);
        
        return leela;
    }

    static async releaseController(controller: Controller) {
        await controller.stop();
        AIManager.controllers.delete(controller);
    }

}