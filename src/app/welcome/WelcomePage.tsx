import { useLiveQuery } from 'dexie-react-hooks';
import { BookOpen, CalendarCheck, Gift, Smartphone, Sparkles, Swords, Target, type LucideIcon } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Page } from '@/components/layout/AppShell.tsx';
import { Button, ButtonLink } from '@/components/primitives/Button.tsx';
import { Card } from '@/components/primitives/Card.tsx';
import { startGuest } from '@/data/auth.ts';
import { db } from '@/data/db.ts';
import { useProfile } from '@/hooks/data.ts';
import { formatPrice, PLANS, TRIAL_DAYS } from '@/lib/subscription.ts';

const PLUSES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Target, title: '2 000+ заданий по всем 19 номерам', text: 'Вся первая часть ОГЭ по математике: числа в задачах генерируются, каждый ответ проверен, к геометрии есть рисунки.' },
  { icon: Sparkles, title: 'Стартовый тест за 7 минут', text: 'Шесть задач, и ты знаешь свой балл по шкале первой части и слабые блоки.' },
  { icon: CalendarCheck, title: 'План под тебя', text: 'Три коротких блока в день. Уровень по каждому номеру растёт по твоим ответам.' },
  { icon: BookOpen, title: 'Разбор и справочник', text: 'К каждой задаче подсказка и решение по шагам, а ошибки превращаются в личные заметки к формулам.' },
  { icon: Swords, title: 'Дуэли и лиги', text: 'Соревнуйся с одноклассниками, набирай XP, держи стрик и вызов «100 дней».' },
  { icon: Smartphone, title: 'На телефоне и без интернета', text: 'Ставится на домашний экран как приложение, после первого открытия работает офлайн.' },
];

const STEPS = ['Создай аккаунт (имя и пароль) или войди без него.', 'Пройди стартовый тест на 6 задач и получи балл.', 'Тренируйся по плану 10–15 минут в день и следи за прогнозом.'];

/** Public landing page: what the service is, its pluses, how it works and the plans. */
export default function WelcomePage() {
  const profile = useProfile();
  const navigate = useNavigate();
  const session = useLiveQuery(() => db.meta.get('session').then((s) => s?.value ?? 0), []);
  const ready = session !== undefined;
  const hasAccount = Boolean(profile.account);
  const inApp = (hasAccount || Boolean(profile.guest)) && session === 1;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // «Использовать»: straight into the app as a guest; AuthGate then shows the gift and the start test.
  const useAsGuest = async () => {
    setBusy(true);
    setError(null);
    try {
      await startGuest();
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  const headerAction = !ready ? null : inApp ? (
    <ButtonLink to="/" variant="pill">В приложение</ButtonLink>
  ) : hasAccount ? (
    <ButtonLink to="/login" variant="pill">Войти</ButtonLink>
  ) : (
    <>
      <ButtonLink to="/login" variant="ghost">Войти</ButtonLink>
      <Button variant="pill" disabled={busy} onClick={() => void useAsGuest()}>
        {busy ? 'Открываем…' : 'Использовать'}
      </Button>
    </>
  );

  return (
    <Page nav={false} brand wide>
      <header className="sticky top-0 z-20 -mx-4 flex items-center justify-between gap-3 bg-[#1d0d33]/85 px-4 pt-[calc(env(safe-area-inset-top)+0.75rem)] pb-3 backdrop-blur-xl sm:-mx-6 sm:px-6">
        <span className="font-display text-lg font-bold tracking-tight">Эврика</span>
        <div className="flex items-center gap-2">{headerAction}</div>
      </header>
      <section className="pt-8 text-center sm:pt-14">
        <p className="text-sm text-muted">Математика · первая часть ОГЭ</p>
        <h1 className="mt-3 font-display text-[34px] leading-tight font-bold tracking-tight sm:text-5xl">
          Твой личный тренер <span className="text-[#e879f9]">по ОГЭ</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[17px] text-ink/85">
          Короткие тренировки, план под твой уровень и прогноз балла. Первый месяц — максимальная подписка в подарок.
        </p>
        <div className="mx-auto mt-8 flex max-w-sm flex-col gap-2 sm:max-w-none sm:flex-row sm:justify-center">
          {!ready ? null : inApp ? (
            <ButtonLink to="/" className="min-h-14 px-8 text-lg">В приложение</ButtonLink>
          ) : hasAccount ? (
            <ButtonLink to="/login" className="min-h-14 px-8 text-lg">Войти</ButtonLink>
          ) : (
            <>
              <ButtonLink to="/register" className="min-h-14 px-8 text-lg">Создать аккаунт</ButtonLink>
              <ButtonLink to="/login" variant="soft" className="min-h-14 px-8 text-lg">Войти</ButtonLink>
            </>
          )}
        </div>
        {ready && !inApp && !hasAccount && (
          <div className="mt-3">
            <Button variant="ghost" disabled={busy} onClick={() => void useAsGuest()}>
              {busy ? 'Открываем…' : 'Использовать без аккаунта'}
            </Button>
            <p className="mt-1 text-xs text-faint">Без регистрации: прогресс останется на этом устройстве, аккаунт можно создать позже.</p>
          </div>
        )}
        {hasAccount && !inApp && <p className="mt-3 text-xs text-faint">На этом устройстве уже есть аккаунт — войдите в него.</p>}
        {error && (
          <p role="alert" className="mx-auto mt-3 max-w-md rounded-inner bg-pink/10 px-4 py-3 text-[15px] text-[#fbcfe8] ring-1 ring-pink/50">
            {error}
          </p>
        )}
      </section>

      <section aria-labelledby="pluses" className="mt-14">
        <h2 id="pluses" className="font-display text-2xl font-bold">
          Плюсы
        </h2>
        <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {PLUSES.map(({ icon: Icon, title, text }) => (
            <li key={title}>
              <Card className="flex h-full gap-4 p-5">
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-lime/15 text-lime" aria-hidden="true">
                  <Icon size={20} />
                </span>
                <div>
                  <h3 className="font-display text-base font-semibold">
                    <span className="mr-1 text-lime" aria-hidden="true">+</span>
                    {title}
                  </h3>
                  <p className="mt-1 text-[15px] text-muted">{text}</p>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <section aria-labelledby="how" className="mt-14">
        <h2 id="how" className="font-display text-2xl font-bold">
          Как это работает
        </h2>
        <ol className="mt-4 grid gap-3 sm:grid-cols-3">
          {STEPS.map((text, i) => (
            <li key={text}>
              <Card className="flex h-full gap-4 p-5">
                <span className="num grid size-10 shrink-0 place-items-center rounded-full bg-cta font-display text-lg font-bold">{i + 1}</span>
                <p className="text-[15px]">{text}</p>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="plans" className="mt-14">
        <h2 id="plans" className="font-display text-2xl font-bold">
          Тарифы
        </h2>
        <p className="mt-2 flex items-center gap-2 text-[15px] text-muted">
          <Gift size={18} className="text-lime" aria-hidden="true" />
          После регистрации {TRIAL_DAYS} дней максимальной подписки бесплатно.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {PLANS.map((p) => (
            <li key={p.id}>
              <Card className={`h-full p-5 ${p.id === 'max' ? 'ring-1 ring-lime/50' : ''}`}>
                <h3 className="font-display text-base font-semibold">{p.name}</h3>
                <p className="num mt-1 font-display text-2xl font-bold">{formatPrice(p.price)}</p>
                <p className="text-sm text-muted">{p.lessonsPerMonth === null ? 'уроки без ограничений' : `${p.lessonsPerMonth} уроков в месяц · ${p.tagline}`}</p>
              </Card>
            </li>
          ))}
        </ul>
      </section>

      <p className="mt-14 text-center text-xs text-faint">
        Задания построены по структуре первой части ОГЭ‑2026. Все числа генерируются, тексты заданий собственные.
      </p>
    </Page>
  );
}
