export interface IImageConstructor {
  scene: Phaser.Scene;
  x: number;
  y: number;
  texture: string | Phaser.Textures.Texture;
  frame?: string | number;
}

export class Redhat extends Phaser.GameObjects.Image {
  body: Phaser.Physics.Arcade.Body;

  constructor(aParams: IImageConstructor) {
    super(aParams.scene, aParams.x, aParams.y, aParams.texture, aParams.frame);

    this.initSprite();
    this.initPhysics();
    this.scene.add.existing(this);
  }

  private initSprite() {
    this.setScale(0.5);
  }

  private initPhysics() {
    this.scene.physics.world.enable(this);
    this.body.setVelocity(100, 200);
    this.body.setBounce(1, 1);
    this.body.setCollideWorldBounds(true);
  }
}

export default class PacmanScene extends Phaser.Scene {
  private myRedhat: Redhat;
  private player: Phaser.GameObjects.Sprite;
  private cursors: any;


  constructor() {
    super({ key: 'TestScene' });
  }

  public preload(): void {
    this.load.tilemapTiledJSON('map', '/assets/tilemaps/desert.json');
    // this.load.image('Desert', '/assets/tilemaps/tmw_desert_spacing.png');
    this.load.image('player', require('./sprites/mushroom.png'));

    this.load.image('redhat', require('./redhat.png'));
    this.load.image('redParticle', require('./red.png'));
  }

  create(): void {
    const particles = this.add.particles('redParticle');

    const emitter = particles.createEmitter({
      speed: 100,
      scale: { start: 0.5, end: 0 },
      blendMode: 'ADD'
    });

    this.myRedhat = new Redhat({
      scene: this,
      x: 400,
      y: 300,
      texture: 'redhat'
    });

    emitter.startFollow(this.myRedhat);



    const map: Phaser.Tilemaps.Tilemap = this.make.tilemap({key: 'map'});
    //const tileset: Phaser.Tilemaps.Tileset = map.addTilesetImage('Desert');
    // const layer: Phaser.Tilemaps.StaticTilemapLayer = map.createStaticLayer(0, tileset, 0, 0);

    this.player = this.add.sprite(100, 100, 'player');
    this.cursors = this.input.keyboard.createCursorKeys();

    this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
    this.cameras.main.startFollow(this.player, false);
  }


  public update(time: number, delta: number) {
    this.player.angle += 1;
    if (this.cursors.left.isDown) {
      this.player.x -= 5;
    }
    if (this.cursors.right.isDown) {
      this.player.x += 5;
    }
    if (this.cursors.down.isDown) {
      this.player.y += 5;
    }
    if (this.cursors.up.isDown) {
      this.player.y -= 5;
    }
  }
}
