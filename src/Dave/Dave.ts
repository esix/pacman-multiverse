import Phaser from 'phaser';
import pacmanUrl from '../assets/pacman.png';
import { WorldState, EntrySide } from '../world/WorldState';
import { goToScene } from '../world/navigation';
import { parseLevel } from '../world/level';
import { ITEM_GUN_KEY, ensureItemTextures } from '../world/items';
import { ShootSystem } from '../world/shooting';
import { BombSystem } from '../world/bombs';

const TILE = 56;
const PLAYER_HALF = 16;

const SPEED = 220;
const JUMP_VELOCITY = 560;
const GRAVITY = 1100;

const COLOR_BG = 0x101830;
const COLOR_BLOCK = 0x6b3e1a;
const COLOR_BLOCK_HI = 0x9a5d28;
const COLOR_PIPE = 0x22aa44;
const COLOR_PIPE_HI = 0x88ff88;

// Each char is one 60×60 tile.
// 'B' = solid block (collidable). 'P' = pipe (decoration; doubles as spawn marker).
// 'G' = gun pickup (added to inventory on overlap). space = empty.
// Player spawns at the topmost-leftmost 'P'. Walking off the left edge returns to Digger.
const LEVEL = `\
BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB
B                                                            B
B                                                            B
B                                                            B
P
BBB          G        BBB  BBB   BB         BB   BB BBB  BBBBB
B    BBB    BB      B                 BBBB                   B
B               BBB                    BB                    B
B        BB                              BBB                 B
BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB   BBBBBBB
`;

const PARSED = parseLevel(LEVEL);
const LEVEL_ROWS = PARSED.rows;
const COLS = PARSED.cols;
const ROWS = PARSED.numRows;
const WIDTH = COLS * TILE;
const HEIGHT = ROWS * TILE;

interface DaveInitData {
  from?: EntrySide;
}

export default class Dave extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private fireKey!: Phaser.Input.Keyboard.Key;
  private bombKey!: Phaser.Input.Keyboard.Key;
  private blocks!: Phaser.Physics.Arcade.StaticGroup;
  private gunPickups: Phaser.GameObjects.Image[] = [];
  private shootSystem!: ShootSystem;
  private bombSystem!: BombSystem;
  private lastDir = { x: 1, y: 0 };
  private entry: DaveInitData | null = null;
  private exited = false;

  constructor() {
    super({ key: 'Dave' });
  }

  public init(data?: DaveInitData): void {
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
    ensureItemTextures(this);

    this.cameras.main.setBackgroundColor(COLOR_BG);
    this.cameras.main.setBounds(0, 0, WIDTH, HEIGHT);
    this.physics.world.setBounds(0, 0, WIDTH, HEIGHT);
    this.physics.world.gravity.set(0, GRAVITY);

    this.blocks = this.physics.add.staticGroup();
    this.gunPickups = [];
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
    this.physics.add.collider(this.player, this.blocks);

    for (const gun of this.gunPickups) {
      this.physics.add.overlap(this.player, gun, () => this.pickupGun(gun));
    }

    this.cameras.main.startFollow(this.player, true, 0.15, 0.15);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.fireKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
    this.bombKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.shootSystem = new ShootSystem({
      scene: this,
      getPlayer: () => this.player,
      getDirection: () => this.lastDir,
      walls: this.blocks,
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
    if (ch === 'B') {
      const rect = this.add.rectangle(cx, cy, TILE, TILE, COLOR_BLOCK);
      rect.setStrokeStyle(2, COLOR_BLOCK_HI);
      this.blocks.add(rect);
      return;
    }
    if (ch === 'P') {
      const rect = this.add.rectangle(cx, cy, TILE, TILE, COLOR_PIPE);
      rect.setStrokeStyle(2, COLOR_PIPE_HI);
      return;
    }
    if (ch === 'G') {
      if (WorldState.hasItem('gun')) return; // already picked up
      const gun = this.add.image(cx, cy, ITEM_GUN_KEY);
      gun.setDepth(5);
      this.physics.add.existing(gun, true);
      this.gunPickups.push(gun);
      return;
    }
  }

  private pickupGun(gun: Phaser.GameObjects.Image): void {
    if (!gun.active) return;
    WorldState.inventory.add('gun');
    gun.destroy();
  }

  private computeSpawn(): { x: number; y: number } {
    const pipeSpawn = this.findFirstPipe();
    if (this.entry?.from === 'left' || this.entry?.from === 'pipe') return pipeSpawn;
    if (this.entry?.from === 'hole') return this.findHoleSpawn();
    const snap = WorldState.load('Dave');
    if (snap) return { x: snap.player.x, y: snap.player.y };
    return pipeSpawn;
  }

  private findHoleSpawn(): { x: number; y: number } {
    // One tile left of the floor hole — player lands on solid floor next to the hole.
    const floorRow = ROWS - 1;
    const line = LEVEL_ROWS[floorRow];
    const holeCol = line.indexOf(' ');
    const standCol = holeCol > 0 ? holeCol - 1 : 0;
    return {
      x: (standCol + 0.5) * TILE,
      y: floorRow * TILE - PLAYER_HALF,
    };
  }

  private findFirstPipe(): { x: number; y: number } {
    for (let r = 0; r < ROWS; r++) {
      const c = LEVEL_ROWS[r].indexOf('P');
      if (c >= 0) return { x: (c + 0.5) * TILE, y: (r + 0.5) * TILE };
    }
    return { x: TILE, y: TILE };
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

    if (Phaser.Input.Keyboard.JustDown(this.fireKey)) {
      this.shootSystem.fire();
    }
    if (Phaser.Input.Keyboard.JustDown(this.bombKey)) {
      this.bombSystem.plant();
    }
    this.shootSystem.update();
    this.bombSystem.update();

    if (this.player.x < 0) {
      this.exited = true;
      goToScene(this, 'Pacman', { from: 'right' });
      return;
    }
    if (this.player.y > HEIGHT) {
      this.exited = true;
      goToScene(this, 'LodeRunner', { from: 'top' });
    }
  }

  private persist(): void {
    WorldState.save('Dave', {
      player: { x: this.player.x, y: this.player.y },
    });
  }
}
