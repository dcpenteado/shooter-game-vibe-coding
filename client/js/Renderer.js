import { Application, Graphics, Container, AnimatedSprite, Assets } from 'pixi.js';
import { SpriteAnimator } from './SpriteAnimator.js';
import { DeathFragments } from './DeathFragments.js';

export class Renderer {
  constructor() {
    this.app = null;
    this.layers = {};
    this.mapGraphics = null;
    // Reusable graphics objects (one per layer, cleared each frame)
    this.projGraphics = null;
    this.pickupGraphics = null;
    this.particleGraphics = null;
    this.crosshairGraphics = null;
    this.playerGfx = new Map(); // id -> { mode, ... }
    this.spriteAnimator = null;
    this.spritesReady = false;
    this.deathFragments = new DeathFragments();
    this.leaderId = null;
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
    const layerNames = ['background', 'map', 'pickups', 'remotePlayers', 'localPlayer', 'projectiles', 'particles'];
    for (const name of layerNames) {
      const container = new Container();
      this.layers[name] = container;
      this.app.stage.addChild(container);
    }

    this.mapGraphics = new Graphics();
    this.layers.map.addChild(this.mapGraphics);

    this.pickupGraphics = new Graphics();
    this.layers.pickups.addChild(this.pickupGraphics);

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

  /** Load character sprites (async, non-blocking) */
  async initSprites(charDef) {
    if (!charDef.sprites) {
      console.log('Renderer: No sprite config, using stick figures');
      return;
    }

    this.spriteAnimator = new SpriteAnimator(charDef.sprites);
    this.spritesReady = await this.spriteAnimator.loadTextures();

    if (!this.spritesReady) {
      console.warn('Renderer: Sprite loading failed, falling back to stick figures');
      this.spriteAnimator = null;
    }
  }

  /** Clear all player gfx entries (force recreate with sprites after loading) */
  clearAllPlayerGfx() {
    for (const [id, entry] of this.playerGfx) {
      if (entry.mode === 'sprite') {
        entry.parentContainer.removeChild(entry.container);
        entry.container.destroy({ children: true });
      } else {
        entry.graphics.clear();
        entry.container.removeChild(entry.graphics);
        entry.graphics.destroy();
      }
    }
    this.playerGfx.clear();
  }

  /** Get or create a rendering entry for a player (sprite or stick figure) */
  _getPlayerEntry(id, parentContainer) {
    let entry = this.playerGfx.get(id);

    if (!entry) {
      if (this.spritesReady && this.spriteAnimator) {
        const spriteEntry = this.spriteAnimator.createPlayerSprite();
        if (spriteEntry) {
          // Create crown graphics (hidden by default, shown for kill leader)
          const crownGfx = new Graphics();
          crownGfx.visible = false;
          this._drawCrownShape(crownGfx, 0, -40);
          spriteEntry.container.addChild(crownGfx);

          entry = { mode: 'sprite', ...spriteEntry, crownGfx, parentContainer };
          parentContainer.addChild(spriteEntry.container);
          this.playerGfx.set(id, entry);
          return entry;
        }
      }
      // Fallback: stick figure
      const graphics = new Graphics();
      entry = { mode: 'graphics', graphics, container: parentContainer };
      parentContainer.addChild(graphics);
      this.playerGfx.set(id, entry);
    } else if (entry.mode === 'graphics' && entry.container !== parentContainer) {
      entry.container.removeChild(entry.graphics);
      parentContainer.addChild(entry.graphics);
      entry.container = parentContainer;
    } else if (entry.mode === 'sprite' && entry.parentContainer !== parentContainer) {
      entry.parentContainer.removeChild(entry.container);
      parentContainer.addChild(entry.container);
      entry.parentContainer = parentContainer;
    }

    return entry;
  }

  /** Draw a player (sprite or stick-figure fallback) */
  drawPlayer(parentContainer, player, isLocal) {
    const entry = this._getPlayerEntry(player.id, parentContainer);

    if (player.state === 1) {
      if (entry.crownGfx) entry.crownGfx.visible = false;
      if (entry.mode === 'sprite') {
        // On first frame of death: hide sprite and spawn fragments
        if (!entry.fragmentSpawned) {
          entry.fragmentSpawned = true;
          entry.container.visible = false;
          // Get death texture and explode it into fragments
          const deathTex = this.spriteAnimator?.textures.get('death')?.[0];
          if (deathTex) {
            this.deathFragments.spawn(
              deathTex, player.x, player.y,
              this.spriteAnimator.autoScale,
              this.layers.particles
            );
          }
        }
      } else {
        entry.graphics.clear();
      }
      return;
    }

    // Reset fragment state on respawn
    if (entry.fragmentSpawned) {
      entry.fragmentSpawned = false;
      entry.container.visible = true;
    }

    const isLeader = this.leaderId != null && player.id === this.leaderId;

    if (entry.mode === 'sprite') {
      this.spriteAnimator.updatePlayerSprite(entry, player);
      if (entry.crownGfx) entry.crownGfx.visible = isLeader;
    } else {
      this._drawPlayerStickFigure(entry.graphics, player, isLocal, isLeader);
    }
  }

  /** Draw a player as stick-figure (fallback when sprites not loaded) */
  _drawPlayerStickFigure(g, player, isLocal, isLeader = false) {
    g.clear();

    const { x, y, aimAngle } = player;
    const color = isLocal ? '#44cc44' : (player.color || '#cc4444');

    // Crown for kill leader
    if (isLeader) {
      this._drawCrownShape(g, x, y - 40);
    }

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
    const backX = x - facing * 8;
    const backY = y - 4;

    // Strap going to shoulder
    g.moveTo(backX + facing * 3, backY - 6);
    g.lineTo(x, y - 14);
    g.stroke({ width: 1.5, color: '#3a3a4a' });

    // Frame/bracket (connects the two tanks)
    g.roundRect(backX - 2, backY - 5, 4, 10, 1);
    g.fill('#3d3d4d');

    // Left fuel tank (cylinder shape)
    g.roundRect(backX - 6, backY - 7, 5, 13, 2.5);
    g.fill('#505068');
    g.stroke({ width: 0.8, color: '#6a6a82' });
    // Tank highlight (reflection)
    g.roundRect(backX - 5.5, backY - 5, 1.5, 7, 0.8);
    g.fill({ color: '#8888aa', alpha: 0.3 });

    // Right fuel tank (cylinder shape)
    g.roundRect(backX + 1, backY - 7, 5, 13, 2.5);
    g.fill('#505068');
    g.stroke({ width: 0.8, color: '#6a6a82' });
    // Tank highlight
    g.roundRect(backX + 1.5, backY - 5, 1.5, 7, 0.8);
    g.fill({ color: '#8888aa', alpha: 0.3 });

    // Nozzle tips at bottom of each tank
    g.roundRect(backX - 5, backY + 5.5, 3, 2, 0.5);
    g.fill('#2a2a35');
    g.roundRect(backX + 2, backY + 5.5, 3, 2, 0.5);
    g.fill('#2a2a35');

    // Jet flames from nozzles
    if (player.jetting) {
      const flameH = 8 + Math.random() * 10;

      // Outer glow
      g.circle(backX, backY + 10 + flameH * 0.3, 9);
      g.fill({ color: '#ff5500', alpha: 0.08 });

      // Left nozzle flame
      g.moveTo(backX - 5.5, backY + 7);
      g.lineTo(backX - 3.5, backY + 7 + flameH);
      g.lineTo(backX - 1.5, backY + 7);
      g.fill('#ff5500');
      g.moveTo(backX - 5, backY + 7);
      g.lineTo(backX - 3.5, backY + 7 + flameH * 0.6);
      g.lineTo(backX - 2, backY + 7);
      g.fill('#ffcc44');
      g.moveTo(backX - 4.5, backY + 7);
      g.lineTo(backX - 3.5, backY + 7 + flameH * 0.3);
      g.lineTo(backX - 2.5, backY + 7);
      g.fill('#ffffcc');

      // Right nozzle flame
      g.moveTo(backX + 1.5, backY + 7);
      g.lineTo(backX + 3.5, backY + 7 + flameH);
      g.lineTo(backX + 5.5, backY + 7);
      g.fill('#ff5500');
      g.moveTo(backX + 2, backY + 7);
      g.lineTo(backX + 3.5, backY + 7 + flameH * 0.6);
      g.lineTo(backX + 5, backY + 7);
      g.fill('#ffcc44');
      g.moveTo(backX + 2.5, backY + 7);
      g.lineTo(backX + 3.5, backY + 7 + flameH * 0.3);
      g.lineTo(backX + 4.5, backY + 7);
      g.fill('#ffffcc');
    }
  }

  /** Draw a golden crown shape at the given center position */
  _drawCrownShape(g, cx, cy) {
    // Golden glow aura (30% smaller)
    g.circle(cx, cy + 1.4, 10);
    g.fill({ color: '#ffd700', alpha: 0.08 });
    g.circle(cx, cy + 1.4, 7);
    g.fill({ color: '#ffd700', alpha: 0.12 });
    g.circle(cx, cy + 1.4, 4.2);
    g.fill({ color: '#ffea00', alpha: 0.15 });

    // Crown body (Font Awesome crown proportions, 30% smaller)
    const w = 12.6;
    const base = cy + 2.8;
    const bandH = 1.8;

    g.moveTo(cx - w / 2, base);                // bottom-left
    g.lineTo(cx - w / 2 - 1.4, cy - 2.8);     // left peak (outer)
    g.lineTo(cx - w / 4, cy + 0.7);            // left valley
    g.lineTo(cx, cy - 4.2);                    // center peak (tallest)
    g.lineTo(cx + w / 4, cy + 0.7);            // right valley
    g.lineTo(cx + w / 2 + 1.4, cy - 2.8);     // right peak (outer)
    g.lineTo(cx + w / 2, base);                // bottom-right
    g.closePath();
    g.fill('#ffd700');
    g.stroke({ width: 0.5, color: '#b8860b' });

    // Crown band at bottom
    g.roundRect(cx - w / 2, base, w, bandH, 0.7);
    g.fill('#daa520');
    g.stroke({ width: 0.4, color: '#b8860b' });
  }

  /** Draw projectile with configurable trail and glow */
  drawProjectile(x, y, vx, vy, trail = [], opts = {}) {
    const {
      color = '#ffdd44',
      trailWidth = 3,
      trailOpacity = 0.6,
      glowRadius = 6,
      coreRadius = 1.5,
    } = opts;
    const g = this.projGraphics;

    // Draw trail segments (oldest to newest, fading in)
    if (trail.length >= 2) {
      for (let i = 1; i < trail.length; i++) {
        const t = i / trail.length; // 0..1 (0 = oldest, 1 = newest)
        const alpha = t * t * trailOpacity;
        const width = Math.max(0.5, t * trailWidth);

        g.moveTo(trail[i - 1].x, trail[i - 1].y);
        g.lineTo(trail[i].x, trail[i].y);
        g.stroke({ width, color, alpha });
      }
    }

    // Glow around the projectile head
    if (glowRadius > 0) {
      g.circle(x, y, glowRadius);
      g.fill({ color, alpha: 0.15 });
      g.circle(x, y, glowRadius * 0.5);
      g.fill({ color, alpha: 0.3 });
    }

    // Bright projectile core
    g.circle(x, y, coreRadius);
    g.fill({ color: '#ffffff', alpha: 0.9 });
  }

  /** Draw a particle */
  drawParticle(x, y, radius, color, alpha) {
    const g = this.particleGraphics;
    g.circle(x, y, Math.max(0.5, radius));
    g.fill({ color, alpha: Math.max(0, alpha) });
  }

  /** Draw an ammo pickup crate */
  drawPickup(x, y, amount) {
    const g = this.pickupGraphics;
    const w = 16;
    const h = 12;
    const bob = Math.sin(Date.now() * 0.003) * 3;
    const py = y + bob;

    // Crate body
    g.rect(x - w / 2, py - h / 2, w, h);
    g.fill('#cc9933');
    g.stroke({ width: 1, color: '#ffcc44' });

    // Ammo icon (small bullet lines)
    g.moveTo(x - 3, py - 2);
    g.lineTo(x - 3, py + 3);
    g.stroke({ width: 2, color: '#665522' });
    g.moveTo(x + 1, py - 2);
    g.lineTo(x + 1, py + 3);
    g.stroke({ width: 2, color: '#665522' });
    g.moveTo(x + 5, py - 2);
    g.lineTo(x + 5, py + 3);
    g.stroke({ width: 2, color: '#665522' });

    // Glow effect
    g.circle(x, py, 14);
    g.fill({ color: '#ffcc44', alpha: 0.1 + Math.sin(Date.now() * 0.005) * 0.05 });
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
    this.pickupGraphics.clear();
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
        if (entry.mode === 'sprite') {
          entry.parentContainer.removeChild(entry.container);
          entry.container.destroy({ children: true });
        } else {
          entry.graphics.clear();
          entry.container.removeChild(entry.graphics);
          entry.graphics.destroy();
        }
        this.playerGfx.delete(id);
      }
    }
  }

  /** Remove a specific player */
  removePlayer(id) {
    const entry = this.playerGfx.get(id);
    if (entry) {
      if (entry.mode === 'sprite') {
        entry.parentContainer.removeChild(entry.container);
        entry.container.destroy({ children: true });
      } else {
        entry.graphics.destroy();
      }
      this.playerGfx.delete(id);
    }
  }

  /** Update death fragment physics */
  updateDeathFragments(dt) {
    this.deathFragments.update(dt);
  }

  /** Apply camera offset to all world layers */
  applyCamera(camera) {
    const worldLayers = ['background', 'map', 'pickups', 'remotePlayers', 'localPlayer', 'projectiles', 'particles'];
    for (const name of worldLayers) {
      this.layers[name].x = -camera.x;
      this.layers[name].y = -camera.y;
    }
  }
}
