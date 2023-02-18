class StartScene extends Phaser.Scene {
  public constructor() {
    super({
      key: 'StartScene',
    });
  }

  public preload() {
    this.load.image('bg', require('./background.jpg'));
  }

  public create() {
    const bg = this.add.image(0, 0, 'bg');
    bg.setOrigin(0, 0);
    bg.displayWidth = this.sys.canvas.width;
    bg.displayHeight = this.sys.canvas.height;

    const helloButton = this.add.text(
      550, 100,
      'Start',
      {
        stroke: 'white',
        fontSize: '66px',
        strokeThickness: 4,
        shadow: {
          color: '#aaaaaa',
          blur: 10,
          fill: true,
        }
      });
    helloButton.setInteractive();
    helloButton.on('pointerdown', () => {
      this.scene.start('TestScene');
    });
  }
}

export default StartScene;
