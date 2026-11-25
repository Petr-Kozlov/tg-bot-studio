import { expect, test } from 'bun:test';
import { freshIntent, sourcedReply } from '../modules/ai-assistant/fresh-facts';

test('directs current USD/RUB questions to the central bank and fresh news to search', () => {
  expect(freshIntent('Какой сегодня курс доллара?')).toBe('usd');
  expect(freshIntent('GTA 6 уже вышла?')).toBe('search');
  expect(freshIntent('Перепроверь')).toBe('search');
  expect(freshIntent('Привет!')).toBeNull();
  expect(freshIntent('Исходное сообщение: Перепроверь\nВопрос участника: Спасибо!')).toBeNull();
});

test('requires an opened page and returns its address', () => {
  const content = 'Игра доступна.';
  expect(sourcedReply(content)).not.toContain(content);
  expect(sourcedReply(content, [{ name: 'browser.open', output: 'L0:\nL1: URL: https://example.com/news\nL2: Released' }])).toContain('https://example.com/news');
});
