import { TIME_ZONE } from '../config';

export type Sky = 'dawn' | 'day' | 'dusk' | 'night';

const clock = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });

/** Minutes since midnight in New York, where the cell is. */
export function nycMinutes(now: Date): number {
  const parts = clock.formatToParts(now);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (get('hour') % 24) * 60 + get('minute');
}

/** What the window shows: dawn 6–9, day 9–17, dusk 17–20, night otherwise (New York hours). */
export function skyAt(now: Date): Sky {
  const hour = nycMinutes(now) / 60;
  if (hour >= 6 && hour < 9) return 'dawn';
  if (hour >= 9 && hour < 17) return 'day';
  if (hour >= 17 && hour < 20) return 'dusk';
  return 'night';
}
