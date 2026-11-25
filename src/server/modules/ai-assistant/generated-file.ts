export function asksForGame(question: string): boolean {
  return /(?:создай|создайте|сделай|сделайте|напиши|напишите|сгенерируй|реализуй|доработай|исправь|почини|build|create|generate|make|fix)\s+(?:(?:мне|нам|простую|небольшую|браузерную|a|an|simple|browser)\s+)*(?:мини[- ]?)?(?:игру|игрушку|шутер|космо[- ]?шутер|крестики|змейку|game\b|shooter\b)/iu.test(question);
}

export function usesCodeModel(question: string): boolean {
  const coding = /(?:^|[^\p{L}\p{N}_])(?:код(?:а|у|ом|е)?|скрипт\p{L}*|функци\p{L}*|верстк\p{L}*|вёрстк\p{L}*|алгоритм\p{L}*|регулярк\p{L}*|стектрейс|html|css|svg|javascript|typescript|python|sql|jsx?|tsx?|code|debug|refactor|implementation|c#|c\+\+)(?![\p{L}\p{N}_])/iu;
  if (coding.test(question) || /файл|\bfile\b/iu.test(question)) return true;
  const create = /созда|сдела|напиш|нарису|сгенер|исправ|реализ|добав|доработ|почин|сверста|постро|build|create|generate|draw|fix|implement|make/iu;
  return create.test(question) && /игр|игор|крестики|змейк|иконк|картинк|иллюстраци|вектор|логотип|\b(?:game|icon|image|logo)\b/iu.test(question);
}

export const fileInstructions = [
  'Если участник просит создать или прислать файл, верни только его полное содержимое между отдельными строками FILE: имя.ext и END_FILE. Для обычного вопроса отвечай текстом.',
  'Для запроса создать игру без явно заданной другой платформы сделай компактную автономную браузерную игру: первая строка GAME: game.html, далее полный HTML с CSS и JavaScript внутри и строка END_FILE. Управление должно работать касаниями. Не используй сеть, внешние библиотеки, хранилище или Markdown-ограждения.',
  'Если просят нарисовать иконку, простую картинку или SVG, создай автономный векторный рисунок как FILE: drawing.svg, без скриптов и внешних ресурсов. Если явно запрошена фотография или растровая генерация, объясни, что доступен SVG.',
  'Для других текстовых форматов используй FILE. Для бинарного формата, который не можешь создать, объясни ограничение обычным текстом.',
].join(' ');

export function generatedFile(answer: string, requestedGame = false) {
  const header = /^(GAME|FILE):[ \t]*([^\r\n]+)\r?\n/.exec(answer);
  if (!header) return null;
  const name = header[2].trim();
  const end = /\r?\nEND_FILE\s*$/.exec(answer);
  if (!end || !/^[\p{L}\p{N}_-][\p{L}\p{N} ._-]{0,75}\.[a-z\d]{1,10}$/iu.test(name))
    throw Error('Incomplete file');
  const content = answer.slice(header[0].length, end.index);
  const game = header[1] === 'GAME' || (requestedGame && /\.html?$/i.test(name));
  if (!content.trim() || (game && (!/\.html?$/i.test(name) || !/<\/html>\s*$/i.test(content))))
    throw Error('Incomplete file');
  return { name, content, game };
}
