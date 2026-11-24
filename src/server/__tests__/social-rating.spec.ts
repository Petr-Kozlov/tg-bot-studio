import 'reflect-metadata';
import { test, expect } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import { readFileSync } from 'node:fs';
import { SocialRatingRuntime } from '../modules/social-rating/social-rating.runtime';

test('awards one point per giver and original group message; ranks the last 30 days', async () => {
  const db = new PrismaClient({
    adapter: new PrismaLibSql({ url: ':memory:' }),
  });
  try {
    await db.$executeRawUnsafe('CREATE TABLE bots (id TEXT PRIMARY KEY)');
    await db.$executeRawUnsafe("INSERT INTO bots VALUES ('b')");
    const migration = readFileSync(
      'prisma/migrations/20261124000000_social_rating/migration.sql',
      'utf8',
    );
    for (const sql of migration
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean))
      await db.$executeRawUnsafe(sql);
    const handlers = new Map<string, Function>();
    const register = (name: string, fn: Function) => handlers.set(name, fn);
    const runtime = new SocialRatingRuntime(
      db as never,
      { isTargeted: async () => true } as never,
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
    await send(c);
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
  } finally {
    await db.$disconnect();
  }
});
