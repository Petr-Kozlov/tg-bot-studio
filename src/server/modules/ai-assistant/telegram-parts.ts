import type { MessageEntity } from 'grammy/types';

interface Part {
  text: string;
  entities: MessageEntity[];
}

export function telegramParts(markdown: string): Part[] {
  let text = '';
  const entities: MessageEntity[] = [];
  function inline(line: string) {
    // Only parse unambiguous inline spans. Literal HTML and source code remain literal.
    const spans = /\x60([^\x60\n]+)\x60|\*\*([^\n]+?)\*\*|__([^\n]+?)__|(?<!\w)_([^_\n]+)_(?!\w)|\*([^*\n]+)\*/g;
    let pos = 0;
    for (const match of line.matchAll(spans)) {
      text += line.slice(pos, match.index);
      const value = match[1] ?? match[2] ?? match[3] ?? match[4] ?? match[5];
      entities.push({ type: match[1] ? 'code' : match[2] || match[3] ? 'bold' : 'italic', offset: text.length, length: value.length });
      text += value;
      pos = match.index! + match[0].length;
    }
    text += line.slice(pos);
  }

  let fence: { offset: number; language: string } | undefined;
  function closeFence() {
    if (!fence) return;
    const length = text.length - fence.offset - (text.endsWith('\n') ? 1 : 0);
    if (length > 0) entities.push({ type: 'pre', offset: fence.offset, length, language: fence.language });
    fence = undefined;
  }
  for (let line of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const marker = /^\s*\x60{3}([\w.+#-]*)\s*$/.exec(line);
    if (marker && (!fence || !marker[1])) {
      if (fence) closeFence();
      else fence = { offset: text.length, language: marker[1] };
      continue;
    }
    if (fence) text += line;
    else {
      line = line.replace(/\x60?(?:FILE|GAME):[^\n\x60]*?END_FILE\x60?/g, 'готового вложения').trimEnd();
      const heading = /^\s*#{1,6}\s+(.+)$/.exec(line);
      if (heading) {
        const title = heading[1].replace(/^\*\*(.*)\*\*$/, '$1');
        entities.push({ type: 'bold', offset: text.length, length: title.length });
        text += title;
      } else inline(line.replace(/^(\s*)[-*+]\s+/, '$1• '));
    }
    text += '\n';
  }
  closeFence();
  text = text.trimEnd();
  const parts: Part[] = [];
  for (let start = 0; start < text.length;) {
    let end = Math.min(start + 4000, text.length);
    if (end < text.length) {
      const newline = text.lastIndexOf('\n', end - 1);
      if (newline > start + 2000) end = newline + 1;
      else if (/^[\uDC00-\uDFFF]$/.test(text[end])) end--;
    }
    const local: MessageEntity[] = [];
    for (const entity of entities) {
      const left = Math.max(entity.offset, start), right = Math.min(entity.offset + entity.length, end);
      if (left < right) local.push({ ...entity, offset: left - start, length: right - left });
    }
    const chunk = text.slice(start, end);
    if (chunk.trim()) parts.push({ text: chunk, entities: local });
    start = end;
  }
  return parts;
}
