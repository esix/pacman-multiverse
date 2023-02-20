import Preloader from "./Preloader";
import Pacman from "./Pacman";

export const GameConfig: Phaser.Types.Core.GameConfig = {
  title: 'Ultra Pacman',
  url: 'https://github.com/esix/ultra-pacman',
  version: '1.0',
  width: 800,
  height: 600,
  // backgroundColor: "#EDEEC9",
  backgroundColor: 0x000000,
  // resolution: 1,
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true,
  physics: {
    default: "arcade",
    arcade: {
      debug: false
      // debugShowVelocity: false
    }
  },
  // scene: [Preloader, Pacman]
  scene: [Pacman]
};
