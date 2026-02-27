import { Assets, Texture, AnimatedSprite, Container, Graphics } from 'pixi.js';

const ANIM_STATE = {
  IDLE: 'idle',
  RUN: 'run',
};

export class SpriteAnimator {
  constructor(spriteConfig) {
    this.config = spriteConfig;
    this.loaded = false;
    this.textures = new Map(); // animName -> Texture[]
    this.physWidth = 20;
    this.physHeight = 36;
    this.autoScale = 1;
  }

  async loadTextures() {
    if (!this.config || !this.config.animations) {
      console.warn('SpriteAnimator: No sprite config or animations defined');
      return false;
    }

    try {
      const basePath = this.config.basePath;

      for (const [animName, animDef] of Object.entries(this.config.animations)) {
        const paths = [];
        for (let i = 0; i < animDef.frameCount; i++) {
          const frameNum = String(i).padStart(3, '0');
          paths.push(`${basePath}/${animName}/frame_${frameNum}.png`);
        }

        const loadedMap = await Assets.load(paths);
        const textureArray = paths.map(p => loadedMap[p]);

        if (textureArray.some(t => !t || t === Texture.EMPTY)) {
          console.warn(`SpriteAnimator: Missing frames for "${animName}"`);
          return false;
        }

        this.textures.set(animName, textureArray);
      }

      // Compute auto-scale from first frame of default animation
      const defaultAnim = this.config.defaultAnimation || ANIM_STATE.IDLE;
      const firstTexture = this.textures.get(defaultAnim)?.[0];
      if (firstTexture) {
        const scaleX = this.physWidth / firstTexture.width;
        const scaleY = this.physHeight / firstTexture.height;
        this.autoScale = Math.min(scaleX, scaleY) * (this.config.scale || 1);
      }

      this.loaded = true;
      console.log('SpriteAnimator: All textures loaded');
      return true;
    } catch (err) {
      console.warn('SpriteAnimator: Failed to load textures', err);
      this.loaded = false;
      return false;
    }
  }

  createPlayerSprite() {
    if (!this.loaded) return null;

    const container = new Container();
    const defaultAnim = this.config.defaultAnimation || ANIM_STATE.IDLE;
    const defaultTextures = this.textures.get(defaultAnim);
    if (!defaultTextures || defaultTextures.length === 0) return null;

    const sprite = new AnimatedSprite(defaultTextures);
    sprite.anchor.set(this.config.anchor.x, this.config.anchor.y);
    sprite.animationSpeed = this.config.animations[defaultAnim].speed;
    sprite.loop = this.config.animations[defaultAnim].loop !== false;
    sprite.scale.set(this.autoScale, this.autoScale);
    sprite.play();

    container.addChild(sprite);

    // Arm/weapon overlay drawn on top of sprite
    const armGraphics = new Graphics();
    container.addChild(armGraphics);

    return {
      container,
      sprite,
      armGraphics,
      currentAnim: defaultAnim,
      facingRight: true,
    };
  }

  getAnimationState(player) {
    if (player.state === 1) return ANIM_STATE.IDLE;

    if (player.onGround && player.moveDir !== 0 && Math.abs(player.vx) > 15) {
      return ANIM_STATE.RUN;
    }

    return ANIM_STATE.IDLE;
  }

  updatePlayerSprite(entry, player) {
    if (!entry || !this.loaded) return;

    const { container, sprite, armGraphics } = entry;

    // Position container at player world position
    container.x = player.x;
    container.y = player.y;

    // Animation state transition
    const newAnim = this.getAnimationState(player);
    if (newAnim !== entry.currentAnim) {
      const textures = this.textures.get(newAnim);
      if (textures && textures.length > 0) {
        sprite.stop();
        sprite.textures = textures;
        sprite.animationSpeed = this.config.animations[newAnim].speed;
        sprite.loop = this.config.animations[newAnim].loop !== false;
        sprite.play();
        entry.currentAnim = newAnim;
      }
    }

    // Direction flip based on aim
    const facingRight = Math.cos(player.aimAngle) >= 0;
    if (facingRight !== entry.facingRight) {
      sprite.scale.x = facingRight
        ? Math.abs(sprite.scale.x)
        : -Math.abs(sprite.scale.x);
      entry.facingRight = facingRight;
    }

    // Draw arm/weapon overlay
    this._drawArmWeapon(armGraphics, player, facingRight);
  }

  _drawArmWeapon(g, player, facingRight) {
    g.clear();

    const { aimAngle } = player;
    const ox = this.config.armOffset.x;
    const oy = this.config.armOffset.y;

    // Arm
    const armLen = 16;
    const armX = ox + Math.cos(aimAngle) * armLen;
    const armY = oy + Math.sin(aimAngle) * armLen;
    g.moveTo(ox, oy);
    g.lineTo(armX, armY);
    g.stroke({ width: 3, color: '#999999' });

    // Weapon barrel
    const weapLen = 24;
    const tipX = ox + Math.cos(aimAngle) * weapLen;
    const tipY = oy + Math.sin(aimAngle) * weapLen;
    g.moveTo(armX, armY);
    g.lineTo(tipX, tipY);
    g.stroke({ width: 2, color: '#777777' });

    // Jetpack on back
    const facing = facingRight ? 1 : -1;
    const backX = ox - facing * 8;
    const backY = oy + 6;

    g.rect(backX - 4, backY - 6, 8, 12);
    g.fill('#555566');
    g.stroke({ width: 1, color: '#777788' });

    // Jet flame
    if (player.jetting) {
      const flameH = 10 + Math.random() * 12;
      g.moveTo(backX - 5, backY + 6);
      g.lineTo(backX, backY + 6 + flameH);
      g.lineTo(backX + 5, backY + 6);
      g.fill('#ff5500');
      g.moveTo(backX - 3, backY + 6);
      g.lineTo(backX, backY + 6 + flameH * 0.65);
      g.lineTo(backX + 3, backY + 6);
      g.fill('#ffcc00');
    }
  }
}

export { ANIM_STATE };
