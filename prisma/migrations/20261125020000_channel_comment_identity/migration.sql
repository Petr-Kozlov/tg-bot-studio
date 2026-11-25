ALTER TABLE group_ai_usage ADD COLUMN post_key TEXT;
CREATE UNIQUE INDEX group_ai_usage_post_key ON group_ai_usage(bot_id,chat_id,post_key);
