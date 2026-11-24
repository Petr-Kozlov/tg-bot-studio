import { Injectable } from '@nestjs/common';
import type { Context } from 'grammy';
import { BotModuleHandler, type ModuleRuntimeContext } from '../../bot-engine/bot-module-handler';
import { ModuleHandlerRegistry } from '../../bot-engine/module-handler-registry';
import { ChatSettingsService } from '../../bot-engine/chat-settings.service';
import { PrismaService } from '../../database/prisma.service';

import { renderTemplate, type TemplateContext } from '../../common/utils/template.util';

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

    const options = (chatId: number) =>
      this.settings.getEffectiveConfig(botId, chatId, this.moduleKey);
    const format = (cfg: Record<string, unknown>, key: string, vars: TemplateContext = {}) =>
      renderTemplate(String(cfg[key]), vars).trim().slice(0, 4096);

    bot.on('message', async (c, next) => {
      const author = c.msg.from;
      if (author && !author.is_bot && !c.msg.sender_chat && (await targeted(c))) {
        await this.db.$executeRaw`
          INSERT INTO social_rating_message_authors (bot_id, chat_id, message_id, author, author_name)
          VALUES (${botId}, ${String(c.chat.id)}, ${c.msg.message_id}, ${String(author.id)}, ${author.first_name})
          ON CONFLICT (bot_id, chat_id, message_id) DO NOTHING`;
      }
      await next();
    });

    bot.on('message_reaction', async (c, next) => {
      const event = c.messageReaction;
      const giver = event.user;
      const cfg = await options(event.chat.id);
      const isThanks = (r: (typeof event.new_reaction)[number]) =>
        r.type === 'emoji' && r.emoji === cfg.reactionEmoji;
      if (
        giver &&
        !giver.is_bot &&
        !event.actor_chat &&
        event.new_reaction.some(isThanks) &&
        !event.old_reaction.some(isThanks) &&
        (await targeted(c))
      ) {
        const giverId = String(giver.id);
        const awards = await this.db.$queryRaw<Array<{ recipient_name: string }>>`
          INSERT INTO social_rating_awards (bot_id, chat_id, message_id, giver, recipient, recipient_name, awarded_at)
          SELECT bot_id, chat_id, message_id, ${giverId}, author, author_name, ${new Date()}
          FROM social_rating_message_authors
          WHERE bot_id = ${botId} AND chat_id = ${String(event.chat.id)} AND message_id = ${event.message_id}
            AND author <> ${giverId}
          ON CONFLICT (bot_id, chat_id, message_id, giver) DO NOTHING
          RETURNING recipient_name`;
        if (cfg.notifyReactionAward === true && awards.length) {
          const body = format(cfg, 'awardText', { name: awards[0].recipient_name });
          if (body) await c.reply(body, { reply_parameters: { message_id: event.message_id } });
        }
      }
      await next();
    });

    bot.command('rating', async (c) => {
      if (!(await targeted(c))) return;
      const original = c.msg.reply_to_message;
      const user = original ? original.from : c.from;
      if (!user || user.is_bot || original?.sender_chat) return;
      const count = await this.db.socialRatingAward.count({
        where: { botId, chatId: String(c.chat.id), recipient: String(user.id) },
      });
      const body = format(await options(c.chat.id), 'balanceText', {
        name: user.first_name,
        score: count,
      });
      if (body) await c.reply(body);
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
      const cfg = await options(c.chat.id);
      const medals = String(cfg.rankMedals ?? '')
        .trim()
        .split(/\s+/);
      const lines = rows.map((r, i) =>
        format(cfg, 'topRow', {
          rank: i + 1,
          medal: medals[i] || `${i + 1}.`,
          name: r._max.recipientName ?? '',
          score: r._count.recipient,
        }),
      );
      const body = [format(cfg, 'topTitle'), ...(rows.length ? lines : [format(cfg, 'emptyText')])]
        .filter(Boolean)
        .join('\n')
        .slice(0, 4096);
      if (body) await c.reply(body);
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
        if (added) {
          const body = format(await options(c.chat.id), 'awardText', { name: user.first_name });
          if (body) await c.reply(body);
        }
      }
      await next();
    });
  }
}
