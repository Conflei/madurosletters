export const GAME_TITLE = "Maduro's Letters";
export const VERSION = '0.2.0';

/** Short name shown on the sign above the character. */
export const INMATE_NAME = 'Maduro';
export const INMATE_FULL_NAME = 'Nicolás Maduro Moros';
export const INMATE_NUMBER = '00734-506';
export const FACILITY = 'MDC Brooklyn';

/** Real-world clock shown in the HUD. Custody began Jan 3, 2026 (U.S. State Department). */
export const TIME_ZONE = 'America/New_York';
export const CUSTODY_START = { year: 2026, month: 1, day: 3 };

/** Isometric tile footprint in world pixels (classic 2:1 Habbo-style diamond). */
export const TILE_W = 64;
export const TILE_H = 32;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;

/** Room geometry, heights in world pixels, thickness in tiles. */
export const WALL_H = 120;
export const WALL_T = 0.18;
export const FLOOR_T = 10;
export const PAINT_H = 40;
export const BAR_H = 92;

export const ZOOM_MAX = 3;

export const PAL = {
  bgTop: '#111620',
  bgBottom: '#05070a',

  corridor: '#6a7179',
  cellFloor: '#8a8f94',
  grout: 'rgba(28, 32, 38, 0.35)',
  slabLeft: '#3d434b',
  slabRight: '#2a2f36',

  block: '#a7aeb6',
  mortar: 'rgba(50, 56, 64, 0.22)',
  paint: '#4e6b73',
  paintTrim: '#e2b33c',
  baseboard: '#2d3a40',
  wallTop: '#c9ced4',
  wallEnd: '#7d848c',

  steel: '#7f8a96',
  steelLight: '#b9c1c9',
  mattress: '#d4d8cc',
  pillow: '#f1f2ec',
  blanket: '#c8692e',
  bar: '#262b32',
  barLight: '#8b96a3',
  beam: '#5b636d',
  pillar: '#9aa1a9',
  deskTop: '#7b5a3e',
  paper: '#f3f1e7',
  envelope: '#e9dcc0',

  windowFrame: '#3a424c',
  sign: '#1d2a3a',
  signText: '#f2c94c',
  lamp: '#ffe0a3',

  jumpsuit: '#e0712f',
  jumpsuitDark: '#b9561d',
  skin: '#e8b48a',
  hair: '#121214',
  shoe: '#2a2a2e',
} as const;
