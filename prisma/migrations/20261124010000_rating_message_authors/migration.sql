CREATE TABLE "social_rating_message_authors" (
    "bot_id" TEXT NOT NULL REFERENCES "bots" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    "chat_id" TEXT NOT NULL,
    "message_id" INTEGER NOT NULL,
    "author" TEXT NOT NULL,
    "author_name" TEXT NOT NULL,
    PRIMARY KEY ("bot_id", "chat_id", "message_id")
);
