export class Camera {
  constructor(viewportW, viewportH) {
    this.x = 0;
    this.y = 0;
    this.viewportW = viewportW;
    this.viewportH = viewportH;
    this.mapW = 3200;
    this.mapH = 1800;
    this.lerpSpeed = 0.1;
    this.zoom = 1; // 1 = normal, 0.5 = 2x zoom out
  }

  /** Effective viewport size in world units (accounts for zoom) */
  get effectiveW() { return this.viewportW / this.zoom; }
  get effectiveH() { return this.viewportH / this.zoom; }

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
    const desiredX = targetX - this.effectiveW / 2;
    const desiredY = targetY - this.effectiveH / 2;

    this.x += (desiredX - this.x) * this.lerpSpeed;
    this.y += (desiredY - this.y) * this.lerpSpeed;

    // Clamp to map bounds
    this.x = Math.max(0, Math.min(this.x, this.mapW - this.effectiveW));
    this.y = Math.max(0, Math.min(this.y, this.mapH - this.effectiveH));
  }

  /** Instant snap (no lerp) */
  snapTo(targetX, targetY) {
    this.x = targetX - this.effectiveW / 2;
    this.y = targetY - this.effectiveH / 2;
    this.x = Math.max(0, Math.min(this.x, this.mapW - this.effectiveW));
    this.y = Math.max(0, Math.min(this.y, this.mapH - this.effectiveH));
  }

  worldToScreen(wx, wy) {
    return { x: (wx - this.x) * this.zoom, y: (wy - this.y) * this.zoom };
  }

  screenToWorld(sx, sy) {
    return { x: sx / this.zoom + this.x, y: sy / this.zoom + this.y };
  }
}
