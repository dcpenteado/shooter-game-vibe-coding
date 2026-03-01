import { CLIENT_TICK_DT, RESPAWN_TIME_MS } from '../../shared/constants.js';
import { stepPlayer, stepProjectile, createPlayerEntity } from '../../shared/physics.js';
import { MSG, PLAYER_STATE } from '../../shared/protocol.js';
import { Renderer } from './Renderer.js';
import { InputHandler } from './InputHandler.js';
import { Camera } from './Camera.js';
import { NetworkClient } from './NetworkClient.js';
import { Prediction } from './Prediction.js';
import { Interpolation } from './Interpolation.js';
import { HUD } from './HUD.js';
import { ParticleSystem } from './ParticleSystem.js';
import { RagdollManager } from './Ragdoll.js';

export class Game {
  constructor(canvas) {
    this.canvas = canvas;
    this.renderer = new Renderer();
    this.input = new InputHandler(canvas);
    this.camera = new Camera(window.innerWidth, window.innerHeight);
    if (this.input.isMobile) {
      this.camera.zoom = 0.5;
    }
    this.net = new NetworkClient();
    this.prediction = new Prediction();
    this.interpolation = new Interpolation();
    this.hud = new HUD();
    this.particles = new ParticleSystem();
    this.ragdolls = new RagdollManager();

    this.mapData = null;
    this.mapPolygons = [];
    this.weaponDefs = {};
    this.charDef = null;
    this.localPlayer = null;
    this.remotePlayers = new Map();
    this.projectiles = [];
    this.pickups = [];
    this.mines = [];
    this.running = false;
    this.lastTime = 0;
    this.accumulator = 0;
    this.serverTime = 0;
    this.nextProjectileId = 1;

    // Audio pools per weapon (built on _onWelcome from weapon JSON)
    this._weaponSounds = {};
    this._reloading = false;
    this._reloadTimer = 0;
    this._reloadTotal = 0;
    this._prevFire = false;
    this._prevPlaceMine = false;

    // Death sound
    this._deathSound = new Audio('assets/sounds/death.mp3');
    this._deathSound.volume = 0.3;

    // Mine sounds
    this._mineTimerSound = new Audio('assets/sounds/mine_timer.mp3');
    this._mineTimerSound.volume = 0.5;
    this._mineExplosionSound = new Audio('assets/sounds/mine_explosion.mp3');
    this._mineExplosionSound.volume = 0.6;

    // Jetpack sound (looping)
    this._jetSound = new Audio('assets/sounds/jetpack.mp3');
    this._jetSound.volume = 0.1;
    this._jetSound.loop = true;
    this._jetting = false;

    // Bind resize
    window.addEventListener('resize', () => {
      this.camera.resize(window.innerWidth, window.innerHeight);
    });
  }

  async init() {
    await this.renderer.init(this.canvas);
    this.input.bind();
  }

  async connectToServer() {
    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${location.host}`;

    this.net.onRoomList = (data) => {
      if (this.onRoomListUpdate) this.onRoomListUpdate(data);
    };
    this.net.onWelcome = (data) => this._onWelcome(data);
    this.net.onSnapshot = (snap) => this._onSnapshot(snap);
    this.net.onEvent = (evt) => this._onEvent(evt);
    this.net.onPlayerJoin = (data) => {};
    this.net.onPlayerLeave = (data) => this._onPlayerLeave(data);
    this.net.onDisconnect = () => this._onDisconnect();

    await this.net.connect(url);
  }

  joinRoom(playerName, roomId) {
    this.net.joinRoom(playerName, roomId);
  }

  createRoom(playerName, roomName) {
    this.net.createRoom(playerName, roomName);
  }

  refreshRooms() {
    this.net.requestRoomList();
  }

  _onWelcome(data) {
    this.mapData = data.map;
    this.mapPolygons = this.mapData.collisionPolygons;
    this.weaponDefs = {};
    for (const w of data.weapons) {
      this.weaponDefs[w.id] = w;
    }
    this.charDef = data.characters[0];

    // Build audio pools from weapon JSON sound config
    this._weaponSounds = {};
    for (const w of data.weapons) {
      const entry = {};
      const vol = w.sound?.volume ?? 0.4;
      if (w.sound?.fire) {
        entry.fire = { pool: Array.from({ length: 6 }, () => {
          const a = new Audio(w.sound.fire);
          a.volume = vol;
          return a;
        }), idx: 0 };
      }
      if (w.sound?.reload) {
        const a = new Audio(w.sound.reload);
        a.volume = vol;
        entry.reload = a;
      }
      if (entry.fire || entry.reload) this._weaponSounds[w.id] = entry;
    }

    // Draw map
    this.renderer.drawMap(this.mapData);
    this.camera.setMapBounds(this.mapData.bounds.width, this.mapData.bounds.height);

    // Load character sprites (async, game starts with stick figures immediately)
    this.renderer.initSprites(this.charDef).then(() => {
      this.renderer.clearAllPlayerGfx();
    });

    // Create local player
    const spawn = this.mapData.spawnPoints[0];
    this.localPlayer = createPlayerEntity(
      this.net.playerId, this.charDef, spawn.x, spawn.y
    );
    this.localPlayer.name = data.playerName || 'Player';
    this.localPlayer.prevX = this.localPlayer.x;
    this.localPlayer.prevY = this.localPlayer.y;
    this.prediction.setEntity(this.localPlayer);
    this.camera.snapTo(this.localPlayer.x, this.localPlayer.y);

    // Show HUD
    this.hud.show();

    // Show touch controls on mobile
    if (this.input.isMobile && this.input.touch) {
      this.input.touch.show();

      // Show desktop recommendation message
      const msg = document.createElement('div');
      msg.id = 'mobile-hint';
      msg.textContent = 'The gaming experience is much better on desktop';
      document.getElementById('hud').appendChild(msg);
      setTimeout(() => msg.remove(), 5000);
    }

    // Start game loop
    if (!this.running) {
      this.running = true;
      this.lastTime = performance.now();
      requestAnimationFrame((t) => this._loop(t));
    }

    // Ping periodically
    setInterval(() => this.net.ping(), 2000);

    this._waitingFirstSnapshot = true;
    if (this.onJoinedRoom) this.onJoinedRoom();
  }

  _onSnapshot(snap) {
    if (this._waitingFirstSnapshot) {
      this._waitingFirstSnapshot = false;
      if (this.onFirstSnapshot) this.onFirstSnapshot(snap);
    }
    this.serverTime = snap.tick;

    for (const p of snap.players) {
      if (p.id === this.net.playerId) {
        // Reconcile local player
        const serverState = {
          x: p.x, y: p.y,
          vx: p.vx, vy: p.vy,
          onGround: p.onGround,
          fuel: p.fuel,
          hp: p.hp,
        };
        const corrected = this.prediction.reconcile(
          serverState, snap.yourSeq, this.mapPolygons, CLIENT_TICK_DT, this.mapData.bounds
        );
        // Only correct position if prediction error exceeds deadzone
        // Small errors are ignored — trust the client prediction
        const dx = corrected.x - this.localPlayer.x;
        const dy = corrected.y - this.localPlayer.y;
        const errorSq = dx * dx + dy * dy;
        if (errorSq > 25) { // 5px deadzone
          this.localPlayer.x = corrected.x;
          this.localPlayer.y = corrected.y;
          this.localPlayer.prevX = corrected.x;
          this.localPlayer.prevY = corrected.y;
          this.localPlayer.vx = corrected.vx;
          this.localPlayer.vy = corrected.vy;
          this.localPlayer.onGround = corrected.onGround;
        }
        this.localPlayer.fuel = corrected.fuel;
        this.localPlayer.hp = p.hp;
        // Cancel reload bar when server confirms ammo refilled
        if (p.ammo > this.localPlayer.ammo && this._reloadTimer > 0) {
          this._reloadTimer = 0;
        }
        this.localPlayer.ammo = p.ammo;
        this.localPlayer.reserveAmmo = p.reserveAmmo;
        this.localPlayer.state = p.state;

        // Sync mines count from server
        if (p.mines !== undefined) this.localPlayer.mines = p.mines;

        // Sync weapon type from server
        if (p.weapon && p.weapon !== this.localPlayer.weapon) {
          this.localPlayer.weapon = p.weapon;
          this._reloading = false;
          this._reloadTimer = 0;
          this._reloadTotal = 0;
          this._prevFire = false;
        }
      } else {
        // Push remote player state for interpolation
        this.interpolation.pushState(p.id, performance.now(), {
          x: p.x, y: p.y,
          vx: p.vx, vy: p.vy,
          aimAngle: p.aimAngle,
          hp: p.hp,
          fuel: p.fuel,
          state: p.state,
          jetting: p.jetting,
          onGround: p.onGround,
          name: p.name || 'Player',
          color: p.color || '#cc4444',
        });
      }
    }

    // Update projectiles, preserving client-side trail data
    const incoming = snap.projectiles || [];
    const oldById = new Map(this.projectiles.map(p => [p.id, p]));
    for (const proj of incoming) {
      const prev = oldById.get(proj.id);
      if (prev?.trail) proj.trail = prev.trail;
    }
    this.projectiles = incoming;
    this.pickups = snap.pickups || [];
    this.mines = snap.mines || [];

    // Collect leaderboard data from all players in snapshot
    this.leaderboardData = snap.players.map(p => ({
      name: p.name || 'Player',
      kills: p.kills || 0,
      deaths: p.deaths || 0,
    }));

    // Determine kill leader (must have 3+ kills to earn the crown)
    let leaderId = null;
    let maxKills = 0;
    for (const p of snap.players) {
      if ((p.kills || 0) > maxKills) {
        maxKills = p.kills;
        leaderId = p.id;
      }
    }
    this.renderer.leaderId = maxKills >= 3 ? leaderId : null;
  }

  _onEvent(evt) {
    if (evt.event === 'kill') {
      this.hud.addKill(evt.killerName, evt.victimName, evt.weapon);

      // Blood particles
      this.particles.emitBlood(evt.victimX, evt.victimY, evt.dirX || 0, evt.dirY || 0);

      // Death sound
      this._deathSound.currentTime = 0;
      this._deathSound.play().catch(() => {});
    }
    if (evt.event === 'hit') {
      this.particles.emitBlood(evt.x, evt.y, evt.dirX || 0, evt.dirY || 0);
    }
    if (evt.event === 'mine_trigger') {
      this._mineTimerSound.currentTime = 0;
      this._mineTimerSound.play().catch(() => {});
    }
    if (evt.event === 'mine_explode') {
      this.particles.emitExplosion(evt.x, evt.y);
      this._mineExplosionSound.currentTime = 0;
      this._mineExplosionSound.play().catch(() => {});
    }
  }

  _onPlayerLeave(data) {
    this.interpolation.removePlayer(data.playerId);
    this.renderer.removePlayer(data.playerId);
  }

  _onDisconnect() {
    this.running = false;
    this.hud.hide();
    if (this.input.isMobile && this.input.touch) {
      this.input.touch.hide();
    }
    document.getElementById('lobby').style.display = 'flex';
    document.getElementById('step-name').classList.remove('hidden');
    document.getElementById('step-rooms').classList.add('hidden');
    document.getElementById('lobby-status').textContent = 'Disconnected from server.';
  }

  _loop(timestamp) {
    if (!this.running) return;
    requestAnimationFrame((t) => this._loop(t));

    const delta = Math.min(timestamp - this.lastTime, 100) / 1000; // cap at 100ms
    this.lastTime = timestamp;
    this.accumulator += delta;

    const dt = CLIENT_TICK_DT;

    while (this.accumulator >= dt) {
      // Save previous position for render interpolation
      if (this.localPlayer) {
        this.localPlayer.prevX = this.localPlayer.x;
        this.localPlayer.prevY = this.localPlayer.y;
      }
      this._tick(dt);
      this.accumulator -= dt;
    }

    // Alpha = fraction between last tick and next tick (0.0 to 1.0)
    const alpha = this.accumulator / dt;
    this._render(alpha);
  }

  _tick(dt) {
    // Always update visual effects (even while dead)
    this.particles.update(dt);
    this.ragdolls.update(dt, this.mapPolygons);
    this.renderer.updateDeathFragments(dt);

    if (this.localPlayer.state !== PLAYER_STATE.ALIVE) return;

    // Get input
    const rawInput = this.input.getInput(this.camera.x, this.camera.y);

    // Calculate aim angle
    let aimAngle;
    if (this.input.isMobile) {
      // Mobile: aim follows joystick direction
      const tc = this.input.touch;
      const jx = tc.joystickX;
      const jy = tc.joystickY;
      const deadzone = 0.2;
      if (Math.abs(jx) > deadzone || Math.abs(jy) > deadzone) {
        // Joystick is active: aim in joystick direction
        this._lastMobileAimAngle = Math.atan2(jy, jx);
      }
      // Use last known angle (defaults to facing right)
      aimAngle = this._lastMobileAimAngle ?? 0;
    } else {
      // Desktop: aim toward mouse world position
      aimAngle = Math.atan2(
        rawInput.mouseWorldY - (this.localPlayer.y - 10),
        rawInput.mouseWorldX - this.localPlayer.x
      );
    }
    rawInput.aimAngle = aimAngle;
    this.localPlayer.aimAngle = aimAngle;
    this.localPlayer.moveDir = rawInput.moveDir;
    this.localPlayer._tickTime = (this.localPlayer._tickTime || 0) + dt;

    // Client-side prediction
    stepPlayer(this.localPlayer, rawInput, dt, this.mapPolygons, this.mapData.bounds);

    // Handle firing (client visual + recoil knockback)
    const currentWep = this.weaponDefs[this.localPlayer.weapon];
    const isSemi = currentWep && currentWep.firing.mode === 'semi';
    const fireTriggered = rawInput.fire && (!isSemi || !this._prevFire);

    if (fireTriggered && this.localPlayer.fireCooldown <= 0 && this.localPlayer.ammo > 0) {
      const wep = currentWep;
      if (wep) {
        const cooldown = 60 / wep.firing.rateOfFire;
        this.localPlayer.fireCooldown = cooldown;

        // Muzzle flash particle
        const shoulder = wep.muzzleOffset?.shoulder ?? -10;
        const barrel = wep.muzzleOffset?.barrel ?? 24;
        const muzzleX = this.localPlayer.x + Math.cos(aimAngle) * barrel;
        const muzzleY = (this.localPlayer.y + shoulder) + Math.sin(aimAngle) * barrel;
        this.particles.emitMuzzleFlash(muzzleX, muzzleY);

        // Play gunfire sound from weapon config
        const sfx = this._weaponSounds[wep.id];
        if (sfx?.fire) {
          const snd = sfx.fire.pool[sfx.fire.idx];
          snd.currentTime = 0;
          snd.play().catch(() => {});
          sfx.fire.idx = (sfx.fire.idx + 1) % sfx.fire.pool.length;
        }

        // Apply recoil knockback (opposite direction of shot)
        const kb = wep.recoil?.knockback || 0;
        if (kb > 0) {
          this.localPlayer.vx -= Math.cos(aimAngle) * kb;
          this.localPlayer.vy -= Math.sin(aimAngle) * kb;
        }
      }
    }

    // Store prediction (after knockback so reconciliation is correct)
    this.prediction.push(rawInput.seq, rawInput, {
      x: this.localPlayer.x,
      y: this.localPlayer.y,
      vx: this.localPlayer.vx,
      vy: this.localPlayer.vy,
      onGround: this.localPlayer.onGround,
      fuel: this.localPlayer.fuel,
    });
    if (this.localPlayer.fireCooldown > 0) {
      this.localPlayer.fireCooldown -= dt;
    }

    // Reload tracking (client-side timer for HUD)
    if (rawInput.reload && !this._reloading) {
      const wep = this.weaponDefs[this.localPlayer.weapon];
      if (wep && this.localPlayer.ammo < wep.ammo.magazineSize) {
        this._reloading = true;
        this._reloadTimer = wep.ammo.reloadTimeMs;
        this._reloadTotal = wep.ammo.reloadTimeMs;
        const sfx = this._weaponSounds[wep.id];
        if (sfx?.reload) {
          sfx.reload.currentTime = 0;
          sfx.reload.play().catch(() => {});
        }
      }
    }
    if (!rawInput.reload) this._reloading = false;
    if (this._reloadTimer > 0) {
      this._reloadTimer -= dt * 1000;
      if (this._reloadTimer <= 0) this._reloadTimer = 0;
    }

    // Send input to server
    this.net.sendInput({
      seq: rawInput.seq,
      moveDir: rawInput.moveDir,
      jet: rawInput.jet,
      jump: rawInput.jump,
      aimAngle: rawInput.aimAngle,
      fire: rawInput.fire,
      reload: rawInput.reload,
      placeMine: rawInput.placeMine && !this._prevPlaceMine, // rising edge only
    });

    this._prevFire = rawInput.fire;
    this._prevPlaceMine = rawInput.placeMine;
  }

  _render(alpha) {
    // Clear per-frame graphics (projectiles, particles)
    this.renderer.clearFrame();

    // Interpolate local player position for smooth rendering between physics ticks
    let renderX, renderY;
    if (this.localPlayer) {
      const px = this.localPlayer.prevX ?? this.localPlayer.x;
      const py = this.localPlayer.prevY ?? this.localPlayer.y;
      renderX = px + (this.localPlayer.x - px) * alpha;
      renderY = py + (this.localPlayer.y - py) * alpha;
      this.camera.follow(renderX, renderY);
    }
    this.renderer.applyCamera(this.camera);

    // Draw remote players (interpolated)
    const renderTime = performance.now();
    const remoteIds = [...this.interpolation.buffers.keys()];
    for (const id of remoteIds) {
      if (id === this.net.playerId) continue;
      const state = this.interpolation.getState(id, renderTime);
      if (state) {
        this.renderer.drawPlayer(
          this.renderer.layers.remotePlayers,
          { id, ...state },
          false
        );
        this.renderer.markPlayerActive(id);
        // Jetpack smoke for remote players
        if (state.state !== PLAYER_STATE.DEAD && state.jetting) {
          const facing = Math.cos(state.aimAngle || 0) >= 0 ? 1 : -1;
          this.particles.emitJetSmoke(state.x - facing * 8, state.y - 4);
        }
      }
    }

    // Draw local player at interpolated position
    if (this.localPlayer) {
      const physX = this.localPlayer.x;
      const physY = this.localPlayer.y;
      if (renderX != null) {
        this.localPlayer.x = renderX;
        this.localPlayer.y = renderY;
      }
      this.renderer.drawPlayer(
        this.renderer.layers.localPlayer,
        this.localPlayer,
        true
      );
      this.localPlayer.x = physX;
      this.localPlayer.y = physY;
      this.renderer.markPlayerActive(this.localPlayer.id);
      // Jetpack smoke + sound for local player
      const isJetting = this.localPlayer.state === PLAYER_STATE.ALIVE && this.localPlayer.jetting;
      if (isJetting) {
        const facing = Math.cos(this.localPlayer.aimAngle || 0) >= 0 ? 1 : -1;
        this.particles.emitJetSmoke(renderX - facing * 8, renderY - 4);
      }
      if (isJetting && !this._jetting) {
        this._jetSound.currentTime = 0;
        this._jetSound.play().catch(() => {});
      } else if (!isJetting && this._jetting) {
        this._jetSound.pause();
      }
      this._jetting = isJetting;

      // Reload hint when magazine is empty and not reloading
      const showReloadHint = this.localPlayer.state !== 1
        && this.localPlayer.ammo === 0
        && this._reloadTimer <= 0;
      this.renderer.drawReloadHint(renderX, renderY, showReloadHint, this.input.isMobile);
    }

    // Remove stale player graphics
    this.renderer.pruneInactivePlayers();

    // Draw projectiles with trails
    for (const proj of this.projectiles) {
      const wep = this.weaponDefs[proj.weapon] || {};
      const r = wep.rendering || {};

      // Build trail history
      if (!proj.trail) proj.trail = [];
      proj.trail.push({ x: proj.x, y: proj.y });
      const maxTrailLen = r.trailLength ?? 10;
      if (proj.trail.length > maxTrailLen) {
        proj.trail.splice(0, proj.trail.length - maxTrailLen);
      }

      this.renderer.drawProjectile(proj.x, proj.y, proj.vx, proj.vy, proj.trail, {
        color: r.tracerColor || '#ffdd44',
        trailWidth: r.trailWidth ?? 3,
        trailOpacity: r.trailOpacity ?? 0.6,
        glowRadius: r.glowRadius ?? 6,
        coreRadius: r.coreRadius ?? 1.5,
      });
    }

    // Draw pickups
    for (const pickup of this.pickups) {
      if (pickup.type === 'weapon') {
        this.renderer.drawWeaponPickup(pickup.x, pickup.y, pickup.weaponId);
      } else {
        this.renderer.drawPickup(pickup.x, pickup.y, pickup.amount);
      }
    }

    // Draw mines
    for (const mine of this.mines) {
      const isOwn = this.localPlayer && mine.ownerId === this.localPlayer.id;
      this.renderer.drawMine(mine.x, mine.y, mine.state, isOwn);
    }

    // Draw particles & ragdolls
    this.particles.draw(this.renderer);
    this.ragdolls.draw(this.renderer);

    // Draw crosshair (desktop only — mobile aims via joystick)
    if (!this.input.isMobile) {
      this.renderer.drawCrosshair(this.input.mouseX, this.input.mouseY);
    }

    // Update HUD
    if (this.localPlayer) {
      const reloadPct = (this._reloadTotal > 0 && this._reloadTimer > 0)
        ? 1 - this._reloadTimer / this._reloadTotal : 0;
      const hudWep = this.weaponDefs[this.localPlayer.weapon];
      this.hud.update({
        hp: this.localPlayer.hp,
        maxHP: this.localPlayer.maxHP,
        fuel: this.localPlayer.fuel,
        maxFuel: this.localPlayer.maxFuel,
        ammo: this.localPlayer.ammo,
        reserveAmmo: this.localPlayer.reserveAmmo,
        reloadPct,
        weaponName: hudWep ? hudWep.name : '',
        magazineSize: hudWep ? hudWep.ammo.magazineSize : 30,
        mines: this.localPlayer.mines ?? 0,
      });
      if (this.leaderboardData) {
        this.hud.updateLeaderboard(this.leaderboardData);
      }
    }
  }
}
