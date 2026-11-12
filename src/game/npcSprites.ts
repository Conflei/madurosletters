/*
 * Cellmates who sometimes drop by. Same pixel-by-pixel approach as the inmate's avatar: a shared
 * jumpsuit body plus a head drawn per character, traced with the same outline. Art faces
 * screen-left; facing right is a mirrored copy.
 */
import { outline } from './avatar';

export type NpcId = 'diddy' | 'luigi' | 'pollo' | 'cilia' | 'chavez';

export interface NpcFrame {
  canvas: HTMLCanvasElement;
  ox: number;
  oy: number;
  /** y of the top of the head, relative to the anchor between the feet. */
  top: number;
}

const W = 40;
const H = 80;
const OX = 20;
const OY = 76;

type Px = (x: number, y: number, w: number, h: number, color: string) => void;

interface Suit {
  base: string;
  shade: string;
  deep: string;
  light: string;
}

interface Skin {
  base: string;
  shade: string;
  deep: string;
}

interface Look {
  skin: Skin;
  suit: Suit;
  /** Hip height above the feet; taller people sit higher. */
  hip: number;
  /** Half the torso width. */
  half: number;
  belly: boolean;
  brows: string | null;
  /** Hair, beards, glasses and the like; returns how far above the face top the head reaches. */
  head: (px: Px, y: number, skin: Skin) => number;
  mouth?: (px: Px, y: number, skin: Skin) => void;
}

const ORANGE: Suit = { base: '#f07c1e', shade: '#c9600f', deep: '#a44c08', light: '#ff9d45' };
const KHAKI: Suit = { base: '#c7b183', shade: '#a8925f', deep: '#8a7647', light: '#dcc89c' };
const RED: Suit = { base: '#c8202e', shade: '#9c1522', deep: '#7a0f19', light: '#e04452' };

const EYE = '#1a1418';
const SHOE = '#3b3b40';
const SHOE_HI = '#5c5c64';
const GOLD = '#f2c94c';

function rounded(px: Px, x: number, y: number, w: number, h: number, insets: number[], color: string): void {
  for (let i = 0; i < h; i++) {
    const inset = Math.max(insets[i] ?? 0, insets[h - 1 - i] ?? 0);
    px(x + inset, y + i, w - inset * 2, 1, color);
  }
}

const LOOKS: Record<NpcId, Look> = {
  // Sean "Diddy" Combs: shaved head, short beard, dark shades.
  diddy: {
    skin: { base: '#80502f', shade: '#653d22', deep: '#4c2c18' },
    suit: KHAKI,
    hip: -20,
    half: 8,
    belly: false,
    brows: null,
    head(px, y) {
      // Shaved scalp: just a shadow of stubble at the crown and back, with a shine on top.
      const stubble = '#5a3520';
      rounded(px, -7, y, 14, 2, [3, 1], stubble);
      px(4, y + 2, 4, 5, stubble);
      px(-4, y + 2, 4, 1, '#a8744f');
      px(-3, y + 3, 2, 1, '#a8744f');
      // Beard along the jaw and a mustache.
      const beard = '#1c120c';
      px(-8, y + 13, 2, 4, beard);
      px(-7, y + 14, 7, 1, beard);
      px(-8, y + 16, 12, 2, beard);
      px(-6, y + 18, 9, 1, beard);
      px(2, y + 12, 3, 5, beard);
      // Shades.
      px(-9, y + 9, 11, 3, '#0d0d10');
      px(-8, y + 9, 2, 1, '#5d6c82');
      px(-3, y + 9, 2, 1, '#5d6c82');
      px(2, y + 10, 3, 1, '#0d0d10');
      return 0;
    },
    mouth(px, y) {
      px(-6, y + 15, 4, 1, '#3a1410');
    },
  },
  // Luigi Mangione: thick dark hair swept back with volume, strong brows, clean-shaven.
  luigi: {
    skin: { base: '#ecc19c', shade: '#cf9e78', deep: '#b07d58' },
    suit: KHAKI,
    hip: -21,
    half: 8,
    belly: false,
    brows: '#2f1b11',
    head(px, y) {
      const hair = '#3a2216';
      const hi = '#5e3c28';
      rounded(px, -10, y - 3, 20, 8, [5, 3, 1, 0], hair);
      px(2, y + 4, 8, 7, hair);
      px(-10, y + 4, 4, 2, hair);
      px(-10, y + 6, 2, 1, hair);
      px(-6, y - 2, 5, 1, hi);
      px(-2, y, 4, 1, hi);
      px(-8, y + 2, 3, 1, hi);
      px(4, y + 1, 1, 4, hi);
      return 3;
    },
  },
  // Hugo "El Pollo" Carvajal: grey hair, glasses, grey mustache, a bit of a belly.
  pollo: {
    skin: { base: '#d9a07a', shade: '#bb825d', deep: '#9c6644' },
    suit: ORANGE,
    hip: -19,
    half: 9,
    belly: true,
    brows: '#8f8f8a',
    head(px, y) {
      const grey = '#cfcfca';
      const greyShade = '#a2a29c';
      rounded(px, -8, y - 1, 17, 4, [4, 2, 0], grey);
      px(1, y + 2, 8, 9, grey);
      px(5, y + 4, 3, 6, greyShade);
      px(-9, y + 3, 2, 4, grey);
      // Wire-rim glasses.
      const frame = '#2b2b2b';
      for (const x of [-9, -3]) {
        px(x, y + 9, 5, 1, frame);
        px(x, y + 13, 5, 1, frame);
        px(x, y + 9, 1, 5, frame);
        px(x + 4, y + 9, 1, 5, frame);
      }
      px(2, y + 10, 3, 1, frame);
      // Mustache.
      px(-8, y + 14, 7, 2, grey);
      px(-8, y + 16, 1, 1, grey);
      return 1;
    },
  },
  // Cilia Flores: short light blonde bob with bangs, red lipstick, gold earrings.
  cilia: {
    skin: { base: '#efc6a6', shade: '#d3a684', deep: '#b58563' },
    suit: ORANGE,
    hip: -18,
    half: 7,
    belly: false,
    brows: '#8a6a3c',
    head(px, y) {
      const hair = '#dcb874';
      const shade = '#b38b4b';
      const hi = '#f1d699';
      rounded(px, -10, y - 2, 20, 9, [5, 3, 1, 0], hair);
      px(1, y + 6, 9, 11, hair);
      px(6, y + 7, 3, 10, shade);
      px(-10, y + 6, 3, 4, hair);
      px(-8, y + 4, 7, 3, hair);
      px(-6, y - 1, 6, 1, hi);
      px(-9, y + 1, 3, 1, hi);
      px(2, y + 17, 8, 1, shade);
      // Lashes and an earring peeking out under the bob.
      px(-8, y + 9, 3, 1, '#2a1a12');
      px(-2, y + 9, 3, 1, '#2a1a12');
      px(1, y + 15, 2, 2, GOLD);
      return 2;
    },
    mouth(px, y) {
      px(-6, y + 15, 4, 1, '#c2303a');
      px(-5, y + 16, 2, 1, '#9c2230');
    },
  },
  // Hugo Chávez: red beret, black hair, broad smiling face, red shirt.
  chavez: {
    skin: { base: '#bd8660', shade: '#a06d4a', deep: '#835536' },
    suit: RED,
    hip: -20,
    half: 9,
    belly: true,
    brows: '#1a1414',
    head(px, y, skin) {
      const hair = '#1a1414';
      px(4, y + 3, 5, 5, hair);
      px(5, y + 8, 3, 2, hair);
      px(-9, y + 3, 2, 4, hair);
      // Beret, tilted over the facing side, with a gold badge.
      const red = '#c8102e';
      const redShade = '#8f0b20';
      rounded(px, -11, y - 4, 21, 6, [4, 1, 0], red);
      px(-12, y, 7, 2, red);
      px(-12, y + 1, 3, 1, redShade);
      px(-9, y + 2, 18, 1, redShade);
      px(1, y - 5, 2, 1, redShade);
      px(3, y - 2, 2, 2, GOLD);
      // Fuller cheeks.
      px(-10, y + 9, 1, 7, skin.base);
      return 5;
    },
    mouth(px, y, skin) {
      px(-7, y + 16, 5, 1, skin.deep);
      px(-8, y + 15, 1, 1, skin.deep);
      px(-2, y + 15, 1, 1, skin.deep);
    },
  },
};

export const NPC_NAMES: Record<NpcId, string> = {
  diddy: 'Diddy',
  luigi: 'Luigi',
  pollo: 'El Pollo',
  cilia: 'Cilia',
  chavez: 'Chávez',
};

function drawLegs(px: Px, look: Look, step: number): void {
  const { hip, suit } = look;
  const near = step === 1 ? { dx: -2, lift: 0 } : step === 2 ? { dx: 1, lift: 2 } : { dx: 0, lift: 0 };
  const far = step === 1 ? { dx: 1, lift: 2 } : step === 2 ? { dx: -2, lift: 0 } : { dx: 0, lift: 0 };
  const leg = (x: number, l: { dx: number; lift: number }, color: string) => {
    const bottom = -3 - l.lift;
    px(x + l.dx, hip, 5, bottom - hip, color);
    px(x + l.dx, hip, 1, bottom - hip, suit.base);
    px(x + l.dx - 1, bottom, 6, 3, SHOE);
    px(x + l.dx - 1, bottom, 3, 1, SHOE_HI);
  };
  leg(1, far, suit.deep);
  leg(-6, near, suit.shade);
}

function drawTorso(px: Px, look: Look): number {
  const { hip, half, suit, skin } = look;
  const top = hip - 17;
  px(-half + 1, top, half * 2 - 2, 1, suit.base);
  px(-half, top + 1, half * 2, 17, suit.base);
  if (look.belly) {
    px(-half - 1, top + 5, 1, 11, suit.base);
    px(-half - 2, top + 8, 1, 6, suit.light);
  }
  px(-half, top + 1, 2, 15, suit.light);
  px(half - 4, top + 1, 4, 17, suit.shade);
  px(-half + 1, hip, half * 2 - 2, 1, suit.shade);
  px(-3, top + 3, 1, 13, suit.shade);
  px(-5, top, 4, 2, skin.base);
  px(-4, top + 2, 2, 1, skin.base);
  px(1, top + 4, 4, 3, '#f4f1e6');
  return top;
}

function arm(px: Px, x: number, top: number, len: number, sleeve: string, hand: string, light?: string): void {
  px(x, top, 4, len, sleeve);
  if (light) px(x, top, 1, len, light);
  px(x, top + len, 4, 3, hand);
}

function drawHead(px: Px, look: Look, neck: number, blink: boolean): number {
  const { skin } = look;
  const y = neck - 19;
  rounded(px, -9, y, 18, 19, [4, 2, 1, 1], skin.base);
  px(4, y + 4, 5, 13, skin.shade);
  px(-6, y + 18, 10, 1, skin.shade);
  px(3, y + 8, 3, 5, skin.base);
  px(4, y + 9, 1, 3, skin.deep);

  if (look.brows) {
    px(-8, y + 8, 3, 1, look.brows);
    px(-2, y + 8, 3, 1, look.brows);
  }
  if (blink) {
    px(-7, y + 11, 2, 1, EYE);
    px(-2, y + 11, 2, 1, EYE);
  } else {
    px(-7, y + 10, 2, 2, '#ffffff');
    px(-6, y + 10, 1, 2, EYE);
    px(-2, y + 10, 2, 2, '#ffffff');
    px(-1, y + 10, 1, 2, EYE);
  }
  px(-5, y + 12, 2, 2, skin.shade);
  px(-5, y + 13, 3, 1, skin.deep);
  if (look.mouth) look.mouth(px, y, skin);
  else px(-6, y + 15, 4, 1, skin.deep);

  const above = look.head(px, y, skin);
  return y - above;
}

function build(id: NpcId, step: number, blink: boolean): NpcFrame {
  const look = LOOKS[id];
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Unable to create NPC canvas');
  const px: Px = (x, y, w, h, color) => {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(OX + x, OY + y, w, h);
  };
  const swing = step === 1 ? 1 : step === 2 ? -1 : 0;
  const top = look.hip - 17;
  arm(px, look.half - 1 - swing, top + 1, 12, look.suit.deep, look.skin.shade);
  drawLegs(px, look, step);
  const neck = drawTorso(px, look);
  const head = drawHead(px, look, neck, blink);
  arm(px, -look.half - 4 + swing, top + 2, 11, look.suit.shade, look.skin.base, look.suit.base);
  outline(ctx);
  return { canvas, ox: OX, oy: OY, top: head - 1 };
}

function mirror(f: NpcFrame): NpcFrame {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create NPC canvas');
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(f.canvas, 0, 0);
  return { ...f, canvas, ox: W - f.ox };
}

/** Pale blue see-through copy with the legs fading out, for the ghost. */
function ghostly(f: NpcFrame): NpcFrame {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create NPC canvas');
  ctx.drawImage(f.canvas, 0, 0);
  ctx.globalCompositeOperation = 'source-atop';
  ctx.fillStyle = 'rgba(190, 228, 255, 0.4)';
  ctx.fillRect(0, 0, W, H);
  ctx.globalCompositeOperation = 'destination-out';
  const fade = ctx.createLinearGradient(0, f.oy - 24, 0, f.oy);
  fade.addColorStop(0, 'rgba(0, 0, 0, 0)');
  fade.addColorStop(1, 'rgba(0, 0, 0, 1)');
  ctx.fillStyle = fade;
  ctx.fillRect(0, 0, W, H);
  return { ...f, canvas };
}

const cache = new Map<string, NpcFrame>();

export function npcFrame(id: NpcId, step: number, facing: 1 | -1, blink: boolean, ghost = false): NpcFrame {
  const key = `${id}|${step}|${facing}|${blink}|${ghost}`;
  let f = cache.get(key);
  if (!f) {
    if (ghost) f = ghostly(npcFrame(id, step, facing, blink));
    else f = facing < 0 ? build(id, step, blink) : mirror(npcFrame(id, step, -1, blink));
    cache.set(key, f);
  }
  return f;
}
