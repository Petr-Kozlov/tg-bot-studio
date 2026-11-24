import { Prisma } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';
import { ratingStandings } from '../social-rating/rating-standings';

export async function profileRanks(
  db: PrismaService,
  bot: string,
  chat: string,
  viewer: string,
  mode: string,
  days: number,
) {
  const awards = mode === 'awards';
  const scores = awards
    ? Prisma.sql`SELECT u.user_id AS user, COUNT(*) AS score, NULL AS name
    FROM achievement_unlocks u JOIN achievements a ON a.id=u.achievement_id
    WHERE a.bot_id=${bot} AND a.chat_id=${chat} GROUP BY u.user_id`
    : ratingStandings(bot, chat, days);
  const rows = await db.$queryRaw<
    { place: bigint; score: bigint; name: string; mine: bigint }[]
  >(Prisma.sql`
    WITH scores AS (${scores}), ranked AS (
      SELECT *, ROW_NUMBER() OVER (ORDER BY score DESC, user ASC) AS place FROM scores
    ) SELECT place,score,(user=${viewer}) AS mine,COALESCE(NULLIF(name,''),
      (SELECT COALESCE(NULLIF(b.first_name,''),b.username) FROM bot_users b
       WHERE b.bot_id=${bot} AND b.telegram_id=CAST(r.user AS INTEGER)),
      (SELECT author_name FROM social_rating_message_authors m WHERE m.bot_id=${bot} AND m.chat_id=${chat}
       AND m.author=r.user ORDER BY message_id DESC LIMIT 1),'Участник') AS name
    FROM ranked r WHERE place<=100 OR user=${viewer} ORDER BY place`);
  const ranked = rows.map((r) => ({
    place: Number(r.place),
    score: Number(r.score),
    name: r.name,
    mine: Boolean(r.mine),
  }));
  const counts = awards
    ? await db.$queryRaw<
        { count: bigint }[]
      >`SELECT COUNT(*) AS count FROM achievements WHERE bot_id=${bot} AND chat_id=${chat}`
    : [];
  const total = counts.length ? Number(counts[0].count) : null;
  return {
    rows: ranked.filter((r) => r.place <= 100),
    me: ranked.find((r) => r.mine) ?? null,
    total,
  };
}
