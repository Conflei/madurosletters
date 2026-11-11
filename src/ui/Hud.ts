import { CUSTODY_START, FACILITY, INMATE_FULL_NAME, INMATE_NUMBER, TIME_ZONE, VERSION } from '../config';
import type { Bounds } from '../engine/Camera';
import type { CareAction, StatKey, Stats } from '../game/InmateState';

const ICONS = {
  mood: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9.5h.01M15 9.5h.01"/>',
  letter: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
};

const STATS: { key: StatKey; label: string; icon: keyof typeof ICONS }[] = [{ key: 'mood', label: 'Mood', icon: 'mood' }];

const ACTIONS: { action: CareAction; label: string; icon: keyof typeof ICONS }[] = [
  { action: 'write', label: 'Write', icon: 'letter' },
];

const LOW = 25;
const DAY_MS = 86_400_000;

const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric' });

/** Whole calendar days in New York between the custody date and `now`. */
function daysInside(now: Date): number {
  const parts = Object.fromEntries(dateFormat.formatToParts(now).map((p) => [p.type, p.value]));
  const today = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const start = Date.UTC(CUSTODY_START.year, CUSTODY_START.month - 1, CUSTODY_START.day);
  return Math.floor((today - start) / DAY_MS);
}

const svg = (icon: keyof typeof ICONS) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`;

function query<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`HUD element not found: ${selector}`);
  return el;
}

interface StatView {
  fill: HTMLElement;
  value: HTMLElement;
  row: HTMLElement;
  shown: number;
}

/** DOM overlay: inmate header, the stage the canvas scene is fitted into, mood meter and actions. */
export class Hud {
  private root: HTMLElement;
  private stage: HTMLElement;
  private dayEl: HTMLElement;
  private timeEl: HTMLElement;
  private stats = new Map<StatKey, StatView>();
  private actionHandler: ((action: CareAction) => void) | null = null;
  private lastTime = '';

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <header class="hud-top">
        <div class="profile">
          <span class="avatar" aria-hidden="true"></span>
          <div>
            <h1>${INMATE_FULL_NAME}</h1>
            <p>${INMATE_NUMBER} · ${FACILITY}</p>
          </div>
        </div>
        <div class="clock">
          <span data-day></span>
          <strong><span data-time></span><small>NYC</small></strong>
        </div>
      </header>
      <div class="stage" data-stage></div>
      <section class="panel">
        <div class="stats">
          ${STATS.map(
            (s) => `
            <div class="stat stat-${s.key}" data-stat="${s.key}">
              <div class="stat-head">${svg(s.icon)}<span>${s.label}</span><b data-value>0</b></div>
              <div class="meter"><i data-fill></i></div>
            </div>`,
          ).join('')}
          <p class="tip">Tap the bed, sink, chair or toilet</p>
        </div>
        <div class="actions">
          ${ACTIONS.map(
            (a) => `
            <button type="button" class="action action-${a.action}" data-action="${a.action}">
              <span class="action-icon">${svg(a.icon)}</span>
              <span>${a.label}</span>
            </button>`,
          ).join('')}
        </div>
        <span class="version">v${VERSION}</span>
      </section>
    `;

    this.stage = query(root, '[data-stage]');
    this.dayEl = query(root, '[data-day]');
    this.timeEl = query(root, '[data-time]');

    for (const { key } of STATS) {
      const row = query(root, `[data-stat="${key}"]`);
      this.stats.set(key, { row, fill: query(row, '[data-fill]'), value: query(row, '[data-value]'), shown: -1 });
    }

    root.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => this.actionHandler?.(btn.dataset.action as CareAction));
    });

    this.updateClock(new Date());
  }

  onAction(handler: (action: CareAction) => void): void {
    this.actionHandler = handler;
  }

  /** Screen rectangle (relative to the HUD root) left free for the game scene. */
  stageRect(): Bounds {
    const r = this.stage.getBoundingClientRect();
    const base = this.root.getBoundingClientRect();
    return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
  }

  updateClock(now: Date): void {
    const time = timeFormat.format(now);
    if (time === this.lastTime) return;
    this.lastTime = time;
    this.timeEl.textContent = time;
    const days = daysInside(now);
    this.dayEl.textContent = `${days} ${days === 1 ? 'day' : 'days'} inside`;
  }

  setStats(stats: Stats): void {
    for (const [key, view] of this.stats) {
      const v = Math.round(stats[key]);
      if (v === view.shown) continue;
      view.shown = v;
      view.fill.style.width = `${v}%`;
      view.value.textContent = String(v);
      view.row.classList.toggle('low', v < LOW);
    }
  }
}
