import Phaser from 'phaser';
import pacmanUrl from '../assets/pacman.png';
import { WorldState, EntrySide } from '../world/WorldState';
import { goToScene } from '../world/navigation';
import { parseLevel } from '../world/level';
import { ShootSystem, ensureBulletTexture } from '../world/shooting';
import { BombSystem } from '../world/bombs';
import { ensureGhostTextures, GHOST_PALETTE } from '../world/ghosts';
import { GAMEPLAY_HEIGHT } from '../world/layout';

const TILE = 40;
const PLAYER_HALF = 16;
const PADDLE_SPEED = 280;
const PADDLE_ROW = 12;
const BOMB_BLAST_RADIUS = 90;

// Ghost army (lockstep formation, like classic Space Invaders).
const ARMY_COLS = 8;
const ARMY_ROWS = 2;
const ARMY_SPACING_X = 60;
const ARMY_SPACING_Y = 50;
const ARMY_START_X = 100;
const ARMY_START_Y = 70;
const ARMY_SPEED = 20; // px/sec horizontal
const ARMY_STEP_DOWN = 20;
const ARMY_EDGE_MARGIN = 60;

// Ghost shooting.
const ENEMY_FIRE_INTERVAL_MS = 1500;
const ENEMY_BULLET_SPEED = 220;
const COLOR_ENEMY_BULLET = 0xff4444;

// Shelters (4 destructible bunkers above the paddle).
const SHELTER_CELL = 16;
const SHELTER_W = 4; // cells wide
const SHELTER_H = 4; // cells tall (twice the previous height)
const SHELTER_TOP_TILE_Y = 10; // anchors shelter near the bottom row (row 10 ~ y 400)
const SHELTER_DROP = SHELTER_CELL; // shift the whole shelter down by 1 cell
const COLOR_SHELTER = 0x44ddaa;
const COLOR_SHELTER_HI = 0x88ffcc;

const COLOR_BG = 0x05060a;
const COLOR_WALL = 0x4a4a55;
const COLOR_WALL_HI = 0x7a7a8a;

// Paddle row 12 has both walls open (right → Bomberman, left → Persia).
// Row 13 is a decorative bottom band with a hole at col 0 marking the Persia exit.
const LEVEL = `\
WWWWWWWWWWWWWWWWWWWW
W                  W
W                  W
W                  W
W                  W
W                  W
W                  W
W                  W
W                  W
W                  W
W                  W
W                  W

 WWWWWWWWWWWWWWWWWWW
`;

const PARSED = parseLevel(LEVEL);
const LEVEL_ROWS = PARSED.rows;
const COLS = PARSED.cols;
const ROWS = PARSED.numRows;
const WIDTH = COLS * TILE;
const HEIGHT = ROWS * TILE;
const PADDLE_Y = (PADDLE_ROW + 0.5) * TILE;
const SHELTER_TOP_Y = SHELTER_TOP_TILE_Y * TILE - SHELTER_H * SHELTER_CELL + SHELTER_DROP;

interface SpaceInvadersInitData {
  from?: EntrySide;
}

export default class SpaceInvaders extends Phaser.Scene {
  private paddle!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private fireKey!: Phaser.Input.Keyboard.Key;
  private bombKey!: Phaser.Input.Keyboard.Key;
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private ghosts!: Phaser.Physics.Arcade.Group;
  private shelterBlocks!: Phaser.Physics.Arcade.StaticGroup;
  private enemyBullets!: Phaser.Physics.Arcade.Group;
  private shootSystem!: ShootSystem;
  private bombSystem!: BombSystem;
  private armyDir = 1;
  private enemyFireTimer?: Phaser.Time.TimerEvent;
  private entry: SpaceInvadersInitData | null = null;
  private exited = false;

  constructor() {
    super({ key: 'SpaceInvaders' });
  }

  public init(data?: SpaceInvadersInitData): void {
    this.entry = data && data.from ? data : null;
    this.exited = false;
    this.armyDir = 1;
  }

  public preload(): void {
    if (!this.textures.exists('pacman')) {
      this.load.spritesheet('pacman', pacmanUrl, { frameWidth: 40, frameHeight: 40 });
    }
  }

  public create(): void {
    ensureGhostTextures(this);
    ensureBulletTexture(this);

    this.cameras.main.setBackgroundColor(COLOR_BG);
    this.cameras.main.setBounds(0, 0, WIDTH, GAMEPLAY_HEIGHT);
    this.physics.world.setBounds(0, 0, WIDTH, HEIGHT);
    this.physics.world.gravity.set(0, 0);

    this.walls = this.physics.add.staticGroup();
    for (let r = 0; r < ROWS; r++) {
      const line = LEVEL_ROWS[r];
      for (let c = 0; c < line.length; c++) {
        this.renderTile(line[c], c, r);
      }
    }

    if (!this.anims.exists('munch')) {
      this.anims.create({
        key: 'munch',
        frames: this.anims.generateFrameNumbers('pacman', { frames: [0, 1, 2, 1] }),
        frameRate: 10,
        repeat: -1,
      });
    }

    this.shelterBlocks = this.physics.add.staticGroup();
    this.createShelters();

    const spawn = this.computeSpawn();
    this.paddle = this.physics.add.sprite(spawn.x, PADDLE_Y, 'pacman', 0);
    this.paddle.body.setSize(PLAYER_HALF * 2, PLAYER_HALF * 2);
    this.paddle.body.allowGravity = false;
    this.paddle.play('munch');
    this.physics.add.collider(this.paddle, this.walls);

    this.ghosts = this.physics.add.group();
    this.setupArmy();

    this.enemyBullets = this.physics.add.group();
    this.physics.add.overlap(this.enemyBullets, this.shelterBlocks, this.onEnemyBulletHitShelter, undefined, this);
    this.physics.add.overlap(this.enemyBullets, this.paddle, this.onEnemyBulletHitPaddle, undefined, this);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.fireKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
    this.bombKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.shootSystem = new ShootSystem({
      scene: this,
      getPlayer: () => this.paddle,
      getDirection: () => ({ x: 0, y: -1 }),
      walls: this.walls,
      bounds: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
      bulletTargets: this.ghosts,
    });

    this.bombSystem = new BombSystem({
      scene: this,
      getPlayer: () => this.paddle,
      onExplode: (x, y) => this.killGhostsInBlast(x, y),
      initialVelocity: { x: 0, y: -280 },
      fuseMs: 1500,
      walls: this.walls,
      contactTargets: this.ghosts,
    });

    this.enemyFireTimer = this.time.addEvent({
      delay: ENEMY_FIRE_INTERVAL_MS,
      loop: true,
      callback: () => this.enemyFire(),
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.persist, this);
  }

  private renderTile(ch: string, col: number, row: number): void {
    if (ch !== 'W') return;
    const cx = (col + 0.5) * TILE;
    const cy = (row + 0.5) * TILE;
    const rect = this.add.rectangle(cx, cy, TILE, TILE, COLOR_WALL);
    rect.setStrokeStyle(2, COLOR_WALL_HI);
    this.walls.add(rect);
  }

  private setupArmy(): void {
    for (let row = 0; row < ARMY_ROWS; row++) {
      for (let col = 0; col < ARMY_COLS; col++) {
        const x = ARMY_START_X + col * ARMY_SPACING_X;
        const y = ARMY_START_Y + row * ARMY_SPACING_Y;
        const palette = GHOST_PALETTE[row % GHOST_PALETTE.length];
        const ghost = this.ghosts.create(x, y, palette.key) as Phaser.Physics.Arcade.Sprite;
        const body = ghost.body as Phaser.Physics.Arcade.Body;
        body.setSize(28, 28);
        body.allowGravity = false;
        body.setVelocity(this.armyDir * ARMY_SPEED, 0);
      }
    }
  }

  private updateArmy(): void {
    const ghosts = this.ghosts.getChildren();
    if (ghosts.length === 0) return;
    let minX = Infinity;
    let maxX = -Infinity;
    for (const obj of ghosts) {
      const g = obj as Phaser.GameObjects.Sprite;
      if (!g.active) continue;
      if (g.x < minX) minX = g.x;
      if (g.x > maxX) maxX = g.x;
    }
    const shouldReverse =
      (this.armyDir > 0 && maxX >= WIDTH - ARMY_EDGE_MARGIN) ||
      (this.armyDir < 0 && minX <= ARMY_EDGE_MARGIN);
    if (!shouldReverse) return;

    this.armyDir *= -1;
    for (const obj of ghosts) {
      const g = obj as Phaser.Physics.Arcade.Sprite;
      if (!g.active) continue;
      const body = g.body as Phaser.Physics.Arcade.Body;
      body.setVelocityX(this.armyDir * ARMY_SPEED);
      g.y += ARMY_STEP_DOWN;
    }
  }

  private createShelters(): void {
    const positions = [WIDTH * 0.18, WIDTH * 0.40, WIDTH * 0.60, WIDTH * 0.82];
    const totalW = SHELTER_W * SHELTER_CELL;
    for (const cx of positions) {
      const startX = cx - totalW / 2;
      for (let r = 0; r < SHELTER_H; r++) {
        for (let c = 0; c < SHELTER_W; c++) {
          const x = startX + (c + 0.5) * SHELTER_CELL;
          const y = SHELTER_TOP_Y + (r + 0.5) * SHELTER_CELL;
          const block = this.add.rectangle(x, y, SHELTER_CELL, SHELTER_CELL, COLOR_SHELTER);
          block.setStrokeStyle(1, COLOR_SHELTER_HI);
          this.shelterBlocks.add(block);
        }
      }
    }
  }

  private enemyFire(): void {
    const ghosts = this.ghosts.getChildren().filter((g) => g.active);
    if (ghosts.length === 0) return;
    const shooter = ghosts[Phaser.Math.Between(0, ghosts.length - 1)] as Phaser.GameObjects.Sprite;
    const bullet = this.enemyBullets.create(shooter.x, shooter.y + 16, 'bullet') as Phaser.Physics.Arcade.Sprite;
    const body = bullet.body as Phaser.Physics.Arcade.Body;
    body.allowGravity = false;
    body.setVelocity(0, ENEMY_BULLET_SPEED);
    bullet.setTint(COLOR_ENEMY_BULLET);
  }

  private onEnemyBulletHitShelter: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (bullet, block) => {
    (bullet as Phaser.GameObjects.GameObject).destroy();
    (block as Phaser.GameObjects.Rectangle).destroy();
  };

  private onEnemyBulletHitPaddle: Phaser.Types.Physics.Arcade.ArcadePhysicsCallback = (bullet, _paddle) => {
    (bullet as Phaser.GameObjects.GameObject).destroy();
    // TODO: damage / death animation when we add health.
  };

  private killGhostsInBlast(x: number, y: number): void {
    this.ghosts.getChildren().forEach((obj) => {
      const g = obj as Phaser.GameObjects.Sprite;
      if (!g.active) return;
      const dx = g.x - x;
      const dy = g.y - y;
      if (dx * dx + dy * dy <= BOMB_BLAST_RADIUS * BOMB_BLAST_RADIUS) {
        g.destroy();
      }
    });
  }

  private computeSpawn(): { x: number; y: number } {
    if (this.entry?.from === 'right') {
      return { x: WIDTH - TILE - PLAYER_HALF, y: PADDLE_Y };
    }
    if (this.entry?.from === 'left') {
      return { x: TILE + PLAYER_HALF, y: PADDLE_Y };
    }
    const snap = WorldState.load('SpaceInvaders');
    if (snap) return { x: snap.player.x, y: PADDLE_Y };
    return { x: WIDTH / 2, y: PADDLE_Y };
  }

  public update(): void {
    if (this.exited) return;

    const body = this.paddle.body;
    body.setVelocityX(0);
    if (this.cursors.left.isDown) {
      body.setVelocityX(-PADDLE_SPEED);
      this.paddle.angle = 180;
    } else if (this.cursors.right.isDown) {
      body.setVelocityX(PADDLE_SPEED);
      this.paddle.angle = 0;
    }
    if (this.paddle.y !== PADDLE_Y) {
      this.paddle.y = PADDLE_Y;
      body.setVelocityY(0);
    }

    if (Phaser.Input.Keyboard.JustDown(this.fireKey)) this.shootSystem.fire();
    if (Phaser.Input.Keyboard.JustDown(this.bombKey)) this.bombSystem.plant();
    this.shootSystem.update();
    this.bombSystem.update();

    this.updateArmy();

    // Despawn enemy bullets that fall off-screen.
    this.enemyBullets.getChildren().forEach((obj) => {
      const b = obj as Phaser.GameObjects.Sprite;
      if (b.y > HEIGHT) b.destroy();
    });

    if (this.paddle.x > WIDTH) {
      this.exited = true;
      goToScene(this, 'Bomberman', { from: 'left' });
      return;
    }
    if (this.paddle.x < 0) {
      this.exited = true;
      goToScene(this, 'Persia', { from: 'right' });
    }
  }

  private persist(): void {
    this.enemyFireTimer?.remove(false);
    WorldState.save('SpaceInvaders', {
      player: { x: this.paddle.x, y: this.paddle.y },
    });
  }
}
