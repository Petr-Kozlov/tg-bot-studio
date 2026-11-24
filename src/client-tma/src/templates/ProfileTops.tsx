import { useEffect, useState } from 'react';
import { tmaFetch } from '../api';
import rocket from './images/rating-rocket.webp';
import chest from './images/award-chest.webp';
type Row = { place: number; name: string; score: number; mine: boolean };
type Result = { rows: Row[]; me: Row | null; total: number | null };
export default function ProfileTops({ slug, active }: { slug: string; active: boolean }) {
  const [mode, setMode] = useState('rating'),
    [days, setDays] = useState('30'),
    [limit, setLimit] = useState(50);
  const [result, setResult] = useState<Result>(),
    [error, setError] = useState(''),
    [retry, setRetry] = useState(0);
  const rating = mode === 'rating',
    period = rating ? days : '30';
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    setResult(undefined);
    setError('');
    tmaFetch<Result>(
      '/api/tma/' + encodeURIComponent(slug) + '/tops?mode=' + mode + '&days=' + period,
      { signal: controller.signal },
    )
      .then((data) => {
        if (!controller.signal.aborted) setResult(data);
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    return () => controller.abort();
  }, [slug, active, mode, period, retry]);
  const label = days === '7' ? 'за неделю' : days === '30' ? 'за 30 дней' : 'за год';
  return (
    <>
      <h1>Топы чата</h1>
      <div className="gd-segment">
        {['rating', 'awards'].map((key) => (
          <button key={key} aria-pressed={key === mode} onClick={() => setMode(key)}>
            {key === 'rating' ? 'Соцрейтинг' : 'Ачивки'}
          </button>
        ))}
      </div>
      <div className="gd-hero">
        <div>
          <small>Ваше место</small>
          <strong>{result?.me ? '№ ' + result.me.place : result ? 'Пока вне топа' : '…'}</strong>
          {result &&
            (rating
              ? 'Баллы ' + label + ' · ' + (result.me?.score ?? 0)
              : 'Открыто ' + (result.me?.score ?? 0) + ' из ' + result.total)}
        </div>
        <img src={rating ? rocket : chest} alt="" />
      </div>
      <div className="gd-filters">
        <select
          aria-label="Размер топа"
          value={limit}
          onChange={(e) => setLimit(Number(e.target.value))}
        >
          {[10, 50, 100].map((n) => (
            <option key={n} value={n}>
              Топ-{n}
            </option>
          ))}
        </select>
        {rating ? (
          <select aria-label="Период" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="7">За неделю</option>
            <option value="30">За 30 дней</option>
            <option value="365">За год</option>
          </select>
        ) : (
          <small>За всё время</small>
        )}
      </div>
      {error ? (
        <p role="alert">
          {error} <button onClick={() => setRetry((n) => n + 1)}>Повторить</button>
        </p>
      ) : !result ? (
        <p role="status">Загрузка топа…</p>
      ) : !result.rows.length ? (
        <p>Пока нет участников в этом топе.</p>
      ) : (
        <ol className="gd-list">
          {result.rows.slice(0, limit).map((r) => (
            <li key={r.place} className={r.mine ? 'gd-mine' : ''}>
              <span className={'gd-place p' + r.place}>{r.place}</span>
              <b>
                {r.name}
                {r.mine ? ' · вы' : ''}
              </b>
              <strong>{r.score}</strong>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
