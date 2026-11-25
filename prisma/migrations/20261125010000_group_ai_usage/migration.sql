CREATE TABLE group_ai_usage (
 id TEXT PRIMARY KEY NOT NULL, bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
 chat_id TEXT NOT NULL,user_id TEXT NOT NULL,message_id INTEGER NOT NULL,model TEXT NOT NULL,
 created_at TEXT NOT NULL,status TEXT NOT NULL,prompt_tokens INTEGER,completion_tokens INTEGER,
 UNIQUE(bot_id,chat_id,message_id)
);
CREATE INDEX group_ai_usage_bot_time ON group_ai_usage(bot_id,created_at);
