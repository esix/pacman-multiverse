import Phaser from 'phaser';
import pacmanUrl from '../assets/pacman.png';
import { WorldState, EntrySide } from '../world/WorldState';
import { goToScene } from '../world/navigation';
import { parseLevel } from '../world/level';
import { ShootSystem } from '../world/shooting';
import { BombSystem } from '../world/bombs';
import { ITEM_BOMB_KEY, ensureItemTextures } from '../world/items';
import { GAMEPLAY_HEIGHT } from '../world/layout';

const TILE = 40;
const PLAYER_HALF = 16;
const SPEED = 180;

const COLOR_BG = 0x1d3a1d;
const COLOR_GRASS = 0x2d5a2d;
const COLOR_GRASS_HI = 0x3e7a3e;
const COLOR_WALL = 0x707070;
const COLOR_WALL_HI = 0x9a9a9a;
const COLOR_BLOCK = 0xc97a3c;
const COLOR_BLOCK_HI = 0xe8a060;

// Each char is one 40×40 tile.
// 'W' = indestructible wall. 'B' = soft block (destroyed by bomb blast).
// 'M' = bomb pickup (adds 'bomb' to inventory). space = empty (grass).
// Top wall has a center gap that returns to LodeRunner. Spawn = topmost empty cell in the center column.
const LEVEL = `\
WWWWWWWWWW WWWWWWWWW
W   M              W
W WBWBWBWBWBWBWBWB W
W B              B W
W WBW W W W W W WB W
W B              B W
W WBW W W W W W WB W
W B              B W
W WBW W W W W W WB W
W B              B W
W WBW W W W W W WB W
W B              B W
                   W
WWWWWWWWWWWWWWWWWWWW
`;

const PARSED = parseLevel(LEVEL);
const LEVEL_ROWS = PARSED.rows;
const COLS = PARSED.cols;
const ROWS = PARSED.numRows;
const WIDTH = COLS * TILE;
const HEIGHT = ROWS * TILE;

interface BombermanInitData {
  from?: EntrySide;
}

export default class Bomberman extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private fireKey!: Phaser.Input.Keyboard.Key;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private softBlocks: Map<string, Phaser.GameObjects.Rectangle> = new Map();
  private bombPickups: Phaser.GameObjects.Image[] = [];
  private bombKey!: Phaser.Input.Keyboard.Key;
  private shootSystem!: ShootSystem;
  private bombSystem!: BombSystem;
  private lastDir = { x: 0, y: 1 };
  private entry: BombermanInitData | null = null;
  private exited = false;

  constructor() {
    super({ key: 'Bomberman' });
  }

  public init(data?: BombermanInitData): void {
    this.entry = data && data.from ? data : null;
    this.exited = false;
    this.lastDir = { x: 0, y: 1 };
  }

  public preload(): void {
    if (!this.textures.exists('pacman')) {
      this.load.spritesheet('pacman', pacmanUrl, { frameWidth: 40, frameHeight: 40 });
    }
  }

  public create(): void {
    ensureItemTextures(this);

    this.cameras.main.setBackgroundColor(COLOR_BG);
    this.cameras.main.setBounds(0, 0, WIDTH, GAMEPLAY_HEIGHT);
    this.physics.world.setBounds(0, 0, WIDTH, HEIGHT);
    this.physics.world.gravity.set(0, 0); // top-down, no gravity

    this.solids = this.physics.add.staticGroup();
    this.softBlocks = new Map();
    this.bombPickups = [];
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

    const spawn = this.computeSpawn();
    this.player = this.physics.add.sprite(spawn.x, spawn.y, 'pacman', 0);
    this.player.body.setSize(PLAYER_HALF * 2, PLAYER_HALF * 2);
    this.player.play('munch');
    this.physics.add.collider(this.player, this.solids);

    for (const m of this.bombPickups) {
      this.physics.add.overlap(this.player, m, () => this.pickupBomb(m));
    }

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.fireKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
    this.bombKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.shootSystem = new ShootSystem({
      scene: this,
      getPlayer: () => this.player,
      getDirection: () => this.lastDir,
      walls: this.solids,
      bounds: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    });
    this.bombSystem = new BombSystem({
      scene: this,
      getPlayer: () => this.player,
      onExplode: (x, y) => this.handleExplosion(x, y),
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.persist, this);
  }

  private renderTile(ch: string, col: number, row: number): void {
    const cx = (col + 0.5) * TILE;
    const cy = (row + 0.5) * TILE;
    if (ch === ' ') {
      // grass background tile (decorative; not collidable)
      const bg = this.add.rectangle(cx, cy, TILE, TILE, COLOR_GRASS);
      bg.setStrokeStyle(1, COLOR_GRASS_HI);
      return;
    }
    if (ch === 'W') {
      const rect = this.add.rectangle(cx, cy, TILE, TILE, COLOR_WALL);
      rect.setStrokeStyle(2, COLOR_WALL_HI);
      this.solids.add(rect);
      return;
    }
    if (ch === 'B') {
      const rect = this.add.rectangle(cx, cy, TILE, TILE, COLOR_BLOCK);
      rect.setStrokeStyle(2, COLOR_BLOCK_HI);
      this.solids.add(rect);
      this.softBlocks.set(`${col},${row}`, rect);
      return;
    }
    if (ch === 'M') {
      if (WorldState.hasItem('bomb')) return;
      const m = this.add.image(cx, cy, ITEM_BOMB_KEY);
      m.setDepth(5);
      this.physics.add.existing(m, true);
      this.bombPickups.push(m);
      return;
    }
  }

  private computeSpawn(): { x: number; y: number } {
    if (this.entry?.from === 'top' || this.entry?.from === 'hole') {
      return this.findTopCenterSpawn();
    }
    if (this.entry?.from === 'left') {
      // Came back from SpaceInvaders — spawn at the left-bottom hole.
      return { x: PLAYER_HALF, y: 12.5 * TILE };
    }
    const snap = WorldState.load('Bomberman');
    if (snap) return { x: snap.player.x, y: snap.player.y };
    return this.findTopCenterSpawn();
  }

  private findTopCenterSpawn(): { x: number; y: number } {
    const centerCol = Math.floor(COLS / 2);
    for (let r = 1; r < ROWS - 1; r++) {
      if (LEVEL_ROWS[r]?.[centerCol] === ' ') {
        return { x: (centerCol + 0.5) * TILE, y: (r + 0.5) * TILE };
      }
    }
    return { x: (centerCol + 0.5) * TILE, y: 1.5 * TILE };
  }

  public update(): void {
    if (this.exited) return;

    const body = this.player.body;
    body.setVelocity(0, 0);
    if (this.cursors.left.isDown) {
      body.setVelocityX(-SPEED);
      this.player.angle = 180;
      this.lastDir = { x: -1, y: 0 };
    } else if (this.cursors.right.isDown) {
      body.setVelocityX(SPEED);
      this.player.angle = 0;
      this.lastDir = { x: 1, y: 0 };
    } else if (this.cursors.up.isDown) {
      body.setVelocityY(-SPEED);
      this.player.angle = -90;
      this.lastDir = { x: 0, y: -1 };
    } else if (this.cursors.down.isDown) {
      body.setVelocityY(SPEED);
      this.player.angle = 90;
      this.lastDir = { x: 0, y: 1 };
    }

    if (Phaser.Input.Keyboard.JustDown(this.fireKey)) this.shootSystem.fire();
    if (Phaser.Input.Keyboard.JustDown(this.bombKey)) this.bombSystem.plant();
    this.shootSystem.update();
    this.bombSystem.update();

    if (this.player.y < 0) {
      this.exited = true;
      goToScene(this, 'LodeRunner', { from: 'bottom' });
      return;
    }
    if (this.player.x < 0) {
      this.exited = true;
      goToScene(this, 'SpaceInvaders', { from: 'right' });
    }
  }

  private pickupBomb(m: Phaser.GameObjects.Image): void {
    if (!m.active) return;
    WorldState.inventory.add('bomb');
    m.destroy();
  }

  private handleExplosion(x: number, y: number): void {
    const col = Math.floor(x / TILE);
    const row = Math.floor(y / TILE);
    const cells: Array<[number, number]> = [
      [0, 0], [-1, 0], [1, 0], [0, -1], [0, 1],
    ];
    for (const [dc, dr] of cells) {
      const key = `${col + dc},${row + dr}`;
      const block = this.softBlocks.get(key);
      if (!block) continue;
      block.destroy();
      this.softBlocks.delete(key);
    }
  }

  private persist(): void {
    WorldState.save('Bomberman', {
      player: { x: this.player.x, y: this.player.y },
    });
  }
}
