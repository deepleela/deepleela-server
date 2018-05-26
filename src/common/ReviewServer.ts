import { EventEmitter } from "events";
import * as redis from 'redis';
import { Command, Controller, Response } from '@sabaki/gtp';
import { Protocol, ProtocolDef, ReviewRoom, ReviewRoomInfo, ReviewRoomState } from 'deepleela-common';
import * as crypto from 'crypto';
import * as WebSocket from 'ws';

const RedisOptions = { host: 'localhost', port: 6379 };

export default class ReviewServer extends EventEmitter {

    static setRedis(configs: { host: string, port?: number } = RedisOptions) {
        RedisOptions.host = configs.host;
        RedisOptions.port = configs.port || RedisOptions.port;
    }

    private redis?: redis.RedisClient;
    private redisMessenger?: redis.RedisClient;
    private roomInfo?: ReviewRoomInfo;
    private client: WebSocket;
    private sysHanlders: Map<string, Function>;
    private keepaliveTimer: NodeJS.Timer;

    constructor(client: WebSocket) {
        super();
        this.client = client;

        this.client.on('message', this.handleMessage);
        this.client.on('close', this.handleClose);
        this.client.on('error', this.handleError);

        this.keepaliveTimer = setInterval(() => this.client.ping(), 15 * 1000);

        this.sysHanlders = new Map([
            [Protocol.sys.createReviewRoom, this.handleCreateReviewRoom],
            [Protocol.sys.enterReviewRoom, this.handleEnterReviewRoom],
            [Protocol.sys.reviewRoomStateUpdate, this.handleReviewRoomUpdate],
            [Protocol.sys.reviewRoomMessage, this.handleReviewRoomMessage],
            [Protocol.sys.leaveReviewRoom, this.handleLeaveReviewRoom],
        ]);
    }

    private handleMessage = (data: WebSocket.Data) => {
        let msg: ProtocolDef = null;

        try {
            msg = JSON.parse(data.toString()) as ProtocolDef;

            if (!msg.type) {
                this.close();
                return;
            }

            switch (msg.type) {
                case 'sys':
                    let cmd = msg.data as Command;
                    let handler = this.sysHanlders.get(cmd.name);
                    if (!handler) return;
                    handler(cmd);
                    break;
            }

        } catch (error) {
            this.close();
        }
    }

    private handleClose = (code: number, reason: string) => {
        this.close();
    }

    private handleError = (error: Error) => {
        this.close();
    }

    private close() {
        clearInterval(this.keepaliveTimer);
        super.emit('close', this);

        this.client.terminate();
        this.client.removeAllListeners();

        if (this.redis) {
            this.redis.publish(`${this.roomInfo.roomId}_leave`, '');
            this.redis.decr(`${this.roomInfo.roomId}_people`);
            setTimeout(() => {
                if (this.redisMessenger) {
                    this.redisMessenger.unsubscribe();
                    this.redisMessenger.end(false);
                    this.redisMessenger = undefined;
                }

                this.redis.end(true);
                this.redis.removeAllListeners();
                this.redis = undefined;
            }, 3000);
        }
    }

    sendSysResponse(cmd: Command) {
        if (this.client.readyState !== this.client.OPEN) return;
        let msg: ProtocolDef = { type: 'sys', data: cmd };
        this.client.send(JSON.stringify(msg));
    }

    sendSyncResponse(resp: Command) {
        if (this.client.readyState != this.client.OPEN) return;
        let msg: ProtocolDef = { type: 'sync', data: resp };
        this.client.send(JSON.stringify(msg));
    }

    private handleCreateReviewRoom = async (cmd: Command) => {
        let [uuid, sgf, nickname, roomName, chatBroId] = cmd.args as string[];

        if (!uuid || !sgf) {
            this.sendSysResponse({ id: cmd.id, name: cmd.name, args: 'paramaters bad' });
            return;
        }

        if (this.redis) {
            this.redis.end(false);
            this.redis.removeAllListeners();
        }

        if (this.redisMessenger) {
            this.redisMessenger.end(false);
            this.redisMessenger.unsubscribe();
            this.redisMessenger.removeAllListeners();
            this.redisMessenger = undefined;
        }

        this.redis = redis.createClient(RedisOptions);
        this.redis.once('ready', () => {
            this.redisMessenger = this.redis.duplicate();

            let roomId = crypto.createHash('md5').update(uuid).digest().toString('hex').substr(0, 8);
            let room: ReviewRoom = { uuid, sgf, roomId, roomName, chatBroId, owner: nickname };
            this.redis.set(`${roomId}_people`, 0 as any);
            this.redis.HMSET(roomId, room, error => {
                this.sendSysResponse({ id: cmd.id, name: cmd.name, args: error ? null : JSON.stringify(room) });
            });
        });

        this.redis.on('error', (err) => console.info(err.message));
    }

    private handleEnterReviewRoom = async (cmd: Command) => {
        let [roomId, uuid, nickname] = cmd.args as string[];

        const fetchRoom = async (roomId: string) => {
            if (!this.redis) return null;

            return new Promise<ReviewRoom>(resolve => {
                this.redis.HGETALL(roomId, (err, obj) => resolve((obj as any) as ReviewRoom));
            });
        };

        const sendResponse = (room: ReviewRoom) => {
            if (!room) {
                this.sendSysResponse({ id: cmd.id, name: cmd.name, args: null });
                this.redis.end(false);
                this.redis.removeAllListeners();
                this.redis = undefined;
                return;
            }

            let roomInfo: ReviewRoomInfo = { isOwner: uuid === room.uuid, sgf: room.sgf, owner: room.owner, roomId: roomId, chatBroId: room.chatBroId };
            this.roomInfo = roomInfo;
            this.sendSysResponse({ id: cmd.id, name: cmd.name, args: room ? JSON.stringify(roomInfo) : null });

            this.redis.HGETALL(`${Protocol.sys.reviewRoomStateUpdate}_${roomId}_init`, (err, obj) => {
                if (!obj) return;

                let state = obj as any;
                state.cursor = Number.parseInt(obj.cursor);
                state.branchCursor = obj.branchCursor !== undefined ? Number.parseInt(obj.branchCursor) : undefined;
                state.history = obj.history !== undefined ? JSON.parse(obj.history) : [];
                state.historyCursor = obj.historyCursor !== undefined ? Number.parseInt(obj.historyCursor) : -1;
                state.historySnapshots = obj.historySnapshots !== undefined ? JSON.parse(obj.historySnapshots) : [];
                this.sendSyncResponse({ name: Protocol.sys.reviewRoomStateUpdate, args: JSON.stringify(state) });
            });

            
            let stateUpdate = `${Protocol.sys.reviewRoomStateUpdate}_${roomId}`;
            let roomMessage = `${roomId}_message`;
            let joinRoomNotification = `${roomId}_join`;
            let leaveRoomNotification = `${roomId}_leave`;
            
            this.redis.incr(`${roomId}_people`);
            this.redisMessenger.publish(joinRoomNotification, JSON.stringify({ nickname }));
            [stateUpdate, roomMessage, joinRoomNotification, leaveRoomNotification].forEach(n => this.redisMessenger.subscribe(n));

            this.redisMessenger.on('message', (channel, msg) => {
                switch (channel) {
                    case stateUpdate:
                        this.sendSyncResponse({ name: Protocol.sys.reviewRoomStateUpdate, args: msg });
                        break;
                    case roomMessage:
                        this.sendSyncResponse({ name: Protocol.sys.reviewRoomMessage, args: msg });
                        break;
                    case joinRoomNotification:
                        this.redis.get(`${roomId}_people`, (err, value) => {
                            let count = Number.parseInt(value) || 0;
                            console.log(count);
                            this.sendSyncResponse({ name: Protocol.sys.joinReviewRoom, args: { count, nickname } });
                        });
                        break;
                    case leaveRoomNotification:
                        this.sendSyncResponse({ name: Protocol.sys.leaveReviewRoom, args: msg });
                        break;
                }
            });
        };

        if (!this.redis) {
            this.redis = redis.createClient(RedisOptions);
            this.redis.once('ready', async () => {
                this.redisMessenger = this.redis.duplicate();
                let room = await fetchRoom(roomId);
                sendResponse(room);
            });
            this.redis.on('error', (err) => console.info(err.message));
            return;
        }

        let room = await fetchRoom(roomId);
        sendResponse(room);
    }

    private handleReviewRoomUpdate = async (cmd: Command) => {
        if (!this.roomInfo || !this.roomInfo.isOwner) return;

        let state: ReviewRoomState = cmd.args as ReviewRoomState;
        if (!state) return;
        if (!this.redis) return;

        let key = `${Protocol.sys.reviewRoomStateUpdate}_${state.roomId}`;

        this.redis.publish(key, JSON.stringify(state));

        this.redis.hmset(`${key}_init`, {
            roomId: state.roomId,
            cursor: state.cursor,
            branchCursor: state.branchCursor,
            history: JSON.stringify(state.history),
            historyCursor: state.historyCursor,
            historySnapshots: JSON.stringify(state.historySnapshots),
        }, (err, u) => { });
    }

    private handleReviewRoomMessage = async (cmd: Command) => {
        if (!this.redis || !this.roomInfo) return;
        this.redis.publish(`${this.roomInfo.roomId}_message`, cmd.args);
    }

    private handleLeaveReviewRoom = async (cmd: Command) => {
        if (!this.roomInfo || !this.redis) return;
        this.redis.publish(`${this.roomInfo.roomId}_leave`, '');
        this.redis.decr(`${this.roomInfo.roomId}_people`);
    }

}