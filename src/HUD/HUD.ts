import Phaser from 'phaser';
import { WorldState } from '../world/WorldState';
import { ITEM_GUN_KEY, ITEM_BOMB_KEY, ensureItemTextures } from '../world/items';
import { HUD_HEIGHT } from '../world/layout';

const COLOR_BG = 0x000000;
const COLOR_BORDER = 0x444444;
const COLOR_LABEL = 0x888888;

export default class HUD extends Phaser.Scene {
  private container!: Phaser.GameObjects.Container;
  private lastSignature = '';

  constructor() {
    super({ key: 'HUD', active: false });
  }

  public create(): void {
    ensureItemTextures(this);

    const w = this.scale.width;
    const h = this.scale.height;
    const stripY = h - HUD_HEIGHT / 2;

    const bg = this.add.rectangle(w / 2, stripY, w, HUD_HEIGHT, COLOR_BG);
    bg.setStrokeStyle(2, COLOR_BORDER);

    this.container = this.add.container(0, h - HUD_HEIGHT);
    this.refresh();
  }

  public update(): void {
    const sig = Array.from(WorldState.inventory).sort().join(',');
    if (sig !== this.lastSignature) {
      this.refresh();
    }
  }

  private refresh(): void {
    this.container.removeAll(true);

    const label = this.add.text(8, 12, 'INV', {
      fontFamily: 'monospace',
      fontSize: '16px',
      color: '#' + COLOR_LABEL.toString(16).padStart(6, '0'),
    });
    this.container.add(label);

    let x = 50;
    for (const item of WorldState.inventory) {
      if (item === 'gun') {
        const icon = this.add.image(x + 12, HUD_HEIGHT / 2, ITEM_GUN_KEY);
        this.container.add(icon);
        x += 32;
      } else if (item === 'bomb') {
        const icon = this.add.image(x + 12, HUD_HEIGHT / 2, ITEM_BOMB_KEY);
        this.container.add(icon);
        x += 32;
      } else {
        const t = this.add.text(x, 12, item.toUpperCase(), {
          fontFamily: 'monospace',
          fontSize: '14px',
          color: '#ffff00',
        });
        this.container.add(t);
        x += t.width + 8;
      }
    }

    this.lastSignature = Array.from(WorldState.inventory).sort().join(',');
  }
}
