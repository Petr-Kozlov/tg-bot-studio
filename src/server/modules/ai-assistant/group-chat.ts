import { GROUP_AI_LIMIT_DEFAULTS } from '../../bot-engine/module-registry';
import { Logger } from '@nestjs/common';
import { InputFile, type Bot } from 'grammy';
import { applyDocumentEdits, DocumentError, readSourceDocument, type SourceDocument } from './source-document';
import { GameMemory, gameEdit, specificGameEdit } from './game-memory';
import { telegramParts } from './telegram-parts';
import { asksForGame, generatedFile } from './generated-file';
import { publishGame } from './ai-games.controller';
import { profileQuestion, type ProfileIdentity } from './ai-assistant.service';
import type { AiAssistantService, AiConfig, ChatMessage } from './ai-assistant.service';

/** Keep only recent AI turns. Ordinary chat messages never enter the provider context. */
export function registerGroupChat(
  bot: Bot,
  chat: string | undefined,
  config: AiConfig,
  ai: Pick<AiAssistantService, 'groupAnswer' | 'postComment' | 'isConfigured'> & Partial<Pick<AiAssistantService, 'usernameCandidate'>>,
  botId: string,
) {
  if (!chat) return;
  const replies = new Map<number, { time: number; history: ChatMessage[] }>();
  const requestLimit = config.groupRequestLimit ?? GROUP_AI_LIMIT_DEFAULTS.groupRequestLimit;
  const windowMs = (config.groupWindowMinutes ?? GROUP_AI_LIMIT_DEFAULTS.groupWindowMinutes) * 60_000;
  const usage = new Map<number, number[]>();
  if (config.commentChannelPosts) {
    bot.on('message', async (ctx, next) => {
      const m = ctx.message;
      try {
        if (
          String(ctx.chat.id) !== chat ||
          !m.is_automatic_forward ||
          m.sender_chat?.type !== 'channel' ||
          !ai.isConfigured(config)
        )
          return;
        const origin = m.forward_origin;
        const postId =
          origin?.type === 'channel' && origin.chat.id === m.sender_chat.id
            ? origin.message_id
            : m.message_id;
        const key =
          m.sender_chat.id +
          '/' +
          (m.media_group_id ? 'album:' + m.media_group_id : 'post:' + postId);
        const media = m.photo
          ? 'Фото'
          : m.video
            ? 'Видео'
            : m.poll
              ? 'Опрос'
              : m.animation
                ? 'Анимация'
                : m.document
                  ? 'Документ'
                  : m.audio
                    ? 'Аудио'
                    : m.voice
                      ? 'Голосовое сообщение'
                      : m.sticker
                        ? 'Стикер'
                        : '';
        const post = (m.text || m.caption || m.poll?.question || media).trim().slice(0, 3600);
        if (!post) return;
        const content = await ai.postComment(config, post, {
          bot: botId,
          chat,
          user: m.sender_chat.id,
          message: m.message_id,
          postKey: key,
        });
        const comment = content.trim().slice(0, 800);
        if (!comment) return;
        const [part] = telegramParts(comment);
        if (!part) return;
        const sent = await ctx.reply(part.text, { entities: part.entities, reply_parameters: { message_id: m.message_id } });
        if (replies.size >= 256) replies.delete(replies.keys().next().value!);
        replies.set(sent.message_id, {
          time: Date.now(),
          history: [
            { role: 'user', content: post.slice(0, 1600) },
            { role: 'assistant', content: comment },
          ],
        });
      } catch {
        Logger.warn('Unable to comment on a linked channel post', 'AiAssistantRuntime');
      } finally {
        await next();
      }
    });
  }
  bot.on(['message:text', 'message:photo', 'message:document'], async (ctx, next) => {
    let unlock: (() => void) | undefined;
    try {
      const msg = ctx.message;
      const body = msg.text ?? msg.caption ?? '';
      if (
        String(ctx.chat.id) !== chat ||
        msg.sender_chat ||
        !ctx.from ||
        ctx.from.is_bot ||
        body.startsWith('/') ||
        !ai.isConfigured(config)
      )
        return;
      const mention = (msg.entities ?? msg.caption_entities)?.find(
        (e) =>
          e.type === 'mention' &&
          body.slice(e.offset, e.offset + e.length).toLowerCase() ===
            '@' + ctx.me.username.toLowerCase(),
      );
      const now = Date.now(),
        cutoff = now - 3600000;
      const parent =
        msg.reply_to_message?.from?.id === ctx.me.id
          ? replies.get(msg.reply_to_message.message_id)
          : undefined;
      const memory = config.gameModel ? new GameMemory(botId, chat, msg.message_thread_id ?? 0, ctx.from.id) : undefined;
      const edit = gameEdit.test(body);
      const possibleFollowup = !msg.reply_to_message && edit && specificGameEdit.test(body);
      const addressed = !!mention || msg.reply_to_message?.from?.id === ctx.me.id;
      if (addressed || possibleFollowup) unlock = await memory?.lock();
      const saved = addressed || possibleFollowup ? await memory?.read() : undefined;
      const followup = possibleFollowup && !!saved?.game;
      const history = parent && parent.time > cutoff ? parent.history : (addressed || followup ? saved?.history ?? [] : []);
      const source = msg.reply_to_message;
      const document = msg.document ?? source?.document;
      const replyToBotFile = source?.from?.id === ctx.me.id && !!source.document;
      const spontaneous = !mention && !(memory && addressed) && !followup && !history.length && !replyToBotFile;
      if (spontaneous && (!config.spontaneousReplies || msg.reply_to_message || !msg.text ||
          msg.entities?.some(e => ['mention', 'text_mention', 'bot_command'].includes(e.type)) ||
          body.length < 24 || !body.trimEnd().endsWith('?') || Math.random() >= 0.05)) return;
      const text = (
        mention
          ? body.slice(0, mention.offset) + body.slice(mention.offset + mention.length)
          : body
      ).trim();
      const photos = msg.photo ?? source?.photo;
      if (!text && !photos?.length) return;
      const options = {
        reply_parameters: { message_id: msg.message_id },
        ...(msg.is_topic_message ? { message_thread_id: msg.message_thread_id } : {}),
      };
      const usageCutoff = now - windowMs;
      for (const [id, times] of usage) if (times[times.length - 1] <= usageCutoff) usage.delete(id);
      const times = (usage.get(ctx.from.id) ?? []).filter((t) => t > usageCutoff);
      if (times.length >= requestLimit) return;
      if (!spontaneous) usage.set(ctx.from.id, [...times, now]);
      const original = !history.length && (source?.text || source?.caption);
      const content = [
        original && 'Исходное сообщение: ' + original.slice(0, 2000),
        msg.quote?.text && 'Выделенная цитата: ' + msg.quote.text.slice(0, 1000),
        (original || msg.quote ? 'Вопрос участника: ' : '') + (text.slice(0, 4096) || 'Что на картинке?'),
      ].filter(Boolean).join('\n');
      const turns: ChatMessage[] = [...history, { role: 'user', content }];
      const editingSaved = !document && !photos?.length && saved?.game && edit && !asksForGame(text);
      let attachment: SourceDocument | undefined = editingSaved ? saved.game : undefined;
      if (editingSaved && saved.requirements.length) turns.splice(0, 0, { role: 'user', content: 'Ранее запрошенные свойства игры: ' + saved.requirements.join('; ') });
      let answer: string;
      try {
        let image: string | undefined;
        if (document) {
          const ownGame = !msg.document && replyToBotFile && source?.reply_markup?.inline_keyboard.flat().some(button =>
            'url' in button && button.url.startsWith(config.gameOrigin + '/api/ai-games/'));
          attachment = await readSourceDocument(bot, document, !!ownGame);
        }
        if (!document && photos?.length) {
          if (!config.visionModel?.trim() && config.provider !== 'groq' || config.provider === 'gemini') {
            await ctx.reply('Для этого чата ещё не настроен разбор фотографий.', options);
            return;
          }
          const photo = [...photos].reverse().find(p => p.width <= 1600 && (p.file_size ?? 0) <= 4_000_000) ?? photos[0];
          const file = await bot.api.getFile(photo.file_id);
          if (!file.file_path || (file.file_size ?? 0) > 4_000_000) throw Error('Invalid photo');
          const result = await fetch('https://api.telegram.org/file/bot' + bot.token + '/' + file.file_path,
            { signal: AbortSignal.timeout(10000), redirect: 'error' });
          if (!result.ok) throw Error('Photo download failed');
          const bytes = Buffer.from(await result.arrayBuffer());
          if (!bytes.length || bytes.length > 4_000_000) throw Error('Invalid photo size');
          image = 'data:image/jpeg;base64,' + bytes.toString('base64');
        }
        const member = spontaneous ? null : await bot.api.getChatMember(ctx.chat.id, ctx.from.id).catch(() => null);
        const identity = (u: ProfileIdentity): ProfileIdentity => ({ id: u.id, first_name: u.first_name, last_name: u.last_name, username: u.username });
        let subject = ctx.from;
        let birthdate: string | undefined;
        let unresolved = false;
        if (!spontaneous && profileQuestion.test(text) && !attachment && !image) {
          const target = (msg.entities ?? msg.caption_entities ?? []).find(e =>
            e.type === 'text_mention' || (e.type === 'mention' && e.offset !== mention?.offset));
          const self = /(?:у меня|мне|мой|моя|моё|мои|когда я|меня зовут|меня по)/iu.test(text);
          if (target?.type === 'text_mention') subject = target.user;
          else if (target?.type === 'mention') {
            const handle = body.slice(target.offset + 1, target.offset + target.length).toLowerCase();
            const known = [ctx.from, source?.from].find(u => u?.username?.toLowerCase() === handle);
            const candidate = known?.id ?? await ai.usernameCandidate?.(botId, handle);
            const verified = candidate ? await bot.api.getChatMember(ctx.chat.id, candidate).catch(() => null) : null;
            if (known) subject = known;
            else if (verified && verified.status !== 'left' && verified.status !== 'kicked' && verified.user.username?.toLowerCase() === handle) subject = verified.user;
            else unresolved = true;
          } else if (!self && source?.from && source.from.id !== ctx.me.id && !source.sender_chat) subject = source.from;
          else if (!self && /у\s+[\p{L}]+|его рейтинг|её рейтинг|автора|этого участника/iu.test(text)) unresolved = true;
          if (!unresolved && self && subject.id === ctx.from.id && /рождени|рождень|родил|birthday/iu.test(text)) {
            const full = await bot.api.getChat(subject.id).catch(() => null);
            const date = full?.type === 'private' ? full.birthdate : undefined;
            if (date) birthdate = [date.day, date.month, date.year].filter(Boolean).join('.');
          }
        }
        answer = (
          await ai.groupAnswer(config, turns, {
            bot: botId,
            chat,
            user: ctx.from.id, sender: identity(ctx.from), subject: identity(subject), birthdate, unresolved,
            message: msg.message_id,
            memberStatus: member?.status,
            memberTag: msg.sender_tag || (member && 'custom_title' in member ? member.custom_title : undefined),
            ...(spontaneous ? { spontaneous: true } : {}),
          }, image, attachment)
        ).trim();
      } catch (error) {
        if (!spontaneous) await ctx.reply(error instanceof DocumentError ? error.message : 'Сейчас не получается ответить. Попробуй чуть позже.', options);
        return;
      }
      if (!answer) return;
      let file;
      try {
        if (attachment && /^(?:GAME|FILE):/.test(answer)) {
          if (!attachment.game) throw Error('Expected edits');
          file = generatedFile(answer, true);
          if (!file?.game || Buffer.byteLength(file.content) > 65536) throw Error('Invalid game revision');
          file.name = attachment.name;
        } else {
          file = attachment ? applyDocumentEdits(attachment, answer) : spontaneous ? null : generatedFile(answer, asksForGame(text));
        }
      } catch {
        Logger.warn({ event: 'game-file-validation', bot: botId, message: msg.message_id, editing: !!attachment, bytes: Buffer.byteLength(answer) }, 'AiAssistantRuntime');
        await ctx.reply(attachment ? 'Не удалось однозначно применить правку. Исходник сохранён. Попробуй попросить одно изменение за раз.' : 'Файл получился неполным. Попробуй запросить более короткую версию.', options);
        return;
      }
      let playUrl: string | undefined;
      if (file?.game && config.gameOrigin) {
        try {
          playUrl = await publishGame(file.content, config.gameOrigin);
        } catch {
          Logger.warn('Unable to publish generated game', 'AiAssistantRuntime');
        }
      }
      const responseIds: number[] = [];
      if (file) {
        const response = await ctx.replyWithDocument(new InputFile(Buffer.from(file.content), file.name), {
            ...options,
            ...(playUrl ? { reply_markup: { inline_keyboard: [[{ text: '🎮 Играть', url: playUrl }]] } } : {}),
          });
        responseIds.push(response.message_id);
      } else {
        for (const part of telegramParts(answer)) {
          const response = await ctx.reply(part.text, { ...options, entities: part.entities });
          responseIds.push(response.message_id);
        }
      }
      const depth = Math.max(1, Math.min(8, config.historyLimit || 2));
      const chain: ChatMessage[] = [
        ...turns,
        { role: 'assistant', content: file ? 'Выдан файл ' + file.name : answer.slice(0, 1600) },
      ];
      if (memory && !spontaneous) {
        const previous = saved;
        if (!previous || previous.message < msg.message_id) {
          const requirements = file?.game ? [...(attachment?.game ? saved?.requirements ?? [] : []), text.slice(0, 500)].slice(-8) : previous?.requirements ?? [];
          await memory.save({ history: chain.slice(-2 * depth), requirements, game: file?.game ? file : previous?.game, message: msg.message_id });
        }
      }
      for (const [id, value] of replies) if (value.time <= cutoff) replies.delete(id);
      if (replies.size >= 256) replies.delete(replies.keys().next().value!);
      for (const id of responseIds) replies.set(id, { time: now, history: chain.slice(-2 * depth) });
    } finally {
      unlock?.();
      await next();
    }
  });
}
