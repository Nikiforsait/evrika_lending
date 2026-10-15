import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Immersive } from '@/components/layout/AppShell.tsx';
import { Button } from '@/components/primitives/Button.tsx';
import { Card } from '@/components/primitives/Card.tsx';
import { TextField } from '@/components/primitives/TextField.tsx';
import { isGuest, login } from '@/data/auth.ts';
import { useProfile } from '@/hooks/data.ts';

export default function LoginPage() {
  const profile = useProfile();
  const guest = isGuest(profile);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !password) {
      setError('Введите имя и пароль.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await login(name, password);
      // Signed in: AuthGate redirects to the start test or the home page.
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Immersive>
      <Card as="section" aria-labelledby="login-title" glow="strong" className="w-full max-w-md p-6 sm:p-8">
        <p className="text-sm text-muted">Эврика</p>
        <h1 id="login-title" className="mt-1 font-display text-2xl font-bold">
          С возвращением
        </h1>
        {guest && <p className="mt-2 text-[15px] text-muted">Вход в аккаунт заменит гостевой прогресс на этом устройстве.</p>}
        <form onSubmit={(e) => void submit(e)} noValidate className="mt-6 space-y-4">
          <TextField label="Имя" autoComplete="username" maxLength={64} value={name} onChange={setName} placeholder="Имя (для старых аккаунтов — почта)" />
          <TextField label="Пароль" secret autoComplete="current-password" value={password} onChange={setPassword} />
          {error && (
            <p role="alert" className="rounded-inner bg-pink/10 px-4 py-3 text-[15px] text-[#fbcfe8] ring-1 ring-pink/50">
              {error}
            </p>
          )}
          <Button type="submit" full disabled={busy}>
            {busy ? 'Входим…' : 'Войти'}
          </Button>
        </form>
        <p className="mt-5 text-center text-sm text-muted">
          Нет аккаунта?{' '}
          <Link to="/register" className="font-semibold text-[#e879f9] underline-offset-4 hover:underline">
            Создать
          </Link>
        </p>
        {guest && (
          <p className="mt-2 text-center text-sm">
            <Link to="/" className="font-semibold text-muted underline-offset-4 hover:underline">
              Вернуться к гостевому режиму
            </Link>
          </p>
        )}
        <p className="mt-3 text-center text-xs">
          <Link to="/welcome" className="text-[#e879f9] underline-offset-4 hover:underline">
            Что такое Эврика
          </Link>
        </p>
      </Card>
    </Immersive>
  );
}
