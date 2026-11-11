// Renders the favicon set and the social share image with the game's own pixel art.
// Results are shown on the page and exposed as PNG data URLs on `window.brand`.
import '@fontsource/ubuntu/latin-500.css';
import '@fontsource/ubuntu/latin-700.css';
import { PAL } from '../src/config';
import { avatarFrame } from '../src/game/avatar';
import { FloorLetters } from '../src/game/FloorLetters';
import { InmateActor } from '../src/game/InmateActor';
import { renderCell } from '../src/world/CellRenderer';

const BG = '#0b0e13';
const ORANGE = '#f07c1e';

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  return [c, ctx];
}

/** The inmate's head (normal face), cropped tight from the standing sprite. */
function head(): HTMLCanvasElement {
  const f = avatarFrame('stand', 0, -1, 'normal');
  const src = f.canvas.getContext('2d')!;
  const rows = f.oy - 38;
  const data = src.getImageData(0, 0, f.canvas.width, rows).data;
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < f.canvas.width; x++) {
      if (data[(y * f.canvas.width + x) * 4 + 3] === 0) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  const [c, ctx] = canvas(x1 - x0 + 1, y1 - y0 + 1);
  ctx.drawImage(f.canvas, -x0, -y0);
  return c;
}

/** Head centred on a dark tile at the largest whole-pixel scale that fits `fill` of the side. */
function icon(size: number, opts: { rounded: boolean; fill: number }): HTMLCanvasElement {
  const h = head();
  const [c, ctx] = canvas(size, size);
  ctx.fillStyle = BG;
  if (opts.rounded) {
    ctx.beginPath();
    ctx.roundRect(0, 0, size, size, size * 0.2);
    ctx.fill();
  } else {
    ctx.fillRect(0, 0, size, size);
  }
  const k = Math.max(1, Math.floor((size * opts.fill) / Math.max(h.width, h.height)));
  const w = h.width * k;
  const hh = h.height * k;
  const x = Math.round((size - w) / 2);
  const y = Math.round((size - hh) / 2);
  ctx.drawImage(h, x, y, w, hh);
  return c;
}

/** The cell as the game draws it, with the inmate and a few envelopes on the floor. */
function scene(): HTMLCanvasElement {
  const room = renderCell();
  const b = room.bounds;
  const [c, ctx] = canvas(b.w, b.h);
  ctx.setTransform(1, 0, 0, 1, -b.x, -b.y);
  ctx.drawImage(room.image, b.x, b.y);
  const letters = new FloorLetters();
  letters.load([]);
  letters.draw(ctx, 1);
  new InmateActor().draw(ctx, 0);
  return c;
}

function share(): HTMLCanvasElement {
  const W = 1200;
  const H = 630;
  const [c, ctx] = canvas(W, H);
  ctx.fillStyle = PAL.void;
  ctx.fillRect(0, 0, W, H);

  // Cell on the right, as large as whole pixels allow, over a soft lamp glow.
  const s = scene();
  const k = Math.floor(Math.min(720 / s.width, 600 / s.height));
  const sw = s.width * k;
  const sh = s.height * k;
  const sx = W - sw - 10;
  const sy = Math.round((H - sh) / 2) + 10;
  const glow = ctx.createRadialGradient(sx + sw / 2, sy + sh / 2, 0, sx + sw / 2, sy + sh / 2, sw * 0.6);
  glow.addColorStop(0, 'rgba(240, 124, 30, 0.16)');
  glow.addColorStop(1, 'rgba(240, 124, 30, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);
  ctx.drawImage(s, sx, sy, sw, sh);

  // Title block on the left, Habbo Nitro style.
  const left = 70;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 76px Ubuntu';
  ctx.fillText('Las cartas', left, 220);
  ctx.fillText('de Maduro', left, 304);

  ctx.fillStyle = ORANGE;
  ctx.fillRect(left, 336, 120, 8);

  ctx.fillStyle = '#c9ced6';
  ctx.font = '500 30px Ubuntu';
  ctx.fillText('Escríbele una carta a', left, 404);
  ctx.fillText('Nicolás Maduro en prisión.', left, 444);

  ctx.fillStyle = '#8a929e';
  ctx.font = '500 22px Ubuntu';
  ctx.fillText('Se imprimen y se envían por correo.', left, 500);

  ctx.fillStyle = '#5d6571';
  ctx.font = '500 20px Ubuntu';
  ctx.fillText('Un juego de Felix Izarra · @fxizrr', left, 572);
  return c;
}

async function main(): Promise<void> {
  await Promise.all([document.fonts.load('700 76px Ubuntu'), document.fonts.load('500 30px Ubuntu')]);
  const out: Record<string, HTMLCanvasElement> = {
    'favicon-32.png': icon(32, { rounded: true, fill: 0.95 }),
    'favicon-48.png': icon(48, { rounded: true, fill: 0.9 }),
    'apple-touch-icon.png': icon(180, { rounded: false, fill: 0.78 }),
    'icon-192.png': icon(192, { rounded: true, fill: 0.78 }),
    'icon-512.png': icon(512, { rounded: true, fill: 0.78 }),
    'icon-maskable-512.png': icon(512, { rounded: false, fill: 0.6 }),
    'og-image.png': share(),
  };
  const urls: Record<string, string> = {};
  for (const [name, c] of Object.entries(out)) {
    urls[name] = c.toDataURL('image/png');
    const fig = document.createElement('figure');
    fig.append(c, Object.assign(document.createElement('figcaption'), { textContent: name }));
    document.body.append(fig);
  }
  (window as unknown as { brand: Record<string, string> }).brand = urls;
}

main();
