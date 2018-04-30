// Code from LeelaSabaki src/LineReadable.js

import { EventEmitter } from "events";
import { Readable, Stream } from "stream";

export default class LineReadable extends EventEmitter {

    buffer = '';
    readable: Stream;
    newline: string;

    constructor(readable: Stream, { newline = '\n' } = {}) {
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