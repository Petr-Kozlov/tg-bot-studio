import { useEffect, useState } from 'react';
import { tmaFetch } from '../api';
import { isInsideTelegram } from '../sdk/telegram';
type Entry = {
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
      <p>
        Открыто {items.filter((i) => i.unlocked).length} из {items.length}
      </p>
      {items.map((i) => (
        <article
          key={i.id}
          className="card"
          style={{ display: 'flex', gap: 14, alignItems: 'center', marginBottom: 10 }}
        >
          {i.icon && (
            <img
              src={i.icon}
              alt=""
              width="60"
              height="60"
              style={{ objectFit: 'contain', filter: i.unlocked ? 'none' : 'grayscale(1)' }}
            />
          )}
          <div>
            <strong>{i.title}</strong>
            {i.description && <div>{i.description}</div>}
            <div className="muted">
              {i.condition} · {i.threshold}
            </div>
            {i.unlocked ? (
              <span>✅ Открыто</span>
            ) : (
              <div>
                <progress value={Math.min(i.value, i.threshold)} max={i.threshold} />{' '}
                {Math.min(i.value, i.threshold)} / {i.threshold}
              </div>
            )}
          </div>
        </article>
      ))}
    </section>
  );
}
