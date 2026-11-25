import { expect, test } from 'bun:test';
import { AiAssistantService, type AiConfig } from '../modules/ai-assistant/ai-assistant.service';
import { asksForGame } from '../modules/ai-assistant/generated-file';

test('recognizes game genres and infinitive requests', () => {
  for (const question of ['Можешь сделать 3D игру?', 'Сделай мне космический шутер', 'Создай платформер']) expect(asksForGame(question)).toBe(true);
  expect(asksForGame('Как сделать игру?')).toBe(false);
});

test('continues a truncated game once, accounts for both attempts', async () => {
  let count = 0;
  let tokens = 0;
  const service = new AiAssistantService({ listDocs: async () => [], startGroupCall: async () => 'test',
    endGroupCall: async (_id: string, usage: { completion_tokens: number }) => { tokens = usage.completion_tokens; }
  } as never, {} as never, {} as never);
  Object.assign(service, { callOpenAiCompatible: async (cfg: AiConfig) => {
    expect(cfg.model).toBe('games');
    return { finishReason: ++count === 1 ? 'length' : 'stop', reply: count === 1 ? 'start' : 'end', usage: { completion_tokens: 5 } };
  } });
  const a = await service.groupAnswer({provider:'groq',gameModel:'games'} as AiConfig,[{role:'user',content:'добавь босса'}],{bot:'b',chat:'c',user:1,message:2},undefined,{name:'game.html',content:'<html></html>',game:true});
  expect(a).toBe('startend');
  expect(count).toBe(2);
  expect(tokens).toBe(10);
});
