export class Interpolation {
  constructor() {
    this.buffers = new Map(); // playerId -> [{ timestamp, state }]
    this.delay = 100; // ms behind latest
  }

  /** Push a new snapshot for a player */
  pushState(playerId, timestamp, state) {
    if (!this.buffers.has(playerId)) {
      this.buffers.set(playerId, []);
    }
    const buf = this.buffers.get(playerId);
    buf.push({ timestamp, state: { ...state } });

    // Keep only last 10 snapshots
    if (buf.length > 10) buf.shift();
  }

  /** Get interpolated state for a player */
  getState(playerId, renderTime) {
    const buf = this.buffers.get(playerId);
    if (!buf || buf.length === 0) return null;

    const targetTime = renderTime - this.delay;

    // Find the two snapshots bracketing targetTime
    let i = 0;
    while (i < buf.length - 1 && buf[i + 1].timestamp <= targetTime) {
      i++;
    }

    if (i >= buf.length - 1) {
      // Use latest snapshot (extrapolation territory, just snap)
      return { ...buf[buf.length - 1].state };
    }

    const a = buf[i];
    const b = buf[i + 1];
    const t = (targetTime - a.timestamp) / (b.timestamp - a.timestamp);
    const clamped = Math.max(0, Math.min(1, t));

    return {
      x: a.state.x + (b.state.x - a.state.x) * clamped,
      y: a.state.y + (b.state.y - a.state.y) * clamped,
      vx: a.state.vx + (b.state.vx - a.state.vx) * clamped,
      vy: a.state.vy + (b.state.vy - a.state.vy) * clamped,
      aimAngle: lerpAngle(a.state.aimAngle, b.state.aimAngle, clamped),
      hp: b.state.hp,
      fuel: b.state.fuel,
      state: b.state.state,
      jetting: b.state.jetting,
      onGround: b.state.onGround,
      name: b.state.name,
      color: b.state.color,
    };
  }

  removePlayer(playerId) {
    this.buffers.delete(playerId);
  }
}

function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * t;
}
