import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Controller, Get, NotFoundException, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';

const gameDirectory = () => resolve(process.env.DATA_DIR || 'data', 'ai-games');
export async function publishGame(html: string, origin: string) {
  const base = new URL(origin);
  if (base.protocol !== 'https:') throw Error('Games require HTTPS');
  const id = randomUUID();
  await mkdir(gameDirectory(), { recursive: true });
  await writeFile(resolve(gameDirectory(), id), html, { flag: 'wx' });
  return new URL('/api/ai-games/' + id, base.origin).href;
}

@Controller('ai-games')
export class AiGamesController {
  @Public() @Get(':id')
  async play(@Param('id') id: string, @Res() res: Response) {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.test(id)) throw new NotFoundException();
    const html = await readFile(resolve(gameDirectory(), id), 'utf8').catch((error) => {
      if (error.code === 'ENOENT') throw new NotFoundException();
      throw error;
    });
    const escaped = html.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
    res.set('Content-Security-Policy', "default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com/ajax/libs/; style-src 'unsafe-inline'; img-src data: https:; media-src data:; frame-src about:; form-action 'none'; base-uri 'none'; frame-ancestors 'none'");
    res.set('Referrer-Policy', 'no-referrer');
    return res.type('html').send('<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Игра GameDev</title><style>body{margin:0}iframe{display:block;border:0;width:100vw;height:100dvh}</style><iframe title="Игра" sandbox="allow-scripts" srcdoc="' + escaped + '"></iframe></html>');
  }
}
