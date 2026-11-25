UPDATE bot_modules SET config_json=json_set(config_json, '$.model', 'openai/gpt-oss-120b', '$.codeModel', 'openai/gpt-oss-120b')
WHERE bot_id='96e9312f-b77a-4a48-b096-0c1aecac6441' AND module_key='ai-assistant'
  AND json_extract(config_json,'$.provider')='groq';
