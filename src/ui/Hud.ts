import { CUSTODY_START, FACILITY, FACILITY_LOCATION, INMATE_FULL_NAME, INMATE_NAME, INMATE_NUMBER, TIME_ZONE, VERSION } from '../config';
import type { Bounds } from '../engine/iso';
import { avatarFrame } from '../game/avatar';
import type { CareAction, Stats } from '../game/InmateState';
import { pixelIcon } from './icons';

const LOW = 25;
const DAY_MS = 86_400_000;
const CHAT_MAX = 80;
const BUBBLE_STEP = 28;
/** Space between the name tag and the newest bubble, room for its tail. */
const BUBBLE_GAP = 14;
const BUBBLE_DRIFT_EVERY = 4000;
const BUBBLE_LIFE = 14000;

const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric' });

/** Whole calendar days in New York between the custody date and `now`. */
function daysInside(now: Date): number {
  const parts = Object.fromEntries(dateFormat.formatToParts(now).map((p) => [p.type, p.value]));
  const today = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day));
  const start = Date.UTC(CUSTODY_START.year, CUSTODY_START.month - 1, CUSTODY_START.day);
  return Math.floor((today - start) / DAY_MS);
}

function query<T extends HTMLElement>(root: HTMLElement, selector: string): T {
  const el = root.querySelector<T>(selector);
  if (!el) throw new Error(`HUD element not found: ${selector}`);
  return el;
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

/** Avatar sprite cropped to its opaque area, as a data URL for <img> tags. */
function spriteUrl(pose: 'stand' | 'head'): string {
  const f = avatarFrame(pose, 0, -1);
  const src = f.canvas;
  const ctx = src.getContext('2d');
  if (!ctx) return '';
  const { data, width, height } = ctx.getImageData(0, 0, src.width, src.height);
  let x0 = width;
  let y0 = height;
  let x1 = 0;
  let y1 = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] === 0) continue;
      x0 = Math.min(x0, x);
      y0 = Math.min(y0, y);
      x1 = Math.max(x1, x + 1);
      y1 = Math.max(y1, y + 1);
    }
  }
  const out = document.createElement('canvas');
  out.width = x1 - x0;
  out.height = y1 - y0;
  out.getContext('2d')?.drawImage(src, -x0, -y0);
  return out.toDataURL();
}

interface Bubble {
  el: HTMLElement;
  y: number;
  born: number;
}

/** DOM overlay in the style of Habbo's Nitro client. */
export class Hud {
  private root: HTMLElement;
  private stage: HTMLElement;
  private daysEl: HTMLElement;
  private timeEl: HTMLElement;
  private moodRow: HTMLElement;
  private moodFill: HTMLElement;
  private moodValue: HTMLElement;
  private nameTag: HTMLElement;
  private chatLayer: HTMLElement;
  private notice: HTMLElement | null;
  private headUrl: string;
  private bubbles: Bubble[] = [];
  private head = { x: 0, y: 0 };
  private lastDrift = 0;
  private shownMood = -1;
  private lastTime = '';
  private actionHandler: ((action: CareAction) => void) | null = null;
  private chatHandler: ((text: string) => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.headUrl = spriteUrl('head');
    const touch = matchMedia('(pointer: coarse)').matches;

    root.innerHTML = `
      <div class="stage" data-stage></div>
      <div class="chat-layer" data-chat></div>
      <div class="name-tag" data-name>${INMATE_NAME}</div>

      <div class="room-info nitro-card">
        <b>${FACILITY}</b>
        <span>${FACILITY_LOCATION}</span>
      </div>

      <div class="purse nitro-card">
        <div class="purse-row" title="Days in custody">
          <span class="purse-value"><span data-days>0</span><small>days</small></span>
          ${pixelIcon('calendar', 2)}
        </div>
        <div class="purse-row" title="Time in New York">
          <span class="purse-value"><span data-time>0:00</span><small>NYC</small></span>
          ${pixelIcon('clock', 2)}
        </div>
      </div>

      <div class="notice nitro-card" data-notice>
        <p>Tap the <b>bed</b>, <b>sink</b>, <b>stool</b> or <b>toilet</b> to use them.</p>
        <button type="button" class="notice-close" aria-label="Close">×</button>
      </div>

      <aside class="infostand nitro-card">
        <h2>${INMATE_FULL_NAME}</h2>
        <hr />
        <div class="infostand-body">
          <div class="infostand-figure"><img src="${spriteUrl('stand')}" alt="" /></div>
          <div class="infostand-badges">
            <span class="badge" title="Venezuela">${pixelIcon('flag', 2)}</span>
            <span class="badge" title="Inmate">${pixelIcon('bars', 2)}</span>
          </div>
        </div>
        <hr />
        <p class="motto">${INMATE_NUMBER} · ${FACILITY}</p>
        <hr />
        <div class="mood" data-mood>
          ${pixelIcon('heart', 2)}
          <div class="mood-bar"><i data-mood-fill></i></div>
          <b data-mood-value>0</b>
        </div>
      </aside>

      <nav class="toolbar">
        <button type="button" class="tool tool-me" aria-label="${INMATE_NAME}">
          <img src="${this.headUrl}" alt="" />
        </button>
        <button type="button" class="tool" data-action="write" aria-label="Write a letter">
          ${pixelIcon('envelope', 2)}
          <span>Write</span>
        </button>
        <form class="chat-input" data-chat-form>
          <input type="text" maxlength="${CHAT_MAX}" enterkeyhint="send" autocomplete="off" placeholder="${touch ? 'Tap' : 'Click'} here to chat..." />
        </form>
        <span class="version">v${VERSION}</span>
      </nav>
    `;

    this.stage = query(root, '[data-stage]');
    this.daysEl = query(root, '[data-days]');
    this.timeEl = query(root, '[data-time]');
    this.moodRow = query(root, '[data-mood]');
    this.moodFill = query(root, '[data-mood-fill]');
    this.moodValue = query(root, '[data-mood-value]');
    this.nameTag = query(root, '[data-name]');
    this.chatLayer = query(root, '[data-chat]');
    this.notice = query(root, '[data-notice]');

    query(root, '.notice-close').addEventListener('click', () => this.dismissTip());
    query(root, '.tool-me').addEventListener('click', () => root.classList.toggle('infostand-hidden'));
    root.querySelectorAll<HTMLButtonElement>('button[data-action]').forEach((btn) => {
      btn.addEventListener('click', () => this.actionHandler?.(btn.dataset.action as CareAction));
    });

    const form = query<HTMLFormElement>(root, '[data-chat-form]');
    const input = query<HTMLInputElement>(form, 'input');
    const send = () => {
      const text = input.value.trim().slice(0, CHAT_MAX);
      input.value = '';
      if (text) this.chatHandler?.(text);
      if (touch) input.blur();
    };
    form.addEventListener('submit', (e) => e.preventDefault());
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' || e.isComposing) return;
      e.preventDefault();
      send();
    });

    this.updateClock(new Date());
  }

  onAction(handler: (action: CareAction) => void): void {
    this.actionHandler = handler;
  }

  onChat(handler: (text: string) => void): void {
    this.chatHandler = handler;
  }

  /** Screen rectangle (relative to the HUD root) the room is centred and fitted into. */
  stageRect(): Bounds {
    const r = this.stage.getBoundingClientRect();
    const base = this.root.getBoundingClientRect();
    return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
  }

  dismissTip(): void {
    if (!this.notice) return;
    const el = this.notice;
    this.notice = null;
    el.classList.add('closing');
    setTimeout(() => el.remove(), 250);
  }

  /** Called every frame with the screen position of the top of the avatar's head. */
  placeAvatar(x: number, y: number): void {
    const rx = Math.round(x);
    const ry = Math.round(y);
    if (rx !== this.head.x || ry !== this.head.y) {
      this.head = { x: rx, y: ry };
      this.nameTag.style.transform = `translate(${rx}px, ${ry - 4}px) translate(-50%, -100%)`;
    }
    this.driftBubbles();
  }

  /** Habbo chat: a new bubble appears over the speaker and pushes older ones up. */
  say(text: string): void {
    const el = document.createElement('div');
    el.className = 'bubble';
    el.innerHTML = `<span class="bubble-head"><img src="${this.headUrl}" alt="" /></span><span class="bubble-text"><b>${INMATE_NAME}:</b> ${escapeHtml(text)}</span>`;
    this.chatLayer.append(el);

    const layerW = this.chatLayer.clientWidth;
    const w = el.offsetWidth;
    const left = Math.max(6, Math.min(layerW - w - 6, this.head.x - w / 2));
    el.style.left = `${Math.round(left)}px`;
    el.style.setProperty('--tail', `${Math.round(Math.max(12, Math.min(w - 12, this.head.x - left)))}px`);

    const above = this.head.y - this.nameTag.offsetHeight - BUBBLE_GAP;
    const bubble: Bubble = { el, y: above - el.offsetHeight, born: performance.now() };
    this.moveBubble(bubble, bubble.y);
    let limit = bubble.y - BUBBLE_STEP;
    for (let i = this.bubbles.length - 1; i >= 0; i--) {
      const b = this.bubbles[i];
      this.moveBubble(b, Math.min(b.y - BUBBLE_STEP, limit));
      limit = b.y - BUBBLE_STEP;
    }
    this.bubbles.push(bubble);
    this.lastDrift = performance.now();
  }

  updateClock(now: Date): void {
    const time = timeFormat.format(now);
    if (time === this.lastTime) return;
    this.lastTime = time;
    this.timeEl.textContent = time;
    this.daysEl.textContent = String(daysInside(now));
  }

  setStats(stats: Stats): void {
    const v = Math.round(stats.mood);
    if (v === this.shownMood) return;
    this.shownMood = v;
    this.moodFill.style.width = `${v}%`;
    this.moodValue.textContent = String(v);
    this.moodRow.classList.toggle('low', v < LOW);
  }

  private moveBubble(b: Bubble, y: number): void {
    b.y = y;
    b.el.style.top = `${Math.round(y)}px`;
  }

  private driftBubbles(): void {
    const now = performance.now();
    if (now - this.lastDrift > BUBBLE_DRIFT_EVERY && this.bubbles.length) {
      this.lastDrift = now;
      for (const b of this.bubbles) this.moveBubble(b, b.y - BUBBLE_STEP);
    }
    this.bubbles = this.bubbles.filter((b) => {
      const keep = b.y > -BUBBLE_STEP && now - b.born < BUBBLE_LIFE;
      if (!keep) b.el.remove();
      return keep;
    });
  }
}
