// Public API for the game. Routes (relative to /functions/v1/api):
//   POST /letters        { body, deviceId, elapsedMs, website }  → { ok, id? }
//   POST /votes          { letterId, deviceId, value: 1 | -1 | 0 } → { ok }
//   GET  /letters/top    → { letters: [{ id, body, score, upvotes, downvotes }] }
//   GET  /letters/feed?exclude=id,id → { letters: [{ id, body }] }  (mixed floor batch)
import { createClient } from 'npm:@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false },
});

const IP_SALT = Deno.env.get('IP_SALT') ?? '';
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? 'https://conflei.github.io,http://localhost:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

const BODY_MIN = 5;
const BODY_MAX = 280;
/** Humans take a while to write; anything faster is a script. */
const MIN_WRITE_MS = 2000;

const LIMITS = {
  lettersPerHour: 10,
  lettersPerDay: 30,
  lettersGlobalPerDay: 2000,
  votesPerHour: 120,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const URL_RE = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|ru|xyz|top|info|biz|ly|me)\b)/i;

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function json(req: Request, status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders(req.headers.get('origin')), 'Content-Type': 'application/json' },
  });
}

const fail = (req: Request, status: number, error: string) => json(req, status, { ok: false, error });

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function clientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-real-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0].trim() ??
    'unknown'
  );
}

const since = (ms: number) => new Date(Date.now() - ms).toISOString();

async function countSince(table: 'letters' | 'votes', column: string, value: string | null, ms: number): Promise<number> {
  let q = supabase.from(table).select('*', { count: 'exact', head: true }).gte('created_at', since(ms));
  if (column && value !== null) q = q.eq(column, value);
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
}

/** Why a letter body is unacceptable, or null if it's fine. */
function rejectReason(body: string): string | null {
  if (body.length < BODY_MIN) return `La carta debe tener al menos ${BODY_MIN} caracteres.`;
  if (body.length > BODY_MAX) return `La carta no puede pasar de ${BODY_MAX} caracteres.`;
  if ((body.match(/\p{L}/gu) ?? []).length < BODY_MIN) return 'La carta necesita algo más de texto.';
  if (/(.)\1{9,}/u.test(body)) return 'La carta tiene demasiados caracteres repetidos.';
  if (URL_RE.test(body)) return 'Las cartas no pueden incluir enlaces.';
  return null;
}

const normalize = (body: string) => body.toLowerCase().replace(/\s+/g, ' ').replace(/[^\p{L}\p{N} ]/gu, '').trim();

async function submitLetter(req: Request): Promise<Response> {
  const input = await req.json().catch(() => null);
  if (!input || typeof input !== 'object') return fail(req, 400, 'Petición no válida.');

  const { website, elapsedMs, deviceId } = input as Record<string, unknown>;
  const body = typeof input.body === 'string' ? input.body.trim().replace(/\n{3,}/g, '\n\n') : '';

  // Honeypot or inhumanly fast: pretend it worked so the bot learns nothing, store nothing.
  if ((typeof website === 'string' && website.length > 0) || typeof elapsedMs !== 'number' || elapsedMs < MIN_WRITE_MS) {
    return json(req, 200, { ok: true });
  }
  if (typeof deviceId !== 'string' || !UUID_RE.test(deviceId)) return fail(req, 400, 'Petición no válida.');

  const reason = rejectReason(body);
  if (reason) return fail(req, 422, reason);

  const ipHash = await sha256(`${IP_SALT}:${clientIp(req)}`);
  const bodyHash = await sha256(normalize(body));

  const [ipHour, ipDay, global, dupes] = await Promise.all([
    countSince('letters', 'ip_hash', ipHash, HOUR),
    countSince('letters', 'ip_hash', ipHash, DAY),
    countSince('letters', '', null, DAY),
    countSince('letters', 'body_hash', bodyHash, 7 * DAY),
  ]);

  if (global >= LIMITS.lettersGlobalPerDay) return fail(req, 503, 'La cárcel está saturada hoy. Vuelve mañana.');
  if (ipHour >= LIMITS.lettersPerHour) {
    return fail(req, 429, 'Has escrito muchas cartas. Espera un rato antes de enviar otra.');
  }
  if (ipDay >= LIMITS.lettersPerDay) {
    return fail(req, 429, 'Ya enviaste el máximo de cartas por hoy. Vuelve mañana.');
  }
  // Repeated text: accept silently without storing a second copy.
  if (dupes > 0) return json(req, 200, { ok: true });

  const { data, error } = await supabase
    .from('letters')
    .insert({
      body,
      body_hash: bodyHash,
      device_id: deviceId,
      ip_hash: ipHash,
      user_agent: req.headers.get('user-agent')?.slice(0, 300) ?? null,
    })
    .select('id')
    .single();
  if (error) throw error;
  return json(req, 201, { ok: true, id: data.id });
}

async function castVote(req: Request): Promise<Response> {
  const input = await req.json().catch(() => null);
  const { letterId, deviceId, value } = (input ?? {}) as Record<string, unknown>;
  if (typeof letterId !== 'string' || !UUID_RE.test(letterId)) return fail(req, 400, 'Petición no válida.');
  if (typeof deviceId !== 'string' || !UUID_RE.test(deviceId)) return fail(req, 400, 'Petición no válida.');
  if (value !== 1 && value !== -1 && value !== 0) return fail(req, 400, 'Petición no válida.');

  const ipHash = await sha256(`${IP_SALT}:${clientIp(req)}`);
  if ((await countSince('votes', 'ip_hash', ipHash, HOUR)) >= LIMITS.votesPerHour) {
    return fail(req, 429, 'Demasiados votos. Espera un rato.');
  }

  const { data: letter, error: findError } = await supabase.from('letters').select('status').eq('id', letterId).maybeSingle();
  if (findError) throw findError;
  if (!letter || (letter.status !== 'approved' && letter.status !== 'printed')) return fail(req, 404, 'Carta no encontrada.');

  if (value === 0) {
    const { error } = await supabase.from('votes').delete().eq('letter_id', letterId).eq('ip_hash', ipHash);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('votes')
      .upsert(
        { letter_id: letterId, device_id: deviceId, ip_hash: ipHash, value, created_at: new Date().toISOString() },
        { onConflict: 'letter_id,ip_hash' },
      );
    if (error) throw error;
  }
  return json(req, 200, { ok: true });
}

async function topLetters(req: Request): Promise<Response> {
  const { data, error } = await supabase.rpc('top_letters_week', { max_results: 10 });
  if (error) throw error;
  return json(req, 200, { letters: data ?? [] });
}

/** Letters the client already has on screen this session, so a refill brings new ones. */
const MAX_EXCLUDE = 60;

async function feedLetters(req: Request): Promise<Response> {
  const exclude = (new URL(req.url).searchParams.get('exclude') ?? '')
    .split(',')
    .filter((id) => UUID_RE.test(id))
    .slice(0, MAX_EXCLUDE);
  const ipHash = await sha256(`${IP_SALT}:${clientIp(req)}`);
  const { data, error } = await supabase.rpc('feed_letters', { viewer_ip: ipHash, exclude_ids: exclude });
  if (error) throw error;
  return json(req, 200, { letters: data ?? [] });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(req.headers.get('origin')) });

  const path = new URL(req.url).pathname.replace(/^.*\/api/, '').replace(/\/+$/, '') || '/';
  try {
    if (req.method === 'POST' && path === '/letters') return await submitLetter(req);
    if (req.method === 'POST' && path === '/votes') return await castVote(req);
    if (req.method === 'GET' && path === '/letters/top') return await topLetters(req);
    // `/letters/random` is what clients cached before the feed existed.
    if (req.method === 'GET' && (path === '/letters/feed' || path === '/letters/random')) return await feedLetters(req);
    return fail(req, 404, 'Ruta no encontrada.');
  } catch (err) {
    console.error(err);
    return fail(req, 500, 'Error del servidor. Inténtalo de nuevo.');
  }
});
