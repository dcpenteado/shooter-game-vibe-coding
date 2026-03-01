/**
 * TouchControls — Virtual joystick + action buttons for mobile/tablet.
 *
 * Left side:  floating joystick (appears where thumb touches)
 * Right side: fire, jump, jet, reload, mine buttons + touch-to-aim
 */
export class TouchControls {
  constructor(canvas) {
    this.canvas = canvas;

    // --- Joystick state ---
    this.joystickTouchId = null;
    this.joystickOriginX = 0;
    this.joystickOriginY = 0;
    this.joystickX = 0; // -1..1
    this.joystickY = 0; // -1..1
    this.joystickActive = false;
    this.JOYSTICK_MAX_RADIUS = 50;

    // --- Aim state ---
    this.aimTouchId = null;
    this.aimScreenX = window.innerWidth / 2;
    this.aimScreenY = window.innerHeight / 2;
    this.hasAimTouch = false;

    // --- Button state ---
    this.fire = false;
    this.jump = false;
    this.jet = false;
    this.reload = false;
    this.placeMine = false;

    // DOM elements
    this.joystickZone = document.getElementById('touch-joystick-zone');
    this.joystickBase = document.getElementById('touch-joystick-base');
    this.joystickKnob = document.getElementById('touch-joystick-knob');

    this.btnFire = document.getElementById('touch-btn-fire');
    this.btnJump = document.getElementById('touch-btn-jump');
    this.btnJet = document.getElementById('touch-btn-jet');
    this.btnReload = document.getElementById('touch-btn-reload');
    this.btnMine = document.getElementById('touch-btn-mine');

    // Track which touches are on buttons to avoid conflicts
    this._buttonTouchIds = new Set();

    this._bound = false;
  }

  bind() {
    if (this._bound) return;
    this._bound = true;

    // --- Joystick touch events (on the joystick zone) ---
    this._onJoystickStart = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.joystickTouchId !== null) return;
      const t = e.changedTouches[0];
      this.joystickTouchId = t.identifier;
      this.joystickOriginX = t.clientX;
      this.joystickOriginY = t.clientY;
      this.joystickActive = true;

      // Position the joystick base at touch point
      this.joystickBase.style.left = t.clientX + 'px';
      this.joystickBase.style.top = t.clientY + 'px';
      this.joystickBase.classList.add('active');
      this._updateKnob(0, 0);
    };

    this._onJoystickMove = (e) => {
      if (this.joystickTouchId === null) return;
      for (const t of e.changedTouches) {
        if (t.identifier === this.joystickTouchId) {
          e.preventDefault();
          const dx = t.clientX - this.joystickOriginX;
          const dy = t.clientY - this.joystickOriginY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const clampedDist = Math.min(dist, this.JOYSTICK_MAX_RADIUS);
          const angle = Math.atan2(dy, dx);

          this.joystickX = (clampedDist / this.JOYSTICK_MAX_RADIUS) * Math.cos(angle);
          this.joystickY = (clampedDist / this.JOYSTICK_MAX_RADIUS) * Math.sin(angle);

          this._updateKnob(
            Math.cos(angle) * clampedDist,
            Math.sin(angle) * clampedDist
          );
        }
      }
    };

    this._onJoystickEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.joystickTouchId) {
          this.joystickTouchId = null;
          this.joystickX = 0;
          this.joystickY = 0;
          this.joystickActive = false;
          this.joystickBase.classList.remove('active');
          this._updateKnob(0, 0);
        }
      }
    };

    this.joystickZone.addEventListener('touchstart', this._onJoystickStart, { passive: false });
    window.addEventListener('touchmove', this._onJoystickMove, { passive: false });
    window.addEventListener('touchend', this._onJoystickEnd);
    window.addEventListener('touchcancel', this._onJoystickEnd);

    // --- Button events ---
    this._setupButton(this.btnFire, 'fire');
    this._setupButton(this.btnJump, 'jump');
    this._setupButton(this.btnJet, 'jet');
    this._setupButton(this.btnReload, 'reload');
    this._setupButton(this.btnMine, 'placeMine');

    // --- Aim touch (right side of screen, not on buttons) ---
    this._onAimStart = (e) => {
      // Only handle touches on the canvas itself (not on buttons/joystick)
      if (e.target !== this.canvas) return;
      for (const t of e.changedTouches) {
        // Only right side of screen for aiming
        if (t.clientX > window.innerWidth * 0.4 && this.aimTouchId === null) {
          this.aimTouchId = t.identifier;
          this.aimScreenX = t.clientX;
          this.aimScreenY = t.clientY;
          this.hasAimTouch = true;
        }
      }
    };

    this._onAimMove = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.aimTouchId) {
          this.aimScreenX = t.clientX;
          this.aimScreenY = t.clientY;
        }
      }
    };

    this._onAimEnd = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === this.aimTouchId) {
          this.aimTouchId = null;
          this.hasAimTouch = false;
        }
      }
    };

    this.canvas.addEventListener('touchstart', this._onAimStart, { passive: false });
    window.addEventListener('touchmove', this._onAimMove, { passive: true });
    window.addEventListener('touchend', this._onAimEnd);
    window.addEventListener('touchcancel', this._onAimEnd);
  }

  unbind() {
    if (!this._bound) return;
    this._bound = false;

    this.joystickZone.removeEventListener('touchstart', this._onJoystickStart);
    window.removeEventListener('touchmove', this._onJoystickMove);
    window.removeEventListener('touchend', this._onJoystickEnd);
    window.removeEventListener('touchcancel', this._onJoystickEnd);

    this.canvas.removeEventListener('touchstart', this._onAimStart);
    window.removeEventListener('touchmove', this._onAimMove);
    window.removeEventListener('touchend', this._onAimEnd);
    window.removeEventListener('touchcancel', this._onAimEnd);
  }

  show() {
    document.getElementById('touch-controls').classList.remove('hidden');
    if (!this._preventActive) {
      this._preventActive = true;
      // Prevent scrolling/zooming during gameplay
      this._onTouchPrevent = (e) => e.preventDefault();
      this._onCanvasPrevent = (e) => e.preventDefault();
      document.addEventListener('touchmove', this._onTouchPrevent, { passive: false });
      this.canvas.addEventListener('touchstart', this._onCanvasPrevent, { passive: false });
    }
  }

  hide() {
    document.getElementById('touch-controls').classList.add('hidden');
    if (this._preventActive) {
      this._preventActive = false;
      document.removeEventListener('touchmove', this._onTouchPrevent);
      this.canvas.removeEventListener('touchstart', this._onCanvasPrevent);
    }
  }

  _setupButton(el, prop) {
    const onStart = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this[prop] = true;
      el.classList.add('active');
      for (const t of e.changedTouches) {
        this._buttonTouchIds.add(t.identifier);
      }
    };
    const onEnd = (e) => {
      // Only release if the touch that started this button is ending
      for (const t of e.changedTouches) {
        this._buttonTouchIds.delete(t.identifier);
      }
      // Check if any remaining touch is still on this button
      let stillPressed = false;
      for (const t of Array.from(e.touches || [])) {
        if (t.target === el || el.contains(t.target)) {
          stillPressed = true;
          break;
        }
      }
      if (!stillPressed) {
        this[prop] = false;
        el.classList.remove('active');
      }
    };

    el.addEventListener('touchstart', onStart, { passive: false });
    el.addEventListener('touchend', onEnd);
    el.addEventListener('touchcancel', onEnd);
    // Also handle touch leaving the button
    el.addEventListener('touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });
  }

  _updateKnob(dx, dy) {
    this.joystickKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  }

  /**
   * Returns movement direction from joystick: -1, 0, or 1.
   * Applies a small deadzone.
   */
  getMoveDir() {
    const deadzone = 0.2;
    if (Math.abs(this.joystickX) < deadzone) return 0;
    return this.joystickX > 0 ? 1 : -1;
  }

  /**
   * Returns true if joystick is pushed upward (for jump).
   */
  getJoystickJump() {
    return this.joystickY < -0.5;
  }
}
