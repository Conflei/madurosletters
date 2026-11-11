export type StatKey = 'mood';
export type CareAction = 'write';

export type Stats = Record<StatKey, number>;

/** Points lost per real minute. */
const DECAY: Stats = { mood: 0.5 };

const EFFECTS: Record<CareAction, Partial<Stats>> = {
  write: { mood: 25 },
};

const clamp = (v: number) => Math.max(0, Math.min(100, v));

/** The inmate's needs, Tamagotchi style: they slowly drain, care actions refill. */
export class InmateState {
  stats: Stats = { mood: 60 };

  tick(minutes: number): void {
    for (const key of Object.keys(DECAY) as StatKey[]) {
      this.stats[key] = clamp(this.stats[key] - DECAY[key] * minutes);
    }
  }

  apply(action: CareAction): void {
    for (const [key, delta] of Object.entries(EFFECTS[action]) as [StatKey, number][]) {
      this.stats[key] = clamp(this.stats[key] + delta);
    }
  }
}
