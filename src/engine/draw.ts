import { HALF_H, HALF_W } from '../config';
import { project, type Vec2 } from './iso';

export type Paint = string | CanvasGradient | CanvasPattern;

/** Local pixels per tile when drawing flat onto a wall plane. */
export const PLANE_U = 36;

export function poly(
  ctx: CanvasRenderingContext2D,
  pts: Vec2[],
  fill?: Paint,
  stroke?: Paint,
  lineWidth = 1,
): void {
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fill();
  }
  if (stroke) {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  }
}

export function line(ctx: CanvasRenderingContext2D, a: Vec2, b: Vec2, color: Paint, width: number): void {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.stroke();
}

/** Mix a #rrggbb color toward white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = amount < 0 ? 0 : 255;
  const t = Math.min(1, Math.abs(amount));
  const mix = (c: number) => Math.round(c + (target - c) * t);
  return `rgb(${mix((n >> 16) & 255)}, ${mix((n >> 8) & 255)}, ${mix(n & 255)})`;
}

export interface BoxColors {
  top: Paint;
  left: Paint;
  right: Paint;
  edge?: Paint;
}

/** Top lit, left face mid, right face in shadow (light comes from the upper left). */
export function boxColors(base: string, edge: Paint = 'rgba(0, 0, 0, 0.2)'): BoxColors {
  return { top: shade(base, 0.12), left: shade(base, -0.08), right: shade(base, -0.28), edge };
}

/** Axis-aligned box: footprint (x, y, w, d) in tiles, elevation z and height h in pixels. */
export function isoBox(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  z: number,
  w: number,
  d: number,
  h: number,
  c: BoxColors,
): void {
  const lw = 0.6;
  poly(ctx, [project(x, y + d, z), project(x + w, y + d, z), project(x + w, y + d, z + h), project(x, y + d, z + h)], c.left, c.edge, lw);
  poly(ctx, [project(x + w, y, z), project(x + w, y + d, z), project(x + w, y + d, z + h), project(x + w, y, z + h)], c.right, c.edge, lw);
  poly(ctx, [project(x, y, z + h), project(x + w, y, z + h), project(x + w, y + d, z + h), project(x, y + d, z + h)], c.top, c.edge, lw);
}

export function tileDiamond(x: number, y: number, z = 0): Vec2[] {
  return [project(x, y, z), project(x + 1, y, z), project(x + 1, y + 1, z), project(x, y + 1, z)];
}

/**
 * Draw flat onto the wall plane y = const. Local u runs along +x (PLANE_U px per tile),
 * local v runs downward in pixels. Origin is the world point (x0, y, z0).
 */
export function withPlaneY(ctx: CanvasRenderingContext2D, x0: number, y: number, z0: number, fn: () => void): void {
  const o = project(x0, y, z0);
  ctx.save();
  ctx.transform(HALF_W / PLANE_U, HALF_H / PLANE_U, 0, 1, o.x, o.y);
  fn();
  ctx.restore();
}

/** Same as withPlaneY for the wall plane x = const; local u runs along -y so text reads left to right. */
export function withPlaneX(ctx: CanvasRenderingContext2D, x: number, y0: number, z0: number, fn: () => void): void {
  const o = project(x, y0, z0);
  ctx.save();
  ctx.transform(HALF_W / PLANE_U, -HALF_H / PLANE_U, 0, 1, o.x, o.y);
  fn();
  ctx.restore();
}

/** Soft elliptical glow lying on the floor plane. */
export function floorGlow(ctx: CanvasRenderingContext2D, center: Vec2, radius: number, color: string): void {
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.scale(1, 0.5);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  g.addColorStop(0, color);
  g.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Deterministic PRNG so procedural textures look identical on every load. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
