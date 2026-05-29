import Phaser from 'phaser';

export const ITEM_GUN_KEY = 'item-gun';
export const ITEM_BOMB_KEY = 'item-bomb';

export function ensureItemTextures(scene: Phaser.Scene): void {
  ensureGunTexture(scene);
  ensureBombTexture(scene);
}

function ensureGunTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(ITEM_GUN_KEY)) return;
  const g = scene.add.graphics();
  g.fillStyle(0xcccccc, 1);
  g.fillRect(0, 6, 24, 6);
  g.fillStyle(0xffffff, 1);
  g.fillRect(20, 7, 3, 4);
  g.fillStyle(0x666666, 1);
  g.fillRect(4, 12, 6, 9);
  g.generateTexture(ITEM_GUN_KEY, 24, 22);
  g.destroy();
}

function ensureBombTexture(scene: Phaser.Scene): void {
  if (scene.textures.exists(ITEM_BOMB_KEY)) return;
  const g = scene.add.graphics();
  // round black body
  g.fillStyle(0x222222, 1);
  g.fillCircle(12, 14, 9);
  // highlight
  g.fillStyle(0x555555, 1);
  g.fillCircle(9, 11, 2);
  // fuse stem
  g.fillStyle(0x886633, 1);
  g.fillRect(11, 3, 2, 5);
  // spark
  g.fillStyle(0xffaa00, 1);
  g.fillCircle(12, 2, 2);
  g.generateTexture(ITEM_BOMB_KEY, 24, 24);
  g.destroy();
}
