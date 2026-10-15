// Accounts are identified by a unique name + password and live on the server
// (server/api.ts, a JSON list of users) when one is reachable. The device also keeps
// the password hash so a known user can sign in offline. Without a server at all
// (static hosting such as GitHub Pages, or a build with VITE_API_URL=none) accounts
// are created and kept on the device only. A guest uses the app with no account at
// all: the profile carries `guest`, progress stays on the device, and the guest can
// turn into an account later (register keeps the data).
import { hashPassword, makeSalt, normalizeLogin, verifyPassword, type RegistrationInput } from '@/lib/auth.ts';
import { trialSubscription } from '@/lib/subscription.ts';
import { db, type Account, type Profile } from './db.ts';
import { DEFAULT_PROFILE, getProfile, updateProfile } from './profile.ts';
import { sync } from './sync.ts';

const SESSION_KEY = 'session';
export const TOKEN_KEY = 'token';
/** 'server' once the API has answered, 'local' once we learnt there is no API behind this site. */
export const API_MODE_KEY = 'apiMode';
export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '/api').replace(/\/$/, '');
/** Build-time switch for static hosting: no account server, nothing is sent anywhere. */
export const LOCAL_ONLY = API_URL === 'none';
export const GUEST_NAME = 'Гость';
const NO_CONNECTION = 'Сервер аккаунтов недоступен. Проверьте интернет или запуск сервера и попробуйте снова.';
const WRONG_LOGIN = 'Неверное имя или пароль.';

interface ApiResult {
  ok: boolean;
  status: number;
  data: { token?: string; user?: { name: string }; error?: string; available?: boolean };
  /** True when there is no API behind this site at all (static hosting). */
  absent?: boolean;
}

async function call(path: string, body: unknown, token?: string): Promise<ApiResult> {
  if (LOCAL_ONLY) return { ok: false, status: 0, data: {}, absent: true };
  const res = await fetch(`${API_URL}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const isJson = (res.headers.get('content-type') ?? '').includes('json');
  // A static host answers /api/... with its 404 page (HTML): there is no server here.
  if (!isJson && (res.status === 404 || res.status === 405 || res.status === 200)) return { ok: false, status: res.status, data: {}, absent: true };
  const data = (await res.json().catch(() => ({}))) as ApiResult['data'];
  // 502/504 from a proxy or 500 without a JSON body mean the API itself is down.
  if (res.status >= 500 && !data.error) throw new Error(NO_CONNECTION);
  return { ok: res.ok, status: res.status, data };
}

export async function getAccount(): Promise<Account | null> {
  const account = (await db.profile.get('me'))?.account ?? null;
  if (!account) return null;
  // Accounts stored before names replaced e-mails: the e-mail stays the login.
  const legacy = account as Account & { email?: string };
  return account.login ? account : { ...account, login: (legacy.email ?? '').toLowerCase() };
}

export async function getToken(): Promise<string | null> {
  const row = await db.meta.get(TOKEN_KEY);
  return row ? String(row.value) : null;
}

export const isGuest = (profile: Profile | null | undefined) => Boolean(profile?.guest) && !profile?.account;

/** Wipe local progress when a different person signs in on this device. */
async function clearLocalData(): Promise<void> {
  await db.transaction('rw', [db.profile, db.topics, db.attempts, db.cards, db.notes, db.duels, db.meta], async () => {
    await Promise.all([db.profile.clear(), db.topics.clear(), db.attempts.clear(), db.cards.clear(), db.notes.clear(), db.duels.clear(), db.meta.clear()]);
    await db.profile.put(DEFAULT_PROFILE);
  });
}

interface SessionOpts {
  /** A brand-new account: gift the first month on the max plan. */
  fresh?: boolean;
  /** A guest turning into an account keeps everything done so far. */
  keepData?: boolean;
}

async function openSession(login: string, name: string | undefined, password: string, token: string | null, opts: SessionOpts = {}): Promise<void> {
  const before = await getProfile();
  const existing = await getAccount();
  const sameAccount = existing?.login === login;
  const otherPerson = (existing !== null && !sameAccount) || (Boolean(before.guest) && !opts.keepData);
  if (otherPerson) await clearLocalData();
  const salt = makeSalt();
  // A converted guest keeps the gift's clock: the trial counts from the day the guest started.
  const createdAt = sameAccount ? existing!.createdAt : opts.keepData && before.guest ? before.guest.since : Date.now();
  const account: Account = { login, salt, hash: await hashPassword(password, salt), createdAt };
  await getProfile();
  await updateProfile({
    ...(name === undefined ? {} : { name }),
    account,
    guest: undefined,
    ...(opts.fresh ? { subscription: trialSubscription(account.createdAt) } : {}),
  });
  // Signing in on a device that did not hold this account: the server's profile must win the
  // first merge, so the local stub is stamped as the oldest possible version.
  const newDevice = token !== null && !opts.fresh && !sameAccount;
  if (newDevice) await db.profile.update('me', { updatedAt: 1 });
  await db.meta.put({ key: API_MODE_KEY, value: token ? 'server' : 'local' });
  if (token) {
    await db.meta.put({ key: TOKEN_KEY, value: token });
    await db.meta.put({ key: 'lastSync', value: 0 }); // push everything, including a guest's history
  }
  if (newDevice) await sync().catch(() => undefined); // pull the account's progress before the first screen
  await db.meta.put({ key: SESSION_KEY, value: 1 });
  if (token && !newDevice) void sync();
}

/** Use the app without an account: progress stays on this device until the guest registers. */
export async function startGuest(): Promise<void> {
  const before = await getProfile();
  if (before.account) throw new Error('На этом устройстве уже есть аккаунт. Войдите в него.');
  const now = Date.now();
  await updateProfile({ name: GUEST_NAME, guest: { since: now }, subscription: trialSubscription(now) });
  await db.meta.put({ key: API_MODE_KEY, value: 'local' });
  await db.meta.put({ key: SESSION_KEY, value: 1 });
}

/** Instant feedback for the registration form; 'unknown' when no server can answer. */
export async function checkName(name: string): Promise<{ status: 'free' | 'taken' | 'unknown'; error?: string }> {
  try {
    const res = await call('check', { name });
    if (res.absent || !res.ok) return { status: 'unknown' };
    return res.data.available ? { status: 'free' } : { status: 'taken', error: res.data.error };
  } catch {
    return { status: 'unknown' };
  }
}

export async function register(input: RegistrationInput): Promise<void> {
  const name = input.name.normalize('NFC').trim().replace(/\s+/g, ' ');
  const login = normalizeLogin(name);
  const before = await getProfile();
  const keepData = isGuest(before);
  let res: ApiResult;
  try {
    res = await call('register', { name, password: input.password });
  } catch {
    throw new Error(NO_CONNECTION);
  }
  if (res.absent) {
    // No account server behind this site: the account lives on this device only, one per device.
    if (before.account) throw new Error('На этом устройстве уже есть аккаунт. Войдите в него.');
    await openSession(login, name, input.password, null, { fresh: !keepData, keepData });
    return;
  }
  if (!res.ok || !res.data.token) throw new Error(res.data.error ?? 'Не удалось создать аккаунт.');
  await openSession(login, name, input.password, res.data.token, { fresh: !keepData, keepData });
}

const FAIL_DELAY_MS = 800;
let failures = 0;

/** Sign in against the account kept on this device (offline, or no server at all). */
async function loginLocally(login: string, password: string, errorText: string): Promise<void> {
  const local = await getAccount();
  const ok = !!local && local.login === login && (await verifyPassword(password, local.salt, local.hash));
  if (!ok) {
    failures += 1;
    await new Promise((r) => setTimeout(r, FAIL_DELAY_MS * Math.min(failures, 5)));
    throw new Error(errorText);
  }
  failures = 0;
  await db.meta.put({ key: SESSION_KEY, value: 1 });
}

export async function login(nameRaw: string, password: string): Promise<void> {
  const login = normalizeLogin(nameRaw);
  let res: ApiResult | null = null;
  try {
    res = await call('login', { name: nameRaw, password });
  } catch {
    res = null; // configured server is down: fall back to the account known on this device
  }
  if (res === null) return loginLocally(login, password, NO_CONNECTION);
  if (res.absent) {
    await db.meta.put({ key: API_MODE_KEY, value: 'local' });
    return loginLocally(login, password, WRONG_LOGIN);
  }
  if (!res.ok || !res.data.token) {
    // Growing delay after each failed attempt makes guessing on a shared device impractical.
    failures += 1;
    await new Promise((r) => setTimeout(r, FAIL_DELAY_MS * Math.min(failures, 5)));
    throw new Error(res.data.error ?? WRONG_LOGIN);
  }
  failures = 0;
  await openSession(login, res.data.user?.name, password, res.data.token);
}

export async function logout(): Promise<void> {
  const token = await getToken();
  if (token) {
    await sync().catch(() => undefined);
    call('logout', {}, token).catch(() => undefined);
  }
  await db.meta.delete(TOKEN_KEY);
  await db.meta.put({ key: SESSION_KEY, value: 0 });
}

export async function isSignedIn(): Promise<boolean> {
  return (await db.meta.get(SESSION_KEY))?.value === 1;
}
