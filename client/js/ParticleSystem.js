export class ParticleSystem {
  constructor() {
    this.particles = [];
  }

  /** Spawn particles at a position */
  emit(x, y, count, opts = {}) {
    const {
      color = '#ff4444',
      speed = 200,
      lifetime = 500,
      size = 3,
      gravity = true,
    } = opts;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd,
        life: lifetime,
        maxLife: lifetime,
        size,
        color,
        gravity,
      });
    }
  }

  /** Emit blood particles */
  emitBlood(x, y, dirX, dirY) {
    const count = 6 + Math.floor(Math.random() * 4);
    for (let i = 0; i < count; i++) {
      const spread = (Math.random() - 0.5) * 1.5;
      const spd = 100 + Math.random() * 200;
      this.particles.push({
        x, y,
        vx: dirX * spd + spread * spd,
        vy: dirY * spd + spread * spd - 50,
        life: 400 + Math.random() * 300,
        maxLife: 700,
        size: 2 + Math.random() * 2,
        color: '#cc0000',
        gravity: true,
      });
    }
  }

  /** Emit spark particles (wall hit) */
  emitSparks(x, y) {
    this.emit(x, y, 4, {
      color: '#ffaa33',
      speed: 150,
      lifetime: 200,
      size: 2,
    });
  }

  /** Emit jetpack smoke trail (spawns below the flame) */
  emitJetSmoke(x, y) {
    for (let i = 0; i < 2; i++) {
      const offsetX = (Math.random() - 0.5) * 8;
      this.particles.push({
        x: x + offsetX,
        y: y + 18 + Math.random() * 6,
        vx: (Math.random() - 0.5) * 20,
        vy: 30 + Math.random() * 40,
        life: 250 + Math.random() * 200,
        maxLife: 450,
        size: 2.5 + Math.random() * 2.5,
        color: '#777788',
        gravity: false,
        maxAlpha: 0.3,
      });
    }
  }

  /** Emit mine explosion particles */
  emitExplosion(x, y) {
    // Orange/yellow burst
    for (let i = 0; i < 20; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 80 + Math.random() * 250;
      this.particles.push({
        x, y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 60,
        life: 300 + Math.random() * 400,
        maxLife: 700,
        size: 3 + Math.random() * 3,
        color: Math.random() > 0.5 ? '#ff6600' : '#ffcc00',
        gravity: true,
      });
    }
    // Heavy smoke cloud
    for (let i = 0; i < 25; i++) {
      const angle = Math.random() * Math.PI * 2;
      const spd = 15 + Math.random() * 60;
      this.particles.push({
        x: x + (Math.random() - 0.5) * 20,
        y: y + (Math.random() - 0.5) * 10,
        vx: Math.cos(angle) * spd,
        vy: -20 - Math.random() * 80,
        life: 800 + Math.random() * 1200,
        maxLife: 2000,
        size: 6 + Math.random() * 8,
        color: Math.random() > 0.3 ? '#444444' : '#666655',
        gravity: false,
        maxAlpha: 0.5 + Math.random() * 0.2,
      });
    }
  }

  /** Emit muzzle flash */
  emitMuzzleFlash(x, y) {
    this.emit(x, y, 2, {
      color: '#ffff88',
      speed: 50,
      lifetime: 60,
      size: 4,
      gravity: false,
    });
  }

  update(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt * 1000;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      if (p.gravity) p.vy += 500 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
    }
  }

  draw(renderer) {
    for (const p of this.particles) {
      const t = Math.max(0, p.life / p.maxLife);
      const alpha = t * (p.maxAlpha ?? 1);
      renderer.drawParticle(p.x, p.y, p.size * t, p.color, alpha);
    }
  }
}
