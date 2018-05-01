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

        readable.on('data', this.dataHandler);
    }

    private dataHandler = (chunk: string | Buffer) => {

        this.buffer += (chunk + '').replace(/\r/g, '');

        let newlineIndex = this.buffer.lastIndexOf(this.newline);
        if (newlineIndex < 0) return;

        let lines = this.buffer.slice(0, newlineIndex).split(this.newline);
        lines.forEach(line => this.emit('data', line + this.newline));

        this.buffer = this.buffer.slice(newlineIndex + this.newline.length);
    }

    release() {
        if (!this.readable) return;
        this.readable.removeListener('data', this.dataHandler);
        this.readable = null;
    }
}