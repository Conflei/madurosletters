import { CUSTODY_START, FACILITY, FACILITY_LOCATION, INMATE_FULL_NAME, INMATE_NAME, INMATE_NUMBER, TIME_ZONE, VERSION } from '../config';
import { ApiError, myVote, receivedCount, submitLetter, topLetters, vote, type TopLetter, type VoteValue } from '../api';
import type { Bounds } from '../engine/iso';
import type { FloorLetter } from '../game/FloorLetters';
import { avatarFrame } from '../game/avatar';
import type { Stats } from '../game/InmateState';
import { pixelIcon } from './icons';

const LOW = 25;
const DAY_MS = 86_400_000;
const LETTER_MAX = 280;
const INSTAGRAM = 'fxizrr';
const INSTAGRAM_URL = `https://www.instagram.com/${INSTAGRAM}/`;

type ReadableLetter = Pick<FloorLetter, 'id' | 'text' | 'from'>;

const LETTER_MIN = 5;
const RECEIVED_REFRESH_MS = 60_000;
const BUBBLE_STEP = 28;
/** Space between the name tag and the newest bubble, room for its tail. */
const BUBBLE_GAP = 14;
const BUBBLE_DRIFT_EVERY = 4000;
const BUBBLE_LIFE = 14000;

const timeFormat = new Intl.DateTimeFormat('es-US', { timeZone: TIME_ZONE, hour: 'numeric', minute: '2-digit' });
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
  private receivedEl: HTMLElement;
  private timeEl: HTMLElement;
  private moodRow: HTMLElement;
  private moodFill: HTMLElement;
  private moodValue: HTMLElement;
  private nameTag: HTMLElement;
  private chatLayer: HTMLElement;
  private writeWin: HTMLElement;
  private writeText: HTMLTextAreaElement;
  private writeCount: HTMLElement;
  private sendBtn: HTMLButtonElement;
  private writeError: HTMLElement;
  private honeypot: HTMLInputElement;
  private writeOpenedAt = 0;
  private sending = false;
  private reading: ReadableLetter | null = null;
  /** The read window was opened from the ranking, so its main button goes back there. */
  private readFromRanking = false;
  private ranked: TopLetter[] = [];
  private voteBtns: HTMLButtonElement[] = [];
  private readWin: HTMLElement;
  private infoWin: HTMLElement;
  private rankWin: HTMLElement;
  private windows: HTMLElement[];
  private headUrl: string;
  private bubbles: Bubble[] = [];
  private head = { x: 0, y: 0 };
  private lastDrift = 0;
  private shownMood = -1;
  private lastTime = '';
  private sentHandler: ((text: string) => void) | null = null;

  constructor(root: HTMLElement) {
    this.root = root;
    this.headUrl = spriteUrl('head');

    root.innerHTML = `
      <div class="stage" data-stage></div>
      <div class="chat-layer" data-chat></div>
      <div class="name-tag" data-name>${INMATE_NAME}</div>

      <div class="room-info nitro-card">
        <b>${FACILITY}</b>
        <span>${FACILITY_LOCATION}</span>
      </div>

      <div class="purse nitro-card">
        <div class="purse-row" title="Días bajo custodia">
          <span class="purse-value"><span data-days>0</span><small>días</small></span>
          ${pixelIcon('calendar', 2)}
        </div>
        <div class="purse-row" title="Hora en Nueva York">
          <span class="purse-value"><span data-time>0:00</span><small>NYC</small></span>
          ${pixelIcon('clock', 2)}
        </div>
        <div class="purse-row" title="Cartas recibidas">
          <span class="purse-value"><span data-received>…</span><small>cartas recibidas</small></span>
          ${pixelIcon('letter', 2)}
        </div>
      </div>

      <aside class="infostand nitro-card">
        <h2>${INMATE_FULL_NAME}</h2>
        <hr />
        <div class="infostand-body">
          <div class="infostand-figure"><img src="${spriteUrl('stand')}" alt="" /></div>
          <div class="infostand-badges">
            <span class="badge" title="Venezuela">${pixelIcon('flag', 2)}</span>
            <span class="badge" title="Recluso">${pixelIcon('bars', 2)}</span>
          </div>
        </div>
        <hr />
        <p class="motto">${INMATE_NUMBER} · ${FACILITY}</p>
        <hr />
        <div class="mood" data-mood>
          <span class="mood-label">Ánimo</span>
          <div class="mood-bar"><i data-mood-fill></i></div>
          <b data-mood-value>0</b>
        </div>
      </aside>

      <section class="window letter-write" data-write hidden>
        <header class="window-head">
          <span>Escribir una carta</span>
          <button type="button" class="close-btn" data-close aria-label="Cerrar">×</button>
        </header>
        <div class="window-body">
          <textarea class="paper" maxlength="${LETTER_MAX}" placeholder="Querido Maduro, quiero decirte que…"></textarea>
          <label class="hp" aria-hidden="true">Sitio web <input type="text" name="website" tabindex="-1" autocomplete="off" data-hp /></label>
          <p class="form-error" data-write-error hidden></p>
          <div class="window-actions">
            <span class="count" data-count>0/${LETTER_MAX}</span>
            <button type="button" class="btn btn-green" data-send disabled>Enviar</button>
          </div>
        </div>
      </section>

      <section class="window letter-read" data-read hidden>
        <header class="window-head">
          <span>Carta recibida</span>
          <button type="button" class="close-btn" data-close aria-label="Cerrar">×</button>
        </header>
        <div class="window-body">
          <div class="paper paper-read">
            <p class="paper-to">Para: ${INMATE_FULL_NAME}</p>
            <p data-letter-text></p>
            <p class="paper-from" data-letter-from></p>
          </div>
          <div class="window-actions">
            <div class="vote" data-vote>
              <button type="button" class="vote-btn" data-vote-dir="up" aria-label="Votar a favor" aria-pressed="false">${pixelIcon('arrowUp', 2)}</button>
              <button type="button" class="vote-btn" data-vote-dir="down" aria-label="Votar en contra" aria-pressed="false">${pixelIcon('arrowDown', 2)}</button>
            </div>
            <span class="mood-cost" data-cost></span>
            <button type="button" class="btn" data-read-done>Cerrar</button>
          </div>
        </div>
      </section>

      <section class="window window-info" data-info hidden>
        <header class="window-head">
          <span>Sobre esta cárcel</span>
          <button type="button" class="close-btn" data-close aria-label="Cerrar">×</button>
        </header>
        <div class="window-body">
          <div class="info-text">
            <p>Las cartas que escribas serán enviadas a <b>${INMATE_FULL_NAME}</b> en prisión.</p>
            <p>Estas serán impresas y enviadas físicamente por el creador de esta cárcel digital, <a href="${INSTAGRAM_URL}" target="_blank" rel="noopener">@${INSTAGRAM}</a>.</p>
            <p>Para cualquier duda o sugerencia, escríbeme a mi Instagram.</p>
          </div>
          <div class="window-actions">
            <span></span>
            <a class="btn btn-green" href="${INSTAGRAM_URL}" target="_blank" rel="noopener">Instagram</a>
          </div>
        </div>
      </section>

      <section class="window window-ranking" data-ranking hidden>
        <header class="window-head">
          <span>Las más votadas</span>
          <button type="button" class="close-btn" data-close aria-label="Cerrar">×</button>
        </header>
        <div class="window-body">
          <p class="ranking-intro">Estas son las cartas más votadas de esta semana.</p>
          <ol class="ranking" data-ranking-list></ol>
        </div>
      </section>

      <nav class="toolbar">
        <button type="button" class="tool tool-me" aria-label="${INMATE_NAME}">
          <img src="${this.headUrl}" alt="" />
        </button>
        <button type="button" class="tool" data-open-write aria-label="Escribir una carta">
          ${pixelIcon('envelope', 2)}
          <span>Escribir</span>
        </button>
        <span class="version">v${VERSION}</span>
      </nav>
    `;

    this.stage = query(root, '[data-stage]');
    this.daysEl = query(root, '[data-days]');
    this.receivedEl = query(root, '[data-received]');
    this.timeEl = query(root, '[data-time]');
    this.moodRow = query(root, '[data-mood]');
    this.moodFill = query(root, '[data-mood-fill]');
    this.moodValue = query(root, '[data-mood-value]');
    this.nameTag = query(root, '[data-name]');
    this.chatLayer = query(root, '[data-chat]');
    this.writeWin = query(root, '[data-write]');
    this.writeText = query<HTMLTextAreaElement>(this.writeWin, 'textarea');
    this.writeCount = query(this.writeWin, '[data-count]');
    this.sendBtn = query<HTMLButtonElement>(this.writeWin, '[data-send]');
    this.writeError = query(this.writeWin, '[data-write-error]');
    this.honeypot = query<HTMLInputElement>(this.writeWin, '[data-hp]');
    this.readWin = query(root, '[data-read]');
    this.infoWin = query(root, '[data-info]');
    this.rankWin = query(root, '[data-ranking]');
    this.windows = [this.writeWin, this.readWin, this.infoWin, this.rankWin];

    query(root, '.tool-me').addEventListener('click', () => root.classList.toggle('infostand-hidden'));
    query(root, '[data-open-write]').addEventListener('click', () => {
      if (this.writeWin.hidden) this.openWrite();
      else this.closeWindow(this.writeWin);
    });
    for (const win of this.windows) {
      win.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => this.closeWindow(win)));
    }

    this.writeText.addEventListener('input', () => {
      const n = this.writeText.value.length;
      this.writeCount.textContent = `${n}/${LETTER_MAX}`;
      this.writeError.hidden = true;
      this.updateSendButton();
    });
    query(this.readWin, '[data-read-done]').addEventListener('click', () => {
      if (this.readFromRanking) this.openRanking();
      else this.closeWindow(this.readWin);
    });
    query(this.rankWin, '[data-ranking-list]').addEventListener('click', (e) => {
      const item = (e.target as HTMLElement).closest<HTMLElement>('[data-rank]');
      if (item) this.openRanked(Number(item.dataset.rank));
    });
    this.voteBtns = [...this.readWin.querySelectorAll<HTMLButtonElement>('[data-vote-dir]')];
    for (const btn of this.voteBtns) {
      btn.addEventListener('click', () => this.toggleVote(btn.dataset.voteDir === 'up' ? 1 : -1));
    }
    this.sendBtn.addEventListener('click', () => void this.send());
    this.refreshReceived();
    setInterval(() => this.refreshReceived(), RECEIVED_REFRESH_MS);
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      for (const win of this.windows) this.closeWindow(win);
    });

    this.updateClock(new Date());
  }

  /** Called with the letter's text once the backend has accepted it. */
  onLetterSent(handler: (text: string) => void): void {
    this.sentHandler = handler;
  }

  /** Shows a letter picked up from the floor and how much humour it cost. */
  openLetter(letter: ReadableLetter, moodCost: number): void {
    this.showLetter(letter, `Ánimo −${moodCost}`, false);
  }

  /** A letter from the weekly ranking, read in full. Costs no Ánimo: it isn't picked up from the floor. */
  private openRanked(index: number): void {
    const l = this.ranked[index];
    if (!l) return;
    this.showLetter({ id: l.id, text: l.body, from: 'Remitente desconocido' }, `#${index + 1} de la semana`, true);
  }

  private showLetter(letter: ReadableLetter, note: string, fromRanking: boolean): void {
    this.reading = letter;
    this.readFromRanking = fromRanking;
    query(this.readWin, '[data-letter-text]').textContent = letter.text;
    query(this.readWin, '[data-letter-from]').textContent = `— ${letter.from}`;
    query(this.readWin, '[data-read-done]').textContent = fromRanking ? 'Volver' : 'Cerrar';
    this.setReadNote(note);
    query(this.readWin, '[data-cost]').classList.toggle('is-rank', fromRanking);
    query(this.readWin, '[data-vote]').hidden = !letter.id;
    this.showVote(letter.id ? myVote(letter.id) : 0);
    this.showWindow(this.readWin);
  }

  openInfo(): void {
    this.showWindow(this.infoWin);
  }

  openRanking(): void {
    const list = query(this.rankWin, '[data-ranking-list]');
    list.innerHTML = '<li class="ranking-empty">Cargando…</li>';
    this.showWindow(this.rankWin);
    topLetters()
      .then((letters) => {
        this.ranked = letters;
        list.innerHTML = letters.length
          ? letters
              .map(
                (l, i) =>
                  `<li><button type="button" class="ranking-item" data-rank="${i}" aria-label="Leer la carta ${i + 1}"><span class="medal medal-${Math.min(i + 1, 4)}">${i + 1}</span><p>${escapeHtml(l.body)}</p><b class="score">▲ ${l.score}</b></button></li>`,
              )
              .join('')
          : '<li class="ranking-empty">Todavía no hay cartas votadas esta semana.</li>';
      })
      .catch((err) => {
        list.innerHTML = `<li class="ranking-empty">${escapeHtml(err instanceof ApiError ? err.message : 'No se pudo cargar el ranking.')}</li>`;
      });
  }

  private openWrite(): void {
    this.writeText.value = '';
    this.honeypot.value = '';
    this.writeText.dispatchEvent(new Event('input'));
    this.writeOpenedAt = performance.now();
    this.showWindow(this.writeWin);
    this.writeText.focus();
  }

  private updateSendButton(): void {
    this.sendBtn.disabled = this.sending || this.writeText.value.trim().length < LETTER_MIN;
    this.sendBtn.textContent = this.sending ? 'Enviando…' : 'Enviar';
  }

  private refreshReceived(): void {
    receivedCount()
      .then((n) => (this.receivedEl.textContent = n.toLocaleString('es-ES')))
      .catch(() => {});
  }

  private async send(): Promise<void> {
    const text = this.writeText.value.trim();
    if (text.length < LETTER_MIN || this.sending) return;
    this.sending = true;
    this.updateSendButton();
    try {
      await submitLetter({ body: text, website: this.honeypot.value, elapsedMs: Math.round(performance.now() - this.writeOpenedAt) });
      this.closeWindow(this.writeWin);
      this.sentHandler?.(text);
      this.refreshReceived();
    } catch (err) {
      this.writeError.textContent = err instanceof ApiError ? err.message : 'No se pudo enviar la carta.';
      this.writeError.hidden = false;
    } finally {
      this.sending = false;
      this.updateSendButton();
    }
  }

  private showVote(value: VoteValue): void {
    for (const b of this.voteBtns) {
      const dir = b.dataset.voteDir === 'up' ? 1 : -1;
      b.setAttribute('aria-pressed', String(value === dir));
    }
  }

  private setReadNote(text: string, error = false): void {
    const el = query(this.readWin, '[data-cost]');
    el.textContent = text;
    el.classList.toggle('is-error', error);
    if (error) el.classList.remove('is-rank');
  }

  /** Optimistic: shows the vote right away and rolls back if the backend refuses it. */
  private async toggleVote(dir: 1 | -1): Promise<void> {
    const letter = this.reading;
    if (!letter?.id) return;
    const before = myVote(letter.id);
    const next: VoteValue = before === dir ? 0 : dir;
    this.showVote(next);
    try {
      await vote(letter.id, next);
    } catch (err) {
      if (this.reading === letter) {
        this.showVote(before);
        this.setReadNote(err instanceof ApiError ? err.message : 'No se pudo votar.', true);
      }
    }
  }

  private showWindow(win: HTMLElement): void {
    for (const other of this.windows) if (other !== win) this.closeWindow(other);
    win.hidden = false;
    this.root.classList.add('window-open');
  }

  private closeWindow(win: HTMLElement): void {
    if (win.hidden) return;
    win.hidden = true;
    if (win === this.writeWin) this.writeText.blur();
    if (this.windows.every((w) => w.hidden)) this.root.classList.remove('window-open');
  }

  /** Screen rectangle (relative to the HUD root) the room is centred and fitted into. */
  stageRect(): Bounds {
    const r = this.stage.getBoundingClientRect();
    const base = this.root.getBoundingClientRect();
    return { x: r.left - base.left, y: r.top - base.top, w: r.width, h: r.height };
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
