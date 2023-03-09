export default class Pacman extends Phaser.Scene {
  constructor() {
    super({key: 'Digger'});
    debugger;
  }

  public init(data: any) {
    console.log('init', data);
  }

  public preload() {
    this.load.image('bg', require('./Digger.jpg'));
  }

  public create() {
    const bg = this.add.image(0, 0, 'bg');
    bg.setOrigin(0, 0);
    bg.displayWidth = this.sys.canvas.width;
    bg.displayHeight = this.sys.canvas.height;
  }
}
