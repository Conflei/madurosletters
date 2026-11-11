export interface View {
  width: number;
  height: number;
  dpr: number;
}

export interface Scene {
  resize(width: number, height: number, dpr: number): void;
  update(dt: number): void;
  render(ctx: CanvasRenderingContext2D, view: View): void;
}
