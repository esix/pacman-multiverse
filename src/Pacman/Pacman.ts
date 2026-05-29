import Phaser from 'phaser';
import ArcadePhysicsCallback = Phaser.Types.Physics.Arcade.ArcadePhysicsCallback;
import dotUrl from './assets/dot.png';
import tilesUrl from './assets/pacman-tiles.png';
import mapUrl from './assets/pacman-map.json?url';
import pacmanUrl from '../assets/pacman.png';
import { WorldState, EntrySide } from '../world/WorldState';
import { ensureGhostTextures, placeGhost } from '../world/ghosts';
import { goToScene } from '../world/navigation';
import { ShootSystem } from '../world/shooting';
import { BombSystem } from '../world/bombs';
import { GAMEPLAY_HEIGHT } from '../world/layout';

enum Direction {
  NONE = 0,
  LEFT = 1,
  RIGHT = 2,
  UP = 3,
  DOWN = 4,
}

const SAFETILE = 14;
const GRIDSIZE = 40;
const SPEED = 150;
const THRESHOLD = 10;

const INITIAL_X = 14.5;
const INITIAL_Y = 5.5;
const INITIAL_DIRECTION = Direction.RIGHT;

interface PacmanInitData {
  from?: EntrySide;
  y?: number;
}

export default class Pacman extends Phaser.Scene {
  private map!: Phaser.Tilemaps.Tilemap;
  private layer!: Phaser.Tilemaps.TilemapLayer;
  private pacman!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private marker = new Phaser.Geom.Point();
  private turnPoint = new Phaser.Geom.Point();
  private directions: (Phaser.Tilemaps.Tile | null)[] = [null, null, null, null, null];
  private opposites: Direction[] = [Direction.NONE, Direction.RIGHT, Direction.LEFT, Direction.DOWN, Direction.UP];
  private current: Direction = Direction.UP;
  private turning: Direction = Direction.NONE;
  private dots!: Phaser.GameObjects.Group;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private fireKey!: Phaser.Input.Keyboard.Key;
  private bombKey!: Phaser.Input.Keyboard.Key;
  private shootSystem!: ShootSystem;
  private bombSystem!: BombSystem;
  private mapTop = 0;

  private entry: PacmanInitData | null = null;
  private eatenDots = new Set<number>();
  private exited = false;

  constructor() {
    super({ key: 'Pacman' });
  }

  public init(data?: PacmanInitData): void {
    this.entry = data && data.from ? data : null;
    this.exited = false;
  }

  public preload(): void {
    this.load.image('dot', dotUrl);
    this.load.image('tiles', tilesUrl);
    this.load.tilemapTiledJSON('map', mapUrl);
    this.load.spritesheet('pacman', pacmanUrl, { frameWidth: 40, frameHeight: 40 });
  }

  public create(): void {
    this.anims.create({
      key: 'munch',
      frames: this.anims.generateFrameNumbers('pacman', { frames: [0, 1, 2, 1] }),
      frameRate: 10,
      repeat: -1,
    });

    this.map = this.make.tilemap({ key: 'map' });
    const tileset = this.map.addTilesetImage('pacman-tiles', 'tiles')!;

    this.mapTop = (GAMEPLAY_HEIGHT - this.map.heightInPixels) >> 1;

    this.layer = this.map.createLayer('Pacman', tileset, 0, this.mapTop)!;

    const snap = WorldState.load('Pacman');
    this.eatenDots = new Set(snap?.eatenDotIndices ?? []);

    this.dots = this.add.group();
    const pillsArray = this.map.createFromTiles(7, SAFETILE, { key: 'dot' }, this) ?? [];
    pillsArray.forEach((dot, i) => {
      dot.setDepth(10);
      this.physics.add.existing(dot);
      dot.setData('dotIndex', i);
      this.dots.add(dot);
      if (this.eatenDots.has(i)) {
        const sprite = dot as Phaser.Physics.Arcade.Sprite;
        sprite.setActive(false).setVisible(false);
        const body = sprite.body as Phaser.Physics.Arcade.Body | null;
        if (body) body.enable = false;
      }
    });

    this.map.setCollisionByExclusion([SAFETILE], true, false, this.layer);

    const spawn = this.computeSpawn(snap);

    this.pacman = this.physics.add.sprite(spawn.x, spawn.y, 'pacman', 0);
    this.pacman.body.setSize(GRIDSIZE, GRIDSIZE);
    this.pacman.play('munch');
    this.physics.add.collider(this.pacman, this.layer);
    this.physics.add.overlap(this.pacman, this.dots, this.eatDot, undefined, this);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.fireKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.CTRL);
    this.bombKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
    this.shootSystem = new ShootSystem({
      scene: this,
      getPlayer: () => this.pacman,
      getDirection: () => this.dirVec(),
      walls: this.layer,
      bounds: { x: 0, y: 0, width: this.scale.getViewPort().width, height: GAMEPLAY_HEIGHT },
    });
    this.bombSystem = new BombSystem({
      scene: this,
      getPlayer: () => this.pacman,
    });

    this.move(spawn.direction);

    ensureGhostTextures(this);
    const ghostCells: Array<[number, number]> = [
      [8, 5],
      [9, 5],
      [10, 5],
      [11, 5],
    ];
    ghostCells.forEach(([col, row], i) => {
      placeGhost(this, col * GRIDSIZE + GRIDSIZE / 2, row * GRIDSIZE + GRIDSIZE / 2 + this.mapTop, i);
    });

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.persist, this);
  }

  private computeSpawn(snap: ReturnType<typeof WorldState.load<'Pacman'>>): { x: number; y: number; direction: Direction } {
    const viewportWidth = this.scale.getViewPort().width;
    const centerY = INITIAL_Y * GRIDSIZE + this.mapTop;
    if (this.entry?.from === 'right') {
      return { x: viewportWidth - GRIDSIZE / 2, y: centerY, direction: Direction.LEFT };
    }
    if (this.entry?.from === 'left') {
      return { x: GRIDSIZE / 2, y: centerY, direction: Direction.RIGHT };
    }
    if (snap) {
      return { x: snap.pacman.x, y: snap.pacman.y, direction: snap.pacman.direction };
    }
    return {
      x: INITIAL_X * GRIDSIZE,
      y: centerY,
      direction: INITIAL_DIRECTION,
    };
  }

  public update(_time: number, _delta: number): void {
    this.marker.x = Phaser.Math.Snap.Floor(Math.floor(this.pacman.x), GRIDSIZE) / GRIDSIZE;
    this.marker.y = Phaser.Math.Snap.Floor(Math.floor(this.pacman.y - this.mapTop), GRIDSIZE) / GRIDSIZE;
    this.directions[Direction.LEFT] = this.layer.getTileAt(this.marker.x - 1, this.marker.y);
    this.directions[Direction.RIGHT] = this.layer.getTileAt(this.marker.x + 1, this.marker.y);
    this.directions[Direction.UP] = this.layer.getTileAt(this.marker.x, this.marker.y - 1);
    this.directions[Direction.DOWN] = this.layer.getTileAt(this.marker.x, this.marker.y + 1);

    this.checkKeys();
    if (this.turning !== Direction.NONE) this.turn();

    if (Phaser.Input.Keyboard.JustDown(this.fireKey)) this.shootSystem.fire();
    if (Phaser.Input.Keyboard.JustDown(this.bombKey)) this.bombSystem.plant();
    this.shootSystem.update();
    this.bombSystem.update();

    if (this.exited) return;
    const viewportWidth = this.scale.getViewPort().width;
    if (this.pacman.x > viewportWidth) {
      this.exited = true;
      goToScene(this, 'Dave', { from: 'left', y: this.pacman.y });
    } else if (this.pacman.x < 0) {
      this.exited = true;
      goToScene(this, 'Digger', { from: 'right', y: this.pacman.y });
    }
  }

  private checkKeys(): void {
    if (this.cursors.left.isDown && this.current !== Direction.LEFT) {
      this.checkDirection(Direction.LEFT);
    } else if (this.cursors.right.isDown && this.current !== Direction.RIGHT) {
      this.checkDirection(Direction.RIGHT);
    } else if (this.cursors.up.isDown && this.current !== Direction.UP) {
      this.checkDirection(Direction.UP);
    } else if (this.cursors.down.isDown && this.current !== Direction.DOWN) {
      this.checkDirection(Direction.DOWN);
    } else {
      this.turning = Direction.NONE;
    }
  }

  private checkDirection(turnTo: Direction): void {
    const target = this.directions[turnTo];
    if (this.turning === turnTo || target === null || target.index !== SAFETILE) {
      return;
    }
    if (this.current === this.opposites[turnTo]) {
      this.move(turnTo);
    } else {
      this.turning = turnTo;
      this.turnPoint.x = this.marker.x * GRIDSIZE + GRIDSIZE / 2;
      this.turnPoint.y = this.marker.y * GRIDSIZE + GRIDSIZE / 2 + this.mapTop;
    }
  }

  private turn(): boolean {
    const cx = Math.floor(this.pacman.x);
    const cy = Math.floor(this.pacman.y);
    if (
      !Phaser.Math.Fuzzy.Equal(cx, this.turnPoint.x, THRESHOLD) ||
      !Phaser.Math.Fuzzy.Equal(cy, this.turnPoint.y, THRESHOLD)
    ) {
      return false;
    }
    this.pacman.x = this.turnPoint.x;
    this.pacman.y = this.turnPoint.y;
    this.pacman.body.reset(this.turnPoint.x, this.turnPoint.y);
    this.move(this.turning);
    this.turning = Direction.NONE;
    return true;
  }

  private move(direction: Direction): void {
    switch (direction) {
      case Direction.UP:
        this.pacman.angle = -90;
        this.pacman.body.setVelocityX(0);
        this.pacman.body.setVelocityY(-SPEED);
        break;
      case Direction.DOWN:
        this.pacman.angle = 90;
        this.pacman.body.setVelocityX(0);
        this.pacman.body.setVelocityY(+SPEED);
        break;
      case Direction.RIGHT:
        this.pacman.angle = 0;
        this.pacman.body.setVelocityX(+SPEED);
        this.pacman.body.setVelocityY(0);
        break;
      case Direction.LEFT:
        this.pacman.angle = 180;
        this.pacman.body.setVelocityX(-SPEED);
        this.pacman.body.setVelocityY(0);
        break;
    }
    this.current = direction;
  }

  private eatDot: ArcadePhysicsCallback = (_pacman, dot) => {
    const sprite = dot as Phaser.Physics.Arcade.Sprite;
    const i = sprite.getData('dotIndex') as number | undefined;
    if (typeof i === 'number') this.eatenDots.add(i);
    sprite.setActive(false).setVisible(false);
    const body = sprite.body as Phaser.Physics.Arcade.Body | null;
    if (body) body.enable = false;
  };

  private dirVec(): { x: number; y: number } {
    switch (this.current) {
      case Direction.LEFT: return { x: -1, y: 0 };
      case Direction.RIGHT: return { x: 1, y: 0 };
      case Direction.UP: return { x: 0, y: -1 };
      case Direction.DOWN: return { x: 0, y: 1 };
      default: return { x: 1, y: 0 };
    }
  }

  private persist(): void {
    WorldState.save('Pacman', {
      pacman: { x: this.pacman.x, y: this.pacman.y, direction: this.current },
      eatenDotIndices: Array.from(this.eatenDots),
    });
  }
}
