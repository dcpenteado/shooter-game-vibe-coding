import { resolveMapCollisions } from '../../shared/collision.js';
import { GRAVITY } from '../../shared/constants.js';

/** A simple ragdoll point */
class RagdollPoint {
  constructor(x, y, mass) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.mass = mass;
  }
}

/** Distance constraint between two points */
class Constraint {
  constructor(a, b, dist) {
    this.a = a;
    this.b = b;
    this.dist = dist;
  }

  solve() {
    const dx = this.b.x - this.a.x;
    const dy = this.b.y - this.a.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 0.001;
    const diff = (len - this.dist) / len * 0.5;
    this.a.x += dx * diff;
    this.a.y += dy * diff;
    this.b.x -= dx * diff;
    this.b.y -= dy * diff;
  }
}

export class Ragdoll {
  constructor(x, y, impulseX, impulseY, color) {
    this.color = color || '#cc4444';
    this.lifetime = 5000;
    this.age = 0;

    // Create points: head, shoulder, hip, handL, handR, footL, footR
    this.head = new RagdollPoint(x, y - 22, 0.3);
    this.shoulder = new RagdollPoint(x, y - 12, 0.5);
    this.hip = new RagdollPoint(x, y + 4, 1.0);
    this.handL = new RagdollPoint(x - 10, y - 8, 0.2);
    this.handR = new RagdollPoint(x + 10, y - 8, 0.2);
    this.footL = new RagdollPoint(x - 5, y + 18, 0.3);
    this.footR = new RagdollPoint(x + 5, y + 18, 0.3);

    this.points = [this.head, this.shoulder, this.hip, this.handL, this.handR, this.footL, this.footR];

    // Apply impulse
    const impulseScale = 0.3;
    for (const p of this.points) {
      p.prevX = p.x - impulseX * impulseScale * (0.5 + Math.random() * 0.5);
      p.prevY = p.y - impulseY * impulseScale * (0.5 + Math.random() * 0.5);
    }

    // Constraints
    this.constraints = [
      new Constraint(this.head, this.shoulder, 10),
      new Constraint(this.shoulder, this.hip, 16),
      new Constraint(this.shoulder, this.handL, 12),
      new Constraint(this.shoulder, this.handR, 12),
      new Constraint(this.hip, this.footL, 14),
      new Constraint(this.hip, this.footR, 14),
    ];
  }

  update(dt, mapPolygons) {
    this.age += dt * 1000;

    // Verlet integration
    for (const p of this.points) {
      const vx = (p.x - p.prevX) * 0.98; // damping
      const vy = (p.y - p.prevY) * 0.98;
      p.prevX = p.x;
      p.prevY = p.y;
      p.x += vx;
      p.y += vy + GRAVITY * dt * dt;
    }

    // Solve constraints (3 iterations)
    for (let i = 0; i < 3; i++) {
      for (const c of this.constraints) {
        c.solve();
      }
    }

    // Collide against map (simplified: just push points out of polygons)
    for (const p of this.points) {
      const entity = { x: p.x, y: p.y, width: 4, height: 4 };
      resolveMapCollisions(entity, mapPolygons);
      if (entity.x !== p.x || entity.y !== p.y) {
        p.x = entity.x;
        p.y = entity.y;
      }
    }
  }

  get alive() {
    return this.age < this.lifetime;
  }

  get alpha() {
    const fadeStart = this.lifetime - 1000;
    if (this.age < fadeStart) return 1;
    return Math.max(0, 1 - (this.age - fadeStart) / 1000);
  }
}

export class RagdollManager {
  constructor() {
    this.ragdolls = [];
  }

  spawn(x, y, impulseX, impulseY, color) {
    this.ragdolls.push(new Ragdoll(x, y, impulseX, impulseY, color));
  }

  update(dt, mapPolygons) {
    for (let i = this.ragdolls.length - 1; i >= 0; i--) {
      this.ragdolls[i].update(dt, mapPolygons);
      if (!this.ragdolls[i].alive) {
        this.ragdolls.splice(i, 1);
      }
    }
  }

  draw(renderer) {
    for (const r of this.ragdolls) {
      const a = r.alpha;
      const color = r.color;
      // Head
      renderer.drawParticle(r.head.x, r.head.y, 6, color, a);
      // Lines between points (using particle layer for simplicity)
      // body, arms, legs drawn as particles along the lines
      const lines = [
        [r.head, r.shoulder],
        [r.shoulder, r.hip],
        [r.shoulder, r.handL],
        [r.shoulder, r.handR],
        [r.hip, r.footL],
        [r.hip, r.footR],
      ];
      for (const [from, to] of lines) {
        // Draw midpoint
        const mx = (from.x + to.x) / 2;
        const my = (from.y + to.y) / 2;
        renderer.drawParticle(mx, my, 2, color, a);
        renderer.drawParticle(to.x, to.y, 2, color, a);
      }
    }
  }
}
