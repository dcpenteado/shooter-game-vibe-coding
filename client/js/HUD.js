export class HUD {
  constructor() {
    this.el = document.getElementById('hud');
    this.healthBar = document.getElementById('health-bar');
    this.fuelBar = document.getElementById('fuel-bar');
    this.ammoCurrent = document.getElementById('ammo-current');
    this.ammoReserve = document.getElementById('ammo-reserve');
    this.killfeed = document.getElementById('hud-killfeed');
    this.kills = [];
  }

  show() { this.el.classList.remove('hidden'); }
  hide() { this.el.classList.add('hidden'); }

  update(player) {
    if (!player) return;
    const hpPct = Math.max(0, (player.hp / player.maxHP) * 100);
    this.healthBar.style.width = hpPct + '%';

    if (hpPct > 60) this.healthBar.style.background = '#3c3';
    else if (hpPct > 30) this.healthBar.style.background = '#cc3';
    else this.healthBar.style.background = '#c33';

    const fuelPct = Math.max(0, (player.fuel / player.maxFuel) * 100);
    this.fuelBar.style.width = fuelPct + '%';

    if (player.ammo !== undefined) {
      this.ammoCurrent.textContent = player.ammo;
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

  _renderKillfeed() {
    const now = Date.now();
    this.kills = this.kills.filter(k => now - k.time < 5000);
    this.killfeed.innerHTML = this.kills
      .map(k => `<div><span style="color:#4f4">${k.killer}</span> → <span style="color:#f44">${k.victim}</span></div>`)
      .join('');
  }
}
