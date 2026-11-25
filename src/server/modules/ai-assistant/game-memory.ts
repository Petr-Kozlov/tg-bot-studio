import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { ChatMessage } from './ai-assistant.service';
import type { SourceDocument } from './source-document';

export interface GameConversation {
  history: ChatMessage[];
  requirements: string[];
  game?: SourceDocument;
  message: number;
}

export class GameMemory {
  private static readonly pending = new Map<string, Promise<void>>();
  async lock() {
    const previous = GameMemory.pending.get(this.key);
    let release!: () => void;
    const current = new Promise<void>(resolve => { release = resolve; });
    GameMemory.pending.set(this.key, current);
    await previous;
    return () => {
      if (GameMemory.pending.get(this.key) === current) GameMemory.pending.delete(this.key);
      release();
    };
  }
  private readonly directory = resolve(process.env.DATA_DIR || 'data', 'ai-conversations');
  private readonly key: string;
  constructor(bot: string, chat: string, thread: number, user: number) {
    this.key = createHash('sha256').update(JSON.stringify([bot, chat, thread, user])).digest('hex');
  }
  async read(): Promise<GameConversation | undefined> {
    try {
      return JSON.parse(await readFile(resolve(this.directory, this.key), 'utf8'));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }
  async save(state: GameConversation) {
    await mkdir(this.directory, { recursive: true });
    const file = resolve(this.directory, this.key);
    const temp = file + '.' + randomUUID();
    await writeFile(temp, JSON.stringify(state), { mode: 0o600 });
    await rename(temp, file);
  }
}

export const gameEdit = /(?:добавь|добавить|исправь|измени|поменяй|замени|убери|сделай|почини|доработай|ускорь|замедли|add|fix|change|remove)\s+/iu;
export const specificGameEdit = /босс|уровен|уровн|корабл|враг|оружи|прыж|стрельб|игрок|геймпле|boss|enemy|level/iu;

