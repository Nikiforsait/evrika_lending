import { describe, expect, it } from 'vitest';
import { handleApi, type UserDb } from './api.ts';

const BASE = 'http://localhost/api';
const post = (path: string, body: unknown, token?: string) =>
  new Request(`${BASE}/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

function makeDb(): UserDb & { saves: number } {
  const db = { users: [], saves: 0, persist: async () => void (db.saves += 1) } as UserDb & { saves: number };
  return db;
}

describe('account API over a JSON user list', () => {
  it('registers by a unique name, logs in and syncs progress', async () => {
    const db = makeDb();
    const reg = await handleApi(post('register', { name: 'Маша  Иванова', password: 'abc12345' }), db);
    expect(reg.status).toBe(201);
    const { token, user } = (await reg.json()) as { token: string; user: { name: string } };
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    expect(user).toEqual({ name: 'Маша Иванова' });
    expect(db.users).toHaveLength(1);
    expect(db.users[0]).toMatchObject({ login: 'маша иванова', name: 'Маша Иванова' });
    expect(db.users[0]!.hash).not.toContain('abc12345');
    expect(db.saves).toBe(1);

    // the same name in another case or spacing is the same account
    const dup = await handleApi(post('register', { name: 'МАША ИВАНОВА', password: 'abc12345' }), db);
    expect(dup.status).toBe(409);
    const free = (await (await handleApi(post('check', { name: 'Петя' }), db)).json()) as { available: boolean };
    expect(free.available).toBe(true);
    const taken = (await (await handleApi(post('check', { name: ' маша иванова ' }), db)).json()) as { available: boolean };
    expect(taken.available).toBe(false);

    const bad = await handleApi(post('login', { name: 'Маша Иванова', password: 'wrong1234' }), db);
    expect(bad.status).toBe(401);
    const good = await handleApi(post('login', { name: 'маша иванова', password: 'abc12345' }), db);
    expect(good.status).toBe(200);
    const { token: token2 } = (await good.json()) as { token: string };

    const push = await handleApi(post('sync', { since: 0, topics: [{ topicId: 't6', mastery: 0.5, updatedAt: 5 }] }, token2), db);
    expect(push.status).toBe(200);
    expect(db.users[0]!.progress).toContain('"t6"');

    const pull = await handleApi(post('sync', { since: 0 }, token), db);
    const body = (await pull.json()) as { changes: { topics: { topicId: string }[] } };
    expect(body.changes.topics.map((t) => t.topicId)).toEqual(['t6']);
  });

  it('rejects sync without a valid token and unknown routes', async () => {
    const db = makeDb();
    expect((await handleApi(post('sync', { since: 0 }, 'f'.repeat(64)), db)).status).toBe(401);
    expect((await handleApi(post('sync', { since: 0 }), db)).status).toBe(401);
    expect((await handleApi(post('nope', {}), db)).status).toBe(404);
    expect((await handleApi(new Request(`${BASE}/login`), db)).status).toBe(405);
  });

  it('gives one of two simultaneous registrations of the same name a 409', async () => {
    const db = makeDb();
    const [a, b] = await Promise.all([
      handleApi(post('register', { name: 'Гонка', password: 'abc12345' }), db, 'ip-a'),
      handleApi(post('register', { name: 'гонка', password: 'xyz12345' }), db, 'ip-b'),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 409]);
    expect(db.users).toHaveLength(1);
  });

  it('validates registration input', async () => {
    const db = makeDb();
    const res = await handleApi(post('register', { name: 'A', password: '1' }), db);
    expect(res.status).toBe(400);
    const email = await handleApi(post('register', { name: 'kid@example.com', password: 'abc12345' }), db);
    expect(email.status).toBe(400);
    expect(db.users).toHaveLength(0);
    const invalid = (await (await handleApi(post('check', { name: '...' }), db)).json()) as { available: boolean; error?: string };
    expect(invalid.available).toBe(false);
    expect(invalid.error).toBeTruthy();
  });
});
