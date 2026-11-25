UPDATE bot_modules
SET config_json = json_set(config_json, '$.spontaneousReplies', json('true'))
WHERE bot_id = '96e9312f-b77a-4a48-b096-0c1aecac6441'
  AND module_key = 'ai-assistant' AND is_enabled = 1
  AND json_extract(config_json, '$.groupMentions') = 1
  AND json_type(config_json, '$.spontaneousReplies') IS NULL;
