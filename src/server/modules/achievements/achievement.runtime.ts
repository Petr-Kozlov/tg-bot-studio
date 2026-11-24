import { Injectable } from '@nestjs/common';
import type { Context } from 'grammy';
import { BotModuleHandler, type ModuleRuntimeContext } from '../../bot-engine/bot-module-handler';
import { ModuleHandlerRegistry } from '../../bot-engine/module-handler-registry';
import { ChatSettingsService } from '../../bot-engine/chat-settings.service';
import { PrismaService } from '../../database/prisma.service';

import { collection } from './achievement.service';

@Injectable()
export class AchievementRuntime extends BotModuleHandler {
  readonly moduleKey = 'achievements';

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

    const launchButton = async (c: Context) => {
      if (!c.chat) return;
      const cfg = await this.settings.getEffectiveConfig(botId, c.chat.id, this.moduleKey);
      const url = String(cfg.launchUrl ?? '');
      if (url !== 'https://t.me/' + c.me.username + '?startapp') return;
      if (!(await c.api.getMe()).has_main_web_app) return;
      return { text: '🎮 Мой профиль', url };
    };
    const alertPages = new Map<string, number>();
    // Telegram alerts are personal and limited to 200 characters.
    bot.callbackQuery('ach:list', async (c) => {
      if (!c.chat || !(await targeted(c))) {
        await c.answerCallbackQuery();
        return;
      }
      const button = await launchButton(c);
      if (button) {
        await c.editMessageReplyMarkup({ reply_markup: { inline_keyboard: [[button]] } });
        await c.answerCallbackQuery({ text: 'Коллекция подключена. Нажмите кнопку ещё раз.' });
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
      await next();
    });
    bot.command(['profile', 'achievements'], async (c) => {
      if (!c.from || c.msg.sender_chat || !(await targeted(c))) return;
      const button = (await launchButton(c)) ?? {
        text: '🏆 Мои ачивки',
        callback_data: 'ach:list',
      };
      await c.reply('Профиль GameDev', { reply_markup: { inline_keyboard: [[button]] } });
    });
  }
}
