import {
  GRAVITY, MAX_VELOCITY, MAX_JET_UP_SPEED,
} from './constants.js';
import { resolveMapCollisions, lineVsPolygon, lineVsAABB } from './collision.js';

/**
 * Step a single player entity forward by dt seconds.
 * Mutates entity in-place.
 * mapBounds is optional { width, height } to clamp position.
 */
export function stepPlayer(entity, input, dt, mapPolygons, mapBounds) {
  // Horizontal acceleration
  const accel = entity.onGround ? entity.moveAccel : entity.airAccel;
  entity.vx += input.moveDir * accel * dt;

  // Ground friction
  if (entity.onGround && input.moveDir === 0) {
    entity.vx *= entity.friction;
  }

  // Clamp horizontal speed
  const maxSpeed = entity.moveSpeed;
  if (Math.abs(entity.vx) > maxSpeed && !input.jet) {
    entity.vx = Math.sign(entity.vx) * maxSpeed;
  }

  // Gravity
  entity.vy += GRAVITY * dt;

  // Jump
  if (input.jump && entity.onGround) {
    entity.vy = entity.jumpVel;
    entity.onGround = false;
  }

  // Jet boots (vertical thrust only, no horizontal boost)
  entity.jetting = false;
  if (input.jet && entity.fuel > 0) {
    entity.vy += entity.jetThrust * dt;
    entity.fuel -= entity.jetConsume * dt;
    if (entity.fuel < 0) entity.fuel = 0;
    entity.lastJetTime = entity._tickTime || 0;
    entity.jetting = true;
  }

  // Fuel regen
  const timeSinceJet = ((entity._tickTime || 0) - (entity.lastJetTime || 0)) * 1000;
  if (!input.jet && timeSinceJet > entity.jetRegenDelay) {
    entity.fuel = Math.min(entity.maxFuel, entity.fuel + entity.jetRegen * dt);
  }

  // Clamp vertical speed (tighter cap when jetting upward to prevent runaway acceleration)
  const maxUp = entity.jetting ? MAX_JET_UP_SPEED : MAX_VELOCITY;
  entity.vy = Math.max(-maxUp, Math.min(entity.maxFall, entity.vy));

  // Apply velocity
  entity.x += entity.vx * dt;
  entity.y += entity.vy * dt;

  // Resolve map collisions
  const result = resolveMapCollisions(entity, mapPolygons);
  entity.onGround = result.grounded;
  if (result.hitX) entity.vx = 0;
  if (result.hitY) entity.vy = 0;

  // Clamp to map bounds (hard limit)
  if (mapBounds) {
    const hw = entity.width / 2;
    const hh = entity.height / 2;
    if (entity.x - hw < 0) { entity.x = hw; entity.vx = 0; }
    if (entity.x + hw > mapBounds.width) { entity.x = mapBounds.width - hw; entity.vx = 0; }
    if (entity.y - hh < 0) { entity.y = hh; entity.vy = 0; }
    if (entity.y + hh > mapBounds.height) { entity.y = mapBounds.height - hh; entity.vy = 0; entity.onGround = true; }
  }
}

/**
 * Step a projectile forward. Returns { alive, hitPlayerId, hitPos }
 */
export function stepProjectile(proj, dt, mapPolygons, players) {
  const prevX = proj.x;
  const prevY = proj.y;

  // Apply gravity if needed
  if (proj.gravity) {
    proj.vy += GRAVITY * dt;
  }

  proj.x += proj.vx * dt;
  proj.y += proj.vy * dt;
  proj.lifetime -= dt * 1000;

  if (proj.lifetime <= 0) {
    return { alive: false, hitPlayerId: null, hitPos: null };
  }

  // Check map collision (line segment)
  for (const poly of mapPolygons) {
    const hit = lineVsPolygon(prevX, prevY, proj.x, proj.y, poly.vertices);
    if (hit) {
      return { alive: false, hitPlayerId: null, hitPos: { x: hit.x, y: hit.y } };
    }
  }

  // Check player collision
  if (players) {
    for (const player of players) {
      if (player.id === proj.ownerId) continue;
      if (player.state !== 0) continue; // not alive

      const hit = lineVsAABB(prevX, prevY, proj.x, proj.y, {
        x: player.x,
        y: player.y,
        w: player.width,
        h: player.height,
      });
      if (hit) {
        return { alive: false, hitPlayerId: player.id, hitPos: { x: hit.x, y: hit.y } };
      }
    }
  }

  return { alive: true, hitPlayerId: null, hitPos: null };
}

/**
 * Create a player entity with defaults from a character definition.
 */
export function createPlayerEntity(id, charDef, spawnX, spawnY) {
  const p = charDef.physics;
  const j = charDef.jetBoots;
  const h = charDef.health;

  return {
    id,
    x: spawnX,
    y: spawnY,
    vx: 0,
    vy: 0,
    onGround: false,
    jetting: false,

    // Dimensions
    width: p.width,
    height: p.height,

    // Movement
    moveSpeed: p.moveSpeed,
    moveAccel: p.moveAcceleration || 1800,
    airAccel: p.airAcceleration || 600,
    jumpVel: p.jumpVelocity,
    maxFall: p.maxFallSpeed || 800,
    friction: p.groundFriction || 0.85,

    // Jet boots
    fuel: j.maxFuel,
    maxFuel: j.maxFuel,
    jetThrust: j.thrustForce,
    jetConsume: j.consumeRate,
    jetRegen: j.regenRate,
    jetRegenDelay: j.regenDelay || 300,
    jetHBoost: j.horizontalBoost || 0.3,
    lastJetTime: 0,

    // Health
    hp: h.maxHP,
    maxHP: h.maxHP,

    // Combat
    aimAngle: 0,
    state: 0,           // 0=alive, 1=dead, 2=respawning
    respawnTimer: 0,
    kills: 0,
    deaths: 0,

    // Weapon state
    weapon: charDef.combat?.primarySlot || 'assault_rifle',
    ammo: 30,
    reserveAmmo: 120,
    reloading: false,
    reloadTimer: 0,
    fireCooldown: 0,

    // Internal
    _tickTime: 0,
    name: '',
    color: charDef.rendering?.bodyColor || '#cc4444',
  };
}
