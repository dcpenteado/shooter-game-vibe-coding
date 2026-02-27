import { stepPlayer } from '../../shared/physics.js';
import { POSITION_EPSILON } from '../../shared/constants.js';

export class Prediction {
  constructor() {
    this.inputBuffer = []; // { seq, input, stateAfter }
    this.entityRef = null; // reference to local player entity for physics params
  }

  /** Set reference to local player entity (for physics params during reconciliation) */
  setEntity(entity) {
    this.entityRef = entity;
  }

  /** Store an input + resulting predicted state */
  push(seq, input, stateAfter) {
    this.inputBuffer.push({ seq, input, stateAfter: { ...stateAfter } });
  }

  /**
   * Reconcile with server state.
   * Returns corrected player state.
   */
  reconcile(serverState, lastProcessedSeq, mapPolygons, dt, mapBounds) {
    // Remove acknowledged inputs
    this.inputBuffer = this.inputBuffer.filter(entry => entry.seq > lastProcessedSeq);

    if (!this.entityRef) return serverState;

    // Start from server authoritative state, keeping all physics params from entity
    const state = { ...this.entityRef };
    state.x = serverState.x;
    state.y = serverState.y;
    state.vx = serverState.vx;
    state.vy = serverState.vy;
    state.onGround = serverState.onGround;
    state.fuel = serverState.fuel;
    state.hp = serverState.hp;

    // Re-apply unacknowledged inputs
    for (const entry of this.inputBuffer) {
      stepPlayer(state, entry.input, dt, mapPolygons, mapBounds);
    }

    return state;
  }

  clear() {
    this.inputBuffer = [];
  }
}
