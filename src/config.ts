import StartScene from "./scenes/StartScene";
import { TestScene } from './scenes/TestScene/TestScene';

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
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { y: 200 }
    }
  },
  scene: [StartScene, TestScene]
};
