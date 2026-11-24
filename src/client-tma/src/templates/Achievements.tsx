import { useEffect, useState } from 'react';
import { tmaFetch } from '../api';
import { isInsideTelegram } from '../sdk/telegram';
import './achievements.css';
const groups = [
  ['Рейтинг', ['rating']],
  ['Помощь', ['comment', 'helpers', 'helped']],
  ['Общение', ['messages']],
  ['Реакции', ['reactions']],
] as const;
type Entry = {
  kind: string;
  id: string;
  title: string;
  condition: string;
  description: string;
  threshold: number;
  value: number;
  unlocked: string | null;
  icon: string;
};
export default function Achievements({ slug }: { slug: string }) {
  const [items, setItems] = useState<Entry[] | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (!isInsideTelegram()) return;
    let active = true;
    tmaFetch<Entry[]>('/api/tma/' + slug + '/achievements')
      .then((x) => {
        if (active) setItems(x);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [slug]);
  if (!isInsideTelegram()) return null;
  if (error) return <p role="alert">{error}</p>;
  if (!items) return <p>Загрузка коллекции…</p>;
  if (!items.length) return <p>Ачивки пока не настроены.</p>;
  return (
    <section aria-label="Моя коллекция">
      <p className="achievement-summary">
        <strong>
          {items.filter((i) => i.unlocked).length} / {items.length}
        </strong>{' '}
        открыто
      </p>
      {groups.map(([title, kinds]) => {
        const entries = items.filter((i) => kinds.some((k) => k === i.kind));
        if (!entries.length) return null;
        return (
          <section className="achievement-group" key={title}>
            <h2>{title}</h2>
            {entries.map((i) => {
              const prefix = i.title.match(/^(\p{Extended_Pictographic}\uFE0F?)\s+/u);
              return (
                <article key={i.id} className="achievement-entry" data-locked={!i.unlocked}>
                  <div className="achievement-icon" aria-hidden="true">
                    {i.icon ? <img src={i.icon} alt="" /> : (prefix?.[1] ?? '🏆')}
                  </div>
                  <div>
                    <h3>{prefix ? i.title.slice(prefix[0].length) : i.title}</h3>
                    {i.description && <p>{i.description}</p>}
                    <small>
                      {i.condition} · {i.threshold}
                    </small>
                    {i.unlocked ? (
                      <div>
                        ✓ Открыто{' '}
                        {new Date(i.unlocked.replace(' ', 'T') + 'Z').toLocaleDateString('ru-RU')}
                      </div>
                    ) : (
                      <div>
                        <progress value={Math.min(i.value, i.threshold)} max={i.threshold} />{' '}
                        {Math.min(i.value, i.threshold)} / {i.threshold}
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        );
      })}
    </section>
  );
}
