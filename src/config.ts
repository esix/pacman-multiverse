import Phaser from 'phaser';
import Boot from './Boot/Boot';
import Pacman from './Pacman';
import Digger from './Digger';
import Dave from './Dave';
import LodeRunner from './LodeRunner';
import Bomberman from './Bomberman';
import SpaceInvaders from './SpaceInvaders';
import Persia from './Persia';
import HUD from './HUD';

export const GameConfig: Phaser.Types.Core.GameConfig = {
  title: 'Pacman Multiverse',
  version: '0.1',
  width: 800,
  height: 600,
  backgroundColor: 0x000000,
  type: Phaser.AUTO,
  parent: 'game',
  pixelArt: true,
  physics: {
    default: 'arcade',
    arcade: {
      debug: true,
    },
  },
  scene: [Boot, Pacman, Digger, Dave, LodeRunner, Bomberman, SpaceInvaders, Persia, HUD],
};
