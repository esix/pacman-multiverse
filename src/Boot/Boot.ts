import Phaser from 'phaser';
import { startSceneFromHash } from '../world/navigation';

export default class Boot extends Phaser.Scene {
  constructor() {
    super({ key: 'Boot' });
  }

  public create(): void {
    if (!this.scene.isActive('HUD')) {
      this.scene.launch('HUD');
    }
    this.scene.bringToTop('HUD');
    startSceneFromHash(this, 'Pacman');
  }
}
