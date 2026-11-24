import { useEffect, useState } from 'react';
import { tmaFetch } from '../api';
import { isInsideTelegram } from '../sdk/telegram';
import './profile.css';
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
const groups: Record<string, string> = {
  rating: 'Социальный рейтинг',
  messages: 'Общение',
  comment: 'За один комментарий',
  helpers: 'Кому помогли вы',
  helped: 'Кого поблагодарили вы',
  reactions: 'Реакции',
};
function Award({ item }: { item: Entry }) {
  const n = Math.min(item.value, item.threshold);
  return (
    <article className="gd-award">
      {item.icon ? <img src={item.icon} alt="" /> : <span aria-hidden="true">🏆</span>}
      <div>
        <b>
          {item.title.replace(/^\S+\s+/u, (match) =>
            /\p{Extended_Pictographic}/u.test(match) ? '' : match,
          )}
        </b>
        <p>{item.description || item.condition}</p>
        {item.unlocked ? (
          <small>
            {new Date(item.unlocked.replace(' ', 'T') + 'Z').toLocaleDateString('ru-RU')}
          </small>
        ) : (
          <div className="gd-track">
            <progress aria-label={item.condition} value={n} max={item.threshold} />
            <small>
              {n} / {item.threshold}
            </small>
          </div>
        )}
      </div>
      {item.unlocked && (
        <span className="gd-done" aria-label="Открыта" role="img">
          ✓
        </span>
      )}
    </article>
  );
}
export default function Achievements({ slug }: { slug: string }) {
  const [items, setItems] = useState<Entry[]>(),
    [error, setError] = useState(''),
    [filter, setFilter] = useState('Все');
  useEffect(() => {
    if (!isInsideTelegram()) return;
    const c = new AbortController();
    tmaFetch<Entry[]>('/api/tma/' + encodeURIComponent(slug) + '/achievements', {
      signal: c.signal,
    })
      .then(setItems)
      .catch((e) => {
        if (!c.signal.aborted) setError(e.message);
      });
    return () => c.abort();
  }, [slug]);
  if (!isInsideTelegram()) return null;
  if (error) return <p role="alert">{error}</p>;
  if (!items) return <p>Загрузка коллекции…</p>;
  if (!items.length) return <p>Ачивки пока не настроены.</p>;
  const opened = items.filter((i) => i.unlocked).length;
  const closest = items
    .filter((i) => !i.unlocked)
    .sort((a, b) => b.value / b.threshold - a.value / a.threshold)[0];
  const visible = items.filter(
    (i) => filter === 'Все' || (filter === 'Открытые') === Boolean(i.unlocked),
  );
  return (
    <div className="gd-collection">
      {closest && (
        <>
          <h2>Ближайшая ачивка</h2>
          <Award item={closest} />
        </>
      )}
      <div className="gd-total">
        <h2>Мои ачивки</h2>
        <b>
          {opened} / {items.length}
        </b>
      </div>
      <progress aria-label="Открыто ачивок" value={opened} max={items.length} />
      <div className="gd-pills">
        {['Все', 'В процессе', 'Открытые'].map((f) => (
          <button key={f} aria-pressed={f === filter} onClick={() => setFilter(f)}>
            {f}
          </button>
        ))}
      </div>
      {Object.entries(groups).map(([key, label]) => {
        const entries = visible.filter((i) => i.kind === key);
        return entries.length ? (
          <section key={key}>
            <h3>{label}</h3>
            {entries.map((i) => (
              <Award key={i.id} item={i} />
            ))}
          </section>
        ) : null;
      })}
      {!visible.length && (
        <p>{filter === 'Открытые' ? 'Пока нет открытых ачивок.' : 'Все ачивки открыты.'}</p>
      )}
    </div>
  );
}
