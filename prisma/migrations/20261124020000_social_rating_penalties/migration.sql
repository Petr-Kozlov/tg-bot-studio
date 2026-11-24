CREATE TABLE social_rating_penalties (
  bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE ON UPDATE CASCADE,
  chat_id TEXT NOT NULL, message_id INTEGER NOT NULL, recipient TEXT NOT NULL,
  recipient_name TEXT NOT NULL, moderator TEXT NOT NULL, reason TEXT NOT NULL,
  issued_at DATETIME NOT NULL, undone_by TEXT,
  PRIMARY KEY (bot_id, chat_id, message_id)
);
CREATE INDEX social_rating_penalty_recipient ON social_rating_penalties(bot_id, chat_id, recipient);
