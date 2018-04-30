// Code from LeelaSabaki src/ReadableLogger.js

import { Readable, Stream } from "stream";
import LineReadable from "./LineReadable";

export default class ReadableLogger {

    enabled = false;
    readable: LineReadable;
    log = '';

    constructor(readable: LineReadable) {
        this.readable = readable;

        readable.on('data', (chunk: string) => {
            if (!this.enabled) return;
            this.log += chunk.replace(/\r/g, '');
        });
    }

    start() {
        this.enabled = true;
        this.log = '';
    }

    stop() {
        this.enabled = false;
    }
}