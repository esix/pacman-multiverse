import 'phaser';

class StartScene extends Phaser.Scene {
	player: Phaser.GameObjects.Sprite;
	cursors: any;

	public constructor() {
		super({
			key: 'StartScene',
		});
	}

	public preload() {
		this.load.tilemapTiledJSON('map', '/assets/tilemaps/desert.json');
		// this.load.image('Desert', '/assets/tilemaps/tmw_desert_spacing.png');
		this.load.image('player', require('./sprites/mushroom.png'));
	}

	public create() {
		const map: Phaser.Tilemaps.Tilemap = this.make.tilemap({key: 'map'});
		//const tileset: Phaser.Tilemaps.Tileset = map.addTilesetImage('Desert');
		// const layer: Phaser.Tilemaps.StaticTilemapLayer = map.createStaticLayer(0, tileset, 0, 0);

		this.player = this.add.sprite(100, 100, 'player');
		this.cursors = this.input.keyboard.createCursorKeys();

		this.cameras.main.setBounds(0, 0, map.widthInPixels, map.heightInPixels);
		this.cameras.main.startFollow(this.player, false);

		this.input.on('pointerup', function (pointer: any) {
			this.scene.start('TestScene');
		}, this);
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

export default StartScene;
