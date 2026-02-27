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

    const rankClasses = ['gold', 'silver', 'bronze'];
    const rankLabels = ['1st', '2nd', '3rd'];

    // Pistol icon (kills)
    const pistolSvg = '<svg class="lb-stat-icon lb-kills-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12h14"/><path d="M16 7l2-2 4 4-2 2"/><path d="M16 7l-1 5"/><path d="M9 12v4c0 1 1 2 2 2h1"/><path d="M13 12v6"/></svg>';

    // Skull icon (deaths)
    const skullSvg = '<svg class="lb-stat-icon lb-deaths-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="7"/><circle cx="9.5" cy="9" r="1.5" fill="currentColor"/><circle cx="14.5" cy="9" r="1.5" fill="currentColor"/><path d="M10 14h4"/><path d="M12 14v3"/><path d="M10.5 14v2"/><path d="M13.5 14v2"/></svg>';

    const esc = (s) => {
      const el = document.createElement('span');
      el.textContent = s;
      return el.innerHTML;
    };

    const html = top3.map((p, i) => {
      return `<div class="lb-row">` +
        `<span class="lb-rank ${rankClasses[i]}">${rankLabels[i]}</span>` +
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

    const skullSvg = '<svg class="kill-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="10" r="7"/><circle cx="9" cy="9" r="1.5" fill="currentColor"/><circle cx="15" cy="9" r="1.5" fill="currentColor"/><path d="M10 14h4"/><path d="M9 18l3 3 3-3"/></svg>';

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
