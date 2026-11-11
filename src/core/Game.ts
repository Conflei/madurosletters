import type { Scene, View } from './Scene';

const MAX_DPR = 3;
const MAX_DT = 0.05;

/** Owns the canvas, keeps it sized to its container and drives the active scene. */
export class Game {
  readonly ctx: CanvasRenderingContext2D;
  private view: View = { width: 1, height: 1, dpr: 1 };
  private scene: Scene | null = null;
  private lastTime = 0;
  private rafId = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private container: HTMLElement,
  ) {
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('Canvas 2D is not supported on this device');
    this.ctx = ctx;

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stop();
      else this.start();
    });
  }

  setScene(scene: Scene): void {
    this.scene = scene;
    scene.resize(this.view.width, this.view.height);
  }

  start(): void {
    if (this.rafId) return;
    this.lastTime = performance.now();
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  private frame = (now: number) => {
    const dt = Math.min(MAX_DT, (now - this.lastTime) / 1000);
    this.lastTime = now;
    if (this.scene) {
      this.scene.update(dt);
      this.scene.render(this.ctx, this.view);
    }
    this.rafId = requestAnimationFrame(this.frame);
  };

  private resize(): void {
    const rect = this.container.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    this.view = { width: rect.width, height: rect.height, dpr };
    this.canvas.width = Math.round(rect.width * dpr);
    this.canvas.height = Math.round(rect.height * dpr);
    this.scene?.resize(rect.width, rect.height);
  }
}
