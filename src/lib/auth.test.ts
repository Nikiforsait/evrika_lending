import { describe, expect, it } from 'vitest';
import { hashPassword, makeSalt, normalizeLogin, passwordStrength, validateRegistration, verifyPassword } from './auth.ts';

describe('registration', () => {
  it('validates name and password', () => {
    expect(validateRegistration({ name: 'Аня', password: 'abc12345' })).toEqual({});
    expect(validateRegistration({ name: 'Max_2010', password: 'abc12345' })).toEqual({});
    const bad = validateRegistration({ name: 'A', password: 'short' });
    expect(Object.keys(bad).sort()).toEqual(['name', 'password']);
    expect(validateRegistration({ name: 'Аня', password: '12345678' }).password).toBeTruthy();
    expect(validateRegistration({ name: 'a@b.cd', password: 'abc12345' }).name).toBeTruthy();
    expect(validateRegistration({ name: ' '.repeat(3), password: 'abc12345' }).name).toBeTruthy();
    expect(validateRegistration({ name: '._-', password: 'abc12345' }).name).toBeTruthy();
  });
  it('normalises the login form of a name', () => {
    expect(normalizeLogin('  Маша   Иванова ')).toBe('маша иванова');
    expect(normalizeLogin('MAX_2010')).toBe('max_2010');
    expect(normalizeLogin('e\u0301')).toBe('\u00e9'); // combining accent folded into one character
  });
  it('rates password strength', () => {
    expect(passwordStrength('abc')).toBe(0);
    expect(passwordStrength('abc12345')).toBe(2);
    expect(passwordStrength('abc12345!longer')).toBe(3);
  });
  it('hashes with a salt and verifies', async () => {
    const salt = makeSalt();
    const hash = await hashPassword('secret123', salt);
    expect(hash).toHaveLength(64);
    expect(await verifyPassword('secret123', salt, hash)).toBe(true);
    expect(await verifyPassword('secret124', salt, hash)).toBe(false);
    expect(await hashPassword('secret123', makeSalt())).not.toBe(hash);
  });
});
