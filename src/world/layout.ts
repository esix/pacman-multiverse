// Canvas height is fixed by the Phaser config. The bottom HUD_HEIGHT pixels are
// reserved for the inventory strip; level scenes should fit within GAMEPLAY_HEIGHT.
export const HUD_HEIGHT = 40;
export const CANVAS_HEIGHT = 600;
export const GAMEPLAY_HEIGHT = CANVAS_HEIGHT - HUD_HEIGHT;
