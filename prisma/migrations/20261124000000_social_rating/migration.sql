CREATE TABLE "social_rating_awards" (
    "bot_id" TEXT NOT NULL REFERENCES "bots" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "chat_id" TEXT NOT NULL,
    "message_id" INTEGER NOT NULL,
    "giver" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "recipient_name" TEXT NOT NULL,
    "awarded_at" DATETIME NOT NULL,
    PRIMARY KEY ("bot_id", "chat_id", "message_id", "giver")
);
CREATE INDEX "social_rating_awards_bot_id_chat_id_recipient_idx" ON "social_rating_awards"("bot_id", "chat_id", "recipient");
CREATE INDEX "social_rating_awards_bot_id_chat_id_awarded_at_idx" ON "social_rating_awards"("bot_id", "chat_id", "awarded_at");
