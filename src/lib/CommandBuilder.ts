import { Command } from "@sabaki/gtp";

export type GTPCommands = 'name' | 'version' | 'protocol_version' | 'known_command';

export default class CommandBuilder {

    static nameCommand(): Command {
        return { name: 'name' };
    }

    static version(): Command {
        return { name: 'version' };
    }

    static protocol_version(): Command {
        return { name: 'protocol_version' };
    }

    static known_command(cmd: string): Command {
        return { name: 'known_command', args: [cmd] };
    }

    static list_commands(): Command {
        return { name: 'list_commands', };
    }

    static quit(): Command {
        return { name: 'quit' };
    }

    static boardsize(size = 19): Command {
        return { name: 'boardsize', args: [size] };
    }

    static clear_board(): Command {
        return { name: 'clear_board' };
    }

    static komi(komi = 6.5): Command {
        return { name: 'komi', args: [komi] };
    }

    static fixed_handicap(numberOfStones: number): Command {
        return { name: 'fixed_handicap', args: [numberOfStones] };
    }

    static place_free_handicap(numberOfStones: number): Command {
        return { name: 'place_free_handicap ', args: [numberOfStones] };
    }

    static set_free_handicap(numberOfStones: number): Command {
        return { name: 'set_free_handicap', args: [numberOfStones] };
    }

    static play(move): Command {
        return { name: 'play', args: [move] };
    }

    static genmove(color: 'B' | 'W'): Command {
        return { name: 'genmove', args: [color] };
    }

    static undo(): Command {
        return { name: 'undo' };
    }

    static time_settings(main: number, byo_yomi_seconds: number, byo_yomi_stones: number): Command {
        return { name: 'time_settings', args: [main, byo_yomi_seconds, byo_yomi_stones] };
    }

    static time_left(color: 'B' | 'W', time: number, stones: number): Command {
        return { name: 'time_left', args: [color, time, stones] };
    }

    static final_score(): Command {
        return { name: 'final_score', };
    }

    static final_status_list(status: string): Command {
        return { name: 'final_status_list', args: [status] };
    }

    static showboard(): Command {
        return { name: 'showboard' };
    }

    static leela_heatmap(): Command {
        return { name: 'heatmap' };
    }
}