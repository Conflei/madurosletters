/*
 * Procedural Habbo-style figure. Each frame is painted pixel by pixel into a small canvas,
 * then traced with a 1px outline in a darker shade of whatever it touches (like Habbo's
 * sprites). The base art faces screen-left; facing right is a mirrored copy.
 */

export type AvatarPose = 'stand' | 'walk' | 'sit' | 'write' | 'wash' | 'head';

export interface AvatarFrame {
  canvas: HTMLCanvasElement;
  /** Pixel in the canvas that sits on the anchor point (between the feet, or under the chin for 'head'). */
  ox: number;
  oy: number;
  /** y of the top of the hair, relative to the anchor. */
  top: number;
}

const W = 40;
const H = 80;
const OX = 20;
const OY = 76;

const C = {
  skin: '#e2a47c',
  skinShade: '#c4835b',
  skinDeep: '#a86a46',
  hair: '#151416',
  hairHi: '#3a3a40',
  suit: '#f07c1e',
  suitShade: '#c9600f',
  suitDeep: '#a44c08',
  suitLight: '#ff9d45',
  tag: '#f4f1e6',
  shoe: '#3b3b40',
  shoeHi: '#5c5c64',
  eye: '#1a1418',
};

type Px = (x: number, y: number, w: number, h: number, color: string) => void;

function paint(px: Px, pose: AvatarPose, frame: number, blink: boolean): number {
  if (pose === 'head') return drawHead(px, 21, true);

  const sitting = pose === 'sit' || pose === 'write';
  const step = pose === 'walk' ? frame : 0;
  const hip = (sitting ? -12 : -20) + (step ? 1 : 0);

  drawFarArm(px, pose, hip, step);
  if (sitting) drawSeatedLegs(px, hip);
  else drawLegs(px, hip, step);
  drawTorso(px, hip);
  const top = drawHead(px, hip, blink);
  drawNearArm(px, pose, hip, step, frame);
  return top;
}

function drawLegs(px: Px, hip: number, step: number): void {
  // step 1: near leg forward, far leg lifted back; step 2: the reverse.
  const near = step === 1 ? { dx: -2, lift: 0 } : step === 2 ? { dx: 1, lift: 2 } : { dx: 0, lift: 0 };
  const far = step === 1 ? { dx: 1, lift: 2 } : step === 2 ? { dx: -2, lift: 0 } : { dx: 0, lift: 0 };
  const leg = (x: number, l: { dx: number; lift: number }, color: string) => {
    const bottom = -3 - l.lift;
    px(x + l.dx, hip, 5, bottom - hip, color);
    px(x + l.dx, hip, 1, bottom - hip, C.suit);
    px(x + l.dx - 1, bottom, 6, 3, C.shoe);
    px(x + l.dx - 1, bottom, 3, 1, C.shoeHi);
  };
  leg(1, far, C.suitDeep);
  leg(-6, near, C.suitShade);
}

/** Knees toward the viewer and slightly to the facing side; only knees and shins show. */
function drawSeatedLegs(px: Px, hip: number): void {
  px(-10, hip, 15, 4, C.suitShade);
  px(-10, hip, 15, 1, C.suit);
  for (const x of [-9, -3]) {
    px(x, hip + 4, 5, -3 - (hip + 4), x < -5 ? C.suitShade : C.suitDeep);
    px(x - 1, -3, 6, 3, C.shoe);
    px(x - 1, -3, 3, 1, C.shoeHi);
  }
}

function drawTorso(px: Px, hip: number): void {
  const top = hip - 19;
  px(-8, top + 1, 16, 18, C.suit);
  px(-7, top, 14, 1, C.suit);
  px(-8, top + 1, 2, 17, C.suitLight);
  px(4, top + 1, 4, 18, C.suitShade);
  px(-8, hip - 1, 16, 1, C.suitShade);
  px(-2, top + 3, 1, 15, C.suitShade);
  // Open collar showing the neck.
  px(-4, top, 4, 2, C.skin);
  px(-3, top + 2, 2, 1, C.skin);
  px(-5, top, 1, 2, C.suitLight);
  px(0, top, 1, 2, C.suitLight);
  // Inmate number patch.
  px(1, top + 4, 5, 3, C.tag);
  px(2, top + 5, 3, 1, '#9a978c');
}

function arm(px: Px, x: number, top: number, len: number, sleeve: string, hand: string, light?: string): void {
  px(x, top, 3, len, sleeve);
  if (light) px(x, top, 1, len, light);
  px(x, top + len, 3, 3, hand);
}

function drawFarArm(px: Px, pose: AvatarPose, hip: number, step: number): void {
  if (pose === 'wash' || pose === 'write') return;
  const swing = step === 1 ? -1 : step === 2 ? 1 : 0;
  arm(px, 8 + swing, hip - 18, 13, C.suitDeep, C.skinShade);
}

function drawNearArm(px: Px, pose: AvatarPose, hip: number, step: number, frame: number): void {
  const top = hip - 18;
  if (pose === 'wash') {
    // Both hands out in front, scrubbing over the basin.
    const bob = frame % 2;
    px(-11, top, 3, 6, C.suitShade);
    px(-14, top + 5 + bob, 7, 3, C.suitShade);
    px(-17, top + 4 + bob, 3, 3, C.skin);
    px(4, top + 6, 4, 3, C.suitDeep);
    px(-6, top + 7 - bob, 10, 3, C.suitShade);
    px(-9, top + 6 - bob, 3, 3, C.skinShade);
    return;
  }
  if (pose === 'write') {
    // Forearms resting forward on the desk, writing hand scribbling.
    const dx = frame % 2;
    px(-11, top, 3, 7, C.suitShade);
    px(-15, top + 6, 7, 3, C.suitShade);
    px(-18, top + 6, 3, 3, C.skin);
    px(-6, top + 8, 10, 3, C.suitShade);
    px(-9 - dx, top + 8, 3, 3, C.skinShade);
    px(-11 - dx, top + 7, 1, 2, '#f2c94c');
    return;
  }
  const swing = step === 1 ? 1 : step === 2 ? -1 : 0;
  arm(px, -11 + swing, top, 13, C.suitShade, C.skin, C.suit);
}

/** Rounded rectangle: insets per corner row. */
function rounded(px: Px, x: number, y: number, w: number, h: number, insets: number[], color: string): void {
  for (let i = 0; i < h; i++) {
    const inset = Math.max(insets[i] ?? 0, insets[h - 1 - i] ?? 0);
    px(x + inset, y + i, w - inset * 2, 1, color);
  }
}

/** Head above the neck line `hip - 19`; returns the y of the top of the hair. */
function drawHead(px: Px, hip: number, closed: boolean): number {
  const y = hip - 41;

  px(-3, y + 19, 6, 3, C.skinShade);

  rounded(px, -10, y, 20, 20, [4, 2, 1, 1], C.skin);
  px(6, y + 4, 3, 14, C.skinShade);
  rounded(px, -8, y + 18, 16, 2, [0, 2], C.skinShade);

  // Hair: full cap, fuller at the back of the head, short fringe.
  rounded(px, -11, y - 2, 22, 9, [5, 3, 2, 1, 0], C.hair);
  px(2, y + 6, 9, 7, C.hair);
  px(3, y + 13, 7, 2, C.hair);
  px(-10, y + 7, 3, 1, C.hair);
  px(-6, y + 7, 2, 1, C.hair);
  px(-6, y - 1, 7, 1, C.hairHi);
  px(-8, y, 3, 1, C.hairHi);

  // Ear.
  px(4, y + 9, 3, 5, C.skin);
  px(5, y + 10, 1, 3, C.skinDeep);

  // Heavy brows pulled down toward the nose.
  px(-10, y + 8, 3, 2, C.hair);
  px(-7, y + 9, 2, 2, C.hair);
  px(-2, y + 9, 2, 2, C.hair);
  px(0, y + 8, 3, 2, C.hair);

  if (closed) {
    px(-8, y + 12, 3, 1, C.eye);
    px(-2, y + 12, 3, 1, C.eye);
  } else {
    px(-8, y + 11, 2, 2, '#ffffff');
    px(-7, y + 11, 1, 2, C.eye);
    px(-2, y + 11, 2, 2, '#ffffff');
    px(-1, y + 11, 1, 2, C.eye);
  }
  // Tired eye bags.
  px(-8, y + 13, 2, 1, C.skinShade);
  px(-2, y + 13, 2, 1, C.skinShade);

  // Nose, pointing to the facing side.
  px(-6, y + 12, 2, 3, C.skin);
  px(-6, y + 14, 3, 1, C.skinDeep);
  px(-7, y + 13, 1, 2, C.skinShade);

  // Thick mustache with drooping tips.
  px(-9, y + 15, 9, 1, C.hair);
  px(-10, y + 16, 11, 2, C.hair);
  px(-10, y + 18, 2, 1, C.hair);
  px(-1, y + 18, 2, 1, C.hair);
  px(-7, y + 15, 4, 1, C.hairHi);

  // Downturned mouth corner under the mustache.
  px(-7, y + 19, 5, 1, C.skinDeep);

  return y - 2;
}

/** 1px outline around the opaque pixels, each in a darkened copy of the pixel it borders. */
function outline(ctx: CanvasRenderingContext2D): void {
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

function build(pose: AvatarPose, frame: number, blink: boolean): AvatarFrame {
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
  const top = paint(px, pose, frame, blink);
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

export function avatarFrame(pose: AvatarPose, frame = 0, facing: 1 | -1 = -1, blink = false): AvatarFrame {
  const key = `${pose}|${frame}|${facing}|${blink}`;
  let f = cache.get(key);
  if (!f) {
    f = facing < 0 ? build(pose, frame, blink) : mirror(avatarFrame(pose, frame, -1, blink));
    cache.set(key, f);
  }
  return f;
}
