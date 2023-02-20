import ArcadePhysics = Phaser.Physics.Arcade.ArcadePhysics;

enum Direction {
  NONE = 0,
  LEFT = 1,
  RIGHT = 2,
  UP = 3,
  DOWN = 4,
}

export default class Pacman extends Phaser.Scene {
  private map: Phaser.Tilemaps.Tilemap;
  private layer: Phaser.Tilemaps.TilemapLayer;
  private pacman: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private safetile: number;
  private gridsize: number;
  private speed: number;
  private threshold: number;
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
    this.safetile = 14;
    this.gridsize = 16;
    this.speed = 150;
    this.threshold = 3;
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
    this.load.spritesheet('pacman', require('./assets/pacman.png'), {frameWidth: 32, frameHeight: 32});

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

    this.map = this.make.tilemap({key: 'map', tileWidth: 32, tileHeight: 32});
    const tileset = this.map.addTilesetImage('pacman-tiles', 'tiles');
    this.layer = this.map.createLayer('Pacman', tileset, 0, 0);
    this.dots = this.add.group();
    const pillsArray = this.map.createFromTiles(7, this.safetile, {key: 'dot'}, this);
    pillsArray.forEach(dot => {
      dot.x += 6;
      dot.y += 6;
      this.physics.add.existing(dot)
      this.dots.add(dot);
    });
    //  Pacman should collide with everything except the safe tile
    this.map.setCollisionByExclusion([this.safetile], true, false, this.layer);
    //  Position Pacman at grid location 14x17 (the +8 accounts for his anchor)
    this.pacman = this.physics.add.sprite((14 * 16) + 8, (17 * 16) + 8, 'pacman', 0);
    this.pacman.body.setSize(16, 16);
    this.pacman.play('munch');
    this.physics.add.collider(this.pacman, this.layer);
    this.physics.add.overlap(this.pacman, this.dots, this.eatDot, null, this);

    this.cursors = this.input.keyboard.createCursorKeys();

    this.move(Direction.LEFT)
  }

  public update(time: number, delta: number) {
    this.marker.x = Phaser.Math.Snap.Floor(Math.floor(this.pacman.x), this.gridsize) / this.gridsize;
    this.marker.y = Phaser.Math.Snap.Floor(Math.floor(this.pacman.y), this.gridsize) / this.gridsize;
    this.directions[Direction.LEFT] = this.map.getTileAt(this.marker.x - 1, this.marker.y);
    this.directions[Direction.RIGHT] = this.map.getTileAt(this.marker.x + 1, this.marker.y);
    this.directions[Direction.UP] = this.map.getTileAt(this.marker.x, this.marker.y - 1);
    this.directions[Direction.DOWN] = this.map.getTileAt(this.marker.x, this.marker.y + 1);

    this.checkKeys();
    if (this.turning !== Direction.NONE) this.turn();
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
    if (this.turning === turnTo || this.directions[turnTo] === null || this.directions[turnTo].index !== this.safetile) {
      //  Invalid direction if they're already set to turn that way
      //  Or there is no tile there, or the tile isn't index 1 (a floor tile)
      return;
    }
    //  Check if they want to turn around and can
    if (this.current === this.opposites[turnTo]) {
      this.move(turnTo);
    } else {
      this.turning = turnTo;
      this.turnPoint.x = (this.marker.x * this.gridsize) + (this.gridsize / 2);
      this.turnPoint.y = (this.marker.y * this.gridsize) + (this.gridsize / 2);
    }
  }

  private turn() {
    const cx = Math.floor(this.pacman.x);
    const cy = Math.floor(this.pacman.y);
    //  This needs a threshold, because at high speeds you can't turn because the coordinates skip past
    if (!Phaser.Math.Fuzzy.Equal(cx, this.turnPoint.x, this.threshold) || !Phaser.Math.Fuzzy.Equal(cy, this.turnPoint.y, this.threshold)) {
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
    let speed = this.speed;
    if (direction === Direction.LEFT || direction === Direction.UP) {
      speed = -speed;
    }
    if (direction === Direction.LEFT || direction === Direction.RIGHT) {
      this.pacman.body.setVelocityX(speed);
    } else {
      this.pacman.body.setVelocityY(speed);
    }
    // rotate sprite in right direction
    switch (direction) {
      case Direction.UP:
        this.pacman.angle = -90;
        break;
      case Direction.DOWN:
        this.pacman.angle = 90;
        break;
      case Direction.RIGHT:
        this.pacman.angle = 0;
        break;
      case Direction.LEFT:
        this.pacman.angle = 180;
        break;
    }
    this.current = direction;
  }

  private eatDot(pacman: any, dot: any) {
    dot.setActive(false).setVisible(false);
  }
}
