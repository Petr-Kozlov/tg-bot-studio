import 'reflect-metadata';
import { test, expect } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { readFileSync } from 'node:fs';
import { findModule } from '../bot-engine/module-registry';
import { SocialRatingRuntime } from '../modules/social-rating/social-rating.runtime';

test('awards one point per giver and original group message; ranks the last 30 days', async () => {
  const db = new PrismaClient({
    adapter: new PrismaLibSql({ url: ':memory:' }),
  });
  try {
    await db.$executeRawUnsafe('CREATE TABLE bots (id TEXT PRIMARY KEY)');
    await db.$executeRawUnsafe("INSERT INTO bots VALUES ('b')");
    const migration =
      readFileSync('prisma/migrations/20261124000000_social_rating/migration.sql', 'utf8') +
      readFileSync(
        'prisma/migrations/20261124010000_rating_message_authors/migration.sql',
        'utf8',
      ) +
      readFileSync(
        'prisma/migrations/20261124020000_social_rating_penalties/migration.sql',
        'utf8',
      );
    for (const sql of migration
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean))
      await db.$executeRawUnsafe(sql);
    const handlers = new Map<string, Function>();
    const register = (name: string | string[], fn: Function) => {
      for (const key of [name].flat()) handlers.set(key, fn);
    };
    const config = { ...findModule('social-rating')!.defaultConfig };
    const runtime = new SocialRatingRuntime(
      db as never,
      { isTargeted: async () => true, getEffectiveConfig: async () => config } as never,
      { register() {} } as never,
    );
    runtime.register({ botId: 'b', config: {}, bot: { command: register, on: register } as never });
    const out: string[] = [];
    const c = {
      chat: { id: -1, type: 'supergroup' },
      from: { id: 11, first_name: 'Ира', is_bot: false },
      msg: {
        text: 'Спасибо, помогло!',
        reply_to_message: { message_id: 10, from: { id: 22, first_name: 'Маша', is_bot: false } },
      },
      reply: async (t: string) => out.push(t),
    };
    const send = (ctx: unknown) => handlers.get('message:text')!(ctx, async () => {});
    await send({
      ...c,
      reply: (text: string, options: unknown) => {
        expect(options).toEqual({ reply_parameters: { message_id: 10 } });
        return c.reply(text);
      },
    });
    await send(c);
    await send({ ...c, from: c.msg.reply_to_message.from });
    await send({ ...c, msg: { text: 'Спасибо всем' } });
    await send({ ...c, msg: { ...c.msg, text: 'спасибочки' } });
    await send({ ...c, chat: { ...c.chat, type: 'private' } });
    expect(out).toHaveLength(1);
    await send({ ...c, from: { ...c.from, id: 33 }, msg: { ...c.msg, text: 'СПС!' } });
    await send({
      ...c,
      msg: { text: 'Благодарю!', reply_to_message: { ...c.msg.reply_to_message, message_id: 12 } },
    });
    expect(out).toHaveLength(3);
    await handlers.get('rating')!(c);
    expect(out.at(-1)).toBe('Социальный рейтинг · Маша: 3');
    await handlers.get('rating')!({ ...c, msg: {} });
    expect(out.at(-1)).toBe('Социальный рейтинг · Ира: 0');
    await db.socialRatingAward.updateMany({
      where: { messageId: 12 },
      data: { awardedAt: new Date(Date.now() - 31 * 86400000) },
    });
    await handlers.get('toprating')!(c);
    expect(out.at(-1)).toContain('Маша — 2');
    await handlers.get('toprating')!({ ...c, chat: { ...c.chat, id: -2 } });
    expect(out.at(-1)).toContain('Пока нет благодарностей');
    const author = c.msg.reply_to_message.from;
    const chat = c.chat;
    const run = (name: string, update: unknown) => handlers.get(name)!(update, async () => {});
    const observe = (message_id: number) =>
      run('message', { chat, msg: { message_id, from: author } });
    const notices: Array<[string, unknown]> = [];
    const react = (message_id: number, id: number, before: string[], after: string[]) => {
      const types = (list: string[]) => list.map((emoji) => ({ type: 'emoji', emoji }));
      return run('message_reaction', {
        chat,
        reply: async (text: string, options: unknown) => notices.push([text, options]),
        messageReaction: {
          chat,
          message_id,
          user: { id },
          old_reaction: types(before),
          new_reaction: types(after),
        },
      });
    };
    await observe(10);
    await observe(55);
    await observe(55);
    config.notifyReactionAward = true;
    await react(10, 11, [], ['🙏']); // Already thanked by text.
    await react(55, 22, [], ['🙏']); // Author's own reaction.
    await react(99, 33, [], ['🙏']); // Unknown author.
    await react(55, 33, [], ['👍']);
    expect(await db.socialRatingAward.count()).toBe(3);
    await react(55, 33, [], ['🙏']);
    await react(55, 33, ['🙏'], []);
    await react(55, 33, [], ['🙏']);
    await send({
      ...c,
      from: { ...c.from, id: 33 },
      msg: { ...c.msg, reply_to_message: { ...c.msg.reply_to_message, message_id: 55 } },
    });
    expect(notices).toEqual([[out[0], { reply_parameters: { message_id: 55 } }]]);
    config.notifyReactionAward = false;
    expect(await db.socialRatingAward.count()).toBe(4);
    await handlers.get('rating')!(c);
    expect(out.at(-1)).toBe('Социальный рейтинг · Маша: 4');
    await handlers.get('toprating')!(c);
    expect(out.at(-1)).toContain('🥇 Маша — 3');
    Object.assign(config, {
      rankMedals: '🎖️',
      topRow: '{rank} {medal} {name} +{score}',
      topTitle: 'Наши герои',
      reactionEmoji: '👍',
      balanceText: '{name} ★ {score}',
    });
    await react(55, 44, [], ['🙏']);
    await react(55, 44, [], ['👍']);
    expect(notices).toHaveLength(1);
    await handlers.get('rating')!(c);
    expect(out.at(-1)).toBe('Маша ★ 5');
    await handlers.get('toprating')!(c);
    expect(out.at(-1)).toBe('Наши герои\n1 🎖️ Маша +4');
    const moderate = (cmd: string, reason: string, status: string) =>
      handlers.get(cmd)!({
        ...c,
        msg: { ...c.msg, text: '/' + cmd + ' ' + reason },
        match: reason,
        api: { getChatMember: async () => ({ status }) },
      });
    await moderate('minus', 'причина', 'member');
    await moderate('minus', '', 'administrator');
    expect(await db.socialRatingPenalty.count()).toBe(0);
    Object.assign(config, {
      minusText: '🔻 {name}: {reason}',
      undoMinusText: '✅ {name} — отмена ({reason})',
    });
    await moderate('minus', 'причина', 'administrator');
    expect(out.at(-1)).toBe('🔻 Маша: причина');
    await moderate('minus', 'ещё', 'creator');
    await handlers.get('rating')!(c);
    expect(out.at(-1)).toBe('Маша ★ 4');
    await handlers.get('toprating')!(c);
    expect(out.at(-1)).toContain('Маша +3');
    await moderate('undo_minus', '', 'member');
    expect(await db.socialRatingPenalty.count({ where: { undoneBy: null } })).toBe(1);
    await moderate('undo_minus', '', 'creator');
    expect(out.at(-1)).toBe('✅ Маша — отмена (причина)');
    await moderate('undo_minus', '', 'administrator');
    await handlers.get('rating')!(c);
    expect(out.at(-1)).toBe('Маша ★ 5');
  } finally {
    await db.$disconnect();
  }
});
