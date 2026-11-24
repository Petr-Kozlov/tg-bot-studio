import { useEffect, useState } from 'react';
import { isInsideTelegram, webApp } from '../sdk/telegram';
import { tmaFetch } from '../api';
import Achievements from './Achievements';
import ProfileTops from './ProfileTops';
import rocket from './images/rating-rocket.webp';
import './profile.css';

export default function Profile({ slug, title }: { slug: string; title: string }) {
  const [tab, setTab] = useState<'profile' | 'tops'>('profile');
  const [summary, setSummary] = useState<{ name: string; score: number; chatTitle?: string }>();
  const [error, setError] = useState('');
  const [avatar, setAvatar] = useState('');
  const [showReturn, setReturn] = useState(false);
  const user = webApp?.initDataUnsafe?.user;
  const inside = isInsideTelegram();
  useEffect(() => {
    if (!inside) return;
    const controller = new AbortController();
    let url = '';
    const base = '/api/tma/' + encodeURIComponent(slug);
    tmaFetch<NonNullable<typeof summary>>(base + '/summary', { signal: controller.signal })
      .then(setSummary)
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message);
      });
    fetch(base + '/chat-avatar', {
      headers: { 'X-Telegram-Init-Data': webApp?.initData ?? '' },
      signal: controller.signal,
    })
      .then(async (r) => {
        if (r.ok) {
          const blob = await r.blob();
          if (!controller.signal.aborted) {
            url = URL.createObjectURL(blob);
            setAvatar(url);
          }
        }
      })
      .catch(() => {});
    const scroll = () => setReturn(window.scrollY > window.innerHeight * 0.8);
    scroll();
    window.addEventListener('scroll', scroll, { passive: true });
    return () => {
      controller.abort();
      if (url) URL.revokeObjectURL(url);
      window.removeEventListener('scroll', scroll);
    };
  }, [slug, inside]);
  if (!inside) return null;
  const name = summary?.name || user?.first_name || 'Участник';
  return (
    <div className="gd">
      <header className="gd-header">
        {avatar ? (
          <img src={avatar} alt="" />
        ) : (
          <b className="initial">{(summary?.chatTitle || title).slice(0, 1)}</b>
        )}
        <strong>{summary?.chatTitle || title}</strong>
        <button onClick={() => setTab('profile')} aria-label="Мой профиль">
          <span>{user?.username ? '@' + user.username : name}</span>
          {user?.photo_url ? (
            <img src={user.photo_url} alt="" />
          ) : (
            <b className="initial">{name.slice(0, 1)}</b>
          )}
        </button>
      </header>
      <nav className="gd-tabs" aria-label="Раздел">
        {(['profile', 'tops'] as const).map((key) => (
          <button key={key} onClick={() => setTab(key)} aria-pressed={tab === key}>
            {key === 'profile' ? 'Профиль' : 'Топы чата'}
          </button>
        ))}
      </nav>
      <section hidden={tab !== 'profile'}>
        <h1>Профиль</h1>
        <div className="gd-hero">
          <div>
            <small>Социальный рейтинг</small>
            <strong>{summary?.score ?? '…'}</strong>
            {name}
          </div>
          <img src={rocket} alt="" />
        </div>
        {error && <p role="alert">{error}</p>}
        <Achievements slug={slug} />
      </section>
      <section hidden={tab !== 'tops'}>
        <ProfileTops slug={slug} active={tab === 'tops'} />
      </section>
      {showReturn && (
        <button
          className="gd-return"
          onClick={() => {
            document
              .querySelector<HTMLButtonElement>('.gd-tabs [aria-pressed=true]')
              ?.focus({ preventScroll: true });
            window.scrollTo({
              top: 0,
              behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
                ? 'instant'
                : 'smooth',
            });
          }}
        >
          ↑ Наверх
        </button>
      )}
    </div>
  );
}
