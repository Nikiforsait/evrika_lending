// Account and progress API on top of a JSON list of users (Fetch-API handler,
// runtime-agnostic). Each user record holds: login (the unique name in lower case),
// display name, password hash (never the password itself), session tokens and the
// synced progress snapshot.
import { hashPassword, makeSalt, normalizeLogin, timingSafeEqual, validateRegistration, verifyPassword } from '../src/lib/auth.ts';
import { handleSync, MAX_BODY_BYTES, type Store } from './sync-handler.ts';

export interface UserRecord {
  id: string;
  /** Unique, normalised name used to sign in. */
  login: string;
  /** Name as the learner typed it. */
  name: string;
  salt: string;
  hash: string;
  createdAt: number;
  tokens: { token: string; createdAt: number }[];
  /** Serialized sync snapshot (see sync-handler.ts); null until the first sync. */
  progress: string | null;
}

export interface UserDb {
  users: UserRecord[];
  /** Called after every change so the host can write the list to disk. */
  persist(): Promise<void>;
}

const MAX_TOKENS = 10;
const MAX_FAILS = 10;
const FAIL_WINDOW_MS = 15 * 60_000;
const failures = new Map<string, { count: number; first: number }>();
/** Simple per-client budgets for the unauthenticated endpoints. */
const CHECKS_PER_MINUTE = 60;
const REGISTRATIONS_PER_HOUR = 60;
/** The limiter maps are cleared when they grow past this many keys, so a flood cannot exhaust memory. */
const MAX_LIMITER_KEYS = 10_000;
const usage = new Map<string, { count: number; first: number }>();

function overBudget(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  if (usage.size > MAX_LIMITER_KEYS) usage.clear();
  const u = usage.get(key);
  if (!u || now - u.first > windowMs) {
    usage.set(key, { count: 1, first: now });
    return false;
  }
  u.count += 1;
  return u.count > max;
}

const json = (data: unknown, status = 200) => Response.json(data, { status });
const fail = (error: string, status: number) => json({ error }, status);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
export const NAME_TAKEN = 'Это имя уже занято. Выберите другое или войдите в свой аккаунт.';

const randomHex = (bytes: number) => {
  const buf = new Uint8Array(bytes);
  globalThis.crypto.getRandomValues(buf);
  return [...buf].map((b) => b.toString(16).padStart(2, '0')).join('');
};

async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const length = Number(req.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_BYTES) return null;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return null;
    const parsed: unknown = JSON.parse(text);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function tooManyFailures(key: string): boolean {
  const now = Date.now();
  const f = failures.get(key);
  if (!f || now - f.first > FAIL_WINDOW_MS) return false;
  return f.count >= MAX_FAILS;
}

function noteFailure(key: string): void {
  const now = Date.now();
  if (failures.size > MAX_LIMITER_KEYS) failures.clear();
  const f = failures.get(key);
  if (!f || now - f.first > FAIL_WINDOW_MS) failures.set(key, { count: 1, first: now });
  else f.count += 1;
}

function issueToken(user: UserRecord): string {
  const token = randomHex(32);
  user.tokens = [...user.tokens, { token, createdAt: Date.now() }].slice(-MAX_TOKENS);
  return token;
}

function userByToken(db: UserDb, req: Request): UserRecord | null {
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!/^[0-9a-f]{64}$/.test(token)) return null;
  for (const user of db.users) for (const t of user.tokens) if (timingSafeEqual(t.token, token)) return user;
  return null;
}

const findByLogin = (db: UserDb, login: string) => db.users.find((u) => u.login === login);
const publicUser = (u: UserRecord) => ({ name: u.name });

/** Is this name free? Used by the registration form for instant feedback. */
async function check(req: Request, db: UserDb, clientKey: string): Promise<Response> {
  if (overBudget(`check:${clientKey}`, CHECKS_PER_MINUTE, 60_000)) return fail('Слишком много запросов. Попробуйте через минуту.', 429);
  const body = await readJson(req);
  if (!body) return fail('Некорректный запрос.', 400);
  const name = str(body.name);
  const error = validateRegistration({ name, password: 'check-only-1' }).name;
  if (error) return json({ available: false, error });
  const taken = Boolean(findByLogin(db, normalizeLogin(name)));
  return json({ available: !taken, ...(taken ? { error: NAME_TAKEN } : {}) });
}

async function register(req: Request, db: UserDb, clientKey: string): Promise<Response> {
  if (overBudget(`register:${clientKey}`, REGISTRATIONS_PER_HOUR, 60 * 60_000)) return fail('Слишком много регистраций с этого адреса. Попробуйте позже.', 429);
  const body = await readJson(req);
  if (!body) return fail('Некорректный запрос.', 400);
  const input = { name: str(body.name), password: str(body.password) };
  const errors = validateRegistration(input);
  const first = Object.values(errors)[0];
  if (first) return fail(first, 400);
  const login = normalizeLogin(input.name);
  if (findByLogin(db, login)) return fail(NAME_TAKEN, 409);
  const salt = makeSalt();
  const user: UserRecord = {
    id: randomHex(12),
    login,
    name: input.name.normalize('NFC').trim().replace(/\s+/g, ' '),
    salt,
    hash: await hashPassword(input.password, salt),
    createdAt: Date.now(),
    tokens: [],
    progress: null,
  };
  // Hashing takes a moment: another request may have taken the name meanwhile.
  if (findByLogin(db, login)) return fail(NAME_TAKEN, 409);
  const token = issueToken(user);
  db.users.push(user);
  await db.persist();
  return json({ token, user: publicUser(user) }, 201);
}

async function login(req: Request, db: UserDb, clientKey: string): Promise<Response> {
  const body = await readJson(req);
  if (!body) return fail('Некорректный запрос.', 400);
  const loginName = normalizeLogin(str(body.name).slice(0, 64));
  const password = str(body.password);
  if (tooManyFailures(clientKey) || tooManyFailures(`login:${loginName}`)) return fail('Слишком много попыток. Попробуйте через 15 минут.', 429);
  const user = findByLogin(db, loginName);
  // Always run the hash so a missing account takes as long as a wrong password.
  const ok = user ? await verifyPassword(password, user.salt, user.hash) : (await hashPassword(password, 'dummy'), false);
  if (!ok || !user) {
    noteFailure(clientKey);
    noteFailure(`login:${loginName}`);
    return fail('Неверное имя или пароль.', 401);
  }
  const token = issueToken(user);
  await db.persist();
  return json({ token, user: publicUser(user) });
}

async function logout(req: Request, db: UserDb): Promise<Response> {
  const user = userByToken(db, req);
  if (user) {
    const token = (req.headers.get('authorization') ?? '').slice(7).trim();
    user.tokens = user.tokens.filter((t) => t.token !== token);
    await db.persist();
  }
  return json({ ok: true });
}

async function sync(req: Request, db: UserDb): Promise<Response> {
  const user = userByToken(db, req);
  if (!user) return fail('Нужно войти в аккаунт.', 401);
  const store: Store = {
    get: async () => user.progress,
    put: async (_key, value) => {
      user.progress = value;
    },
  };
  // The learner id is set by the server from the verified token; the client cannot choose it.
  const inner = new Request(req.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'content-length': req.headers.get('content-length') ?? '', 'X-Learner-Id': user.id },
    body: await req.text(),
  });
  const res = await handleSync(inner, store);
  if (res.ok) await db.persist();
  return res;
}

/** Route `/api/...` requests. `clientKey` identifies the caller for rate limiting (e.g. the IP). */
export async function handleApi(req: Request, db: UserDb, clientKey = 'anon'): Promise<Response> {
  const path = new URL(req.url).pathname.replace(/\/+$/, '');
  if (req.method !== 'POST') return fail('Method not allowed', 405);
  switch (path) {
    case '/api/check':
      return check(req, db, clientKey);
    case '/api/register':
      return register(req, db, clientKey);
    case '/api/login':
      return login(req, db, clientKey);
    case '/api/logout':
      return logout(req, db);
    case '/api/sync':
      return sync(req, db);
    case '/api/pay/create':
      // Payment stub. Connect a provider here (see docs/ПОДПИСКИ.md): create a payment for the
      // plan from the body, return { url } of the provider's checkout page, and activate the plan
      // for the user in a webhook handler once the provider confirms the payment.
      return userByToken(db, req) ? fail('Оплата ещё не подключена.', 501) : fail('Нужно войти в аккаунт.', 401);
    default:
      return fail('Not found', 404);
  }
}
