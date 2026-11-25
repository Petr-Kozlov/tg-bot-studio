UPDATE bot_modules SET config_json=json_set(config_json,'$.gameOrigin','https://tgbot.orkogames.online')
WHERE bot_id='96e9312f-b77a-4a48-b096-0c1aecac6441' AND module_key='ai-assistant'
AND json_type(config_json,'$.gameOrigin') IS NULL;
