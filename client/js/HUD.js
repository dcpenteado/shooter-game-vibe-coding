export class HUD {
  constructor() {
    this.el = document.getElementById('hud');
    this.healthBar = document.getElementById('health-bar');
    this.healthText = document.getElementById('health-text');
    this.fuelBar = document.getElementById('fuel-bar');
    this.ammoCurrent = document.getElementById('ammo-current');
    this.ammoReserve = document.getElementById('ammo-reserve');
    this.killfeed = document.getElementById('hud-killfeed');
    this.leaderboard = document.getElementById('hud-leaderboard');
    this.reloadBar = document.getElementById('reload-bar');
    this.reloadBarFill = document.getElementById('reload-bar-fill');
    this.kills = [];
    this._lastLbHtml = '';
  }

  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }

  update(player) {
    if (!player) return;

    // Health bar
    const hpPct = Math.max(0, (player.hp / player.maxHP) * 100);
    this.healthBar.style.width = hpPct + '%';
    this.healthText.textContent = Math.round(player.hp);

    this.healthBar.classList.remove('low', 'medium');
    if (hpPct <= 30) this.healthBar.classList.add('low');
    else if (hpPct <= 60) this.healthBar.classList.add('medium');

    // Fuel bar
    const fuelPct = Math.max(0, (player.fuel / player.maxFuel) * 100);
    this.fuelBar.style.width = fuelPct + '%';

    // Ammo
    if (player.ammo !== undefined) {
      this.ammoCurrent.textContent = player.ammo;
      this.ammoCurrent.classList.toggle('low', player.ammo <= 5 && player.ammo > 0);
    }
    if (player.reserveAmmo !== undefined) {
      this.ammoReserve.textContent = player.reserveAmmo;
    }

    // Reload bar
    if (player.reloadPct > 0) {
      this.reloadBar.classList.remove('hidden');
      this.reloadBarFill.style.width = (player.reloadPct * 100) + '%';
    } else {
      this.reloadBar.classList.add('hidden');
      this.reloadBarFill.style.width = '0%';
    }
  }

  addKill(killerName, victimName, weapon) {
    this.kills.push({ killer: killerName, victim: victimName, weapon, time: Date.now() });
    if (this.kills.length > 5) this.kills.shift();
    this._renderKillfeed();
  }

  updateLeaderboard(players) {
    if (!this.leaderboard || !players || players.length === 0) return;

    // Sort by kills descending, then by fewer deaths
    const sorted = [...players].sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    const top3 = sorted.slice(0, 3);

    const rankLabels = ['1st', '2nd', '3rd'];

    // Gun icon — Font Awesome "gun" (filled silhouette, CC BY 4.0)
    const pistolSvg = '<svg class="lb-stat-icon lb-kills-icon" viewBox="0 0 576 512" fill="currentColor"><path d="M528 56c0-13.3-10.7-24-24-24s-24 10.7-24 24l0 8L32 64C14.3 64 0 78.3 0 96L0 208c0 17.7 14.3 32 32 32l10 0c20.8 0 36.1 19.6 31 39.8L33 440.2c-2.4 9.6-.2 19.7 5.8 27.5S54.1 480 64 480l96 0c14.7 0 27.5-10 31-24.2L217 352l104.5 0c23.7 0 44.8-14.9 52.7-37.2L400.9 240l31.1 0c8.5 0 16.6-3.4 22.6-9.4L477.3 208l66.7 0c17.7 0 32-14.3 32-32l0-80c0-17.7-14.3-32-32-32l-16 0 0-8zM321.4 304L229 304l16-64 105 0-21 58.7c-1.1 3.2-4.2 5.3-7.5 5.3zM80 128l384 0c8.8 0 16 7.2 16 16s-7.2 16-16 16L80 160c-8.8 0-16-7.2-16-16s7.2-16 16-16z"/></svg>';

    // Skull icon — Lucide "skull" (stroke outline, ISC license)
    const skullSvg = '<svg class="lb-stat-icon lb-deaths-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/></svg>';

    const esc = (s) => {
      const el = document.createElement('span');
      el.textContent = s;
      return el.innerHTML;
    };

    const html = top3.map((p, i) => {
      return `<div class="lb-row">` +
        `<span class="lb-rank">${rankLabels[i]}</span>` +
        `<span class="lb-name">${esc(p.name || '?')}</span>` +
        `<span class="lb-stats">` +
          `<span class="lb-stat">${pistolSvg}<span class="lb-kills-val">${p.kills}</span></span>` +
          `<span class="lb-stat">${skullSvg}<span class="lb-deaths-val">${p.deaths}</span></span>` +
        `</span>` +
      `</div>`;
    }).join('');

    // Only update DOM if content changed (avoid re-triggering animations)
    if (html !== this._lastLbHtml) {
      this.leaderboard.innerHTML = html;
      this._lastLbHtml = html;
    }
  }

  _renderKillfeed() {
    const now = Date.now();
    this.kills = this.kills.filter(k => now - k.time < 5000);

    const skullSvg = '<svg class="kill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12.5 17-.5-1-.5 1h1z"/><path d="M15 22a1 1 0 0 0 1-1v-1a2 2 0 0 0 1.56-3.25 8 8 0 1 0-11.12 0A2 2 0 0 0 8 20v1a1 1 0 0 0 1 1z"/><circle cx="15" cy="12" r="1"/><circle cx="9" cy="12" r="1"/></svg>';

    this.killfeed.innerHTML = this.kills
      .map(k => {
        const esc = (s) => {
          const el = document.createElement('span');
          el.textContent = s;
          return el.innerHTML;
        };
        return `<div class="kill-entry"><span class="killer">${esc(k.killer)}</span>${skullSvg}<span class="victim">${esc(k.victim)}</span></div>`;
      })
      .join('');
  }
}
