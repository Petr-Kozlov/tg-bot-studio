UPDATE bot_modules SET config_json=json_set(config_json, '$.codeModel', 'qwen/qwen3.8-27b')
WHERE bot_id='96e9312f-b77a-4a48-b096-0c1aecac6441' AND module_key='ai-assistant'
  AND json_extract(config_json,'$.provider')='groq';
