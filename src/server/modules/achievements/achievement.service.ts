import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { persistIcon, iconRoute } from './achievement-icons';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../database/prisma.service';

export const conditions = {
  rating: 'Социальный рейтинг',
  comment: 'Благодарности за один комментарий',
  helpers: 'Разные люди, которые вас поблагодарили',
  helped: 'Разные люди, которых вы поблагодарили',
  messages: 'Сообщения участника',
  reactions: 'Сообщения, на которые участник поставил реакцию',
} as const;

interface Achievement {
  id: string;
  title: string;
  description: string;
  kind: keyof typeof conditions;
  threshold: number;
  icon: string;
}
export async function collection(
  db: PrismaService,
  bot: string,
  chat: string,
  user: string,
  icons: boolean,
) {
  const rows = await db.$queryRaw<(Achievement & { value: bigint; unlocked: string | null })[]>`
 SELECT a.id,a.title,a.description,a.kind,a.threshold,CASE WHEN ${icons} THEN a.icon ELSE '' END icon,
 COALESCE(m.value,0) value,u.unlocked_at unlocked FROM achievements a
 LEFT JOIN achievement_metrics m ON m.bot_id=a.bot_id AND m.chat_id=a.chat_id AND m.kind=a.kind AND m.user_id=${user}
 LEFT JOIN achievement_unlocks u ON u.achievement_id=a.id AND u.user_id=${user}
 WHERE a.bot_id=${bot} AND a.chat_id=${chat} ORDER BY a.kind,a.threshold,a.title`;
  return rows.map((r) => ({
    ...r,
    icon: r.icon ? iconRoute + r.icon : '',
    threshold: Number(r.threshold),
    value: Math.max(0, Number(r.value)),
    condition: conditions[r.kind],
  }));
}
@Injectable()
export class AchievementService {
  constructor(private readonly db: PrismaService) {}
  async onModuleInit() {
    const rows = await this.db.$queryRaw<
      { id: string; icon: string }[]
    >`SELECT id,icon FROM achievements WHERE icon LIKE 'data:%'`;
    for (const row of rows) {
      const key = await persistIcon(row.icon);
      await this.db
        .$executeRaw`UPDATE achievements SET icon=${key} WHERE id=${row.id} AND icon=${row.icon}`;
    }
  }
  async list(bot: string, chat: string) {
    const rows = await this.db.$queryRaw<
      Achievement[]
    >`SELECT id,title,description,kind,threshold,icon FROM achievements WHERE bot_id=${bot} AND chat_id=${chat} ORDER BY kind,threshold,title`;
    return {
      conditions,
      items: rows.map((r) => ({
        ...r,
        icon: r.icon ? iconRoute + r.icon : '',
        threshold: Number(r.threshold),
      })),
    };
  }
  async save(bot: string, chat: string, id: string | null, input: Partial<Achievement>) {
    const title = String(input.title ?? '').trim(),
      description = String(input.description ?? '').trim(),
      kind = input.kind,
      goal = input.threshold,
      source = input.icon ?? '';
    if (
      !title ||
      title.length > 60 ||
      description.length > 240 ||
      !kind ||
      !Object.hasOwn(conditions, kind) ||
      typeof goal !== 'number' ||
      !Number.isSafeInteger(goal) ||
      goal < 1 ||
      goal > 10000000
    )
      throw new BadRequestException('Проверьте название, условие и порог');
    let icon = '';
    if (typeof source !== 'string') throw new BadRequestException('Некорректная иконка');
    if (source.startsWith(iconRoute) && id) {
      const [existing] = await this.db.$queryRaw<
        { icon: string }[]
      >`SELECT icon FROM achievements WHERE id=${id} AND bot_id=${bot} AND chat_id=${chat}`;
      if (!existing || source !== iconRoute + existing.icon)
        throw new BadRequestException('Выберите файл иконки');
      icon = existing.icon;
    } else if (source) icon = await persistIcon(source);
    if (id) {
      const changed = await this.db
        .$executeRaw`UPDATE achievements SET title=${title},description=${description},kind=${kind},threshold=${goal},icon=${icon} WHERE bot_id=${bot} AND chat_id=${chat} AND id=${id}`;
      if (!changed) throw new NotFoundException();
      return { id };
    }
    const connection = await this.db.chatConnection.findFirst({
      where: { botId: bot, chatId: chat, isActive: 1 },
    });
    if (!connection) throw new NotFoundException();
    const key = randomUUID();
    await this.db
      .$executeRaw`INSERT INTO achievements(id,bot_id,chat_id,title,description,kind,threshold,icon) VALUES(${key},${bot},${chat},${title},${description},${kind},${goal},${icon})`;
    return { id: key };
  }
  async remove(bot: string, chat: string, id: string) {
    await this.db
      .$executeRaw`DELETE FROM achievements WHERE id=${id} AND bot_id=${bot} AND chat_id=${chat}`;
    return { success: true };
  }
}
