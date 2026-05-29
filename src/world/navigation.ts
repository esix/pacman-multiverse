import Phaser from 'phaser';
import { LevelKey } from './WorldState';

const LEVEL_KEYS: LevelKey[] = ['Pacman', 'Digger', 'Dave', 'LodeRunner', 'Bomberman', 'SpaceInvaders', 'Persia'];

function setSceneHash(key: string): void {
  const value = '#' + key;
  if (typeof history !== 'undefined' && typeof history.replaceState === 'function') {
    history.replaceState(null, '', value);
  } else {
    window.location.hash = value;
  }
}

export function goToScene(from: Phaser.Scene, key: LevelKey, data?: object): void {
  setSceneHash(key);
  from.scene.start(key, data);
}

export function startSceneFromHash(scene: Phaser.Scene, fallback: LevelKey): void {
  const raw = (window.location.hash || '').replace(/^#/, '');
  const target = (LEVEL_KEYS as string[]).includes(raw) ? (raw as LevelKey) : fallback;
  setSceneHash(target);
  scene.scene.start(target);
}
