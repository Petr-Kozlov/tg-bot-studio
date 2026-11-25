import { Logger } from '@nestjs/common';
import type { Bot } from 'grammy';
import type { AiAssistantService, AiConfig, ChatMessage } from './ai-assistant.service';

/** Keep only recent AI turns. Ordinary chat messages never enter the provider context. */
export function registerGroupChat(
  bot: Bot,
  chat: string | undefined,
  config: AiConfig,
  ai: Pick<AiAssistantService, 'groupAnswer' | 'postComment' | 'isConfigured'>,
  botId: string,
) {
  if (!chat) return;
  const replies = new Map<number, { time: number; history: ChatMessage[] }>();
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
        const sent = await ctx.reply(comment, { reply_parameters: { message_id: m.message_id } });
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
  bot.on('message:text', async (ctx, next) => {
    try {
      const msg = ctx.message;
      if (
        String(ctx.chat.id) !== chat ||
        msg.sender_chat ||
        !ctx.from ||
        ctx.from.is_bot ||
        msg.text.startsWith('/') ||
        !ai.isConfigured(config)
      )
        return;
      const mention = msg.entities?.find(
        (e) =>
          e.type === 'mention' &&
          msg.text.slice(e.offset, e.offset + e.length).toLowerCase() ===
            '@' + ctx.me.username.toLowerCase(),
      );
      const now = Date.now(),
        cutoff = now - 3600000;
      const parent =
        msg.reply_to_message?.from?.id === ctx.me.id
          ? replies.get(msg.reply_to_message.message_id)
          : undefined;
      const history = parent && parent.time > cutoff ? parent.history : [];
      if (!mention && !history.length) return;
      const text = (
        mention
          ? msg.text.slice(0, mention.offset) + msg.text.slice(mention.offset + mention.length)
          : msg.text
      ).trim();
      if (!text) return;
      const options = {
        reply_parameters: { message_id: msg.message_id },
        ...(msg.is_topic_message ? { message_thread_id: msg.message_thread_id } : {}),
      };
      for (const [id, times] of usage) if (times[times.length - 1] <= cutoff) usage.delete(id);
      const times = (usage.get(ctx.from.id) ?? []).filter((t) => t > cutoff);
      if (times.length >= 10) return;
      usage.set(ctx.from.id, [...times, now]);
      const turns: ChatMessage[] = [...history, { role: 'user', content: text.slice(0, 1600) }];
      let answer: string;
      try {
        answer = (
          await ai.groupAnswer(config, turns, {
            bot: botId,
            chat,
            user: ctx.from.id,
            message: msg.message_id,
          })
        ).trim();
      } catch {
        await ctx.reply('Сейчас не получается ответить. Попробуй чуть позже.', options);
        return;
      }
      if (!answer) return;
      const response = await ctx.reply(answer.slice(0, 4000), options);
      const depth = Math.max(1, Math.min(4, config.historyLimit || 2));
      const chain: ChatMessage[] = [
        ...turns,
        { role: 'assistant', content: answer.slice(0, 1600) },
      ];
      for (const [id, value] of replies) if (value.time <= cutoff) replies.delete(id);
      if (replies.size >= 256) replies.delete(replies.keys().next().value!);
      replies.set(response.message_id, { time: now, history: chain.slice(-2 * depth) });
    } finally {
      await next();
    }
  });
}
