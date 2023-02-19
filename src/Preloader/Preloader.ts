class Preloader extends Phaser.Scene {
  public constructor() {
    super({
      key: 'Preloader',
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

    const startButton = this.add.text(
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
    startButton.setInteractive();
    startButton.on('pointerdown', () => {
      this.scene.start('Pacman');
    });
  }
}

export default Preloader;
