import { GrammyError, InputFile, type Context } from 'grammy';
import { Logger } from '@nestjs/common';
import { escapeHtml } from '../../common/utils/telegram-text.util';
import { iconFile } from './achievement-icons';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../../database/prisma.service';

type Unlock = {
  icon: string;
  title: string;
  description: string;
  user_id: string;
  author_name: string | null;
};
type Batch = {
  bot: string;
  chat: string;
  rows: (Unlock & { messageId: number })[];
  config: Record<string, unknown>;
};
const batches = new WeakMap<Context, Batch>();

export function beginUnlockNotices(
  c: Context,
  bot: string,
  chat: number,
  config: Record<string, unknown>,
) {
  if (config.notifyUnlock === true) batches.set(c, { bot, chat: String(chat), rows: [], config });
}

// Read the trigger's inserts inside the writing transaction so concurrent updates cannot claim each other's notices.
export async function captureUnlocks<T>(
  c: Context,
  db: PrismaService,
  messageId: number,
  write: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  const batch = batches.get(c);
  if (!batch) return write(db);
  const { result, rows } = await db.$transaction(async (tx) => {
    const [before] = await tx.$queryRaw<
      { id: bigint }[]
    >`SELECT COALESCE(MAX(rowid),0) id FROM achievement_unlocks`;
    const result = await write(tx);
    const rows = await tx.$queryRaw<
      Unlock[]
    >`SELECT a.title,a.icon,a.description,u.user_id,m.author_name FROM achievement_unlocks u
 JOIN achievements a ON a.id=u.achievement_id LEFT JOIN social_rating_message_authors m ON m.bot_id=a.bot_id AND m.chat_id=a.chat_id AND m.message_id=${messageId} AND m.author=u.user_id
 WHERE u.rowid>${before.id} AND a.bot_id=${batch.bot} AND a.chat_id=${batch.chat} ORDER BY u.rowid`;
    return { result, rows };
  });
  for (const row of rows) batch.rows.push({ ...row, messageId });
  return result;
}

export async function sendUnlockNotices(c: Context, db: PrismaService) {
  const batch = batches.get(c);
  batches.delete(c);
  if (!batch?.rows.length) return;
  const { config } = batch;
  const template = String(config.unlockText ?? '').trim();
  if (!template) return;
  const label = String(config.unlockButton ?? '')
    .trim()
    .slice(0, 64);
  const url = String(config.launchUrl ?? '');
  const button =
    url === 'https://t.me/' + c.me.username + '?startapp'
      ? { text: label, url }
      : { text: label, callback_data: 'ach:list' };
  const actor = c.messageReaction?.user ?? c.from,
    reply = c.message?.reply_to_message?.from;
  for (const row of batch.rows) {
    const [n] = await db.$queryRaw<
      { opened: bigint; total: bigint }[]
    >`SELECT COUNT(u.achievement_id) opened,COUNT(*) total FROM achievements a LEFT JOIN achievement_unlocks u ON u.achievement_id=a.id AND u.user_id=${row.user_id} WHERE a.bot_id=${batch.bot} AND a.chat_id=${batch.chat}`;
    const name =
      [actor, reply].find((x) => x && String(x.id) === row.user_id)?.first_name ??
      row.author_name ??
      row.user_id;
    const vars: Record<string, string> = {
      name,
      title: row.title,
      description: row.description,
      opened: String(n.opened),
      total: String(n.total),
    };
    const html = config.unlockHtml === true;
    const render = (source: string, formatted: boolean) =>
      source.replace(/\{(name|title|description|opened|total)\}/g, (_, key: string) =>
        formatted ? escapeHtml(vars[key]).replace(/"/g, '&quot;') : vars[key],
      ).trim();
    const options = {
      reply_parameters: { message_id: row.messageId },
      ...(label ? { reply_markup: { inline_keyboard: [[button]] } } : {}),
    };
    let photo: InputFile | undefined;
    if (row.icon) {
      try {
        const bytes = await new Bun.Image(Bun.file(iconFile(row.icon))).png().bytes();
        photo = new InputFile(bytes, 'achievement.png');
      } catch {
        Logger.warn(
          'Unable to read achievement icon; sending text notification',
          'AchievementRuntime',
        );
      }
    }
    const send = async (text: string, formatted: boolean) => {
      const format = formatted ? { parse_mode: 'HTML' as const } : {};
      if (photo) await c.replyWithPhoto(photo, { ...options, ...format, caption: text });
      else await c.reply(text, { ...options, ...format });
    };
    if (html) {
      try {
        await send(render(template, true), true);
        continue;
      } catch (error) {
        if (!(error instanceof GrammyError && error.error_code === 400 &&
          /parse entities|too long|custom emoji|CUSTOM_EMOJI/i.test(error.description))) throw error;
        Logger.warn('Telegram rejected achievement formatting; sending plain text', 'AchievementRuntime');
      }
    }
    const plain = render(html ? template.replace(/<\/?[a-z][^>]*>/gi, '') : template, false);
    if (!plain) continue;
    const limit = photo ? 1024 : 4096;
    const chars = Array.from(plain);
    await send(chars.length <= limit ? plain :
      chars.slice(0, limit - 224).join('') + '…' + chars.slice(-223).join(''), false);
  }
}
