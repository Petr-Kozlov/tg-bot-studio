CREATE TABLE achievements (
 id TEXT PRIMARY KEY NOT NULL, bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
 chat_id TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL,
 kind TEXT NOT NULL, threshold INTEGER NOT NULL CHECK(threshold>0), icon TEXT NOT NULL DEFAULT ''
);
CREATE INDEX achievements_scope ON achievements(bot_id,chat_id,kind,threshold);
CREATE TABLE achievement_metrics (
 bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE, chat_id TEXT NOT NULL, user_id TEXT NOT NULL,
 kind TEXT NOT NULL, value INTEGER NOT NULL, PRIMARY KEY(bot_id,chat_id,user_id,kind)
);
CREATE TABLE achievement_unlocks (
 achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE, user_id TEXT NOT NULL,
 unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(achievement_id,user_id)
);
CREATE TABLE achievement_activity (
 bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE, chat_id TEXT NOT NULL, user_id TEXT NOT NULL,
 kind TEXT NOT NULL, message_id INTEGER NOT NULL, PRIMARY KEY(bot_id,chat_id,user_id,kind,message_id)
);
CREATE INDEX rating_giver_recipient ON social_rating_awards(bot_id,chat_id,giver,recipient);
CREATE INDEX rating_recipient_giver ON social_rating_awards(bot_id,chat_id,recipient,giver);
INSERT INTO achievement_metrics(bot_id,chat_id,user_id,kind,value) SELECT bot_id,chat_id,recipient,'rating',COUNT(*) FROM social_rating_awards GROUP BY bot_id,chat_id,recipient;
INSERT INTO achievement_metrics(bot_id,chat_id,user_id,kind,value) SELECT bot_id,chat_id,recipient,'helpers',COUNT(DISTINCT giver) FROM social_rating_awards GROUP BY bot_id,chat_id,recipient;
INSERT INTO achievement_metrics(bot_id,chat_id,user_id,kind,value) SELECT bot_id,chat_id,giver,'helped',COUNT(DISTINCT recipient) FROM social_rating_awards GROUP BY bot_id,chat_id,giver;
INSERT INTO achievement_metrics SELECT bot_id,chat_id,recipient,'comment',MAX(n) FROM (SELECT bot_id,chat_id,recipient,message_id,COUNT(*) n FROM social_rating_awards GROUP BY bot_id,chat_id,recipient,message_id) GROUP BY bot_id,chat_id,recipient;
INSERT INTO achievement_metrics SELECT bot_id,chat_id,recipient,'rating',-COUNT(*) FROM social_rating_penalties WHERE undone_by IS NULL GROUP BY bot_id,chat_id,recipient
ON CONFLICT DO UPDATE SET value=value+excluded.value;
CREATE TRIGGER achievement_award AFTER INSERT ON social_rating_awards BEGIN
 INSERT INTO achievement_metrics VALUES(NEW.bot_id,NEW.chat_id,NEW.recipient,'rating',1) ON CONFLICT DO UPDATE SET value=value+1;
 INSERT INTO achievement_metrics VALUES(NEW.bot_id,NEW.chat_id,NEW.recipient,'helpers',((SELECT COUNT(*) FROM social_rating_awards WHERE bot_id=NEW.bot_id AND chat_id=NEW.chat_id AND recipient=NEW.recipient AND giver=NEW.giver)=1)) ON CONFLICT DO UPDATE SET value=value+excluded.value;
 INSERT INTO achievement_metrics VALUES(NEW.bot_id,NEW.chat_id,NEW.giver,'helped',((SELECT COUNT(*) FROM social_rating_awards WHERE bot_id=NEW.bot_id AND chat_id=NEW.chat_id AND recipient=NEW.recipient AND giver=NEW.giver)=1)) ON CONFLICT DO UPDATE SET value=value+excluded.value;
 INSERT INTO achievement_metrics VALUES(NEW.bot_id,NEW.chat_id,NEW.recipient,'comment',(SELECT COUNT(*) FROM social_rating_awards WHERE bot_id=NEW.bot_id AND chat_id=NEW.chat_id AND message_id=NEW.message_id)) ON CONFLICT DO UPDATE SET value=MAX(value,excluded.value);
END;
CREATE TRIGGER achievement_penalty AFTER INSERT ON social_rating_penalties WHEN NEW.undone_by IS NULL BEGIN
 INSERT INTO achievement_metrics VALUES(NEW.bot_id,NEW.chat_id,NEW.recipient,'rating',-1) ON CONFLICT DO UPDATE SET value=value-1;
END;
CREATE TRIGGER achievement_penalty_change AFTER UPDATE OF undone_by ON social_rating_penalties WHEN (OLD.undone_by IS NULL) <> (NEW.undone_by IS NULL) BEGIN
 INSERT INTO achievement_metrics VALUES(NEW.bot_id,NEW.chat_id,NEW.recipient,'rating',CASE WHEN NEW.undone_by IS NULL THEN -1 ELSE 1 END) ON CONFLICT DO UPDATE SET value=value+excluded.value;
END;
CREATE TRIGGER achievement_observe AFTER INSERT ON achievement_activity BEGIN
 INSERT INTO achievement_metrics VALUES(NEW.bot_id,NEW.chat_id,NEW.user_id,NEW.kind,1) ON CONFLICT DO UPDATE SET value=value+1;
END;
CREATE TRIGGER achievement_unlock_insert AFTER INSERT ON achievement_metrics BEGIN
 INSERT INTO achievement_unlocks(achievement_id,user_id) SELECT id,NEW.user_id FROM achievements WHERE bot_id=NEW.bot_id AND chat_id=NEW.chat_id AND kind=NEW.kind AND threshold<=NEW.value ON CONFLICT DO NOTHING;
END;
CREATE TRIGGER achievement_define_insert AFTER INSERT ON achievements BEGIN
 INSERT INTO achievement_unlocks(achievement_id,user_id) SELECT NEW.id,user_id FROM achievement_metrics WHERE bot_id=NEW.bot_id AND chat_id=NEW.chat_id AND kind=NEW.kind AND value>=NEW.threshold ON CONFLICT DO NOTHING;
END;
CREATE TRIGGER achievement_unlock_update AFTER UPDATE ON achievement_metrics BEGIN
 INSERT INTO achievement_unlocks(achievement_id,user_id) SELECT id,NEW.user_id FROM achievements WHERE bot_id=NEW.bot_id AND chat_id=NEW.chat_id AND kind=NEW.kind AND threshold<=NEW.value ON CONFLICT DO NOTHING;
END;
CREATE TRIGGER achievement_define_update AFTER UPDATE ON achievements BEGIN
 INSERT INTO achievement_unlocks(achievement_id,user_id) SELECT NEW.id,user_id FROM achievement_metrics WHERE bot_id=NEW.bot_id AND chat_id=NEW.chat_id AND kind=NEW.kind AND value>=NEW.threshold ON CONFLICT DO NOTHING;
END;
