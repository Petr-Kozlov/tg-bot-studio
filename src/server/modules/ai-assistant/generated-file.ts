export const fileInstructions = [
  'Если участник просит создать или прислать файл, верни только его полное содержимое между отдельными строками FILE: имя.ext и END_FILE. Для обычного вопроса отвечай текстом.',
  'Для запроса создать игру без явно заданной другой платформы сделай компактную автономную браузерную игру: первая строка GAME: game.html, далее полный HTML с CSS и JavaScript внутри и строка END_FILE. Управление должно работать касаниями. Не используй сеть, внешние библиотеки, хранилище или Markdown-ограждения.',
  'Для других текстовых форматов используй FILE. Для бинарного формата, который не можешь создать, объясни ограничение обычным текстом.',
].join(' ');

export function generatedFile(answer: string) {
  const header = /^(GAME|FILE):[ \t]*([^\r\n]+)\r?\n/.exec(answer);
  if (!header) return null;
  const name = header[2].trim();
  const end = /\r?\nEND_FILE\s*$/.exec(answer);
  if (!end || !/^[\p{L}\p{N}_-][\p{L}\p{N} ._-]{0,75}\.[a-z\d]{1,10}$/iu.test(name))
    throw Error('Incomplete file');
  const content = answer.slice(header[0].length, end.index);
  const game = header[1] === 'GAME';
  if (!content.trim() || (game && (!/\.html?$/i.test(name) || !/<\/html>\s*$/i.test(content))))
    throw Error('Incomplete file');
  return { name, content, game };
}
