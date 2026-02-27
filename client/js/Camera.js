export class Camera {
  constructor(viewportW, viewportH) {
    this.x = 0;
    this.y = 0;
    this.viewportW = viewportW;
    this.viewportH = viewportH;
    this.mapW = 3200;
    this.mapH = 1800;
    this.lerpSpeed = 0.1;
  }

  setMapBounds(w, h) {
    this.mapW = w;
    this.mapH = h;
  }

  resize(w, h) {
    this.viewportW = w;
    this.viewportH = h;
  }

  /** Smoothly follow a target position */
  follow(targetX, targetY) {
    if (!isFinite(targetX) || !isFinite(targetY)) return;
    const desiredX = targetX - this.viewportW / 2;
    const desiredY = targetY - this.viewportH / 2;

    this.x += (desiredX - this.x) * this.lerpSpeed;
    this.y += (desiredY - this.y) * this.lerpSpeed;

    // Clamp to map bounds
    this.x = Math.max(0, Math.min(this.x, this.mapW - this.viewportW));
    this.y = Math.max(0, Math.min(this.y, this.mapH - this.viewportH));
  }

  /** Instant snap (no lerp) */
  snapTo(targetX, targetY) {
    this.x = targetX - this.viewportW / 2;
    this.y = targetY - this.viewportH / 2;
    this.x = Math.max(0, Math.min(this.x, this.mapW - this.viewportW));
    this.y = Math.max(0, Math.min(this.y, this.mapH - this.viewportH));
  }

  worldToScreen(wx, wy) {
    return { x: wx - this.x, y: wy - this.y };
  }

  screenToWorld(sx, sy) {
    return { x: sx + this.x, y: sy + this.y };
  }
}
