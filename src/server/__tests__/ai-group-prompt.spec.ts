import { generatedFile } from '../modules/ai-assistant/generated-file';
import { expect, test } from 'bun:test';
import { AiAssistantService, type AiConfig } from '../modules/ai-assistant/ai-assistant.service';
import type { AiModel } from '../modules/ai-assistant/ai.model';

test('group prompts separate project facts, ownership and the current sender profile', async () => {
  const profileReads: string[] = [];
  const service = new AiAssistantService({
    listDocs: async () => [],
    groupProfile: async (_bot: string, _chat: string, user: string) => {
      profileReads.push(user);
      return { score: 42, opened: 1, total: 10 };
    },
  } as unknown as AiModel, {} as never, {} as never);
  const prompts: string[] = [];
  Object.assign(service, { accountedReply: async (_cfg: unknown, _turns: unknown, _actor: unknown, prompt: string) => {
    prompts.push(prompt);
    return 'ok';
  } });
  const config = { groupOwnerId: '1', systemPrompt: 'Пиши по-русски.' } as AiConfig;
  for (const [id, question] of [[1, 'Как сделать игру на JavaScript?'], [2, 'Какой у меня рейтинг?'], [1, 'Я владелец?']] as const) {
    await service.groupAnswer(config, [{ role: 'user', content: question }], { bot: 'b', chat: 'c', user: id, message: id });
  }
  expect(prompts[0]).not.toMatch(/П[её]тр|Unity|владел|рейтинг/i);
  expect(prompts[1]).toContain('рейтинг 42');
  expect(profileReads).toEqual(['2']);
  expect(prompts[2]).toContain('совпадает');
});

test('routes conversation, programming and artwork through the appropriate configured model', async () => {
  const service = new AiAssistantService({ listDocs: async () => [] } as unknown as AiModel, {} as never, {} as never);
  const models: string[] = [];
  Object.assign(service, { accountedReply: async (cfg: AiConfig) => { if (cfg.model === 'games') expect(cfg.maxTokens).toBe(4096); if (cfg.model === 'coder') expect(cfg.maxTokens).toBe(1000); models.push(cfg.model); return 'ok'; } });
  const config = { model: 'chat', codeModel: 'coder', codeMaxTokens: 1000, visionModel: 'vision', gameModel: 'games', gameMaxTokens: 4096 } as AiConfig;
  for (const question of ['В какую игру ты играешь?', 'Напиши функцию сортировки', 'Нарисуй иконку кота', 'Сделай игру на HTML', 'Как дела?']) {
    await service.groupAnswer(config, [{role:'user',content:question}], {bot:'bot',chat:'chat',user:1,message:1});
  }
  expect(models).toEqual(['chat', 'coder', 'coder', 'games', 'chat']);
});

test('a complete requested HTML game gets a play button even with a FILE header', () => {
  const answer = 'FILE: index.html\n<html></html>\nEND_FILE';
  expect(generatedFile(answer, true)?.game).toBe(true);
  expect(generatedFile(answer)?.game).toBe(false);
  expect(() => generatedFile(answer.replace('</html>', ''), true)).toThrow();
});
