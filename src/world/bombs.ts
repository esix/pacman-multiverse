import Phaser from 'phaser';
import { WorldState } from './WorldState';
import { ITEM_BOMB_KEY, ensureItemTextures } from './items';

const DEFAULT_FUSE_MS = 3000;
const BLAST_RADIUS_PX = 60;
const COLOR_BLAST = 0xffaa22;

export interface BombSystemConfig {
  scene: Phaser.Scene;
  getPlayer: () => { x: number; y: number };
  /** Called when a bomb explodes; explosion location in world coords. */
  onExplode?: (x: number, y: number) => void;
  /** If set, the planted bomb starts with this velocity (turns it into a thrown projectile). */
  initialVelocity?: { x: number; y: number };
  /** Optional walls the thrown bomb collides with (it stops/bounces, fuse keeps running). */
  walls?: Phaser.Types.Physics.Arcade.ArcadeColliderType;
  /** Optional dynamic group; touching any member detonates immediately. */
  contactTargets?: Phaser.Physics.Arcade.Group;
  /** Override the default 3-second fuse. */
  fuseMs?: number;
}

export class BombSystem {
  private active: { sprite: Phaser.Physics.Arcade.Sprite; explodeAt: number } | null = null;

  constructor(private cfg: BombSystemConfig) {
    ensureItemTextures(cfg.scene);
  }

  public plant(): void {
    if (!WorldState.hasItem('bomb')) return;
    if (this.active) return;
    const p = this.cfg.getPlayer();

    const sprite = this.cfg.scene.physics.add.sprite(p.x, p.y, ITEM_BOMB_KEY);
    sprite.setDepth(40);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    body.allowGravity = false;
    if (this.cfg.initialVelocity) {
      body.setVelocity(this.cfg.initialVelocity.x, this.cfg.initialVelocity.y);
    }

    if (this.cfg.walls) {
      this.cfg.scene.physics.add.collider(sprite, this.cfg.walls);
    }

    if (this.cfg.contactTargets) {
      this.cfg.scene.physics.add.overlap(sprite, this.cfg.contactTargets, () => {
        this.detonate(sprite);
      });
    }

    const fuseMs = this.cfg.fuseMs ?? DEFAULT_FUSE_MS;
    this.active = { sprite, explodeAt: this.cfg.scene.time.now + fuseMs };
  }

  public update(): void {
    if (!this.active) return;
    const now = this.cfg.scene.time.now;
    if (now >= this.active.explodeAt) {
      this.detonate(this.active.sprite);
      return;
    }
    const remaining = this.active.explodeAt - now;
    const phase = Math.floor(remaining / 200) % 2;
    this.active.sprite.setTint(phase ? 0xff5533 : 0xffffff);
  }

  private detonate(sprite: Phaser.Physics.Arcade.Sprite): void {
    if (!this.active || this.active.sprite !== sprite) return;
    const x = sprite.x;
    const y = sprite.y;
    sprite.destroy();
    this.active = null;
    this.flash(x, y);
    this.cfg.onExplode?.(x, y);
  }

  private flash(x: number, y: number): void {
    const blast = this.cfg.scene.add.circle(x, y, BLAST_RADIUS_PX, COLOR_BLAST, 0.7);
    blast.setDepth(45);
    this.cfg.scene.tweens.add({
      targets: blast,
      alpha: 0,
      scaleX: 2,
      scaleY: 2,
      duration: 350,
      onComplete: () => blast.destroy(),
    });
  }
}
