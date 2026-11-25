import { expect, test } from 'bun:test';
import { Bot } from 'grammy';
import { registerGroupChat } from '../modules/ai-assistant/group-chat';
import type { AiConfig, ChatMessage } from '../modules/ai-assistant/ai-assistant.service';

test('only answers direct group turns, keeps reply chains separate and limits calls', async () => {
  const bot = new Bot('42:test', {
    botInfo: { id: 42, is_bot: true, username: 'GameDevBot', first_name: 'Bot' } as never,
  });
  let configured = false,
    id = 1;
  const history: ChatMessage[][] = [],
    sent: { message_id: number; chat_id: number; reply_parameters: { message_id: number } }[] = [];
  bot.api.config.use(async (_prev, _method, payload) => {
    const msg = { ...payload, message_id: 300 + sent.length } as (typeof sent)[number];
    sent.push(msg);
    return { ok: true, result: msg } as never;
  });
  registerGroupChat(
    bot,
    '-100',
    { historyLimit: 2 } as AiConfig,
    {
      postComment: async () => {
        throw Error('unexpected channel comment');
      },
      isConfigured: () => configured,
      groupAnswer: async (_cfg, turns, actor) => {
        expect(actor.chat).toBe('-100');
        expect(actor.user).toBeGreaterThan(0);
        history.push(turns);
        return 'Короткий ответ';
      },
    },
    'bot',
  );
  async function message(text: string, chat = -100, reply?: number, actor = 5) {
    const user = { is_bot: false, id: actor, first_name: 'Участник' };
    const info = { type: chat > 0 ? 'private' : 'supergroup', id: chat };
    const tag = text.indexOf('@GameDevBot');
    await bot.handleUpdate({
      update_id: ++id,
      message: {
        date: 1,
        message_id: id,
        chat: info,
        from: user,
        text,
        entities: tag < 0 ? [] : [{ type: 'mention', offset: tag, length: 11 }],
        ...(reply
          ? {
              reply_to_message: {
                chat: info,
                date: 1,
                message_id: reply,
                from: bot.botInfo,
                text: 'Сообщение бота',
              },
            }
          : {}),
      },
    } as never);
  }
  await message('@GameDevBot привет');
  configured = true;
  await message('@GameDevBot привет', 5);
  await message('@GameDevBot привет', -200);
  await message('привет');
  await message('/rules @GameDevBot');
  await message('спасибо', -100, 42);
  expect(history).toHaveLength(0);
  await message('@GameDevBot привет');
  expect(history[0]).toEqual([{ role: 'user', content: 'привет' }]);
  expect(sent[0].reply_parameters.message_id).toBe(id);
  await message('ещё идею', -100, sent[0].message_id);
  expect(history[1].map((m) => m.content)).toEqual(['привет', 'Короткий ответ', 'ещё идею']);
  for (let i = 0; i < 10; i++) await message('@GameDevBot новая тема');
  expect(history).toHaveLength(10);
  expect(history[2]).toHaveLength(1);
  await message('@GameDevBot другая тема', -100, undefined, 6);
  expect(history).toHaveLength(11);
});

test('comments on an automatic channel copy in its discussion thread, skips manual forwards and edits', async () => {
  const bot = new Bot('42:test', {
    botInfo: { id: 42, is_bot: true, username: 'GameDevBot', first_name: 'Bot' } as never,
  });
  const seen = new Set<string>(),
    sent: number[] = [];
  bot.api.config.use(async (_, method, p) => {
    if (method === 'sendMessage')
      sent.push((p as { reply_parameters: { message_id: number } }).reply_parameters.message_id);
    return { ok: true, result: { message_id: 200 + sent.length } } as never;
  });
  registerGroupChat(
    bot,
    '-100',
    { commentChannelPosts: true } as AiConfig,
    {
      isConfigured: () => true,
      groupAnswer: async () => {
        throw Error('Unexpected group turn');
      },
      postComment: async (_, text, actor) => {
        expect(text).toBeTruthy();
        if (seen.has(actor.postKey)) return '';
        seen.add(actor.postKey);
        return 'Комментарий';
      },
    },
    'bot',
  );
  const channel = { id: -200, type: 'channel' },
    msg = {
      chat: { id: -100, type: 'supergroup' },
      sender_chat: channel,
      is_automatic_forward: true,
      message_id: 15,
      date: 1,
      forward_origin: { type: 'channel', chat: channel, message_id: 7, date: 1 },
      photo: [{}],
      caption: 'Студия Unibox',
      media_group_id: '1000',
    };
  for (const [index, update] of [
    { message: { ...msg, is_automatic_forward: false } },
    { edited_message: msg },
    { channel_post: msg },
    { message: msg },
    { message: { ...msg, message_id: 16, caption: undefined } },
    { message: { ...msg, chat: { id: -150, type: 'supergroup' } } },
  ].entries()) {
    await bot.handleUpdate({ update_id: index + 1, ...update } as never);
  }
  expect(sent).toEqual([15]);
  expect([...seen]).toEqual(['-200/album:1000']);
});
