import type { Vec2 } from '../engine/iso';

/**
 * A single cell seen from inside. Tile (0, 0) is the back corner where the solid side wall
 * (x = 0) meets the barred front (y = 0). Beyond the bars, a strip of corridor (y < 0).
 */
export const CELL_W = 3;
export const CELL_D = 5;
export const CORRIDOR_D = 1;
export const DOOR_X = 1;

export function inCell(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < CELL_W && y < CELL_D;
}

/** Open floor the inmate can wander on (fractional tile coordinates). */
export const FREE_AREA = { minX: 1.4, maxX: 2.7, minY: 1.0, maxY: 4.6 };
export const INMATE_SPOT = { x: 1.9, y: 3.0 };

export type PropKind = 'bunk' | 'desk' | 'stool' | 'toilet' | 'sink';

/** Footprint in tiles, height in pixels (used for tap hit-testing). */
export interface Prop {
  kind: PropKind;
  x: number;
  y: number;
  w: number;
  d: number;
  h: number;
}

export const SEAT_Z = 10;

export const PROPS: Prop[] = [
  { kind: 'bunk', x: 0.1, y: 0.2, w: 0.85, d: 1.8, h: 64 },
  { kind: 'desk', x: 0.08, y: 2.3, w: 0.6, d: 0.95, h: 29 },
  { kind: 'stool', x: 0.92, y: 2.62, w: 0.32, d: 0.32, h: SEAT_Z },
  { kind: 'toilet', x: 0.08, y: 3.55, w: 0.55, d: 0.5, h: 24 },
  { kind: 'sink', x: 0.08, y: 4.3, w: 0.42, d: 0.45, h: 32 },
];

export const propOf = (kind: PropKind): Prop => PROPS.find((p) => p.kind === kind) as Prop;

export type Pose = 'stand' | 'sit' | 'wash' | 'sleep';
export type ActivityId = 'bed' | 'stool' | 'toilet' | 'sink';

/** Something the inmate can go and do at a prop: walk to `approach`, step onto `spot`, hold `pose`. */
export interface Activity {
  id: ActivityId;
  prop: PropKind;
  approach: Vec2;
  spot: Vec2;
  pose: Exclude<Pose, 'stand'>;
  /** -1 faces screen-left (toward the side wall), 1 faces screen-right. */
  facing: 1 | -1;
  duration: number;
  line: string;
  writing?: boolean;
}

export const ACTIVITIES: Activity[] = [
  { id: 'bed', prop: 'bunk', approach: { x: 1.3, y: 1.2 }, spot: { x: 0.52, y: 1.1 }, pose: 'sleep', facing: -1, duration: 12, line: 'Zzz…' },
  { id: 'stool', prop: 'stool', approach: { x: 1.5, y: 2.78 }, spot: { x: 1.08, y: 2.78 }, pose: 'sit', facing: -1, duration: 8, line: '…' },
  { id: 'toilet', prop: 'toilet', approach: { x: 1.05, y: 3.8 }, spot: { x: 0.44, y: 3.8 }, pose: 'sit', facing: 1, duration: 6, line: 'Hmph.' },
  { id: 'sink', prop: 'sink', approach: { x: 1.15, y: 4.52 }, spot: { x: 0.8, y: 4.52 }, pose: 'wash', facing: -1, duration: 4, line: 'Splash!' },
];

export const activityFor = (kind: PropKind): Activity | undefined => ACTIVITIES.find((a) => a.prop === kind);
