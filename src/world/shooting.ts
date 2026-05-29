import Phaser from 'phaser';
import { WorldState } from './WorldState';

const BULLET_KEY = 'bullet';
const BULLET_SPEED = 600;

export function ensureBulletTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(BULLET_KEY)) return;
  const g = scene.add.graphics();
  g.fillStyle(0xffff00, 1);
  g.fillCircle(4, 4, 4);
  g.fillStyle(0xffffff, 1);
  g.fillCircle(3, 3, 1.5);
  g.generateTexture(BULLET_KEY, 8, 8);
  g.destroy();
}

export interface ShootSystemConfig {
  scene: Phaser.Scene;
  getPlayer: () => Phaser.GameObjects.Sprite & { x: number; y: number };
  getDirection: () => { x: number; y: number };
  walls: Phaser.Types.Physics.Arcade.ArcadeColliderType;
  bounds: { x: number; y: number; width: number; height: number };
  /** Optional dynamic group of enemies; bullet overlapping any member kills both. */
  bulletTargets?: Phaser.Physics.Arcade.Group;
  /** Override the default "destroy enemy" behaviour when a bullet hits an enemy. */
  onBulletHit?: (enemy: Phaser.GameObjects.GameObject) => void;
}

export class ShootSystem {
  private bullet: Phaser.Physics.Arcade.Sprite | null = null;

  constructor(private cfg: ShootSystemConfig) {
    ensureBulletTexture(cfg.scene);
  }

  public fire(): void {
    if (!WorldState.hasItem('gun')) return;
    if (this.bullet && this.bullet.active) return;

    const player = this.cfg.getPlayer();
    const dir = this.cfg.getDirection();
    const len = Math.hypot(dir.x, dir.y) || 1;
    const vx = (dir.x / len) * BULLET_SPEED;
    const vy = (dir.y / len) * BULLET_SPEED;

    const b = this.cfg.scene.physics.add.sprite(player.x, player.y, BULLET_KEY);
    const body = b.body as Phaser.Physics.Arcade.Body;
    body.allowGravity = false;
    body.setVelocity(vx, vy);
    b.setDepth(50);

    this.cfg.scene.physics.add.collider(b, this.cfg.walls, () => {
      b.destroy();
      if (this.bullet === b) this.bullet = null;
    });

    if (this.cfg.bulletTargets) {
      this.cfg.scene.physics.add.overlap(b, this.cfg.bulletTargets, (_bullet, enemy) => {
        b.destroy();
        if (this.bullet === b) this.bullet = null;
        const e = enemy as Phaser.GameObjects.GameObject;
        if (this.cfg.onBulletHit) this.cfg.onBulletHit(e);
        else (e as Phaser.GameObjects.GameObject & { destroy(): void }).destroy();
      });
    }

    this.bullet = b;
  }

  public update(): void {
    if (!this.bullet) return;
    if (!this.bullet.active) {
      this.bullet = null;
      return;
    }
    const b = this.bullet;
    const { x, y, width, height } = this.cfg.bounds;
    if (b.x < x || b.x > x + width || b.y < y || b.y > y + height) {
      b.destroy();
      this.bullet = null;
    }
  }
}
