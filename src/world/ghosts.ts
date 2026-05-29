import Phaser from 'phaser';

export interface GhostSpec {
  color: number;
  key: string;
}

export const GHOST_PALETTE: GhostSpec[] = [
  { color: 0xff0000, key: 'ghost-red' },
  { color: 0xffb8ff, key: 'ghost-pink' },
  { color: 0x00ffff, key: 'ghost-cyan' },
  { color: 0xffb852, key: 'ghost-orange' },
];

const GHOST_W = 32;
const GHOST_H = 32;

export function ensureGhostTextures(scene: Phaser.Scene): void {
  for (const spec of GHOST_PALETTE) {
    if (scene.textures.exists(spec.key)) continue;
    drawGhostTexture(scene, spec);
  }
}

function drawGhostTexture(scene: Phaser.Scene, spec: GhostSpec): void {
  const g = scene.add.graphics();
  g.fillStyle(spec.color, 1);
  g.fillRoundedRect(2, 1, 28, 27, { tl: 14, tr: 14, bl: 0, br: 0 });
  // V-shaped feet — three notches along the bottom
  g.fillStyle(0x000000, 0); // transparent: clear via blendMode ERASE on the graphics path
  g.setBlendMode(Phaser.BlendModes.ERASE);
  g.fillTriangle(2, 28, 8, 22, 14, 28);
  g.fillTriangle(14, 28, 16, 23, 18, 28);
  g.fillTriangle(18, 28, 24, 22, 30, 28);
  g.setBlendMode(Phaser.BlendModes.NORMAL);
  // Eyes
  g.fillStyle(0xffffff, 1);
  g.fillCircle(11, 13, 4);
  g.fillCircle(21, 13, 4);
  // Pupils
  g.fillStyle(0x0000aa, 1);
  g.fillCircle(11, 14, 1.8);
  g.fillCircle(21, 14, 1.8);
  g.generateTexture(spec.key, GHOST_W, GHOST_H);
  g.destroy();
}

export function placeGhost(
  scene: Phaser.Scene,
  x: number,
  y: number,
  paletteIndex: number,
): Phaser.GameObjects.Sprite {
  const spec = GHOST_PALETTE[paletteIndex % GHOST_PALETTE.length];
  const sprite = scene.add.sprite(x, y, spec.key);
  sprite.setDepth(20);
  return sprite;
}
