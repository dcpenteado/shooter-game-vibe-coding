import { MSG } from '../../shared/protocol.js';

export class NetworkClient {
  constructor() {
    this.ws = null;
    this.connected = false;
    this.playerId = null;
    this.onWelcome = null;    // (data) => {}
    this.onSnapshot = null;   // (snapshot) => {}
    this.onEvent = null;      // (event) => {}
    this.onPlayerJoin = null; // (data) => {}
    this.onPlayerLeave = null;// (data) => {}
    this.onDisconnect = null; // () => {}
    this.rtt = 0;
    this._pingTime = 0;
  }

  connect(url, playerName) {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        this.connected = true;
        this.send({ type: MSG.C_JOIN, name: playerName });
        resolve();
      };

      this.ws.onerror = (err) => reject(err);

      this.ws.onclose = () => {
        this.connected = false;
        if (this.onDisconnect) this.onDisconnect();
      };

      this.ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        this._handleMessage(msg);
      };
    });
  }

  _handleMessage(msg) {
    switch (msg.type) {
      case MSG.S_WELCOME:
        this.playerId = msg.playerId;
        if (this.onWelcome) this.onWelcome(msg);
        break;
      case MSG.S_SNAPSHOT:
        if (this.onSnapshot) this.onSnapshot(msg);
        break;
      case MSG.S_EVENT:
        if (this.onEvent) this.onEvent(msg);
        break;
      case MSG.S_PLAYER_JOIN:
        if (this.onPlayerJoin) this.onPlayerJoin(msg);
        break;
      case MSG.S_PLAYER_LEAVE:
        if (this.onPlayerLeave) this.onPlayerLeave(msg);
        break;
      case MSG.S_PONG:
        this.rtt = performance.now() - this._pingTime;
        break;
    }
  }

  send(msg) {
    if (this.connected && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  sendInput(input) {
    this.send({ type: MSG.C_INPUT, ...input });
  }

  ping() {
    this._pingTime = performance.now();
    this.send({ type: MSG.C_PING, clientTime: this._pingTime });
  }

  disconnect() {
    if (this.ws) this.ws.close();
  }
}
