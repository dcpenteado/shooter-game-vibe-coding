import { stepPlayer, stepProjectile, createPlayerEntity } from '../shared/physics.js';
import { PLAYER_STATE } from '../shared/protocol.js';
import {
  RESPAWN_TIME_MS, SERVER_TICK_DT, CLIENT_TICK_DT,
  AMMO_PICKUP_INTERVAL, AMMO_PICKUP_AMOUNT,
  PICKUP_COLLECT_RADIUS, PICKUP_DESPAWN_TIME,
  WEAPON_PICKUP_RESPAWN_TIME, WEAPON_PICKUP_COLLECT_RADIUS,
  MINE_MAX_PER_SPAWN, MINE_PLACEMENT_COOLDOWN, MINE_ACTIVATION_DELAY,
  MINE_TRIGGER_RADIUS, MINE_DAMAGE, MINE_LIFETIME,
} from '../shared/constants.js';

export class ServerWorld {
  constructor(mapData, charDef, weaponDefs) {
    this.mapData = mapData;
    this.mapPolygons = mapData.collisionPolygons;
    this.charDef = charDef;
    this.weaponDefs = weaponDefs;
    this.players = new Map(); // id -> entity
    this.projectiles = [];
    this.nextProjectileId = 1;
    this.pickups = [];
    this.nextPickupId = 1;
    this.pickupSpawnTimer = AMMO_PICKUP_INTERVAL;
    this.mines = [];
    this.nextMineId = 1;
    this.events = []; // events generated this tick
    this.tick = 0;

    // Weapon pickup spawn tracking
    this.weaponSpawnPoints = (mapData.weaponPickups || []).map(wp => ({
      x: wp.x,
      y: wp.y,
      weapon: wp.weapon,
      active: false,
      respawnTimer: 5000, // initial spawn delay
    }));
  }

  addPlayer(session) {
    const spawn = this._getSpawnPoint();
    const entity = createPlayerEntity(session.id, this.charDef, spawn.x, spawn.y);
    entity.name = session.name;
    this.players.set(session.id, entity);
    session.entity = entity;
    return entity;
  }

  removePlayer(id) {
    this.players.delete(id);
  }

  _getSpawnPoint() {
    const points = this.mapData.spawnPoints;
    // Pick random spawn, ideally furthest from other players
    if (this.players.size === 0) {
      return points[Math.floor(Math.random() * points.length)];
    }

    // Score each spawn by minimum distance to any player
    let best = points[0];
    let bestDist = -1;
    for (const sp of points) {
      let minDist = Infinity;
      for (const [, p] of this.players) {
        if (p.state !== PLAYER_STATE.ALIVE) continue;
        const dx = sp.x - p.x;
        const dy = sp.y - p.y;
        const dist = dx * dx + dy * dy;
        if (dist < minDist) minDist = dist;
      }
      if (minDist > bestDist) {
        bestDist = minDist;
        best = sp;
      }
    }
    return best;
  }

  update(sessions) {
    this.events = [];
    this.tick++;

    // Process inputs for each player
    for (const session of sessions) {
      const entity = session.entity;
      if (!entity || entity.state !== PLAYER_STATE.ALIVE) {
        // Handle respawn timer
        if (entity && entity.state === PLAYER_STATE.DEAD) {
          entity.respawnTimer -= SERVER_TICK_DT * 1000;
          if (entity.respawnTimer <= 0) {
            this._respawnPlayer(entity);
          }
        }
        // Drain inputs even if dead (keep queue clear)
        session.drainInputs();
        continue;
      }

      const inputs = session.drainInputs();

      if (inputs.length > 0) {
        // Process each input individually at the client's tick rate
        // This matches the client's prediction steps exactly
        for (const inp of inputs) {
          entity._tickTime = (entity._tickTime || 0) + CLIENT_TICK_DT;
          entity.aimAngle = inp.aimAngle;

          stepPlayer(entity, inp, CLIENT_TICK_DT, this.mapPolygons, this.mapData.bounds);

          if (entity.fireCooldown > 0) entity.fireCooldown -= CLIENT_TICK_DT;
          if (inp.fire) {
            const wep = this._getWeaponDef(entity);
            const isSemi = wep && wep.firing.mode === 'semi';
            if (!isSemi || !entity._prevFire) {
              this._tryFire(entity, inp.aimAngle);
            }
          }
          entity._prevFire = inp.fire;

          if (inp.reload && !entity.reloading) {
            const wep = this._getWeaponDef(entity);
            if (wep && entity.ammo < wep.ammo.magazineSize) {
              entity.reloading = true;
              entity.reloadTimer = wep.ammo.reloadTimeMs;
            }
          }
          if (entity.reloading) {
            entity.reloadTimer -= CLIENT_TICK_DT * 1000;
            if (entity.reloadTimer <= 0) {
              entity.reloading = false;
              const wep = this._getWeaponDef(entity);
              if (wep) {
                const needed = wep.ammo.magazineSize - entity.ammo;
                const available = Math.min(needed, entity.reserveAmmo);
                entity.ammo += available;
                entity.reserveAmmo -= available;
              }
            }
          }

          // Mine placement (rising edge)
          if (entity.mineCooldown > 0) entity.mineCooldown -= CLIENT_TICK_DT * 1000;
          if (inp.placeMine && !entity._prevPlaceMine && entity.mines > 0 && entity.mineCooldown <= 0) {
            this._placeMine(entity);
          }
          entity._prevPlaceMine = inp.placeMine;

          session.lastProcessedSeq = inp.seq;
        }
      } else {
        // No inputs received this tick — step with idle input
        entity._tickTime = (entity._tickTime || 0) + SERVER_TICK_DT;
        const idle = { moveDir: 0, jet: false, jump: false, aimAngle: entity.aimAngle, fire: false, reload: false };
        stepPlayer(entity, idle, SERVER_TICK_DT, this.mapPolygons, this.mapData.bounds);

        if (entity.fireCooldown > 0) entity.fireCooldown -= SERVER_TICK_DT;
        if (entity.mineCooldown > 0) entity.mineCooldown -= SERVER_TICK_DT * 1000;
        entity._prevFire = false;
        entity._prevPlaceMine = false;
        if (entity.reloading) {
          entity.reloadTimer -= SERVER_TICK_DT * 1000;
          if (entity.reloadTimer <= 0) {
            entity.reloading = false;
            const wep = this._getWeaponDef(entity);
            if (wep) {
              const needed = wep.ammo.magazineSize - entity.ammo;
              const available = Math.min(needed, entity.reserveAmmo);
              entity.ammo += available;
              entity.reserveAmmo -= available;
            }
          }
        }
      }
    }

    // Update projectiles
    const playersArr = [...this.players.values()].filter(p => p.state === PLAYER_STATE.ALIVE);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const proj = this.projectiles[i];
      const result = stepProjectile(proj, SERVER_TICK_DT, this.mapPolygons, playersArr);

      // Process all hits (piercing projectiles can hit multiple players per tick)
      for (let h = 0; h < result.hitPlayerIds.length; h++) {
        const victimId = result.hitPlayerIds[h];
        const hitPos = result.hitPositions[h];
        this._applyProjectileHit(proj, victimId, hitPos);
      }

      if (!result.alive) {
        this.projectiles.splice(i, 1);
      }
    }

    // Update mines
    const triggerRadiusSq = MINE_TRIGGER_RADIUS * MINE_TRIGGER_RADIUS;
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const mine = this.mines[i];
      mine.lifetime -= SERVER_TICK_DT * 1000;
      if (mine.lifetime <= 0) {
        this.mines.splice(i, 1);
        continue;
      }

      if (mine.state === 'idle') {
        // Check proximity to enemy players
        for (const player of playersArr) {
          if (player.id === mine.ownerId) continue;
          const dx = player.x - mine.x;
          const dy = player.y - mine.y;
          if (dx * dx + dy * dy < triggerRadiusSq) {
            mine.state = 'triggered';
            mine.triggerTimer = MINE_ACTIVATION_DELAY;
            mine.triggeredBy = player.id;
            this.events.push({
              event: 'mine_trigger',
              x: mine.x, y: mine.y
            });
            break;
          }
        }
      } else if (mine.state === 'triggered') {
        mine.triggerTimer -= SERVER_TICK_DT * 1000;
        if (mine.triggerTimer <= 0) {
          this._applyMineExplosion(mine);
          this.mines.splice(i, 1);
        }
      }
    }

    // Periodic ammo pickup spawn
    this.pickupSpawnTimer -= SERVER_TICK_DT * 1000;
    if (this.pickupSpawnTimer <= 0) {
      this.pickupSpawnTimer = AMMO_PICKUP_INTERVAL;
      const sp = this.mapData.spawnPoints[
        Math.floor(Math.random() * this.mapData.spawnPoints.length)
      ];
      this.pickups.push({
        id: this.nextPickupId++,
        type: 'ammo',
        amount: AMMO_PICKUP_AMOUNT,
        x: sp.x + (Math.random() - 0.5) * 100,
        y: sp.y - 20,
        lifetime: PICKUP_DESPAWN_TIME,
      });
    }

    // Weapon pickup spawn management
    for (const sp of this.weaponSpawnPoints) {
      if (!sp.active) {
        sp.respawnTimer -= SERVER_TICK_DT * 1000;
        if (sp.respawnTimer <= 0) {
          sp.active = true;
          sp.pickupId = this.nextPickupId++;
          this.pickups.push({
            id: sp.pickupId,
            type: 'weapon',
            weaponId: sp.weapon,
            amount: 0,
            x: sp.x,
            y: sp.y,
            lifetime: Infinity,
            _spawnPointRef: sp,
          });
        }
      }
    }

    // Update pickups: check collection & despawn
    const collectRadiusSq = PICKUP_COLLECT_RADIUS * PICKUP_COLLECT_RADIUS;
    const weapRadiusSq = WEAPON_PICKUP_COLLECT_RADIUS * WEAPON_PICKUP_COLLECT_RADIUS;
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const pickup = this.pickups[i];
      pickup.lifetime -= SERVER_TICK_DT * 1000;
      if (pickup.lifetime <= 0) {
        this.pickups.splice(i, 1);
        continue;
      }

      let collected = false;
      for (const player of playersArr) {
        if (player.state !== PLAYER_STATE.ALIVE) continue;
        const dx = player.x - pickup.x;
        const dy = player.y - pickup.y;
        const distSq = dx * dx + dy * dy;

        if (pickup.type === 'weapon') {
          if (distSq < weapRadiusSq) {
            // Don't pick up if already holding this weapon
            if (player.weapon === pickup.weaponId) continue;

            // Drop current weapon's ammo as ammo pickup
            if (player.weapon === 'assault_rifle') {
              const dropAmount = player.ammo + player.reserveAmmo;
              if (dropAmount > 0) {
                this.pickups.push({
                  id: this.nextPickupId++,
                  type: 'ammo',
                  amount: dropAmount,
                  x: player.x,
                  y: player.y - 20,
                  lifetime: PICKUP_DESPAWN_TIME,
                });
              }
            } else {
              // Drop non-AR weapon as weapon pickup
              this.pickups.push({
                id: this.nextPickupId++,
                type: 'weapon',
                weaponId: player.weapon,
                amount: 0,
                x: player.x,
                y: player.y - 20,
                lifetime: PICKUP_DESPAWN_TIME,
              });
            }

            // Equip new weapon
            player.weapon = pickup.weaponId;
            const newWep = this._getWeaponDef(player);
            if (newWep) {
              player.ammo = newWep.ammo.magazineSize;
              player.reserveAmmo = newWep.ammo.reserveMax;
            }
            player.reloading = false;
            player.reloadTimer = 0;
            player.fireCooldown = 0;

            this.events.push({
              event: 'weapon_pickup',
              playerId: player.id,
              weaponId: pickup.weaponId,
              x: pickup.x,
              y: pickup.y,
            });

            // Handle spawn point respawn timer
            if (pickup._spawnPointRef) {
              pickup._spawnPointRef.active = false;
              pickup._spawnPointRef.respawnTimer = WEAPON_PICKUP_RESPAWN_TIME;
            }

            this.pickups.splice(i, 1);
            collected = true;
            break;
          }
        } else {
          // Ammo pickup
          if (distSq < collectRadiusSq) {
            const wep = this._getWeaponDef(player);
            const magSize = wep ? wep.ammo.magazineSize : 30;
            const magSpace = magSize - player.ammo;
            const toMag = Math.min(pickup.amount, magSpace);
            player.ammo += toMag;
            player.reserveAmmo += pickup.amount - toMag;
            // Cap reserve ammo
            const reserveMax = wep ? wep.ammo.reserveMax : 120;
            if (player.reserveAmmo > reserveMax) player.reserveAmmo = reserveMax;
            this.events.push({
              event: 'ammo_pickup',
              playerId: player.id,
              amount: pickup.amount,
              x: pickup.x,
              y: pickup.y,
            });
            this.pickups.splice(i, 1);
            collected = true;
            break;
          }
        }
      }
      if (collected) continue;
    }

  }

  _tryFire(entity, aimAngle) {
    if (entity.fireCooldown > 0) return;
    if (entity.ammo <= 0) return;
    if (entity.reloading) return;

    const wep = this._getWeaponDef(entity);
    if (!wep) return;

    const cooldown = 60 / wep.firing.rateOfFire;
    entity.fireCooldown = cooldown;
    entity.ammo--;

    // Apply spread
    const spread = (Math.random() - 0.5) * wep.projectile.spread;
    const angle = aimAngle + spread;

    const shoulder = wep.muzzleOffset?.shoulder ?? -10;
    const barrel = wep.muzzleOffset?.barrel ?? 24;
    const muzzleX = entity.x + Math.cos(angle) * barrel;
    const muzzleY = (entity.y + shoulder) + Math.sin(angle) * barrel;

    this.projectiles.push({
      id: this.nextProjectileId++,
      x: muzzleX,
      y: muzzleY,
      vx: Math.cos(angle) * wep.projectile.speed,
      vy: Math.sin(angle) * wep.projectile.speed,
      ownerId: entity.id,
      damage: wep.projectile.damage,
      lifetime: wep.projectile.lifetime,
      gravity: wep.projectile.gravity || false,
      radius: wep.projectile.radius,
      weapon: wep.id,
      piercing: wep.projectile.piercing || false,
      _hitIds: [],
    });

    // Apply recoil knockback (opposite direction of shot)
    const kb = wep.recoil?.knockback || 0;
    if (kb > 0) {
      entity.vx -= Math.cos(angle) * kb;
      entity.vy -= Math.sin(angle) * kb;
    }
  }

  _applyProjectileHit(proj, victimId, hitPos) {
    const victim = this.players.get(victimId);
    if (!victim) return;

    victim.hp -= proj.damage;

    const hitDir = { x: proj.vx, y: proj.vy };
    const len = Math.sqrt(hitDir.x * hitDir.x + hitDir.y * hitDir.y) || 1;
    this.events.push({
      event: 'hit',
      x: hitPos.x,
      y: hitPos.y,
      dirX: hitDir.x / len,
      dirY: hitDir.y / len,
    });

    if (victim.hp <= 0) {
      victim.hp = 0;
      victim.state = PLAYER_STATE.DEAD;
      victim.respawnTimer = RESPAWN_TIME_MS;
      victim.deaths++;

      const killer = this.players.get(proj.ownerId);
      if (killer) killer.kills++;
      this.events.push({
        event: 'kill',
        killerId: proj.ownerId,
        killerName: killer ? killer.name : '?',
        victimId: victim.id,
        victimName: victim.name,
        victimX: victim.x,
        victimY: victim.y,
        victimColor: victim.color,
        dirX: hitDir.x / len,
        dirY: hitDir.y / len,
        weapon: proj.weapon,
      });

      // Drop victim's weapon/ammo on death
      if (victim.weapon !== 'assault_rifle') {
        this.pickups.push({
          id: this.nextPickupId++,
          type: 'weapon',
          weaponId: victim.weapon,
          amount: 0,
          x: victim.x,
          y: victim.y - 20,
          lifetime: PICKUP_DESPAWN_TIME,
        });
      } else {
        const dropAmount = victim.ammo + victim.reserveAmmo;
        if (dropAmount > 0) {
          this.pickups.push({
            id: this.nextPickupId++,
            type: 'ammo',
            amount: dropAmount,
            x: victim.x,
            y: victim.y - 20,
            lifetime: PICKUP_DESPAWN_TIME,
          });
        }
      }
    }
  }

  _placeMine(entity) {
    const mine = {
      id: this.nextMineId++,
      x: entity.x,
      y: entity.y + entity.height / 2, // at player's feet
      ownerId: entity.id,
      state: 'idle',
      triggerTimer: 0,
      triggeredBy: null,
      lifetime: MINE_LIFETIME,
    };
    this.mines.push(mine);
    entity.mines--;
    entity.mineCooldown = MINE_PLACEMENT_COOLDOWN;
    this.events.push({
      event: 'mine_place',
      playerId: entity.id,
      x: mine.x,
      y: mine.y,
    });
  }

  _applyMineExplosion(mine) {
    const victim = this.players.get(mine.triggeredBy);

    this.events.push({
      event: 'mine_explode',
      x: mine.x,
      y: mine.y,
      ownerId: mine.ownerId,
    });

    if (!victim || victim.state !== PLAYER_STATE.ALIVE) return;

    victim.hp -= MINE_DAMAGE;

    // Strong vertical knockback (launch upward)
    victim.vy = -650;
    // Horizontal push away from mine center
    const dx = victim.x - mine.x;
    victim.vx += (dx >= 0 ? 1 : -1) * 200;
    victim.onGround = false;

    if (victim.hp <= 0) {
      victim.hp = 0;
      victim.state = PLAYER_STATE.DEAD;
      victim.respawnTimer = RESPAWN_TIME_MS;
      victim.deaths++;

      const killer = this.players.get(mine.ownerId);
      if (killer && killer.id !== victim.id) killer.kills++;
      this.events.push({
        event: 'kill',
        killerId: mine.ownerId,
        killerName: killer ? killer.name : '?',
        victimId: victim.id,
        victimName: victim.name,
        victimX: victim.x,
        victimY: victim.y,
        victimColor: victim.color,
        dirX: 0,
        dirY: -1,
        weapon: 'mine',
      });

      // Drop victim's weapon/ammo on death
      if (victim.weapon !== 'assault_rifle') {
        this.pickups.push({
          id: this.nextPickupId++,
          type: 'weapon',
          weaponId: victim.weapon,
          amount: 0,
          x: victim.x,
          y: victim.y - 20,
          lifetime: PICKUP_DESPAWN_TIME,
        });
      } else {
        const dropAmount = victim.ammo + victim.reserveAmmo;
        if (dropAmount > 0) {
          this.pickups.push({
            id: this.nextPickupId++,
            type: 'ammo',
            amount: dropAmount,
            x: victim.x,
            y: victim.y - 20,
            lifetime: PICKUP_DESPAWN_TIME,
          });
        }
      }
    }
  }

  _getWeaponDef(entity) {
    return this.weaponDefs[entity.weapon] || null;
  }

  _respawnPlayer(entity) {
    const spawn = this._getSpawnPoint();
    entity.x = spawn.x;
    entity.y = spawn.y;
    entity.vx = 0;
    entity.vy = 0;
    entity.hp = entity.maxHP;
    entity.fuel = entity.maxFuel;
    entity.state = PLAYER_STATE.ALIVE;
    entity.onGround = false;
    entity.reloading = false;
    entity.fireCooldown = 0;

    // Always respawn with assault rifle
    entity.weapon = 'assault_rifle';
    const wep = this._getWeaponDef(entity);
    if (wep) {
      entity.ammo = wep.ammo.magazineSize;
      entity.reserveAmmo = wep.ammo.reserveMax;
    }

    // Reset mines
    entity.mines = MINE_MAX_PER_SPAWN;
    entity.mineCooldown = 0;
    entity._prevPlaceMine = false;

    this.events.push({
      event: 'respawn',
      playerId: entity.id,
      x: entity.x,
      y: entity.y,
    });
  }

  buildSnapshot(sessions) {
    const players = [];
    for (const session of sessions) {
      const e = session.entity;
      if (!e) continue;
      players.push({
        id: e.id,
        x: Math.round(e.x * 100) / 100,
        y: Math.round(e.y * 100) / 100,
        vx: Math.round(e.vx * 100) / 100,
        vy: Math.round(e.vy * 100) / 100,
        onGround: e.onGround,
        aimAngle: Math.round(e.aimAngle * 100) / 100,
        hp: e.hp,
        fuel: Math.round(e.fuel * 10) / 10,
        state: e.state,
        jetting: e.jetting,
        ammo: e.ammo,
        reserveAmmo: e.reserveAmmo,
        name: e.name,
        color: e.color,
        kills: e.kills,
        deaths: e.deaths,
        weapon: e.weapon,
        mines: e.mines,
      });
    }

    const projectiles = this.projectiles.map(p => ({
      id: p.id,
      x: Math.round(p.x),
      y: Math.round(p.y),
      vx: Math.round(p.vx),
      vy: Math.round(p.vy),
      weapon: p.weapon,
      ownerId: p.ownerId,
    }));

    const pickups = this.pickups.map(p => ({
      id: p.id,
      type: p.type,
      amount: p.amount,
      x: Math.round(p.x),
      y: Math.round(p.y),
      weaponId: p.weaponId || null,
    }));

    const mines = this.mines.map(m => ({
      id: m.id,
      x: Math.round(m.x),
      y: Math.round(m.y),
      ownerId: m.ownerId,
      state: m.state,
    }));

    return { players, projectiles, pickups, mines, tick: this.tick };
  }
}
