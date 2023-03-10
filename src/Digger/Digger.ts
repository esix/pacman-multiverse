export default class Pacman extends Phaser.Scene {
  constructor() {
    super({key: 'Digger'});
  }

  public init(data: any) {
    console.log('init', data);
    const x = data.x || 0;
    const y = data.y || (this.scale.getViewPort().height >> 1);
  }

  public preload() {
    this.load.image('bgDigger', require('./Digger.jpg'));
  }

  public create() {
    const bg = this.add.image(0, 0, 'bgDigger');
    bg.setOrigin(0, 0);
    bg.displayWidth = this.sys.canvas.width;
    bg.displayHeight = this.sys.canvas.height;
  }
}
