import Phaser from 'phaser';
import pacmanUrl from '../assets/pacman.png';
import { WorldState, EntrySide } from '../world/WorldState';
import { goToScene } from '../world/navigation';
import { parseLevel } from '../world/level';
import { ShootSystem } from '../world/shooting';
import { BombSystem } from '../world/bombs';
import { GAMEPLAY_HEIGHT } from '../world/layout';

const TILE = 40;
const PLAYER_HALF = 16;
const WALK_SPEED = 200;
const CLIMB_SPEED = 150;
const GRAVITY = 900;
const BURN_REGEN_MS = 30_000;

const COLOR_BG = 0x12121f;
const COLOR_BLOCK = 0x8a4a20;
const COLOR_BLOCK_HI = 0xc28247;
const COLOR_WALL = 0x3a3a44;
const COLOR_WALL_HI = 0x6a6a7a;
const COLOR_LADDER = 0xe0a040;
const COLOR_BEAM = 0xe0a040;

// Each char is one 40×40 tile.
// 'W' = indestructible wall. 'B' = block (collidable; will be diggable later).
// 'L' = ladder (climbable; passes gravity through).
// 'H' = beam (solid for now; later: hangable). space = empty.
// Player spawns at the topmost-leftmost 'L'. Climbing past the top edge returns to Dave.
const LEVEL = `\
WWWWWWWWLWWWWWWWWWWW
W       L          W
W       L  HHHH    W
WBBB    L          W
W       L  BBBB    W
W   L              W
WBBBL    HHH       W
W   L              W
W   L     BB       W
W   L              W
W   LBB     L      W
W           L      W
WBBBBBBBBBBBBBBBBBBW
WWWWWWWWWBBWWWWWWWWW
`;

const PARSED = parseLevel(LEVEL);
const LEVEL_ROWS = PARSED.rows;
const COLS = PARSED.cols;
const ROWS = PARSED.numRows;
const WIDTH = COLS * TILE;
const HEIGHT = ROWS * TILE;

interface LodeRunnerInitData {
  from?: EntrySide;
}

export default class LodeRunner extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private fireKey!: Phaser.Input.Keyboard.Key;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private ladderCells: boolean[][] = [];
  private blockTiles: (Phaser.GameObjects.Rectangle | null)[][] = [];
  private burnedKeys: Set<string> = new Set();
  private burnLeftKey!: Phaser.Input.Keyboard.Key;
  private burnRightKey!: Phaser.Input.Keyboard.Key;
  private bombKey!: Phaser.Input.Keyboard.Key;
  private shootSystem!: ShootSystem;
  private bombSystem!: BombSystem;
  private lastDir = { x: 1, y: 0 };
  private entry: LodeRunnerInitData | null = null;
  private exited = false;

  constructor() {
    super({ key: 'LodeRunner' });
  }

  public init(data?: LodeRunnerInitData): void {
    this.entry = data && data.from ? data : null;
    this.exited = false;
    this.lastDir = { x: 1, y: 0 };
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
    this.ladderCells = [];
    this.blockTiles = [];
    this.burnedKeys = new Set();
    for (let r = 0; r < ROWS; r++) {
      this.ladderCells[r] = [];
      this.blockTiles[r] = [];
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

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.fireKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
    this.burnLeftKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.Z);
    this.burnRightKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.X);
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
      rect.setStrokeStyle(1, COLOR_WALL_HI);
      this.solids.add(rect);
      return;
    }
    if (ch === 'B') {
      const rect = this.add.rectangle(cx, cy, TILE, TILE, COLOR_BLOCK);
      rect.setStrokeStyle(2, COLOR_BLOCK_HI);
      this.solids.add(rect);
      this.blockTiles[row][col] = rect;
      return;
    }
    if (ch === 'L') {
      // Two vertical rails for the ladder visual; not collidable.
      this.add.rectangle(cx - TILE * 0.25, cy, 4, TILE, COLOR_LADDER);
      this.add.rectangle(cx + TILE * 0.25, cy, 4, TILE, COLOR_LADDER);
      // Rungs every 8 px
      for (let y = cy - TILE / 2 + 6; y < cy + TILE / 2; y += 10) {
        this.add.rectangle(cx, y, TILE * 0.6, 2, COLOR_LADDER);
      }
      this.ladderCells[row][col] = true;
      return;
    }
    if (ch === 'H') {
      // Horizontal beam — solid for Phase 1.
      const rect = this.add.rectangle(cx, cy - TILE * 0.35, TILE, 6, COLOR_BEAM);
      const hitbox = this.add.rectangle(cx, cy - TILE * 0.35, TILE, 6, COLOR_BEAM, 0);
      this.solids.add(hitbox);
      void rect; // visual only
      return;
    }
  }

  private computeSpawn(): { x: number; y: number } {
    const ladderSpawn = this.findFirstLadder();
    if (this.entry?.from === 'top' || this.entry?.from === 'hole') return ladderSpawn;
    if (this.entry?.from === 'bottom') return this.findBottomHoleSpawn();
    const snap = WorldState.load('LodeRunner');
    if (snap) return { x: snap.player.x, y: snap.player.y };
    return ladderSpawn;
  }

  private findFirstLadder(): { x: number; y: number } {
    for (let r = 0; r < ROWS; r++) {
      const c = LEVEL_ROWS[r].indexOf('L');
      if (c >= 0) return { x: (c + 0.5) * TILE, y: (r + 0.5) * TILE };
    }
    return { x: TILE, y: TILE };
  }

  private findBottomHoleSpawn(): { x: number; y: number } {
    // Find first 'B' in the bottom-most row (the burnable-band) and spawn
    // 2 rows above it so player lands on whatever is there.
    const lastRow = ROWS - 1;
    const line = LEVEL_ROWS[lastRow] ?? '';
    const c = line.indexOf('B');
    if (c >= 0) {
      return { x: (c + 0.5) * TILE, y: (lastRow - 1.5) * TILE };
    }
    return { x: (COLS / 2) * TILE, y: (ROWS - 2.5) * TILE };
  }

  private isOnLadder(): boolean {
    const col = Math.floor(this.player.x / TILE);
    const row = Math.floor(this.player.y / TILE);
    return !!this.ladderCells[row]?.[col];
  }

  public update(): void {
    if (this.exited) return;

    const body = this.player.body;
    const onLadder = this.isOnLadder();

    if (onLadder) {
      body.allowGravity = false;
      body.setVelocity(0, 0);
      if (this.cursors.up.isDown) body.setVelocityY(-CLIMB_SPEED);
      else if (this.cursors.down.isDown) body.setVelocityY(CLIMB_SPEED);
      if (this.cursors.left.isDown) {
        body.setVelocityX(-WALK_SPEED);
        this.player.angle = 180;
        this.lastDir = { x: -1, y: 0 };
      } else if (this.cursors.right.isDown) {
        body.setVelocityX(WALK_SPEED);
        this.player.angle = 0;
        this.lastDir = { x: 1, y: 0 };
      }
    } else {
      body.allowGravity = true;
      body.setVelocityX(0);
      if (this.cursors.left.isDown) {
        body.setVelocityX(-WALK_SPEED);
        this.player.angle = 180;
        this.lastDir = { x: -1, y: 0 };
      } else if (this.cursors.right.isDown) {
        body.setVelocityX(WALK_SPEED);
        this.player.angle = 0;
        this.lastDir = { x: 1, y: 0 };
      }
      // No jumping in LodeRunner.
    }

    if (Phaser.Input.Keyboard.JustDown(this.fireKey)) this.shootSystem.fire();
    if (Phaser.Input.Keyboard.JustDown(this.bombKey)) this.bombSystem.plant();
    this.shootSystem.update();
    this.bombSystem.update();

    if (Phaser.Input.Keyboard.JustDown(this.burnLeftKey)) this.burn(-1);
    if (Phaser.Input.Keyboard.JustDown(this.burnRightKey)) this.burn(1);

    if (this.player.y < 0) {
      this.exited = true;
      goToScene(this, 'Dave', { from: 'hole' });
      return;
    }
    if (this.player.y > HEIGHT) {
      this.exited = true;
      goToScene(this, 'Bomberman', { from: 'top' });
    }
  }

  private burn(dx: number): void {
    if (!this.player.body.blocked.down) return;
    const playerCol = Math.floor(this.player.x / TILE);
    const playerRow = Math.floor(this.player.y / TILE);
    const targetCol = playerCol + dx;
    const targetRow = playerRow + 1;
    if (LEVEL_ROWS[targetRow]?.[targetCol] !== 'B') return;
    const key = `${targetCol},${targetRow}`;
    if (this.burnedKeys.has(key)) return;

    const tile = this.blockTiles[targetRow]?.[targetCol];
    if (!tile) return;
    tile.destroy();
    this.blockTiles[targetRow][targetCol] = null;
    this.burnedKeys.add(key);

    this.time.delayedCall(BURN_REGEN_MS, () => this.restoreBlock(targetCol, targetRow, key));
  }

  private restoreBlock(col: number, row: number, key: string): void {
    if (!this.burnedKeys.has(key)) return;
    const cx = (col + 0.5) * TILE;
    const cy = (row + 0.5) * TILE;
    const rect = this.add.rectangle(cx, cy, TILE, TILE, COLOR_BLOCK);
    rect.setStrokeStyle(2, COLOR_BLOCK_HI);
    this.solids.add(rect);
    this.blockTiles[row][col] = rect;
    this.burnedKeys.delete(key);
  }

  private persist(): void {
    WorldState.save('LodeRunner', {
      player: { x: this.player.x, y: this.player.y },
    });
  }
}
