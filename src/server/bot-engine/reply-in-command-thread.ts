import type { MiddlewareFn } from 'grammy';

export const replyInCommandThread: MiddlewareFn = async (ctx, next) => {
  const msg = ctx.message;
  if (
    msg?.chat.type === 'supergroup' &&
    !msg.is_topic_message &&
    (msg.message_thread_id || msg.reply_to_message) &&
    msg.entities?.some((entity) => entity.type === 'bot_command' && entity.offset === 0)
  ) {
    // grammY creates a separate API instance per update.
    ctx.api.config.use((prev, method, payload, signal) => {
      if (
        method.startsWith('send') &&
        'chat_id' in payload &&
        payload.chat_id === msg.chat.id &&
        !('reply_parameters' in payload && payload.reply_parameters) &&
        !('message_thread_id' in payload && payload.message_thread_id)
      ) {
        return prev(
          method,
          { ...payload, reply_parameters: { message_id: msg.message_id } },
          signal,
        );
      }
      return prev(method, payload, signal);
    });
  }
  await next();
};
