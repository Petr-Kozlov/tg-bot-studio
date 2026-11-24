import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, rename, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

export const iconRoute = '/api/achievement-icons/';
export function iconFile(key: string) {
  if (!/^[a-f0-9]{64}\.(png|webp)$/.test(key)) throw new NotFoundException();
  return resolve(process.env.DATA_DIR || 'data', 'achievements', 'icons', key);
}
export async function persistIcon(data: string) {
  if (data.length > 160000) throw new BadRequestException('Слишком большая иконка');
  const match = /^data:image\/(png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);
  const bytes = Buffer.from(match?.[2] ?? '', 'base64');
  if (
    !match ||
    (match[1] === 'png'
      ? !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))
      : bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP')
  )
    throw new BadRequestException('Выберите PNG или WebP');
  const key = createHash('sha256').update(bytes).digest('hex') + '.' + match[1];
  const path = iconFile(key),
    tmp = path + '.' + randomUUID();
  await mkdir(resolve(path, '..'), { recursive: true });
  try {
    await writeFile(tmp, bytes);
    await rename(tmp, path);
  } finally {
    await unlink(tmp).catch((e) => {
      if (e.code !== 'ENOENT') throw e;
    });
  }
  return key;
}
