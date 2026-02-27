import { Application, Graphics, Container } from 'pixi.js';

export class Renderer {
  constructor() {
    this.app = null;
    this.layers = {};
    this.mapGraphics = null;
    // Reusable graphics objects (one per layer, cleared each frame)
    this.projGraphics = null;
    this.particleGraphics = null;
    this.crosshairGraphics = null;
    this.playerGfx = new Map(); // id -> { graphics, container }
  }

  async init(canvas) {
    this.app = new Application();
    await this.app.init({
      canvas,
      resizeTo: window,
      background: 0x0f0c29,
      antialias: false,
      resolution: 1,
    });

    // Create layer containers (draw order)
    const layerNames = ['background', 'map', 'remotePlayers', 'localPlayer', 'projectiles', 'particles'];
    for (const name of layerNames) {
      const container = new Container();
      this.layers[name] = container;
      this.app.stage.addChild(container);
    }

    this.mapGraphics = new Graphics();
    this.layers.map.addChild(this.mapGraphics);

    this.projGraphics = new Graphics();
    this.layers.projectiles.addChild(this.projGraphics);

    this.particleGraphics = new Graphics();
    this.layers.particles.addChild(this.particleGraphics);

    // Crosshair layer (screen-space, not affected by camera)
    this.crosshairGraphics = new Graphics();
    this.app.stage.addChild(this.crosshairGraphics);

    return this;
  }

  get width() { return this.app.screen.width; }
  get height() { return this.app.screen.height; }

  /** Draw map polygons from map data (called once on load) */
  drawMap(mapData) {
    const g = this.mapGraphics;
    g.clear();

    // Background
    const bg = new Graphics();
    bg.rect(0, 0, mapData.bounds.width, mapData.bounds.height);
    bg.fill(mapData.background.bottom || '#302b63');
    this.layers.background.removeChildren();
    this.layers.background.addChild(bg);

    // Collision polygons
    for (const poly of mapData.collisionPolygons) {
      const verts = poly.vertices;
      if (verts.length < 3) continue;
      g.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) {
        g.lineTo(verts[i].x, verts[i].y);
      }
      g.closePath();
      g.fill(poly.color || '#4a3728');
    }

    // Decorations
    if (mapData.decorations) {
      for (const dec of mapData.decorations) {
        if (dec.type === 'rect') {
          g.rect(dec.x, dec.y, dec.width, dec.height);
          g.fill(dec.color || '#335533');
        }
      }
    }
  }

  /** Get or create a Graphics for a player (reused across frames) */
  _getPlayerGfx(id, container) {
    let entry = this.playerGfx.get(id);
    if (!entry) {
      const graphics = new Graphics();
      entry = { graphics, container };
      this.playerGfx.set(id, entry);
      container.addChild(graphics);
    } else if (entry.container !== container) {
      // Player moved layers (shouldn't happen but handle it)
      entry.container.removeChild(entry.graphics);
      container.addChild(entry.graphics);
      entry.container = container;
    }
    return entry.graphics;
  }

  /** Draw a player (stick-figure) */
  drawPlayer(container, player, isLocal) {
    const g = this._getPlayerGfx(player.id, container);
    g.clear();
    if (player.state === 1) return;

    const { x, y, aimAngle } = player;
    const color = isLocal ? '#44cc44' : (player.color || '#cc4444');

    // Head
    g.circle(x, y - 22, 7);
    g.fill(color);

    // Torso
    g.moveTo(x, y - 15);
    g.lineTo(x, y + 3);
    g.stroke({ width: 4, color });

    // Legs (walking animation)
    const walkSpeed = Math.abs(player.vx || 0);
    const walkOffset = Math.sin(Date.now() * 0.012) * (walkSpeed > 10 ? 6 : 0);
    g.moveTo(x, y + 3);
    g.lineTo(x - 6 + walkOffset, y + 18);
    g.stroke({ width: 3, color });
    g.moveTo(x, y + 3);
    g.lineTo(x + 6 - walkOffset, y + 18);
    g.stroke({ width: 3, color });

    // Arm + weapon
    const armLen = 16;
    const armX = x + Math.cos(aimAngle) * armLen;
    const armY = (y - 10) + Math.sin(aimAngle) * armLen;
    g.moveTo(x, y - 10);
    g.lineTo(armX, armY);
    g.stroke({ width: 3, color: '#999999' });

    // Weapon barrel
    const weapLen = 24;
    const tipX = x + Math.cos(aimAngle) * weapLen;
    const tipY = (y - 10) + Math.sin(aimAngle) * weapLen;
    g.moveTo(armX, armY);
    g.lineTo(tipX, tipY);
    g.stroke({ width: 2, color: '#777777' });

    // Jetpack on back (opposite side of aim direction)
    const facing = Math.cos(aimAngle) >= 0 ? 1 : -1;
    const backX = x - facing * 8; // behind the torso
    const backY = y - 4;          // mid-torso height

    // Draw jetpack box on back
    g.rect(backX - 4, backY - 6, 8, 12);
    g.fill('#555566');
    g.stroke({ width: 1, color: '#777788' });

    // Jet flame from jetpack
    if (player.jetting) {
      const flameH = 10 + Math.random() * 12;
      // Outer flame
      g.moveTo(backX - 5, backY + 6);
      g.lineTo(backX, backY + 6 + flameH);
      g.lineTo(backX + 5, backY + 6);
      g.fill('#ff5500');
      // Inner flame
      g.moveTo(backX - 3, backY + 6);
      g.lineTo(backX, backY + 6 + flameH * 0.65);
      g.lineTo(backX + 3, backY + 6);
      g.fill('#ffcc00');
    }
  }

  /** Draw all projectiles (call once per frame after clearFrame) */
  drawProjectile(x, y, vx, vy, color = '#ffdd44') {
    const g = this.projGraphics;
    const len = 14;
    const speed = Math.sqrt(vx * vx + vy * vy) || 1;
    const dx = (vx / speed) * len;
    const dy = (vy / speed) * len;

    g.moveTo(x - dx, y - dy);
    g.lineTo(x, y);
    g.stroke({ width: 2, color });
    g.circle(x, y, 2);
    g.fill('#ffffff');
  }

  /** Draw a particle */
  drawParticle(x, y, radius, color, alpha) {
    const g = this.particleGraphics;
    g.circle(x, y, Math.max(0.5, radius));
    g.fill({ color, alpha: Math.max(0, alpha) });
  }

  /** Draw crosshair at screen position */
  drawCrosshair(screenX, screenY) {
    const g = this.crosshairGraphics;
    g.clear();

    const size = 10;
    const gap = 4;
    const thickness = 2;
    const color = '#ffffff';
    const alpha = 0.5;

    // Top line
    g.moveTo(screenX, screenY - gap);
    g.lineTo(screenX, screenY - gap - size);
    g.stroke({ width: thickness, color, alpha });

    // Bottom line
    g.moveTo(screenX, screenY + gap);
    g.lineTo(screenX, screenY + gap + size);
    g.stroke({ width: thickness, color, alpha });

    // Left line
    g.moveTo(screenX - gap, screenY);
    g.lineTo(screenX - gap - size, screenY);
    g.stroke({ width: thickness, color, alpha });

    // Right line
    g.moveTo(screenX + gap, screenY);
    g.lineTo(screenX + gap + size, screenY);
    g.stroke({ width: thickness, color, alpha });

    // Center dot
    g.circle(screenX, screenY, 1.5);
    g.fill({ color: '#ff3333', alpha: 0.5 });
  }

  /** Clear per-frame graphics */
  clearFrame() {
    this.projGraphics.clear();
    this.particleGraphics.clear();
    this.crosshairGraphics.clear();

    // Mark all player gfx as unused this frame
    this._activePlayerIds = new Set();
  }

  /** Mark a player as active this frame */
  markPlayerActive(id) {
    if (!this._activePlayerIds) this._activePlayerIds = new Set();
    this._activePlayerIds.add(id);
  }

  /** Remove player gfx that weren't drawn this frame */
  pruneInactivePlayers() {
    if (!this._activePlayerIds) return;
    for (const [id, entry] of this.playerGfx) {
      if (!this._activePlayerIds.has(id)) {
        entry.graphics.clear();
        entry.container.removeChild(entry.graphics);
        entry.graphics.destroy();
        this.playerGfx.delete(id);
      }
    }
  }

  /** Remove a specific player */
  removePlayer(id) {
    const entry = this.playerGfx.get(id);
    if (entry) {
      entry.graphics.destroy();
      this.playerGfx.delete(id);
    }
  }

  /** Apply camera offset to all world layers */
  applyCamera(camera) {
    const worldLayers = ['background', 'map', 'remotePlayers', 'localPlayer', 'projectiles', 'particles'];
    for (const name of worldLayers) {
      this.layers[name].x = -camera.x;
      this.layers[name].y = -camera.y;
    }
  }
}
