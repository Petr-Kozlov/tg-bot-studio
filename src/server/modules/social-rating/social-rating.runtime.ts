import { Injectable } from '@nestjs/common';
import type { Context } from 'grammy';
import { BotModuleHandler, type ModuleRuntimeContext } from '../../bot-engine/bot-module-handler';
import { ModuleHandlerRegistry } from '../../bot-engine/module-handler-registry';
import { ChatSettingsService } from '../../bot-engine/chat-settings.service';
import { PrismaService } from '../../database/prisma.service';

const thanks = /^(?:спасибо|спс|благодарю)(?![\p{L}\p{N}_])/iu;

@Injectable()
export class SocialRatingRuntime extends BotModuleHandler {
  readonly moduleKey = 'social-rating';

  constructor(
    private readonly db: PrismaService,
    private readonly settings: ChatSettingsService,
    registry: ModuleHandlerRegistry,
  ) {
    super();
    registry.register(this);
  }

  register({ bot, botId }: ModuleRuntimeContext): void {
    const targeted = (c: Context) =>
      (c.chat?.type === 'group' || c.chat?.type === 'supergroup') &&
      this.settings.isTargeted(botId, c.chat.id, this.moduleKey);

    bot.command('rating', async (c) => {
      if (!(await targeted(c))) return;
      const original = c.msg.reply_to_message;
      const user = original ? original.from : c.from;
      if (!user || user.is_bot || original?.sender_chat) return;
      const count = await this.db.socialRatingAward.count({
        where: { botId, chatId: String(c.chat.id), recipient: String(user.id) },
      });
      await c.reply(`Социальный рейтинг · ${user.first_name}: ${count}`);
    });

    bot.command('toprating', async (c) => {
      if (!(await targeted(c))) return;
      const cutoff = new Date(Date.now() - 30 * 86400000);
      const rows = await this.db.socialRatingAward.groupBy({
        by: ['recipient'],
        where: { botId, chatId: String(c.chat.id), awardedAt: { gte: cutoff } },
        _count: { recipient: true },
        _max: { recipientName: true },
        orderBy: [{ _count: { recipient: 'desc' } }, { recipient: 'asc' }],
        take: 10,
      });
      const lines = rows.map(
        (r, i) => `${i + 1}. ${r._max.recipientName} — ${r._count.recipient}`,
      );
      await c.reply(
        [
          'Социальный рейтинг за 30 дней',
          ...(lines.length ? lines : ['Пока нет благодарностей.']),
        ].join('\n'),
      );
    });

    bot.on('message:text', async (c, next) => {
      const original = c.msg.reply_to_message;
      const user = original?.from;
      if (
        user &&
        !user.is_bot &&
        !c.from.is_bot &&
        !original.sender_chat &&
        !c.msg.sender_chat &&
        user.id !== c.from.id &&
        thanks.test(c.msg.text.trimStart()) &&
        (await targeted(c))
      ) {
        const added = await this.db.$executeRaw`
          INSERT INTO social_rating_awards (bot_id, chat_id, message_id, giver, recipient, recipient_name, awarded_at)
          VALUES (${botId}, ${String(c.chat.id)}, ${original.message_id}, ${String(c.from.id)}, ${String(user.id)}, ${user.first_name}, ${new Date()})
          ON CONFLICT (bot_id, chat_id, message_id, giver) DO NOTHING`;
        if (added)
          await c.reply(
            `✨ ${user.first_name} получает +1 к социальному рейтингу!`,
          );
      }
      await next();
    });
  }
}
