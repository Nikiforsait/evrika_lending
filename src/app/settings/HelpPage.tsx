import { Compass, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Page } from '@/components/layout/AppShell.tsx';
import { TopBar } from '@/components/layout/TopBar.tsx';
import { Card } from '@/components/primitives/Card.tsx';
import { ListRow } from '@/components/primitives/ListRow.tsx';
import { updateProfile } from '@/data/profile.ts';

const FAQ = [
  {
    q: 'С чего начать?',
    a: 'Сразу после регистрации ты проходишь стартовый тест на 6 задач и получаешь план. Полная диагностика на 19 заданий необязательна, но делает план и прогноз точнее.',
  },
  {
    q: 'Как подбираются задания?',
    a: 'Каждое следующее задание подбирается так, чтобы ты решал его примерно в 7 случаях из 10: не скучно и не слишком трудно.',
  },
  {
    q: 'Что такое прогноз?',
    a: 'Это оценка, сколько баллов ты наберёшь по всем темам сейчас. Он меняется после каждого задания. Чем больше решаешь, тем он точнее.',
  },
  {
    q: 'Как работает стрик?',
    a: 'Стрик — сколько дней подряд ты занимаешься. Хватит одного задания в день. За каждые 7 дней подряд даётся заморозка: она сохранит стрик, если пропустишь день.',
  },
  {
    q: 'Зачем карточки с формулами?',
    a: 'Карточки возвращаются тогда, когда формула начинает забываться. Отвечай честно: «Не помню» вернёт карточку завтра, «Легко» — нескоро.',
  },
  {
    q: 'Нужен ли интернет?',
    a: 'Нет. После первого открытия всё работает без сети. Прогресс хранится на устройстве и, если подключён сервер аккаунтов, в твоём аккаунте.',
  },
];

export default function HelpPage() {
  const navigate = useNavigate();
  const replayTour = async () => {
    await updateProfile({ tourDoneAt: undefined });
    navigate('/');
  };
  return (
    <Page>
      <TopBar title="Помощь" />
      <Card className="mt-4 p-2" as="section" aria-label="Знакомство с приложением">
        <ListRow icon={Compass} label="Показать подсказки по интерфейсу" onClick={() => void replayTour()} />
        <ListRow icon={Info} label="О сервисе" to="/welcome" />
      </Card>
      <div className="mt-4 space-y-3">
        {FAQ.map(({ q, a }) => (
          <Card as="article" key={q} className="p-5">
            <details>
              <summary className="cursor-pointer text-[16px] font-semibold">{q}</summary>
              <p className="mt-3 text-[15px] leading-relaxed text-muted">{a}</p>
            </details>
          </Card>
        ))}
      </div>
    </Page>
  );
}
