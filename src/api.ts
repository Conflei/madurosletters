import { API_URL } from './config';

export interface RemoteLetter {
  id: string;
  body: string;
}

export interface TopLetter extends RemoteLetter {
  score: number;
  upvotes: number;
  downvotes: number;
}

export interface LetterDraft {
  body: string;
  /** Honeypot: a field people never see. Anything in it means a bot filled the form. */
  website: string;
  /** Time between opening the writing pad and sending. */
  elapsedMs: number;
}

export type VoteValue = -1 | 0 | 1;

export class ApiError extends Error {}

const DEVICE_KEY = 'ml.device';
const VOTES_KEY = 'ml.votes';

/** Anonymous per-browser id, used for rate limits and one vote per letter. */
function deviceId(): string {
  let id = localStorage.getItem(DEVICE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, id);
  }
  return id;
}

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('No se pudo conectar. Revisa tu conexión.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new ApiError(data?.error ?? 'Algo salió mal. Inténtalo de nuevo.');
  return data as T;
}

export async function submitLetter(draft: LetterDraft): Promise<void> {
  await request('POST', '/letters', { ...draft, deviceId: deviceId() });
}

export async function topLetters(): Promise<TopLetter[]> {
  return (await request<{ letters: TopLetter[] }>('GET', '/letters/top')).letters;
}

export async function randomLetters(): Promise<RemoteLetter[]> {
  return (await request<{ letters: RemoteLetter[] }>('GET', '/letters/random')).letters;
}

function storedVotes(): Record<string, VoteValue> {
  try {
    return JSON.parse(localStorage.getItem(VOTES_KEY) ?? '{}');
  } catch {
    return {};
  }
}

export function myVote(letterId: string): VoteValue {
  return storedVotes()[letterId] ?? 0;
}

export async function vote(letterId: string, value: VoteValue): Promise<void> {
  await request('POST', '/votes', { letterId, deviceId: deviceId(), value });
  const votes = storedVotes();
  if (value === 0) delete votes[letterId];
  else votes[letterId] = value;
  localStorage.setItem(VOTES_KEY, JSON.stringify(votes));
}
