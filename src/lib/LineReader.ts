// Code from LeelaSabaki src/LineReadable.js

import { EventEmitter } from "events";
import { Readable } from "stream";

export default class LineReader extends EventEmitter {

    buffer = '';
    readable: Readable;
    newline: string;

    constructor(readable: Readable, { newline = '\n' } = {}) {
        super();
        this.readable = readable;
        this.newline = newline;

        readable.on('data', chunk => {
            this.buffer += (chunk + '').replace(/\r/g, '');

            let newlineIndex = this.buffer.lastIndexOf(newline);
            if (newlineIndex < 0) return;

            let lines = this.buffer.slice(0, newlineIndex).split(newline);
            lines.forEach(line => this.emit('data', line + newline));
            
            this.buffer = this.buffer.slice(newlineIndex + newline.length);
        });
    }
}