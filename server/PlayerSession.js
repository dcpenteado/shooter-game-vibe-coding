import { MSG } from '../shared/protocol.js';

let nextPlayerId = 1;

export class PlayerSession {
  constructor(ws) {
    this.ws = ws;
    this.id = nextPlayerId++;
    this.name = 'Player';
    this.inputQueue = [];
    this.lastProcessedSeq = 0;
    this.entity = null;
    this.connected = true;

    ws.on('message', (data) => {
      try {
        const msg = JSON.parse(data);
        this._handleMessage(msg);
      } catch (e) {
        // ignore malformed
      }
    });

    ws.on('close', () => {
      this.connected = false;
    });
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case MSG.C_INPUT:
        this.inputQueue.push({
          seq: msg.seq,
          moveDir: msg.moveDir || 0,
          jet: !!msg.jet,
          jump: !!msg.jump,
          aimAngle: msg.aimAngle || 0,
          fire: !!msg.fire,
          reload: !!msg.reload,
        });
        // Cap queue size to prevent memory issues
        if (this.inputQueue.length > 60) {
          this.inputQueue.shift();
        }
        break;
      case MSG.C_PING:
        this.send({
          type: MSG.S_PONG,
          clientTime: msg.clientTime,
          serverTime: Date.now(),
        });
        break;
    }
  }

  drainInputs() {
    const inputs = this.inputQueue;
    this.inputQueue = [];
    return inputs;
  }

  send(msg) {
    if (this.connected && this.ws.readyState === 1) {
      this.ws.send(JSON.stringify(msg));
    }
  }
}
