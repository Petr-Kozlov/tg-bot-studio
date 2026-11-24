import { Injectable } from '@nestjs/common';
import type { Context } from 'grammy';
import { BotModuleHandler, type ModuleRuntimeContext } from '../../bot-engine/bot-module-handler';
import { ModuleHandlerRegistry } from '../../bot-engine/module-handler-registry';
import { ChatSettingsService } from '../../bot-engine/chat-settings.service';
import { PrismaService } from '../../database/prisma.service';

import { renderTemplate, type TemplateContext } from '../../common/utils/template.util';

import { collection } from './achievement.service';
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

    const alertPages = new Map<string, number>();
    // Telegram alerts are personal and limited to 200 characters.
    bot.callbackQuery('ach:list', async (c) => {
      if (!c.chat || !(await targeted(c))) {
        await c.answerCallbackQuery();
        return;
      }
      const rows = await collection(this.db, botId, String(c.chat.id), String(c.from.id), false);
      const pages: string[] = [];
      let page = '';
      for (const r of rows) {
        const line =
          (r.unlocked ? '✅ ' : '▫️ ') +
          r.title +
          ' · ' +
          (r.unlocked
            ? 'открыто'
            : r.condition + ' ' + Math.min(r.value, r.threshold) + '/' + r.threshold);
        if (page.length + line.length > 160) {
          pages.push(page);
          page = '';
        }
        page += (page ? '\n' : '') + line;
      }
      if (page) pages.push(page);
      const key = String(c.chat.id) + '/' + c.from.id;
      const index = (alertPages.get(key) ?? 0) % Math.max(1, pages.length);
      if (pages.length > 1) {
        if (alertPages.size >= 10000) alertPages.delete(alertPages.keys().next().value!);
        alertPages.set(key, index + 1);
      }
      await c.answerCallbackQuery({
        show_alert: true,
        text:
          (pages[index] ?? 'Ачивки пока не настроены') +
          (pages.length > 1 ? '\n' + (index + 1) + '/' + pages.length + ' · нажмите ещё раз' : ''),
      });
    });

    bot.on('message', async (c, next) => {
      const author = c.msg.from;
      if (author && !author.is_bot && !c.msg.sender_chat && (await targeted(c))) {
        if (
          c.msg.text ||
          c.msg.caption ||
          c.msg.photo ||
          c.msg.video ||
          c.msg.animation ||
          c.msg.sticker ||
          c.msg.document ||
          c.msg.audio ||
          c.msg.voice ||
          c.msg.video_note ||
          c.msg.poll ||
          c.msg.contact ||
          c.msg.location ||
          c.msg.dice ||
          c.msg.venue ||
          c.msg.game ||
          c.msg.story ||
          c.msg.paid_media
        ) {
          await this.db
            .$executeRaw`INSERT INTO achievement_activity VALUES(${botId},${String(c.chat.id)},${String(author.id)},'messages',${c.msg.message_id}) ON CONFLICT DO NOTHING`;
        }
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
      if (
        giver &&
        !giver.is_bot &&
        !event.actor_chat &&
        event.new_reaction.length &&
        (await targeted(c))
      ) {
        await this.db
          .$executeRaw`INSERT INTO achievement_activity VALUES(${botId},${String(event.chat.id)},${String(giver.id)},'reactions',${event.message_id}) ON CONFLICT DO NOTHING`;
      }
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
          const body = format(cfg, 'awardText', {
            name: awards[0].recipient_name,
            giver: giver.first_name,
          });
          if (body) await c.reply(body, { reply_parameters: { message_id: event.message_id } });
        }
      }
      await next();
    });

    bot.command(['minus', 'undo_minus'], async (c) => {
      if (!(await targeted(c))) return;
      if (!c.from || c.from.is_bot || c.msg.sender_chat) {
        await c.reply('Отправьте команду с личного аккаунта администратора.');
        return;
      }
      const member = await c.api.getChatMember(c.chat.id, c.from.id);
      if (member.status !== 'creator' && member.status !== 'administrator') {
        await c.reply('Эта команда доступна только модераторам.');
        return;
      }
      const undo = c.msg.text.split(/[\s@]/, 1)[0] === '/undo_minus';
      const original = c.msg.reply_to_message;
      if (!original?.from || original.from.is_bot || original.sender_chat) {
        await c.reply('Отправьте команду в ответ на сообщение участника.');
        return;
      }
      const chatId = String(c.chat.id);
      const moderator = String(c.from.id);
      if (undo) {
        const [penalty] = await this.db.socialRatingPenalty.updateManyAndReturn({
          select: { recipientName: true, reason: true },
          where: { botId, chatId, messageId: original.message_id, undoneBy: null },
          data: { undoneBy: moderator },
        });
        if (!penalty) {
          await c.reply('Активного штрафа за это сообщение нет.');
          return;
        }
        const body = format(await options(c.chat.id), 'undoMinusText', {
          name: penalty.recipientName,
          reason: penalty.reason,
        });
        if (body) await c.reply(body);
        return;
      }
      const reason = c.match.trim();
      if (!reason) {
        await c.reply('Укажите причину: /minus причина');
        return;
      }
      const added = await this.db.$executeRaw`
        INSERT INTO social_rating_penalties (bot_id, chat_id, message_id, recipient, recipient_name, moderator, reason, issued_at)
        VALUES (${botId}, ${chatId}, ${original.message_id}, ${String(original.from.id)}, ${original.from.first_name}, ${moderator}, ${reason}, ${new Date()})
        ON CONFLICT (bot_id, chat_id, message_id) DO UPDATE SET moderator=excluded.moderator,
          reason=excluded.reason, issued_at=excluded.issued_at, undone_by=NULL
        WHERE social_rating_penalties.undone_by IS NOT NULL`;
      if (!added) {
        await c.reply('За это сообщение уже есть штраф.');
        return;
      }
      const body = format(await options(c.chat.id), 'minusText', {
        name: original.from.first_name,
        reason,
      });
      if (body) await c.reply(body);
    });

    bot.command('rating', async (c) => {
      if (!(await targeted(c))) return;
      const replied = c.msg.reply_to_message;
      const original = replied?.is_automatic_forward ? undefined : replied;
      const user = original ? original.from : c.from;
      if (!user || user.is_bot || original?.sender_chat) return;
      const count = await this.db.socialRatingAward.count({
        where: { botId, chatId: String(c.chat.id), recipient: String(user.id) },
      });
      const body = format(await options(c.chat.id), 'balanceText', {
        name: user.first_name,
        score:
          count -
          (await this.db.socialRatingPenalty.count({
            where: { botId, chatId: String(c.chat.id), recipient: String(user.id), undoneBy: null },
          })),
      });
      if (body) await c.reply(body);
    });

    bot.command('toprating', async (c) => {
      if (!(await targeted(c))) return;
      const cutoff = new Date(Date.now() - 30 * 86400000);
      const chatId = String(c.chat.id);
      const rows = await this.db.$queryRaw<Array<{ name: string; score: bigint }>>`
        SELECT MAX(recipient_name) AS name, SUM(points) AS score FROM (
          SELECT recipient, recipient_name, 1 AS points FROM social_rating_awards
          WHERE bot_id=${botId} AND chat_id=${chatId} AND awarded_at>=${cutoff}
          UNION ALL
          SELECT recipient, recipient_name, -1 AS points FROM social_rating_penalties
          WHERE bot_id=${botId} AND chat_id=${chatId} AND issued_at>=${cutoff} AND undone_by IS NULL
        ) GROUP BY recipient ORDER BY score DESC, recipient ASC LIMIT 10`;
      const cfg = await options(c.chat.id);
      const medals = String(cfg.rankMedals ?? '')
        .trim()
        .split(/\s+/);
      const lines = rows.map((r, i) =>
        format(cfg, 'topRow', {
          rank: i + 1,
          medal: medals[i] || `${i + 1}.`,
          name: r.name,
          score: Number(r.score),
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
          const body = format(await options(c.chat.id), 'awardText', {
            name: user.first_name,
            giver: c.from.first_name,
          });
          if (body) await c.reply(body, { reply_parameters: { message_id: original.message_id } });
        }
      }
      await next();
    });
  }
}
