import { test, expect } from 'bun:test';
import { PrismaClient } from '@prisma/client';
import { PrismaLibSql } from '@prisma/adapter-libsql';
import type { PrismaService } from '../database/prisma.service';
import { profileRanks } from '../modules/achievements/profile-ranks';

test('scopes standings, keeps personal rank beyond top 100 and applies rolling periods', async () => {
  const client = new PrismaClient({
    adapter: new PrismaLibSql({ url: 'file::memory:?cache=shared' }),
  });
  const rollback = new Error('rollback fixture');
  try {
    await client
      .$transaction(async (db) => {
        const ranks = (viewer: string, mode: string, days: number) =>
          profileRanks(db as PrismaService, 'bot', 'chat', viewer, mode, days);
        for (const sql of [
          'CREATE TABLE achievements(id TEXT,bot_id TEXT,chat_id TEXT)',
          'CREATE TABLE achievement_unlocks(achievement_id TEXT,user_id TEXT)',
          'CREATE TABLE bot_users(bot_id TEXT,telegram_id INTEGER,first_name TEXT,username TEXT)',
          'CREATE TABLE social_rating_message_authors(bot_id TEXT,chat_id TEXT,author TEXT,author_name TEXT,message_id INTEGER)',
          'CREATE TABLE social_rating_awards(bot_id TEXT,chat_id TEXT,recipient TEXT,recipient_name TEXT,awarded_at DATETIME)',
          'CREATE TABLE social_rating_penalties(bot_id TEXT,chat_id TEXT,recipient TEXT,recipient_name TEXT,issued_at DATETIME,undone_by TEXT)',
          "INSERT INTO achievements VALUES ('a','bot','chat'),('b','bot','chat'),('c','bot','other')",
          "WITH RECURSIVE ids(n) AS (SELECT 100 UNION ALL SELECT n+1 FROM ids WHERE n<200) INSERT INTO achievement_unlocks SELECT 'a',CAST(n AS TEXT) FROM ids",
          "INSERT INTO achievement_unlocks VALUES ('b','100'),('c','200')",
          "INSERT INTO bot_users VALUES ('bot',200,'Viewer',NULL)",
        ])
          await db.$executeRawUnsafe(sql);
        const awards = await ranks('200', 'awards', 30);
        expect(awards.rows).toHaveLength(100);
        expect(awards.total).toBe(2);
        expect(awards.me).toEqual({ place: 101, name: 'Viewer', score: 1, mine: true });
        expect(awards.rows[0].score).toBe(2);
        const ago = (days: number) => new Date(Date.now() - days * 86400000);
        for (const age of [2, 15, 60])
          await db.$executeRaw`INSERT INTO social_rating_awards VALUES ('bot','chat','200','Viewer',${ago(age)})`;
        await db.$executeRaw`INSERT INTO social_rating_penalties VALUES ('bot','chat','200','Viewer',${ago(2)},NULL),('bot','chat','200','Viewer',${ago(2)},'mod')`;
        await db.$executeRaw`INSERT INTO social_rating_awards VALUES ('bot','other','200','Viewer',${ago(2)})`;
        for (const [days, score] of [
          [7, 0],
          [30, 1],
          [365, 2],
        ])
          expect((await ranks('200', 'rating', days)).me?.score).toBe(score);
        expect((await ranks('999', 'rating', 30)).me).toBeNull();
        throw rollback;
      })
      .catch((error) => {
        if (error !== rollback) throw error;
      });
  } finally {
    await client.$disconnect();
  }
});
