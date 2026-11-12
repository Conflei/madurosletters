export type StatKey = 'mood';
export type CareAction = 'read' | 'poke';

export type Stats = Record<StatKey, number>;

/** Points lost per real minute. */
const DECAY: Stats = { mood: 0.5 };

/** Ánimo only ever goes down: reading letters hurts most, being poked a little. */
const COSTS: Record<CareAction, [number, number]> = {
  read: [12, 12],
  poke: [2, 3],
};

/** Ánimo on page load, picked fresh each time. */
const START_MOOD: [number, number] = [90, 100];

export const READ_MOOD_COST = COSTS.read[0];

const clamp = (v: number) => Math.max(0, Math.min(100, v));
const between = ([lo, hi]: [number, number]) => lo + Math.floor(Math.random() * (hi - lo + 1));

/** The inmate's spirits. They start high on every visit and can only sink from there. */
export class InmateState {
  stats: Stats = { mood: between(START_MOOD) };

  tick(minutes: number): void {
    for (const key of Object.keys(DECAY) as StatKey[]) {
      this.stats[key] = clamp(this.stats[key] - DECAY[key] * minutes);
    }
  }

  apply(action: CareAction): void {
    this.stats.mood = clamp(this.stats.mood - between(COSTS[action]));
  }
}
