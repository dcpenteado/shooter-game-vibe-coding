import { Sprite, Texture, Rectangle } from 'pixi.js';

/**
 * Splits a death sprite into grid fragments and explodes them outward
 * with simple physics (gravity, rotation, fade).
 */
export class DeathFragments {
  constructor() {
    this.groups = [];
  }

  /**
   * Spawn fragments from a death sprite texture.
   * @param {Texture} deathTexture - The death frame texture to split
   * @param {number} x - World X position of the dead player
   * @param {number} y - World Y position of the dead player
   * @param {number} scale - Sprite scale factor
   * @param {Container} parentContainer - PixiJS container to add fragments to
   */
  spawn(deathTexture, x, y, scale, parentContainer) {
    const cols = 4;
    const rows = 5;
    const frame = deathTexture.frame;
    const cellW = Math.floor(frame.width / cols);
    const cellH = Math.floor(frame.height / rows);

    if (cellW < 1 || cellH < 1) return;

    const group = {
      fragments: [],
      life: 2500,
      maxLife: 2500,
    };

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        // Create a sub-texture for this grid cell
        const subFrame = new Rectangle(
          frame.x + c * cellW,
          frame.y + r * cellH,
          cellW,
          cellH
        );
        const subTex = new Texture({ source: deathTexture.source, frame: subFrame });

        const spr = new Sprite(subTex);
        spr.anchor.set(0.5, 0.5);
        spr.scale.set(scale);

        // Offset from center of original sprite (in world space)
        const offsetX = (c * cellW + cellW / 2 - frame.width / 2) * scale;
        const offsetY = (r * cellH + cellH / 2 - frame.height / 2) * scale;
        spr.x = x + offsetX;
        spr.y = y + offsetY;

        // Explosion velocity: outward from center with randomness
        const angle = Math.atan2(offsetY, offsetX) + (Math.random() - 0.5) * 0.8;
        const speed = 100 + Math.random() * 200;

        group.fragments.push({
          sprite: spr,
          vx: Math.cos(angle) * speed + (Math.random() - 0.5) * 60,
          vy: Math.sin(angle) * speed - 100 - Math.random() * 120, // upward bias
          rotSpeed: (Math.random() - 0.5) * 12,
        });

        parentContainer.addChild(spr);
      }
    }

    this.groups.push(group);
  }

  update(dt) {
    for (let i = this.groups.length - 1; i >= 0; i--) {
      const group = this.groups[i];
      group.life -= dt * 1000;

      if (group.life <= 0) {
        // Clean up all fragment sprites
        for (const frag of group.fragments) {
          frag.sprite.parent?.removeChild(frag.sprite);
          frag.sprite.destroy();
        }
        this.groups.splice(i, 1);
        continue;
      }

      const t = group.life / group.maxLife; // 1.0 → 0.0

      for (const frag of group.fragments) {
        // Gravity
        frag.vy += 450 * dt;
        // Air drag
        frag.vx *= 1 - 1.5 * dt;

        // Move
        frag.sprite.x += frag.vx * dt;
        frag.sprite.y += frag.vy * dt;
        frag.sprite.rotation += frag.rotSpeed * dt;

        // Fade out in the last 40% of lifetime
        frag.sprite.alpha = t < 0.4 ? t / 0.4 : 1;
      }
    }
  }
}
