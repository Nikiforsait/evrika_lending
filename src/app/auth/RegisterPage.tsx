import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { Immersive } from '@/components/layout/AppShell.tsx';
import { Button } from '@/components/primitives/Button.tsx';
import { Card } from '@/components/primitives/Card.tsx';
import { TextField } from '@/components/primitives/TextField.tsx';
import { checkName, isGuest, LOCAL_ONLY, register } from '@/data/auth.ts';
import { useProfile } from '@/hooks/data.ts';
import { NAME_MAX, passwordStrength, validateRegistration, type FieldErrors } from '@/lib/auth.ts';

const STRENGTH = ['Слабый', 'Средний', 'Хороший', 'Надёжный'];
const STRENGTH_COLOR = ['#EC4899', '#FACC15', '#A3E635', '#A3E635'];

export default function RegisterPage() {
  const profile = useProfile();
  const guest = isGuest(profile);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<'free' | 'taken' | null>(null);
  const [busy, setBusy] = useState(false);
  const strength = passwordStrength(password);

  // Ask the server whether the name is free, half a second after the learner stops typing.
  useEffect(() => {
    setAvailability(null);
    if (validateRegistration({ name, password: 'check-only-1' }).name) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      void checkName(name).then((r) => {
        if (alive && r.status !== 'unknown') setAvailability(r.status);
      });
    }, 500);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [name]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const found = validateRegistration({ name, password });
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true);
    setFormError(null);
    try {
      await register({ name, password });
      // Signed in: AuthGate redirects to the start test or the home page.
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const nameHint = availability === 'free' ? 'Имя свободно' : availability === 'taken' ? undefined : 'Это имя будет твоим логином. Оно должно быть свободно.';

  return (
    <Immersive>
      <Card as="section" aria-labelledby="reg-title" glow="strong" className="w-full max-w-md p-6 sm:p-8">
        <p className="text-sm text-muted">Эврика</p>
        <h1 id="reg-title" className="mt-1 font-display text-2xl font-bold">
          {guest ? 'Сохрани прогресс' : 'Создай аккаунт'}
        </h1>
        <p className="mt-2 text-[15px] text-muted">
          {guest ? 'Создай аккаунт: всё, что ты уже решил, перейдёт в него.' : 'Чтобы прогресс, план и стрик сохранялись за тобой.'}
        </p>

        <form onSubmit={(e) => void submit(e)} noValidate className="mt-6 space-y-4">
          <div>
            <TextField
              label="Имя"
              autoComplete="username"
              maxLength={NAME_MAX}
              value={name}
              onChange={(v) => {
                setName(v);
                setErrors((e) => ({ ...e, name: undefined }));
              }}
              error={errors.name ?? (availability === 'taken' ? 'Это имя уже занято, выбери другое.' : undefined)}
              hint={nameHint}
              placeholder="Например, Маша или max_2010"
            />
          </div>
          <div>
            <TextField
              label="Пароль"
              secret
              autoComplete="new-password"
              value={password}
              onChange={(v) => {
                setPassword(v);
                setErrors((e) => ({ ...e, password: undefined }));
              }}
              error={errors.password}
              hint="Не короче 8 символов, с буквами и цифрами"
            />
            {password && (
              <div className="mt-2 flex items-center gap-2" aria-live="polite">
                <div className="flex flex-1 gap-1" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="h-1.5 flex-1 rounded-full" style={{ background: i <= strength ? STRENGTH_COLOR[strength] : 'rgb(255 255 255 / 0.1)' }} />
                  ))}
                </div>
                <span className="text-xs text-muted">{STRENGTH[strength]}</span>
              </div>
            )}
          </div>

          {formError && (
            <p role="alert" className="rounded-inner bg-pink/10 px-4 py-3 text-[15px] text-[#fbcfe8] ring-1 ring-pink/50">
              {formError}
            </p>
          )}

          <Button type="submit" full disabled={busy || availability === 'taken'}>
            {busy ? 'Создаём…' : guest ? 'Создать аккаунт и сохранить' : 'Создать аккаунт'}
          </Button>
        </form>

        <p className="mt-5 text-center text-sm text-muted">
          Уже есть аккаунт?{' '}
          <Link to="/login" className="font-semibold text-[#e879f9] underline-offset-4 hover:underline">
            Войти
          </Link>
        </p>
        {guest && (
          <p className="mt-2 text-center text-sm">
            <Link to="/" className="font-semibold text-muted underline-offset-4 hover:underline">
              Пока остаться гостем
            </Link>
          </p>
        )}
        <p className="mt-4 text-center text-xs text-faint">
          {LOCAL_ONLY ? 'Аккаунт и прогресс хранятся на этом устройстве.' : 'Пароль хранится только в виде хэша. Прогресс доступен с любого устройства.'}
        </p>
        <p className="mt-2 text-center text-xs">
          <Link to="/welcome" className="text-[#e879f9] underline-offset-4 hover:underline">
            Что такое Эврика
          </Link>
        </p>
      </Card>
    </Immersive>
  );
}
