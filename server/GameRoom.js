import { MSG } from '../shared/protocol.js';
import { SERVER_TICK_RATE, MAX_PLAYERS_PER_ROOM } from '../shared/constants.js';
import { ServerWorld } from './ServerWorld.js';

export class GameRoom {
  constructor(id, name, mapData, charDef, weaponDefs, manager) {
    this.id = id;
    this.name = name;
    this.maxPlayers = MAX_PLAYERS_PER_ROOM;
    this.manager = manager;
    this.sessions = new Map(); // id -> PlayerSession
    this.world = new ServerWorld(mapData, charDef, weaponDefs);
    this.mapData = mapData;
    this.charDef = charDef;
    this.weaponDefs = weaponDefs;
    this.tickInterval = null;
  }

  start() {
    const tickMs = 1000 / SERVER_TICK_RATE;
    this.tickInterval = setInterval(() => this._tick(), tickMs);
    console.log(`GameRoom started at ${SERVER_TICK_RATE} Hz`);
  }

  stop() {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  addPlayer(session) {
    if (this.sessions.size >= this.maxPlayers) return false;

    session.name = session.name || 'Player';
    this.sessions.set(session.id, session);

    // Add to physics world
    const entity = this.world.addPlayer(session);

    // Send welcome to the new player
    session.send({
      type: MSG.S_WELCOME,
      playerId: session.id,
      playerName: session.name,
      map: this.mapData,
      weapons: Object.values(this.weaponDefs),
      characters: [this.charDef],
    });

    // Notify existing players
    for (const [id, other] of this.sessions) {
      if (id !== session.id) {
        other.send({
          type: MSG.S_PLAYER_JOIN,
          playerId: session.id,
          name: session.name,
        });
      }
    }

    console.log(`[${this.name}] Player ${session.name} (${session.id}) joined. Total: ${this.sessions.size}`);
    return true;
  }

  removePlayer(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    this.sessions.delete(sessionId);
    this.world.removePlayer(sessionId);

    // Notify others
    for (const [, other] of this.sessions) {
      other.send({
        type: MSG.S_PLAYER_LEAVE,
        playerId: sessionId,
      });
    }

    console.log(`[${this.name}] Player ${session.name} (${sessionId}) left. Total: ${this.sessions.size}`);

    if (this.sessions.size === 0 && this.manager) {
      this.manager.onRoomEmpty(this.id);
    }
  }

  _tick() {
    // Remove disconnected sessions
    for (const [id, session] of this.sessions) {
      if (!session.connected) {
        this.removePlayer(id);
      }
    }

    // Auto-close empty room
    if (this.sessions.size === 0) return;

    const sessionsArr = [...this.sessions.values()];

    // Update world
    this.world.update(sessionsArr);

    // Build snapshot
    const baseSnapshot = this.world.buildSnapshot(sessionsArr);

    // Send personalized snapshot to each player (with their lastProcessedSeq)
    for (const session of sessionsArr) {
      session.send({
        type: MSG.S_SNAPSHOT,
        ...baseSnapshot,
        yourSeq: session.lastProcessedSeq,
      });
    }

    // Send events
    for (const evt of this.world.events) {
      const msg = { type: MSG.S_EVENT, ...evt };
      for (const session of sessionsArr) {
        session.send(msg);
      }
    }
  }
}
