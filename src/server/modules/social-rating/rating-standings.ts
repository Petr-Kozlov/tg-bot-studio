import { Prisma } from '@prisma/client';

export function ratingStandings(bot: string, chat: string, days: number) {
  const cutoff = new Date(Date.now() - days * 86400000);
  return Prisma.sql`SELECT recipient AS user, MAX(recipient_name) AS name, SUM(points) AS score FROM (
    SELECT recipient, recipient_name, 1 AS points FROM social_rating_awards
    WHERE bot_id=${bot} AND chat_id=${chat} AND awarded_at>=${cutoff}
    UNION ALL
    SELECT recipient, recipient_name, -1 AS points FROM social_rating_penalties
    WHERE bot_id=${bot} AND chat_id=${chat} AND issued_at>=${cutoff} AND undone_by IS NULL
  ) GROUP BY recipient`;
}
