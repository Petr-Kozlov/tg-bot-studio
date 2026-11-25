import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import type { PrismaService } from '../database/prisma.service';
import { AiModel } from '../modules/ai-assistant/ai.model';

test('group AI usage records one request per message and separates actors and missing usage', async () => {
  const db = new PrismaClient({ adapter: new PrismaLibSql({ url: 'file::memory:?cache=shared' }) });
  const rollback = new Error('fixture');
  try {
    await db
      .$transaction(async (tx) => {
        await tx.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS bots(id TEXT PRIMARY KEY)');
        await tx.$executeRawUnsafe("INSERT INTO bots(id) VALUES ('fixture')");
        for (const sql of readFileSync(
          'prisma/migrations/20261125010000_group_ai_usage/migration.sql',
          'utf8',
        )
          .split(';')
          .filter((v) => v.trim()))
          await tx.$executeRawUnsafe(sql);
        for (const sql of readFileSync(
          'prisma/migrations/20261125020000_channel_comment_identity/migration.sql',
          'utf8',
        )
          .split(';')
          .filter((s) => s.trim()))
          await tx.$executeRawUnsafe(sql);
        const model = new AiModel(tx as PrismaService);
        const actor = { bot: 'fixture', chat: '-1', user: 51, message: 12 };
        const id = await model.startGroupCall(actor, '20b');
        expect(id).toBeTruthy();
        expect(await model.startGroupCall(actor, '20b')).toBeNull();
        await model.endGroupCall(id!, { prompt_tokens: 31, completion_tokens: 7 }, false);
        const failed = await model.startGroupCall({ ...actor, user: 52, message: 13 }, '20b');
        await model.endGroupCall(failed!, null, true);
        const rows = await model.groupUsage('fixture', '2000');
        expect(rows[0]).toMatchObject({
          user: '51',
          requests: 1,
          input: 31,
          output: 7,
          missing: 0,
          errors: 0,
        });
        expect(rows[1]).toMatchObject({ user: '52', requests: 1, errors: 1, missing: 1 });
        expect(await model.groupUsage('other', '2000')).toEqual([]);
        expect(
          await model.startGroupCall({ ...actor, message: 40, postKey: 'album:1' }, '20b'),
        ).toBeTruthy();
        expect(
          await model.startGroupCall({ ...actor, message: 41, postKey: 'album:1' }, '20b'),
        ).toBeNull();
        const unsolicited = { ...actor, spontaneous: true, message: 50 };
        expect(await model.startGroupCall(unsolicited, '20b')).toBeTruthy();
        expect(await model.startGroupCall({ ...unsolicited, message: 51 }, '20b')).toBeNull();
        expect(await model.startGroupCall({ ...actor, message: 52 }, '20b')).toBeTruthy();
        throw rollback;
      })
      .catch((e) => {
        if (e !== rollback) throw e;
      });
  } finally {
    await db.$disconnect();
  }
});
