import { expect, test } from 'bun:test';
import { telegramParts } from '../modules/ai-assistant/telegram-parts';

test('renders a Telegram capability list, heading and inline code', () => {
  const [part] = telegramParts('# Возможности\n* **🎮 Технические вопросы** – про `C#`.  \n* **Файлы** – пришлю в виде `FILE: имя.ext … END_FILE`.');
  expect(part.text).toBe('Возможности\n• 🎮 Технические вопросы – про C#.\n• Файлы – пришлю в виде готового вложения.');
  expect(part.entities.map(e => [e.type, part.text.slice(e.offset,e.offset+e.length)])).toEqual([['bold','Возможности'],['bold','🎮 Технические вопросы'],['code','C#'],['bold','Файлы']]);
});

test('long fenced code preserves literals and language across Telegram messages', () => {
  const code = 'const html = "<b>**ok**</b>";\n' + '🎮'.repeat(2400);
  const parts = telegramParts('```javascript\n' + code + '\n```');
  expect(parts.length).toBe(2);
  expect(parts.map(x=>x.text).join('')).toBe(code);
  for (const p of parts) expect(p.entities).toEqual([{type:'pre',language:'javascript',offset:0,length:p.text.length}]);
});
