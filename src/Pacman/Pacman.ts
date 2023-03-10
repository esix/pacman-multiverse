import ArcadePhysics = Phaser.Physics.Arcade.ArcadePhysics;

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

// const INITIAL_X = 9.5;
// const INITIAL_Y = 7.5;
// const INITIAL_DIRECTION = Direction.LEFT;

const INITIAL_X = 14.5;
const INITIAL_Y = 5.5;
const INITIAL_DIRECTION = Direction.RIGHT;


export default class Pacman extends Phaser.Scene {
  private map: Phaser.Tilemaps.Tilemap;
  private layer: Phaser.Tilemaps.TilemapLayer;
  private pacman: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private marker: Phaser.Geom.Point;
  private turnPoint: Phaser.Geom.Point;
  private directions: any;
  private opposites: Direction[];
  private current: Direction;
  private turning: any;
  private dots: any;
  private cursors: any;

  constructor() {
    super({key: 'Pacman'});

    this.map = null;
    this.layer = null;
    this.pacman = null;
    this.marker = new Phaser.Geom.Point();
    this.turnPoint = new Phaser.Geom.Point();
    this.directions = [null, null, null, null, null];
    this.opposites = [Direction.NONE, Direction.RIGHT, Direction.LEFT, Direction.DOWN, Direction.UP];
    this.current = Direction.UP;
    this.turning = Direction.NONE;
  }

  public preload(): void {
    this.load.image('dot', require('./assets/dot.png'));
    this.load.image('tiles', require('./assets/pacman-tiles.png'));
    this.load.tilemapTiledJSON('map', require('./assets/pacman-map.json'));
    this.load.spritesheet('pacman', require('../assets/pacman.png'), {frameWidth: 40, frameHeight: 40});

    // this.load.scenePlugin({
    //   key: 'ArcadePhysics',
    //   sceneKey: 'physics',
    //   url: Phaser.Physics.Arcade.ArcadePhysics
    // });
  }

  public create(): void {

    this.anims.create({
      key: 'munch',
      frames: this.anims.generateFrameNumbers('pacman', {frames: [0, 1, 2, 1]}),
      frameRate: 10,
      repeat: -1
    });

    this.map = this.make.tilemap({key: 'map'});
    const tileset = this.map.addTilesetImage('pacman-tiles', 'tiles');

    const gameHeight = this.scale.getViewPort().height;
    const mapTop = (gameHeight - this.map.heightInPixels) >> 1;

    this.layer = this.map.createLayer('Pacman', tileset, 0, mapTop);

    this.dots = this.add.group();
    const pillsArray = this.map.createFromTiles(7, SAFETILE, {key: 'dot'}, this);
    pillsArray.forEach(dot => {
      dot.x += 20;
      dot.y += 20;
      this.physics.add.existing(dot)
      this.dots.add(dot);
    });
    //  Pacman should collide with everything except the safe tile
    this.map.setCollisionByExclusion([SAFETILE], true, false, this.layer);

    //  Position Pacman
    this.pacman = this.physics.add.sprite(
      INITIAL_X * GRIDSIZE,
      INITIAL_Y * GRIDSIZE + mapTop,
      'pacman', 0);
    this.pacman.body.setSize(GRIDSIZE, GRIDSIZE);

    this.pacman.play('munch');
    this.physics.add.collider(this.pacman, this.layer);
    this.physics.add.overlap(this.pacman, this.dots, this.eatDot, null, this);

    this.cursors = this.input.keyboard.createCursorKeys();

    this.move(INITIAL_DIRECTION);
  }

  public update(time: number, delta: number) {
    this.marker.x = Phaser.Math.Snap.Floor(Math.floor(this.pacman.x), GRIDSIZE) / GRIDSIZE;
    this.marker.y = Phaser.Math.Snap.Floor(Math.floor(this.pacman.y), GRIDSIZE) / GRIDSIZE;
    this.directions[Direction.LEFT] = this.map.getTileAt(this.marker.x - 1, this.marker.y);
    this.directions[Direction.RIGHT] = this.map.getTileAt(this.marker.x + 1, this.marker.y);
    this.directions[Direction.UP] = this.map.getTileAt(this.marker.x, this.marker.y - 1);
    this.directions[Direction.DOWN] = this.map.getTileAt(this.marker.x, this.marker.y + 1);

    this.checkKeys();
    if (this.turning !== Direction.NONE) this.turn();

    if (this.pacman.x > this.scale.getViewPort().width) {
      this.scene.start('Digger', {x: 0, y: this.pacman.y});
    }
  }

  private checkKeys() {
    if (this.cursors.left.isDown && this.current !== Direction.LEFT) {
      this.checkDirection(Direction.LEFT);
    } else if (this.cursors.right.isDown && this.current !== Direction.RIGHT) {
      this.checkDirection(Direction.RIGHT);
    } else if (this.cursors.up.isDown && this.current !== Direction.UP) {
      this.checkDirection(Direction.UP);
    } else if (this.cursors.down.isDown && this.current !== Direction.DOWN) {
      this.checkDirection(Direction.DOWN);
    } else {
      //  This forces them to hold the key down to turn the corner
      this.turning = Direction.NONE;
    }
  }

  private checkDirection(turnTo: any) {
    if (this.turning === turnTo || this.directions[turnTo] === null || this.directions[turnTo].index !== SAFETILE) {
      //  Invalid direction if they're already set to turn that way
      //  Or there is no tile there, or the tile isn't index 1 (a floor tile)
      return;
    }
    //  Check if they want to turn around and can
    if (this.current === this.opposites[turnTo]) {
      this.move(turnTo);
    } else {
      this.turning = turnTo;
      this.turnPoint.x = (this.marker.x * GRIDSIZE) + (GRIDSIZE / 2);
      this.turnPoint.y = (this.marker.y * GRIDSIZE) + (GRIDSIZE / 2);
    }
  }

  private turn() {
    const cx = Math.floor(this.pacman.x);
    const cy = Math.floor(this.pacman.y);
    //  This needs a threshold, because at high speeds you can't turn because the coordinates skip past
    if (!Phaser.Math.Fuzzy.Equal(cx, this.turnPoint.x, THRESHOLD) || !Phaser.Math.Fuzzy.Equal(cy, this.turnPoint.y, THRESHOLD)) {
      return false;
    }
    //  Grid align before turning
    this.pacman.x = this.turnPoint.x;
    this.pacman.y = this.turnPoint.y;
    this.pacman.body.reset(this.turnPoint.x, this.turnPoint.y);
    this.move(this.turning);
    this.turning = Direction.NONE;
    return true;
  }

  private move(direction: any) {
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

  private eatDot(pacman: any, dot: any) {
    dot.setActive(false).setVisible(false);
  }
}
