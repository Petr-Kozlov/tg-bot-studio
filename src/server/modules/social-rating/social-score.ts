import type { PrismaService } from '../../database/prisma.service';

export async function socialScore(db: PrismaService, bot: string, chat: string, user: string) {
  const [row] = await db.$queryRaw<{ score: bigint }[]>`SELECT
 (SELECT COUNT(*) FROM social_rating_awards WHERE bot_id=${bot} AND chat_id=${chat} AND recipient=${user}) -
 (SELECT COUNT(*) FROM social_rating_penalties WHERE bot_id=${bot} AND chat_id=${chat} AND recipient=${user} AND undone_by IS NULL) AS score`;
  return Number(row.score);
}
