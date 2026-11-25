import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Bot } from 'grammy';
import { registerGroupChat } from '../modules/ai-assistant/group-chat';
import { AiGamesController } from '../modules/ai-assistant/ai-games.controller';
import type { AiConfig } from '../modules/ai-assistant/ai-assistant.service';

test('documents and games use the source thread, and only complete games get a sandboxed launch URL', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'telegram-game-'));
  const original = process.env.DATA_DIR;
  process.env.DATA_DIR = directory;
  try {
    const bot = new Bot('42:test', { botInfo: { id: 42, username: 'GameDevBot', is_bot: true } as never });
    const sent: { method: string; payload: any }[] = [];
    bot.api.config.use(async (_, method, payload) => {
      if (method === 'getChatMember') return { ok: true, result: { status: 'administrator' } } as never;
      sent.push({ method, payload });
      return { ok: true, result: { message_id: sent.length } } as never;
    });
    const html = '<html><button onclick="this.textContent=1">Ход</button></html>';
    const outputs = ['GAME: game.html\n' + html + '\nEND_FILE', 'FILE: notes.md\n# План\nEND_FILE', 'GAME: game.html\n<html>'];
    registerGroupChat(bot, '-100', { gameOrigin: 'https://games.example' } as AiConfig, {
      isConfigured: () => true, postComment: async () => '',
      groupAnswer: async (_, _turns, actor) => {
        expect(actor.memberTag).toBe('Художник');
        expect(actor.memberStatus).toBe('administrator');
        return outputs.shift()!;
      },
    }, 'bot');
    for (let i = 1; i <= 3; i++) await bot.handleUpdate({ update_id: i, message: {
      date: 1, message_id: i, chat: { type: 'supergroup', id: -100 }, from: { id: 3, is_bot: false, first_name: 'User' },
      text: '@GameDevBot сделай файл', entities: [{ type: 'mention', offset: 0, length: 11 }],
      sender_tag: 'Художник', is_topic_message: true, message_thread_id: 9,
    } } as never);
    expect(sent.map(x => x.method)).toEqual(['sendDocument', 'sendDocument', 'sendMessage']);
    expect(sent[0].payload.message_thread_id).toBe(9);
    expect(sent[0].payload.document.filename).toBe('game.html');
    expect(sent[1].payload.document.filename).toBe('notes.md');
    expect(sent[1].payload.reply_markup).toBeUndefined();
    const button = sent[0].payload.reply_markup.inline_keyboard[0][0];
    expect(button.text).toBe('🎮 Играть');
    const url = new URL(button.url);
    expect(url.origin).toBe('https://games.example');
    const headers: Record<string,string> = {};
    const res = { set(k: string,v: string){ headers[k]=v; }, type(){ return this; }, send(body: string){ return body; } };
    const api = new AiGamesController();
    const page = await api.play(url.pathname.split('/').pop()!, res as never);
    expect(String(page)).toContain('sandbox="allow-scripts"');
    expect(String(page)).toContain('&lt;button onclick=&quot;');
    expect(headers['Content-Security-Policy']).toContain("default-src 'none'");
    await expect(api.play('../wrong', res as never)).rejects.toThrow();
  } finally {
    if (original === undefined) delete process.env.DATA_DIR; else process.env.DATA_DIR = original;
    await rm(directory, { recursive: true, force: true });
  }
});
