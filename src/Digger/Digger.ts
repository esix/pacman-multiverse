import Phaser from 'phaser';
import pacmanUrl from '../assets/pacman.png';
import { WorldState, EntrySide } from '../world/WorldState';
import { ensureGhostTextures, placeGhost } from '../world/ghosts';
import { goToScene } from '../world/navigation';
import { parseLevel } from '../world/level';
import { ShootSystem } from '../world/shooting';
import { BombSystem } from '../world/bombs';

const TILE = 20;
const PLAYER_HALF = 16;
const SPEED = 160;
const DIG_OVERLAP_THRESHOLD = 0.2;

const COLOR_BG = 0x1a0d00;
const COLOR_DIRT = 0x8b5a2b;
const COLOR_DIRT_BORDER = 0xa5703a;
const COLOR_WALL = 0x444444;

// Each char is one 20×20 tile.
// 'W' = wall (collidable, indestructible). 'D' = dirt (diggable). space = empty (cave).
// Left/right openings at rows 13-16 are spaces in the wall border — that's how player
// reaches the screen edges to transition to neighbor levels.
// Left edge → Pacman. Right edge → Dave.
const LEVEL = `\
WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW
WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW
WWDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDWW
WW                                    WW
WW                                    WW
WWDDDD  DDDDDDDDDDDDDDDDDDD  DDDDDDDDDWW
WWDDDD  DDDDDDDDDDDDDDDDDDD  DDDDDDDDDWW
WWDDDD  DDDDDDDDDDDDDDDDDDD  DDDDDDDDDWW
WW                             DDDDDDDWW
WW                             DDDDDDDWW
WWDDDD  DDDDDDDD  DDDDDDDDD  DDDDDDDDDWW
WWDDDD  DDDDDDDD  DDDDDDDDD  DDDDDDDDDWW
WWDDDD  DDDDDDDD  DDDDDDDDD  DDDDDDDDDWW
WW
WW
WW
WW
WWDDDD  DDDDDDDD  DDDDDDDDD  DDDDDDDDDWW
WWDDDD  DDDDDDDD  DDDDDDDDD  DDDDDDDDDWW
WWDDDD  DDDDDDDD  DDDDDDDDD  DDDDDDDDDWW
WWDDDD                                WW
WWDDDD                                WW
WWDDDD  DDDDDDDD  DDDDDDDDDDDDDDDDDDDDWW
WWDDDD  DDDDDDDD  DDDDDDDDDDDDDDDDDDDDWW
WWDDDD  DDDDDDDD  DDDDDDDDDDDDDDDDDDDDWW
WW                                    WW
WW                                    WW
WWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWWW`;

const PARSED = parseLevel(LEVEL);
const LEVEL_ROWS = PARSED.rows;
const COLS = PARSED.cols;
const ROWS = PARSED.numRows;
const WIDTH = COLS * TILE;
const HEIGHT = ROWS * TILE;
// Hole at rows 13-16 (4 tiles tall) — center between rows 14 and 15.
const HOLE_CENTER_Y = 15 * TILE;

type Cell = 'empty' | 'dirt' | 'wall';

interface DiggerInitData {
  from?: EntrySide;
  y?: number;
}

export default class Digger extends Phaser.Scene {
  private cells: Cell[][] = [];
  private dirtTiles: (Phaser.GameObjects.Rectangle | null)[][] = [];
  private walls!: Phaser.Physics.Arcade.StaticGroup;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private fireKey!: Phaser.Input.Keyboard.Key;
  private bombKey!: Phaser.Input.Keyboard.Key;
  private shootSystem!: ShootSystem;
  private bombSystem!: BombSystem;
  private lastDir = { x: 1, y: 0 };
  private entry: DiggerInitData | null = null;
  private exited = false;

  constructor() {
    super({ key: 'Digger' });
  }

  public init(data?: DiggerInitData): void {
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

    this.buildGrid();
    this.applySnapshot();
    this.renderGrid();

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
    this.physics.add.collider(this.player, this.walls);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.fireKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
    this.bombKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.shootSystem = new ShootSystem({
      scene: this,
      getPlayer: () => this.player,
      getDirection: () => this.lastDir,
      walls: this.walls,
      bounds: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
    });
    this.bombSystem = new BombSystem({
      scene: this,
      getPlayer: () => this.player,
    });

    ensureGhostTextures(this);
    // [col, corridorTopRow] — ghost is centered vertically between top and bottom rows of its 2-tile corridor
    const ghostCells: Array<[number, number]> = [
      [10, 3],   // top corridor
      [25, 8],   // upper-mid corridor
      [14, 20],  // lower-mid corridor
      [32, 25],  // bottom corridor
    ];
    ghostCells.forEach(([col, topRow], i) => {
      placeGhost(this, col * TILE + TILE / 2, (topRow + 1) * TILE, i);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.persist, this);
  }

  private buildGrid(): void {
    this.cells = [];
    for (let row = 0; row < ROWS; row++) {
      this.cells[row] = [];
      for (let col = 0; col < COLS; col++) {
        this.cells[row][col] = this.defaultCellAt(row, col);
      }
    }
  }

  private defaultCellAt(row: number, col: number): Cell {
    const ch = LEVEL_ROWS[row]?.[col] ?? ' ';
    if (ch === 'W') return 'wall';
    if (ch === 'D') return 'dirt';
    return 'empty';
  }

  private applySnapshot(): void {
    const snap = WorldState.load('Digger');
    if (!snap) return;
    for (const [row, col] of snap.dug) {
      if (this.cells[row]?.[col] === 'dirt') {
        this.cells[row][col] = 'empty';
      }
    }
  }

  private renderGrid(): void {
    this.walls = this.physics.add.staticGroup();
    this.dirtTiles = [];
    for (let row = 0; row < ROWS; row++) {
      this.dirtTiles[row] = [];
      for (let col = 0; col < COLS; col++) {
        const cx = col * TILE + TILE / 2;
        const cy = row * TILE + TILE / 2;
        const cell = this.cells[row][col];
        if (cell === 'wall') {
          const rect = this.add.rectangle(cx, cy, TILE, TILE, COLOR_WALL);
          this.walls.add(rect);
          this.dirtTiles[row][col] = null;
        } else if (cell === 'dirt') {
          this.dirtTiles[row][col] = this.makeDirtTile(cx, cy);
        } else {
          this.dirtTiles[row][col] = null;
        }
      }
    }
  }

  private makeDirtTile(cx: number, cy: number): Phaser.GameObjects.Rectangle {
    const rect = this.add.rectangle(cx, cy, TILE, TILE, COLOR_DIRT);
    rect.setStrokeStyle(1, COLOR_DIRT_BORDER);
    return rect;
  }

  private computeSpawn(): { x: number; y: number } {
    if (this.entry?.from === 'left') {
      return { x: PLAYER_HALF, y: HOLE_CENTER_Y };
    }
    if (this.entry?.from === 'right') {
      return { x: WIDTH - PLAYER_HALF, y: HOLE_CENTER_Y };
    }
    const snap = WorldState.load('Digger');
    if (snap) return { x: snap.player.x, y: snap.player.y };
    // Default (fresh navigation to #Digger): drop into the entry corridor at the right hole.
    return { x: WIDTH - PLAYER_HALF, y: HOLE_CENTER_Y };
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

    this.dig();

    if (this.player.x > WIDTH) {
      this.exited = true;
      goToScene(this, 'Pacman', { from: 'left', y: this.player.y });
      return;
    }
  }

  private dig(): void {
    const pl = this.player.x - PLAYER_HALF;
    const pr = this.player.x + PLAYER_HALF;
    const pt = this.player.y - PLAYER_HALF;
    const pb = this.player.y + PLAYER_HALF;
    const minCol = Math.floor(pl / TILE);
    const maxCol = Math.floor((pr - 1) / TILE);
    const minRow = Math.floor(pt / TILE);
    const maxRow = Math.floor((pb - 1) / TILE);
    const minOverlapArea = DIG_OVERLAP_THRESHOLD * TILE * TILE;
    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        if (this.cells[r]?.[c] !== 'dirt') continue;
        const cl = c * TILE;
        const ct = r * TILE;
        const ox = Math.min(pr, cl + TILE) - Math.max(pl, cl);
        const oy = Math.min(pb, ct + TILE) - Math.max(pt, ct);
        if (ox * oy <= minOverlapArea) continue;
        this.cells[r][c] = 'empty';
        const tile = this.dirtTiles[r][c];
        if (tile) {
          tile.destroy();
          this.dirtTiles[r][c] = null;
        }
      }
    }
  }

  private persist(): void {
    const dug: Array<[number, number]> = [];
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        if (this.cells[row][col] === 'empty' && this.defaultCellAt(row, col) === 'dirt') {
          dug.push([row, col]);
        }
      }
    }
    WorldState.save('Digger', {
      player: { x: this.player.x, y: this.player.y },
      dug,
    });
  }
}
