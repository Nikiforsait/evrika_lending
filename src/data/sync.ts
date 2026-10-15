// Delta sync with the account server (server/api.ts, endpoint `${API}/sync`).
// Runs only while a session token exists; otherwise the app stays local. Conflict rules:
//   * attempts and notes are append-only facts → union by id;
//   * profile progress takes the maximum (XP, streak, best) so progress is never lost;
//   * everything else is last-writer-wins by updatedAt.
import { db, type Attempt, type CardState, type Duel, type Note, type Profile, type TopicState } from './db.ts';

const API = ((import.meta.env.VITE_API_URL as string | undefined) ?? '/api').replace(/\/$/, '');
const ENDPOINT = `${API}/sync`;

export interface SyncPayload {
  since: number;
  profile?: Profile;
  topics: TopicState[];
  cards: CardState[];
  duels: Duel[];
  attempts: Attempt[];
  notes: Note[];
}

/** Progress is synced whenever the device holds a session token. */
export async function syncEnabled(): Promise<boolean> {
  return Boolean(await token());
}

async function token(): Promise<string | null> {
  const row = await db.meta.get('token');
  return row ? String(row.value) : null;
}

async function collect(since: number): Promise<SyncPayload> {
  const profile = await db.profile.get('me');
  return {
    since,
    profile: profile && profile.updatedAt > since ? profile : undefined,
    topics: await db.topics.where('updatedAt').above(since).toArray(),
    cards: await db.cards.where('updatedAt').above(since).toArray(),
    duels: await db.duels.where('updatedAt').above(since).toArray(),
    attempts: await db.attempts.where('ts').above(since).toArray(),
    notes: await db.notes.where('createdAt').above(since).toArray(),
  };
}

function mergeProfile(local: Profile | undefined, remote: Profile): Profile {
  if (!local) return remote;
  const newer = remote.updatedAt > local.updatedAt ? remote : local;
  return {
    ...newer,
    xp: Math.max(local.xp, remote.xp),
    best: Math.max(local.best, remote.best),
    streak: Math.max(local.streak, remote.streak),
    activeDays: [...new Set([...local.activeDays, ...remote.activeDays])].sort(),
    diagnosticHistory: mergeHistory(local.diagnosticHistory, remote.diagnosticHistory),
  };
}

/** Union of diagnostic runs from both devices, keyed by date + score, oldest first. */
function mergeHistory(a: Profile['diagnosticHistory'] = [], b: Profile['diagnosticHistory'] = []) {
  const byKey = new Map([...a, ...b].map((r) => [r.takenAt ?? `${r.date}|${r.correct}|${r.predicted}`, r]));
  const order = (r: { date: string; takenAt?: number }) => r.takenAt ?? new Date(r.date).getTime();
  return [...byKey.values()].sort((x, y) => order(x) - order(y)).slice(-12);
}

async function putNewer<T extends { updatedAt: number }>(
  rows: T[],
  get: (row: T) => Promise<T | undefined>,
  put: (row: T) => Promise<unknown>,
) {
  for (const row of rows) {
    const local = await get(row);
    if (!local || row.updatedAt > local.updatedAt) await put(row);
  }
}

async function apply(remote: SyncPayload): Promise<void> {
  await db.transaction('rw', [db.profile, db.topics, db.cards, db.duels, db.attempts, db.notes], async () => {
    if (remote.profile) await db.profile.put(mergeProfile(await db.profile.get('me'), remote.profile));
    await putNewer(remote.topics, (r) => db.topics.get(r.topicId), (r) => db.topics.put(r));
    await putNewer(remote.cards, (r) => db.cards.get(r.id), (r) => db.cards.put(r));
    await putNewer(remote.duels, (r) => db.duels.get(r.id), (r) => db.duels.put(r));
    await db.attempts.bulkPut(remote.attempts);
    await db.notes.bulkPut(remote.notes);
  });
}

/** The server accepts at most 5 000 rows per request; a long guest history is pushed in slices. */
const MAX_PUSH_ROWS = 4000;

/** Split one payload into request-sized pieces; only the first carries the profile and the small tables. */
function slices(payload: SyncPayload): SyncPayload[] {
  const small = payload.topics.length + payload.cards.length + payload.duels.length;
  const big = [...payload.attempts.map((row) => ({ table: 'attempts' as const, row })), ...payload.notes.map((row) => ({ table: 'notes' as const, row }))];
  if (small + big.length <= MAX_PUSH_ROWS) return [payload];
  const out: SyncPayload[] = [];
  let first = true;
  for (let i = 0; i < big.length || first; ) {
    const room = MAX_PUSH_ROWS - (first ? small : 0);
    const piece = big.slice(i, i + room);
    i += room;
    out.push({
      since: payload.since,
      profile: first ? payload.profile : undefined,
      topics: first ? payload.topics : [],
      cards: first ? payload.cards : [],
      duels: first ? payload.duels : [],
      attempts: piece.filter((p) => p.table === 'attempts').map((p) => p.row as Attempt),
      notes: piece.filter((p) => p.table === 'notes').map((p) => p.row as Note),
    });
    first = false;
  }
  return out;
}

/** Push local changes and pull remote ones. Safe to call often; no-op offline. */
export async function sync(): Promise<'skipped' | 'ok' | 'error'> {
  const bearer = await token();
  if (!bearer || !navigator.onLine) return 'skipped';
  const since = Number((await db.meta.get('lastSync'))?.value ?? 0);
  try {
    let now = since;
    const pieces = slices(await collect(since));
    for (const [index, piece] of pieces.entries()) {
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${bearer}` },
        body: JSON.stringify(piece),
      });
      if (res.status === 401) {
        await db.meta.delete('token'); // the session was revoked; the next sign-in issues a new token
        return 'error';
      }
      if (!res.ok) return 'error';
      const body = (await res.json()) as { now: number; changes: SyncPayload };
      if (index === 0) await apply(body.changes); // later pieces only push; the pull is the same data
      now = body.now;
    }
    await db.meta.put({ key: 'lastSync', value: now });
    return 'ok';
  } catch {
    return 'error';
  }
}

export function startAutoSync(intervalMs = 2 * 60_000): () => void {
  const run = () => void sync();
  run();
  window.addEventListener('online', run);
  const timer = window.setInterval(run, intervalMs);
  return () => {
    window.removeEventListener('online', run);
    window.clearInterval(timer);
  };
}
