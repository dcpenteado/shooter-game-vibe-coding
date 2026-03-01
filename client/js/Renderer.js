import { Application, Graphics, Container, AnimatedSprite, Assets, Text, TextStyle } from 'pixi.js';
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
    this.reloadHintText = null;
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

    // "R to reload" hint text (world-space, in localPlayer layer)
    this.reloadHintText = new Text({
      text: 'R to reload',
      style: new TextStyle({
        fontFamily: 'monospace',
        fontSize: 13,
        fontWeight: 'bold',
        fill: '#ffffff',
        letterSpacing: 1,
      }),
    });
    this.reloadHintText.anchor.set(0.5, 0.5);
    this.reloadHintText.alpha = 0;
    this.layers.localPlayer.addChild(this.reloadHintText);

    return this;
  }

  get width() { return this.app.screen.width; }
  get height() { return this.app.screen.height; }

  /** Parse hex color to {r,g,b} */
  _hexToRgb(hex) {
    const n = parseInt(hex.replace('#', ''), 16);
    return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  }

  /** Lerp between two hex colors, return hex string */
  _lerpColor(hex1, hex2, t) {
    const a = this._hexToRgb(hex1);
    const b = this._hexToRgb(hex2);
    const r = Math.round(a.r + (b.r - a.r) * t);
    const g = Math.round(a.g + (b.g - a.g) * t);
    const bl = Math.round(a.b + (b.b - a.b) * t);
    return `#${((r << 16) | (g << 8) | bl).toString(16).padStart(6, '0')}`;
  }

  /** Lighten a hex color by a factor (0-1) */
  _lighten(hex, amount) {
    const c = this._hexToRgb(hex);
    const r = Math.min(255, c.r + Math.round((255 - c.r) * amount));
    const g = Math.min(255, c.g + Math.round((255 - c.g) * amount));
    const b = Math.min(255, c.b + Math.round((255 - c.b) * amount));
    return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  }

  /** Draw map polygons from map data (called once on load) */
  drawMap(mapData) {
    const g = this.mapGraphics;
    g.clear();
    this.layers.background.removeChildren();

    const W = mapData.bounds.width;
    const H = mapData.bounds.height;
    const bg = new Graphics();

    // --- Gradient sky background ---
    const topColor = mapData.background.top || '#060610';
    const bottomColor = mapData.background.bottom || '#12121e';
    const gradientSteps = 32;
    for (let i = 0; i < gradientSteps; i++) {
      const t = i / gradientSteps;
      const y = t * H;
      const h = H / gradientSteps + 1;
      bg.rect(0, y, W, h);
      bg.fill(this._lerpColor(topColor, bottomColor, t));
    }

    // --- Stars ---
    const starSeed = 42;
    for (let i = 0; i < 120; i++) {
      const sx = ((starSeed * (i + 1) * 7919) % W);
      const sy = ((starSeed * (i + 1) * 6271) % (H * 0.5));
      const sr = 0.5 + ((i * 13) % 3) * 0.4;
      const sa = 0.15 + ((i * 7) % 5) * 0.08;
      bg.circle(sx, sy, sr);
      bg.fill({ color: '#ffffff', alpha: sa });
    }

    // --- Moon ---
    bg.circle(2700, 120, 40);
    bg.fill({ color: '#ddddcc', alpha: 0.08 });
    bg.circle(2700, 120, 25);
    bg.fill({ color: '#eeeedd', alpha: 0.12 });
    bg.circle(2700, 120, 14);
    bg.fill({ color: '#ffffee', alpha: 0.18 });

    // --- Skyline buildings ---
    if (mapData.skyline) {
      const groundY = 1580;
      for (const bld of mapData.skyline) {
        const bx = bld.x;
        const bw = bld.width;
        const bh = bld.height;
        const by = groundY - bh;

        // Building body
        bg.rect(bx, by, bw, bh);
        bg.fill(bld.color || '#0e0e18');

        // Subtle edge highlights
        bg.rect(bx, by, 1, bh);
        bg.fill({ color: '#ffffff', alpha: 0.02 });
        bg.rect(bx + bw - 1, by, 1, bh);
        bg.fill({ color: '#ffffff', alpha: 0.015 });

        // Rooftop line
        bg.rect(bx - 2, by, bw + 4, 2);
        bg.fill({ color: '#ffffff', alpha: 0.03 });

        // Windows
        if (bld.windows) {
          const winW = 4;
          const winH = 5;
          const gapX = 14;
          const gapY = 18;
          const cols = Math.floor((bw - 10) / gapX);
          const rows = Math.floor((bh - 15) / gapY);
          for (let row = 0; row < rows; row++) {
            for (let col = 0; col < cols; col++) {
              // Deterministic pseudo-random: some windows lit, most dark
              const hash = ((bx * 31 + col * 17 + row * 53) % 100);
              if (hash < 25) {
                const wx = bx + 8 + col * gapX;
                const wy = by + 10 + row * gapY;
                // Warm window glow
                const warmth = hash < 10 ? '#ffcc66' : '#ffaa44';
                const wa = 0.15 + (hash % 10) * 0.02;
                bg.rect(wx, wy, winW, winH);
                bg.fill({ color: warmth, alpha: wa });
                // Tiny glow around window
                bg.rect(wx - 1, wy - 1, winW + 2, winH + 2);
                bg.fill({ color: warmth, alpha: wa * 0.3 });
              }
            }
          }
        }
      }
    }

    this.layers.background.addChild(bg);

    // --- Collision polygons with depth ---
    const skipIds = new Set(['wall_left', 'wall_right', 'ceiling']);
    for (const poly of mapData.collisionPolygons) {
      const verts = poly.vertices;
      if (verts.length < 3) continue;

      const baseColor = poly.color || '#3a3a48';
      const isGround = poly.id === 'ground';
      const isRamp = poly.id?.startsWith('ramp');
      const isPlatform = !isGround && !isRamp && !skipIds.has(poly.id);

      // Draw polygon fill
      g.moveTo(verts[0].x, verts[0].y);
      for (let i = 1; i < verts.length; i++) {
        g.lineTo(verts[i].x, verts[i].y);
      }
      g.closePath();
      g.fill(baseColor);

      if (isPlatform) {
        // Get bounding box
        const xs = verts.map(v => v.x);
        const ys = verts.map(v => v.y);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);
        const pw = maxX - minX;
        const ph = maxY - minY;

        // Top highlight (light from above)
        g.rect(minX, minY, pw, 2);
        g.fill({ color: '#ffffff', alpha: 0.12 });

        // Bottom shadow
        g.rect(minX, maxY - 2, pw, 4);
        g.fill({ color: '#000000', alpha: 0.3 });

        // Left edge
        g.rect(minX, minY, 1, ph);
        g.fill({ color: '#ffffff', alpha: 0.05 });

        // Right edge shadow
        g.rect(maxX - 1, minY, 1, ph);
        g.fill({ color: '#000000', alpha: 0.15 });

        // Surface texture lines (subtle concrete cracks)
        const lineCount = Math.floor(pw / 80);
        for (let j = 1; j <= lineCount; j++) {
          const lx = minX + (pw / (lineCount + 1)) * j;
          g.moveTo(lx, minY + 3);
          g.lineTo(lx, maxY - 2);
          g.stroke({ width: 0.5, color: '#000000', alpha: 0.1 });
        }
      }

      if (isGround) {
        const gMinY = Math.min(...verts.map(v => v.y));

        // Curb/sidewalk top edge
        g.rect(0, gMinY, W, 3);
        g.fill({ color: '#444450', alpha: 1 });
        g.rect(0, gMinY, W, 1);
        g.fill({ color: '#555560', alpha: 1 });

        // Road lane markings (dashed yellow center line)
        const laneY = gMinY + 40;
        for (let dx = 80; dx < W; dx += 120) {
          g.rect(dx, laneY, 50, 2);
          g.fill({ color: '#888844', alpha: 0.2 });
        }

        // Subtle asphalt noise
        for (let dx = 0; dx < W; dx += 60) {
          for (let dy = gMinY + 10; dy < gMinY + 200; dy += 30) {
            const noiseHash = ((dx * 7 + dy * 13) % 100);
            if (noiseHash < 20) {
              g.circle(dx + (noiseHash % 20), dy + (noiseHash % 10), 1 + (noiseHash % 2));
              g.fill({ color: '#000000', alpha: 0.08 });
            }
          }
        }
      }

      if (isRamp) {
        // Top surface highlight
        g.moveTo(verts[0].x, verts[0].y);
        g.lineTo(verts[1].x, verts[1].y);
        g.stroke({ width: 2, color: '#ffffff', alpha: 0.08 });
      }

      // Hidden walls/ceiling - just fill dark
      if (skipIds.has(poly.id)) {
        // Already drawn above
      }
    }

    // --- Decorations ---
    if (mapData.decorations) {
      for (const dec of mapData.decorations) {
        if (dec.type === 'lamppost') {
          const lx = dec.x;
          const ly = dec.y;

          // Pole
          g.rect(lx - 1.5, ly - 80, 3, 80);
          g.fill('#2a2a35');

          // Arm extending right
          g.rect(lx, ly - 80, 15, 2);
          g.fill('#2a2a35');

          // Lamp housing
          g.roundRect(lx + 10, ly - 82, 8, 5, 1);
          g.fill('#333340');

          // Light cone (triangular glow below lamp)
          g.moveTo(lx + 8, ly - 77);
          g.lineTo(lx - 15, ly);
          g.lineTo(lx + 35, ly);
          g.closePath();
          g.fill({ color: '#ffcc66', alpha: 0.03 });

          // Light glow circles
          g.circle(lx + 14, ly - 78, 12);
          g.fill({ color: '#ffcc66', alpha: 0.06 });
          g.circle(lx + 14, ly - 78, 6);
          g.fill({ color: '#ffdd88', alpha: 0.1 });

          // Bright point
          g.circle(lx + 14, ly - 78, 2);
          g.fill({ color: '#ffeeaa', alpha: 0.5 });
        }

        if (dec.type === 'crate') {
          const cx = dec.x;
          const cy = dec.y;
          const cw = dec.width || 24;
          const ch = dec.height || 20;
          // Body
          g.rect(cx, cy, cw, ch);
          g.fill('#3a3530');
          g.stroke({ width: 1, color: '#4a4540' });
          // Cross straps
          g.moveTo(cx, cy);
          g.lineTo(cx + cw, cy + ch);
          g.stroke({ width: 0.8, color: '#4a4540', alpha: 0.5 });
          g.moveTo(cx + cw, cy);
          g.lineTo(cx, cy + ch);
          g.stroke({ width: 0.8, color: '#4a4540', alpha: 0.5 });
          // Highlight top
          g.rect(cx, cy, cw, 1);
          g.fill({ color: '#ffffff', alpha: 0.06 });
        }

        if (dec.type === 'barrel') {
          const bx = dec.x;
          const by = dec.y;
          // Body
          g.roundRect(bx - 8, by, 16, 22, 3);
          g.fill('#2a3530');
          g.stroke({ width: 1, color: '#3a4540' });
          // Bands
          g.rect(bx - 8, by + 5, 16, 2);
          g.fill({ color: '#3a4540', alpha: 0.6 });
          g.rect(bx - 8, by + 15, 16, 2);
          g.fill({ color: '#3a4540', alpha: 0.6 });
          // Top highlight
          g.rect(bx - 7, by + 1, 14, 1);
          g.fill({ color: '#ffffff', alpha: 0.05 });
        }

        if (dec.type === 'dumpster') {
          const dx = dec.x;
          const dy = dec.y;
          const dw = dec.width || 60;
          const dh = dec.height || 35;
          // Body
          g.rect(dx, dy, dw, dh);
          g.fill('#1e2e1e');
          g.stroke({ width: 1, color: '#2a3a2a' });
          // Lid (slightly wider)
          g.rect(dx - 2, dy - 3, dw + 4, 5);
          g.fill('#253525');
          // Handle
          g.rect(dx + dw / 2 - 8, dy - 5, 16, 2);
          g.fill('#2a3a2a');
          // Highlight
          g.rect(dx, dy, dw, 1);
          g.fill({ color: '#ffffff', alpha: 0.04 });
        }

        // Legacy rect type
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

    // Crate body (dark green military style for contrast)
    g.rect(x - w / 2, py - h / 2, w, h);
    g.fill('#3a5a2a');
    g.stroke({ width: 1, color: '#6b8a3a' });

    // Crate cross detail
    g.moveTo(x - w / 2 + 2, py);
    g.lineTo(x + w / 2 - 2, py);
    g.stroke({ width: 0.6, color: '#4a6a32' });
    g.moveTo(x, py - h / 2 + 2);
    g.lineTo(x, py + h / 2 - 2);
    g.stroke({ width: 0.6, color: '#4a6a32' });

    // 3 detailed bullets centered in the crate
    const bulletOffsets = [-5, 0, 5]; // wider spacing
    const bw = 1.2;  // bullet half-width (thinner)
    const casH = 4;   // casing height
    const tipH = 2.5; // tip (ogive) height

    for (const ox of bulletOffsets) {
      const bx = x + ox;
      const bBase = py + 3;

      // Brass casing
      g.roundRect(bx - bw, bBase - casH, bw * 2, casH, 0.3);
      g.fill('#e8c840');

      // Bullet tip / ogive
      const tipBase = bBase - casH;
      g.moveTo(bx - bw, tipBase);
      g.lineTo(bx - bw * 0.5, tipBase - tipH * 0.6);
      g.lineTo(bx, tipBase - tipH);
      g.lineTo(bx + bw * 0.5, tipBase - tipH * 0.6);
      g.lineTo(bx + bw, tipBase);
      g.closePath();
      g.fill('#ee9955');
    }

    // Glow effect
    g.circle(x, py, 14);
    g.fill({ color: '#ffcc44', alpha: 0.1 + Math.sin(Date.now() * 0.005) * 0.05 });
  }

  /** Draw a weapon pickup (rifle on ground) */
  drawWeaponPickup(x, y, weaponId) {
    const g = this.pickupGraphics;
    const bob = Math.sin(Date.now() * 0.003) * 3;
    const py = y + bob;

    const glowColor = weaponId === 'awm' ? '#00ccff' : '#ffffff';
    const bodyColor = weaponId === 'awm' ? '#2a4a5a' : '#4a4a4a';
    const accentColor = weaponId === 'awm' ? '#00aadd' : '#888888';

    // Pulsing glow
    const glowAlpha = 0.12 + Math.sin(Date.now() * 0.004) * 0.06;
    g.circle(x, py, 30);
    g.fill({ color: glowColor, alpha: glowAlpha });
    g.circle(x, py, 18);
    g.fill({ color: glowColor, alpha: glowAlpha * 1.5 });

    // --- Detailed sniper rifle silhouette ---
    const s = 1.1; // overall scale

    // Stock (left side — angled buttstock)
    g.moveTo(x - 22 * s, py - 1 * s);
    g.lineTo(x - 18 * s, py - 3 * s);
    g.lineTo(x - 10 * s, py - 3 * s);
    g.lineTo(x - 10 * s, py + 2 * s);
    g.lineTo(x - 14 * s, py + 5 * s);
    g.lineTo(x - 22 * s, py + 3 * s);
    g.closePath();
    g.fill(bodyColor);
    g.stroke({ width: 0.6, color: '#555555' });

    // Thumbhole in stock
    g.roundRect(x - 18 * s, py - 0.5 * s, 4 * s, 3 * s, 1);
    g.fill({ color: '#555555', alpha: 0.35 });

    // Receiver / main body
    g.roundRect(x - 10 * s, py - 3 * s, 18 * s, 5 * s, 1);
    g.fill(bodyColor);
    g.stroke({ width: 0.6, color: '#555555' });

    // Pistol grip (below receiver)
    g.moveTo(x - 4 * s, py + 2 * s);
    g.lineTo(x - 2 * s, py + 2 * s);
    g.lineTo(x - 1 * s, py + 7 * s);
    g.lineTo(x - 5 * s, py + 8 * s);
    g.lineTo(x - 6 * s, py + 3 * s);
    g.closePath();
    g.fill(bodyColor);
    g.stroke({ width: 0.5, color: '#555555' });

    // Trigger guard
    g.moveTo(x - 6 * s, py + 2.5 * s);
    g.lineTo(x - 6 * s, py + 5 * s);
    g.lineTo(x - 1.5 * s, py + 5 * s);
    g.lineTo(x - 1.5 * s, py + 2.5 * s);
    g.stroke({ width: 0.5, color: '#555555' });

    // Magazine (below receiver, in front of grip)
    g.roundRect(x - 1 * s, py + 2 * s, 5 * s, 6 * s, 0.5);
    g.fill('#333333');
    g.stroke({ width: 0.4, color: '#555555' });

    // Long barrel
    g.roundRect(x + 8 * s, py - 2 * s, 20 * s, 3 * s, 0.5);
    g.fill('#444444');
    g.stroke({ width: 0.4, color: '#666666' });

    // Suppressor / muzzle brake (barrel tip)
    g.roundRect(x + 27 * s, py - 2.8 * s, 8 * s, 4.5 * s, 1.5);
    g.fill('#3a3a3a');
    g.stroke({ width: 0.5, color: '#555555' });
    // Suppressor ridges
    for (let i = 0; i < 3; i++) {
      const rx = x + (29 + i * 2) * s;
      g.moveTo(rx, py - 2.5 * s);
      g.lineTo(rx, py + 1.5 * s);
      g.stroke({ width: 0.3, color: '#555555' });
    }

    // Scope rail (on top of receiver)
    g.roundRect(x - 8 * s, py - 3.8 * s, 14 * s, 1.2 * s, 0.3);
    g.fill('#333333');

    // Scope body
    g.roundRect(x - 6 * s, py - 7 * s, 14 * s, 3.5 * s, 1.5);
    g.fill('#333333');
    g.stroke({ width: 0.5, color: bodyColor });

    // Scope adjustment turret (top knob)
    g.roundRect(x - 1 * s, py - 8.5 * s, 3 * s, 2 * s, 0.5);
    g.fill('#333333');

    // Bipod (two legs below barrel)
    g.moveTo(x + 10 * s, py + 1 * s);
    g.lineTo(x + 7 * s, py + 8 * s);
    g.stroke({ width: 0.7, color: '#555555' });
    g.moveTo(x + 12 * s, py + 1 * s);
    g.lineTo(x + 15 * s, py + 8 * s);
    g.stroke({ width: 0.7, color: '#555555' });
  }

  /** Draw a mine on the ground */
  drawMine(x, y, state, isOwn) {
    const g = this.pickupGraphics;
    const now = Date.now();

    // Mine body — flat disc shape
    const rx = 10;  // horizontal radius
    const ry = 5;   // vertical radius (flattened)

    if (state === 'triggered') {
      // Fast red/yellow blink
      const blink = Math.floor(now / 80) % 2 === 0;
      const blinkColor = blink ? '#ff4400' : '#ffcc00';

      // Intense glow
      g.ellipse(x, y, rx + 8, ry + 8);
      g.fill({ color: blinkColor, alpha: 0.25 });
      g.ellipse(x, y, rx + 4, ry + 4);
      g.fill({ color: blinkColor, alpha: 0.15 });

      // Body
      g.ellipse(x, y, rx, ry);
      g.fill('#555555');
      g.stroke({ width: 1, color: blinkColor });

      // Center light
      g.circle(x, y - 1, 3);
      g.fill({ color: blinkColor, alpha: 0.9 });
    } else {
      // Idle state — subtle red pulse
      const pulseAlpha = 0.4 + Math.sin(now * 0.004) * 0.2;

      // Subtle glow
      g.ellipse(x, y, rx + 4, ry + 4);
      g.fill({ color: '#ff2200', alpha: 0.06 });

      // Body
      g.ellipse(x, y, rx, ry);
      g.fill(isOwn ? '#4a4a4a' : '#555555');
      g.stroke({ width: 1, color: '#666666' });

      // Metal rim detail
      g.ellipse(x, y, rx - 2, ry - 1);
      g.stroke({ width: 0.5, color: '#777777' });

      // Center indicator light (pulsing red)
      g.circle(x, y - 1, 2);
      g.fill({ color: '#ff2200', alpha: pulseAlpha });
    }
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

  /** Show or hide "R to reload" hint near the player */
  drawReloadHint(x, y, show, isMobile = false) {
    if (!this.reloadHintText) return;
    if (show) {
      this.reloadHintText.text = isMobile ? 'Tap R to reload' : 'R to reload';
      this.reloadHintText.x = x;
      this.reloadHintText.y = y + 38;
      // Gentle pulsing opacity between 0.35 and 0.55
      this.reloadHintText.alpha = 0.45 + Math.sin(Date.now() * 0.004) * 0.1;
    } else {
      this.reloadHintText.alpha = 0;
    }
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
      this.layers[name].x = -camera.x * camera.zoom;
      this.layers[name].y = -camera.y * camera.zoom;
      this.layers[name].scale.set(camera.zoom);
    }
  }
}
