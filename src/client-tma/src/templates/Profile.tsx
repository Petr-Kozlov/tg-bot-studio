import { useEffect, useState } from 'react';
import { tmaFetch } from '../api';
import { isInsideTelegram } from '../sdk/telegram';
import Achievements from './Achievements';
export default function Profile({ slug }: { slug: string }) {
  const [profile, setProfile] = useState<{ name: string; score: number } | null>(null),
    [error, setError] = useState('');
  useEffect(() => {
    if (!isInsideTelegram()) return;
    let active = true;
    tmaFetch<{ name: string; score: number }>('/api/tma/' + slug + '/summary')
      .then((p) => {
        if (active) setProfile(p);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [slug]);
  if (!isInsideTelegram()) return null;
  return (
    <>
      <section className="profile-rating" aria-label="Мой рейтинг">
        <div>
          <h2>{profile?.name || 'Мой рейтинг'}</h2>
          <span>Социальный рейтинг</span>
        </div>
        {error ? <p role="alert">{error}</p> : <strong>{profile?.score ?? '…'}</strong>}
      </section>
      <section>
        <h2>Мои ачивки</h2>
        <Achievements slug={slug} />
      </section>
    </>
  );
}
