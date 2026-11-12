/*
 * Procedural Habbo-style figure. Each frame is painted pixel by pixel into a small canvas,
 * then traced with a 1px outline in a darker shade of whatever it touches (like Habbo's
 * sprites). The base art faces screen-left; facing right is a mirrored copy.
 */

export type AvatarPose = 'stand' | 'walk' | 'sit' | 'write' | 'wash' | 'head';
export type Expression = 'normal' | 'blink' | 'pain';

export interface AvatarFrame {
  canvas: HTMLCanvasElement;
  /** Pixel in the canvas that sits on the anchor point (between the feet, or under the chin for 'head'). */
  ox: number;
  oy: number;
  /** y of the top of the hair, relative to the anchor. */
  top: number;
}

const W = 44;
const H = 80;
const OX = 22;
const OY = 76;

const C = {
  skin: '#e2a47c',
  skinShade: '#c4835b',
  skinDeep: '#a86a46',
  hair: '#151416',
  hairHi: '#3a3a40',
  grey: '#d8d8d4',
  suit: '#f07c1e',
  suitShade: '#c9600f',
  suitDeep: '#a44c08',
  suitLight: '#ff9d45',
  tag: '#f4f1e6',
  shoe: '#3b3b40',
  shoeHi: '#5c5c64',
  eye: '#1a1418',
  mouth: '#5a1e1e',
  sweat: '#8fd3ff',
};

type Px = (x: number, y: number, w: number, h: number, color: string) => void;

function paint(px: Px, pose: AvatarPose, frame: number, face: Expression): number {
  if (pose === 'head') return drawHead(px, 21, 'blink');

  const sitting = pose === 'sit' || pose === 'write';
  const step = pose === 'walk' ? frame : 0;
  const hip = (sitting ? -12 : -19) + (step ? 1 : 0);

  drawFarArm(px, pose, hip, step);
  if (sitting) drawSeatedLegs(px, hip);
  else drawLegs(px, hip, step);
  drawTorso(px, hip);
  const top = drawHead(px, hip, face);
  drawNearArm(px, pose, hip, step, frame);
  return top;
}

function drawLegs(px: Px, hip: number, step: number): void {
  // step 1: near leg forward, far leg lifted back; step 2: the reverse.
  const near = step === 1 ? { dx: -2, lift: 0 } : step === 2 ? { dx: 1, lift: 2 } : { dx: 0, lift: 0 };
  const far = step === 1 ? { dx: 1, lift: 2 } : step === 2 ? { dx: -2, lift: 0 } : { dx: 0, lift: 0 };
  const leg = (x: number, l: { dx: number; lift: number }, color: string) => {
    const bottom = -3 - l.lift;
    px(x + l.dx, hip, 6, bottom - hip, color);
    px(x + l.dx, hip, 1, bottom - hip, C.suit);
    px(x + l.dx - 1, bottom, 7, 3, C.shoe);
    px(x + l.dx - 1, bottom, 3, 1, C.shoeHi);
  };
  leg(1, far, C.suitDeep);
  leg(-7, near, C.suitShade);
}

/** Knees toward the viewer and slightly to the facing side; only knees and shins show. */
function drawSeatedLegs(px: Px, hip: number): void {
  px(-12, hip, 18, 4, C.suitShade);
  px(-12, hip, 18, 1, C.suit);
  for (const x of [-11, -4]) {
    px(x, hip + 4, 6, -3 - (hip + 4), x < -6 ? C.suitShade : C.suitDeep);
    px(x - 1, -3, 7, 3, C.shoe);
    px(x - 1, -3, 3, 1, C.shoeHi);
  }
}

/** Wide, round-bellied torso. */
function drawTorso(px: Px, hip: number): void {
  const top = hip - 19;
  px(-9, top, 18, 1, C.suit);
  px(-10, top + 1, 20, 19, C.suit);
  // Belly pushing out on the facing side and a little over the hips.
  px(-11, top + 5, 1, 13, C.suit);
  px(-12, top + 7, 1, 10, C.suitLight);
  px(-13, top + 10, 1, 5, C.suitLight);
  px(10, top + 6, 1, 11, C.suitShade);
  px(-11, top + 1, 2, 16, C.suitLight);
  px(5, top + 1, 5, 19, C.suitShade);
  px(-9, hip, 17, 1, C.suitShade);
  px(-10, hip - 1, 3, 1, C.suitShade);
  px(-3, top + 3, 1, 15, C.suitShade);
  // Open collar showing the neck.
  px(-5, top, 5, 2, C.skin);
  px(-4, top + 2, 3, 1, C.skin);
  px(-6, top, 1, 2, C.suitLight);
  px(0, top, 1, 2, C.suitLight);
  // Inmate number patch.
  px(1, top + 4, 5, 3, C.tag);
  px(2, top + 5, 3, 1, '#9a978c');
}

function arm(px: Px, x: number, top: number, len: number, sleeve: string, hand: string, light?: string): void {
  px(x, top, 4, len, sleeve);
  if (light) px(x, top, 1, len, light);
  px(x, top + len, 4, 3, hand);
}

function drawFarArm(px: Px, pose: AvatarPose, hip: number, step: number): void {
  if (pose === 'wash' || pose === 'write') return;
  const swing = step === 1 ? -1 : step === 2 ? 1 : 0;
  arm(px, 9 + swing, hip - 18, 13, C.suitDeep, C.skinShade);
}

function drawNearArm(px: Px, pose: AvatarPose, hip: number, step: number, frame: number): void {
  const top = hip - 18;
  if (pose === 'wash') {
    // Both hands out in front, scrubbing over the basin.
    const bob = frame % 2;
    px(-14, top, 4, 6, C.suitShade);
    px(-17, top + 5 + bob, 8, 4, C.suitShade);
    px(-20, top + 5 + bob, 3, 3, C.skin);
    px(5, top + 6, 4, 4, C.suitDeep);
    px(-7, top + 7 - bob, 12, 4, C.suitShade);
    px(-10, top + 7 - bob, 3, 3, C.skinShade);
    return;
  }
  if (pose === 'write') {
    // Forearms resting forward on the desk, writing hand scribbling.
    const dx = frame % 2;
    px(-14, top, 4, 7, C.suitShade);
    px(-18, top + 6, 8, 4, C.suitShade);
    px(-21, top + 6, 3, 3, C.skin);
    px(-7, top + 8, 12, 4, C.suitShade);
    px(-10 - dx, top + 8, 3, 3, C.skinShade);
    px(-12 - dx, top + 7, 1, 2, '#f2c94c');
    return;
  }
  const swing = step === 1 ? 1 : step === 2 ? -1 : 0;
  arm(px, -16 + swing, top + 1, 12, C.suitShade, C.skin, C.suit);
}

/** Rounded rectangle: insets per corner row. */
function rounded(px: Px, x: number, y: number, w: number, h: number, insets: number[], color: string): void {
  for (let i = 0; i < h; i++) {
    const inset = Math.max(insets[i] ?? 0, insets[h - 1 - i] ?? 0);
    px(x + inset, y + i, w - inset * 2, 1, color);
  }
}

/** Head above the neck line `hip - 19`; returns the y of the top of the hair. */
function drawHead(px: Px, hip: number, face: Expression): number {
  const y = hip - 41;

  // Full cheeks and a double chin.
  rounded(px, -11, y, 22, 21, [4, 2, 1, 1], C.skin);
  px(6, y + 4, 4, 15, C.skinShade);
  rounded(px, -8, y + 19, 16, 3, [0, 1, 3], C.skinShade);
  px(-6, y + 20, 10, 1, C.skin);

  // Black hair going grey: a full cap, fuller at the back, short fringe, white streaks.
  rounded(px, -12, y - 2, 24, 9, [5, 3, 2, 1, 0], C.hair);
  px(2, y + 6, 10, 7, C.hair);
  px(3, y + 13, 8, 2, C.hair);
  px(-11, y + 7, 3, 1, C.hair);
  px(-7, y + 7, 2, 1, C.hair);
  px(-7, y - 1, 7, 1, C.hairHi);
  px(-9, y, 3, 1, C.hairHi);
  px(-4, y - 1, 2, 1, C.grey);
  px(-1, y, 1, 3, C.grey);
  px(4, y, 1, 4, C.grey);
  px(-8, y + 2, 3, 1, C.grey);
  px(7, y + 3, 1, 5, C.grey);
  px(9, y + 7, 1, 6, C.grey);
  px(4, y + 12, 1, 3, C.grey);

  // Ear.
  px(4, y + 9, 3, 5, C.skin);
  px(5, y + 10, 1, 3, C.skinDeep);

  if (face === 'pain') {
    // Brows pinched upward, eyes squeezed shut, teeth clenched, a drop of sweat.
    px(-10, y + 9, 3, 1, C.hair);
    px(-7, y + 8, 2, 2, C.hair);
    px(-2, y + 8, 2, 2, C.hair);
    px(0, y + 9, 3, 1, C.hair);
    px(-8, y + 11, 1, 1, C.eye);
    px(-7, y + 12, 2, 1, C.eye);
    px(-8, y + 13, 1, 1, C.eye);
    px(-2, y + 12, 2, 1, C.eye);
    px(0, y + 11, 1, 1, C.eye);
    px(0, y + 13, 1, 1, C.eye);
    px(-14, y + 6, 2, 2, C.sweat);
    px(-13, y + 5, 1, 1, C.sweat);
  } else {
    // Heavy brows pulled down toward the nose.
    px(-10, y + 8, 3, 2, C.hair);
    px(-7, y + 9, 2, 2, C.hair);
    px(-2, y + 9, 2, 2, C.hair);
    px(0, y + 8, 3, 2, C.hair);
    if (face === 'blink') {
      px(-8, y + 12, 3, 1, C.eye);
      px(-2, y + 12, 3, 1, C.eye);
    } else {
      px(-8, y + 11, 2, 2, '#ffffff');
      px(-7, y + 11, 1, 2, C.eye);
      px(-2, y + 11, 2, 2, '#ffffff');
      px(-1, y + 11, 1, 2, C.eye);
    }
  }
  // Tired eye bags.
  px(-8, y + 13 + (face === 'pain' ? 1 : 0), 2, 1, C.skinShade);
  px(-2, y + 13 + (face === 'pain' ? 1 : 0), 2, 1, C.skinShade);

  // Nose, pointing to the facing side.
  px(-6, y + 12, 2, 3, C.skin);
  px(-6, y + 14, 3, 1, C.skinDeep);
  px(-7, y + 13, 1, 2, C.skinShade);

  // Thick mustache with drooping tips, salted with grey.
  px(-9, y + 15, 9, 1, C.hair);
  px(-10, y + 16, 11, 2, C.hair);
  px(-10, y + 18, 2, 1, C.hair);
  px(-1, y + 18, 2, 1, C.hair);
  px(-7, y + 15, 4, 1, C.hairHi);
  px(-6, y + 16, 1, 1, C.grey);
  px(-2, y + 17, 1, 1, C.grey);

  if (face === 'pain') {
    px(-7, y + 18, 5, 2, C.mouth);
    px(-7, y + 18, 5, 1, '#ffffff');
  } else {
    // Downturned mouth corner under the mustache.
    px(-7, y + 19, 5, 1, C.skinDeep);
  }

  return y - 2;
}

/** 1px outline around the opaque pixels, each in a darkened copy of the pixel it borders. */
export function outline(ctx: CanvasRenderingContext2D): void {
  const { width: W, height: H } = ctx.canvas;
  const img = ctx.getImageData(0, 0, W, H);
  const src = new Uint8ClampedArray(img.data);
  const d = img.data;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= W || y >= H ? -1 : (y * W + x) * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = at(x, y);
      if (src[i + 3] > 0) continue;
      for (const [nx, ny] of [
        [x + 1, y],
        [x - 1, y],
        [x, y + 1],
        [x, y - 1],
      ]) {
        const j = at(nx, ny);
        if (j < 0 || src[j + 3] === 0) continue;
        d[i] = src[j] * 0.35;
        d[i + 1] = src[j + 1] * 0.3;
        d[i + 2] = src[j + 2] * 0.3;
        d[i + 3] = 255;
        break;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
}

function build(pose: AvatarPose, frame: number, face: Expression): AvatarFrame {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('Unable to create avatar canvas');
  const px: Px = (x, y, w, h, color) => {
    if (w <= 0 || h <= 0) return;
    ctx.fillStyle = color;
    ctx.fillRect(OX + x, OY + y, w, h);
  };
  const top = paint(px, pose, frame, face);
  outline(ctx);
  return { canvas, ox: OX, oy: OY, top: top - 1 };
}

function mirror(f: AvatarFrame): AvatarFrame {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Unable to create avatar canvas');
  ctx.translate(W, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(f.canvas, 0, 0);
  return { ...f, canvas, ox: W - f.ox };
}

const cache = new Map<string, AvatarFrame>();

export function avatarFrame(pose: AvatarPose, frame = 0, facing: 1 | -1 = -1, face: Expression = 'normal'): AvatarFrame {
  const key = `${pose}|${frame}|${facing}|${face}`;
  let f = cache.get(key);
  if (!f) {
    f = facing < 0 ? build(pose, frame, face) : mirror(avatarFrame(pose, frame, -1, face));
    cache.set(key, f);
  }
  return f;
}
