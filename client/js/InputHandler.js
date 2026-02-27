export class InputHandler {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.seq = 0;
    this.locked = false;

    this._onKeyDown = (e) => {
      this.keys.add(e.code);
      if (['Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyR'].includes(e.code)) {
        e.preventDefault();
      }
    };
    this._onKeyUp = (e) => this.keys.delete(e.code);
    this._onMouseMove = (e) => {
      if (document.pointerLockElement === canvas) {
        this.mouseX += e.movementX;
        this.mouseY += e.movementY;
        // Clamp to viewport
        this.mouseX = Math.max(0, Math.min(this.mouseX, window.innerWidth));
        this.mouseY = Math.max(0, Math.min(this.mouseY, window.innerHeight));
      } else {
        this.mouseX = e.clientX;
        this.mouseY = e.clientY;
      }
    };
    this._onMouseDown = (e) => {
      if (e.button === 0) this.mouseDown = true;
    };
    this._onMouseUp = (e) => {
      if (e.button === 0) this.mouseDown = false;
    };
    this._onPointerLockChange = () => {
      this.locked = document.pointerLockElement === canvas;
    };
  }

  bind() {
    window.addEventListener('keydown', this._onKeyDown);
    window.addEventListener('keyup', this._onKeyUp);
    this.canvas.addEventListener('mousemove', this._onMouseMove);
    this.canvas.addEventListener('mousedown', this._onMouseDown);
    this.canvas.addEventListener('mouseup', this._onMouseUp);
    document.addEventListener('pointerlockchange', this._onPointerLockChange);
  }

  unbind() {
    window.removeEventListener('keydown', this._onKeyDown);
    window.removeEventListener('keyup', this._onKeyUp);
    this.canvas.removeEventListener('mousemove', this._onMouseMove);
    this.canvas.removeEventListener('mousedown', this._onMouseDown);
    this.canvas.removeEventListener('mouseup', this._onMouseUp);
    document.removeEventListener('pointerlockchange', this._onPointerLockChange);
  }

  /** Build current input snapshot */
  getInput(cameraX, cameraY) {
    let moveDir = 0;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) moveDir -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) moveDir += 1;

    const jet = this.keys.has('Space');
    const jump = this.keys.has('KeyW') || this.keys.has('ArrowUp');
    const reload = this.keys.has('KeyR');

    // Aim angle: from player screen center to mouse
    const worldMouseX = this.mouseX + cameraX;
    const worldMouseY = this.mouseY + cameraY;

    return {
      seq: ++this.seq,
      moveDir,
      jet,
      jump,
      fire: this.mouseDown,
      reload,
      aimAngle: 0, // set by Game with proper player position
      mouseWorldX: worldMouseX,
      mouseWorldY: worldMouseY,
    };
  }
}
