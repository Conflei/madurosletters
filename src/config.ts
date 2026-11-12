export const GAME_TITLE = 'Las cartas de Maduro';
export const VERSION = '0.6.0';

/** Short name shown on the tag above the character. */
export const INMATE_NAME = 'Maduro';
export const INMATE_FULL_NAME = 'Nicolás Maduro Moros';
export const INMATE_NUMBER = '00734-506';
export const FACILITY = 'MDC Brooklyn';
export const FACILITY_LOCATION = 'Brooklyn, Nueva York';

/** Supabase Edge Function that stores letters and votes (see supabase/functions/api). */
export const API_URL = 'https://ftqdksuxorosltvsjxyp.supabase.co/functions/v1/api';

/** Real-world clock shown in the HUD. Custody began Jan 3, 2026 (U.S. State Department). */
export const TIME_ZONE = 'America/New_York';
export const CUSTODY_START = { year: 2026, month: 1, day: 3 };

/** Isometric tile footprint in art pixels (Habbo's 64x32 diamond). */
export const TILE_W = 64;
export const TILE_H = 32;
export const HALF_W = TILE_W / 2;
export const HALF_H = TILE_H / 2;

/** Room geometry: heights in art pixels, thickness in tiles. */
export const WALL_H = 112;
export const WALL_T = 0.25;
export const FLOOR_T = 8;
export const PAINT_H = 40;
export const BAR_H = 88;

export const PAL = {
  void: '#0e0e0e',

  floor: '#a9a89d',
  floorGrid: '#999889',
  floorLeft: '#858479',
  floorRight: '#696860',
  corridorFloor: '#7b7a71',
  corridorGrid: '#6d6c64',

  wallBlock: '#b9bdc5',
  wallPaint: '#567780',
  wallTrim: '#e6b63a',
  wallBase: '#33424a',
  wallCap: '#dcdfe4',
  wallEnd: '#80858d',

  steel: '#8b96a2',
  steelLight: '#c3cad2',
  mattress: '#dcdfd3',
  pillow: '#f6f6f0',
  blanket: '#d0702f',
  bar: '#2a2e35',
  barLight: '#7d8794',
  beam: '#5f6771',
  pillar: '#a3aab2',
  deskTop: '#8a6544',
  paper: '#f6f3e6',
  envelope: '#eadcbc',
  pencil: '#f2c94c',

  windowFrame: '#3d454f',
  lamp: '#ffe7a8',
  lampHousing: '#3d454f',
} as const;
