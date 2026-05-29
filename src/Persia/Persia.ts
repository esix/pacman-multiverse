import Phaser from 'phaser';
import pacmanUrl from '../assets/pacman.png';
import { WorldState, EntrySide } from '../world/WorldState';
import { goToScene } from '../world/navigation';
import { parseLevel } from '../world/level';
import { ShootSystem } from '../world/shooting';
import { BombSystem } from '../world/bombs';
import { GAMEPLAY_HEIGHT } from '../world/layout';

const TILE = 40;
const PLAYER_SCALE = 2;
const PLAYER_HALF = 32; // 32 base × 2 scale → body 64
const SPEED = 200;
const JUMP_VELOCITY = 480; // shorter hop than Dave's 560
const GRAVITY = 1000;

const COLOR_BG = 0x2a1a05;
const COLOR_BLOCK = 0xa57040;
const COLOR_BLOCK_HI = 0xc89460;
const COLOR_WALL = 0x3a3030;
const COLOR_WALL_HI = 0x5a5050;
const COLOR_PEDAL = 0xddaa22;
const COLOR_PEDAL_HI = 0xffd966;
const COLOR_GRID = 0x808080;
const COLOR_GRID_HI = 0xcccccc;

// Each char is one 40×40 tile.
// 'W' = indestructible wall. 'B' = block (collidable floor/platform).
// 'P' = pedal (overlap detection — opens grids while player stands on it).
// 'G' = grid/door (collidable; toggles open while any pedal is pressed).
// space = empty.
//
// Layout: 60 cols × 14 rows = 3 screens horizontally. Player enters from the
// right at the bottom floor. Three nominal floors at rows 6, 9, 12.
const LEVEL = `\






   BBBBBB         BBBBBBBB           BBBBBB     BBBBBBBB


   BBBBBBBBBB           BBBBBBBBBB        BBBBBBBBBB
                       P
                       G
BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB

`;

const PARSED = parseLevel(LEVEL);
const LEVEL_ROWS = PARSED.rows;
const COLS = PARSED.cols;
const ROWS = PARSED.numRows;
const WIDTH = COLS * TILE;
const HEIGHT = ROWS * TILE;

interface PersiaInitData {
  from?: EntrySide;
}

export default class Persia extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private fireKey!: Phaser.Input.Keyboard.Key;
  private bombKey!: Phaser.Input.Keyboard.Key;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private pedals: Phaser.GameObjects.Rectangle[] = [];
  private grids: Phaser.GameObjects.Rectangle[] = [];
  private gridsOpen = false;
  private shootSystem!: ShootSystem;
  private bombSystem!: BombSystem;
  private lastDir = { x: 1, y: 0 };
  private entry: PersiaInitData | null = null;
  private exited = false;

  constructor() {
    super({ key: 'Persia' });
  }

  public init(data?: PersiaInitData): void {
    this.entry = data && data.from ? data : null;
    this.exited = false;
    this.lastDir = this.entry?.from === 'right' ? { x: -1, y: 0 } : { x: 1, y: 0 };
  }

  public preload(): void {
    if (!this.textures.exists('pacman')) {
      this.load.spritesheet('pacman', pacmanUrl, { frameWidth: 40, frameHeight: 40 });
    }
  }

  public create(): void {
    this.cameras.main.setBackgroundColor(COLOR_BG);
    this.cameras.main.setBounds(0, 0, WIDTH, GAMEPLAY_HEIGHT);
    this.physics.world.setBounds(0, 0, WIDTH, HEIGHT);
    this.physics.world.gravity.set(0, GRAVITY);

    this.solids = this.physics.add.staticGroup();
    this.pedals = [];
    this.grids = [];
    this.gridsOpen = false;
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
    this.player.setScale(PLAYER_SCALE);
    this.player.body.setSize(PLAYER_HALF * 2, PLAYER_HALF * 2);
    this.player.play('munch');
    this.physics.add.collider(this.player, this.solids);

    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

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
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.persist, this);
  }

  private renderTile(ch: string, col: number, row: number): void {
    if (ch === ' ') return;
    const cx = (col + 0.5) * TILE;
    const cy = (row + 0.5) * TILE;
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
      return;
    }
    if (ch === 'P') {
      // Pedal: a flat disk on the floor; no physics body so player just walks over it.
      const pedal = this.add.rectangle(cx, cy + TILE * 0.35, TILE * 0.7, TILE * 0.2, COLOR_PEDAL);
      pedal.setStrokeStyle(2, COLOR_PEDAL_HI);
      pedal.setData('cellCx', cx);
      pedal.setData('cellCy', cy);
      this.pedals.push(pedal);
      return;
    }
    if (ch === 'G') {
      const grid = this.add.rectangle(cx, cy, TILE, TILE, COLOR_GRID);
      grid.setStrokeStyle(2, COLOR_GRID_HI);
      this.solids.add(grid);
      this.grids.push(grid);
      return;
    }
  }

  private computeSpawn(): { x: number; y: number } {
    // Bottom-floor surface at top of the floor row (row 12 → y=480), player feet there.
    const groundY = 12 * TILE - PLAYER_HALF;
    if (this.entry?.from === 'right') return { x: WIDTH - PLAYER_HALF - TILE, y: groundY };
    if (this.entry?.from === 'left') return { x: PLAYER_HALF + TILE, y: groundY };
    const snap = WorldState.load('Persia');
    if (snap) return { x: snap.player.x, y: snap.player.y };
    return { x: WIDTH - PLAYER_HALF - TILE, y: groundY };
  }

  public update(): void {
    if (this.exited) return;

    const body = this.player.body;
    body.setVelocityX(0);
    if (this.cursors.left.isDown) {
      body.setVelocityX(-SPEED);
      this.player.angle = 180;
      this.lastDir = { x: -1, y: 0 };
    } else if (this.cursors.right.isDown) {
      body.setVelocityX(SPEED);
      this.player.angle = 0;
      this.lastDir = { x: 1, y: 0 };
    }

    if (this.cursors.up.isDown && body.blocked.down) {
      body.setVelocityY(-JUMP_VELOCITY);
    }

    this.updatePedals();

    if (Phaser.Input.Keyboard.JustDown(this.fireKey)) this.shootSystem.fire();
    if (Phaser.Input.Keyboard.JustDown(this.bombKey)) this.bombSystem.plant();
    this.shootSystem.update();
    this.bombSystem.update();

    if (this.player.x > WIDTH) {
      this.exited = true;
      goToScene(this, 'SpaceInvaders', { from: 'left' });
    }
  }

  private updatePedals(): void {
    let onPedal = false;
    if (this.pedals.length > 0) {
      const playerBounds = this.player.getBounds();
      for (const pedal of this.pedals) {
        if (Phaser.Geom.Intersects.RectangleToRectangle(playerBounds, pedal.getBounds())) {
          onPedal = true;
          break;
        }
      }
    }
    if (onPedal === this.gridsOpen) return;
    this.gridsOpen = onPedal;
    for (const grid of this.grids) {
      grid.setVisible(!onPedal);
      const body = grid.body as Phaser.Physics.Arcade.StaticBody | null;
      if (body) body.enable = !onPedal;
    }
  }

  private persist(): void {
    WorldState.save('Persia', {
      player: { x: this.player.x, y: this.player.y },
    });
  }
}
