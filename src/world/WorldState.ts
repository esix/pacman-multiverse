export type LevelKey = 'Pacman' | 'Digger' | 'Dave' | 'LodeRunner' | 'Bomberman' | 'SpaceInvaders' | 'Persia';
export type EntrySide = 'left' | 'right' | 'top' | 'bottom' | 'spawn' | 'pipe' | 'hole';
export type ItemId = 'gun' | 'key' | 'bomb';

export interface PendingEntry {
  from: EntrySide;
  y?: number;
  x?: number;
}

export interface PacmanSnapshot {
  pacman: { x: number; y: number; direction: number };
  eatenDotIndices: number[];
}

export interface DiggerSnapshot {
  player: { x: number; y: number };
  dug: Array<[number, number]>;
}

export interface DaveSnapshot {
  player: { x: number; y: number };
}

export interface LodeRunnerSnapshot {
  player: { x: number; y: number };
}

export interface BombermanSnapshot {
  player: { x: number; y: number };
}

export interface SpaceInvadersSnapshot {
  player: { x: number; y: number };
}

export interface PersiaSnapshot {
  player: { x: number; y: number };
}

export interface LevelSnapshots {
  Pacman?: PacmanSnapshot;
  Digger?: DiggerSnapshot;
  Dave?: DaveSnapshot;
  LodeRunner?: LodeRunnerSnapshot;
  Bomberman?: BombermanSnapshot;
  SpaceInvaders?: SpaceInvadersSnapshot;
  Persia?: PersiaSnapshot;
}

class WorldStateClass {
  public readonly inventory = new Set<ItemId>();
  public readonly levels: LevelSnapshots = {};
  public pendingEntry: PendingEntry | null = null;

  public save<K extends LevelKey>(key: K, snap: LevelSnapshots[K]): void {
    (this.levels as Record<string, unknown>)[key] = snap;
  }

  public load<K extends LevelKey>(key: K): LevelSnapshots[K] | undefined {
    return this.levels[key];
  }

  public hasItem(id: ItemId): boolean {
    return this.inventory.has(id);
  }
}

export const WorldState = new WorldStateClass();
