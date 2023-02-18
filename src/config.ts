import StartScene from "./scenes/StartScene";
import PacmanScene from "./scenes/PacmanScene";

export const GameConfig: Phaser.Types.Core.GameConfig = {
  title: 'Ultra Pacman',
  url: 'https://github.com/esix/ultra-pacman',
  version: '1.0',
  width: 800,
  height: 600,
  backgroundColor: "#EDEEC9",
  // resolution: 1,
  type: Phaser.AUTO,
  parent: 'game',
  scene: [StartScene, PacmanScene]
};
