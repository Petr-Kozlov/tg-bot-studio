INSERT INTO bot_modules(bot_id,module_key,is_enabled,config_json) SELECT DISTINCT bot_id,'achievements',1,'{}' FROM achievements WHERE 1 ON CONFLICT DO NOTHING;
INSERT INTO chat_module_settings(bot_id,chat_id,module_key,config_json) SELECT DISTINCT bot_id,chat_id,'achievements','{"enabled":true}' FROM achievements WHERE 1 ON CONFLICT DO NOTHING;
