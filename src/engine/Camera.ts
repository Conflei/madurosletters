import { ZOOM_MAX } from '../config';
import type { Vec2 } from './iso';

export interface Bounds {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Fixed 2D camera over world pixels: (x, y) is the world point shown at the center of the view. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;

  private viewW = 1;
  private viewH = 1;

  setViewport(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
  }

  /** Scale and position so `world` fits inside the screen rectangle `area`, centered. */
  fit(world: Bounds, area: Bounds, maxZoom = ZOOM_MAX): void {
    this.zoom = Math.min(maxZoom, area.w / world.w, area.h / world.h);
    this.x = world.x + world.w / 2 - (area.x + area.w / 2 - this.viewW / 2) / this.zoom;
    this.y = world.y + world.h / 2 - (area.y + area.h / 2 - this.viewH / 2) / this.zoom;
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    return { x: (sx - this.viewW / 2) / this.zoom + this.x, y: (sy - this.viewH / 2) / this.zoom + this.y };
  }

  apply(ctx: CanvasRenderingContext2D, dpr: number): void {
    const s = dpr * this.zoom;
    ctx.setTransform(s, 0, 0, s, dpr * (this.viewW / 2 - this.x * this.zoom), dpr * (this.viewH / 2 - this.y * this.zoom));
  }
}
