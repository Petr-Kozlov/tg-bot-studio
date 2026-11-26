export function asksForGame(question: string): boolean {
  const action = /созда(?:й|ть|йте)|сдела(?:й|ть|йте)|напиш(?:и|ите)|написать|сгенерируй|разработай|хочу|build|create|generate|make/iu;
  const genre = /(?:^|[^\p{L}])(?:игру|игрушку|шутер|платформер|аркаду|гонку|гонки|змейку|крестики|раннер|тетрис|game|shooter|platformer)(?!\p{L})/iu;
  if (/как\s+(?:мне\s+)?(?:сделать|создать|написать)/iu.test(question)) return false;
  return action.test(question) && genre.test(question);
}

export function usesCodeModel(question: string): boolean {
  const coding = /(?:^|[^\p{L}\p{N}_])(?:код(?:а|у|ом|е)?|скрипт\p{L}*|функци\p{L}*|верстк\p{L}*|вёрстк\p{L}*|алгоритм\p{L}*|регулярк\p{L}*|стектрейс|html|css|svg|javascript|typescript|python|sql|jsx?|tsx?|code|debug|refactor|implementation|c#|c\+\+)(?![\p{L}\p{N}_])/iu;
  if (coding.test(question) || /файл|\bfile\b/iu.test(question)) return true;
  const create = /созда|сдела|напиш|нарису|сгенер|исправ|реализ|добав|доработ|почин|сверста|постро|build|create|generate|draw|fix|implement|make/iu;
  return create.test(question) && /игр|игор|крестики|змейк|иконк|картинк|иллюстраци|вектор|логотип|\b(?:game|icon|image|logo)\b/iu.test(question);
}

export const gameAssets = 'Для 3D доступен Three.js как обычный script https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js (глобальный THREE), для jQuery https://cdnjs.cloudflare.com/ajax/libs/jquery/3.7.1/jquery.min.js. Картинки можно загружать по HTTPS; для WebGL нужны CORS и запасной материал при ошибке текстуры. Другие библиотеки доступны по версионированным адресам cdnjs.cloudflare.com/ajax/libs/.';

export const fileInstructions = [
  'Если участник просит создать или прислать файл, верни только его полное содержимое между отдельными строками FILE: имя.ext и END_FILE. Для обычного вопроса отвечай текстом.',
  'Для запроса создать игру без явно заданной другой платформы сделай компактную автономную браузерную игру: первая строка GAME: game.html, далее полный HTML с CSS и JavaScript внутри и строка END_FILE. Управление должно работать касаниями. Не используй хранилище и Markdown-ограждения.',
  'Если просят нарисовать иконку, простую картинку или SVG, создай автономный векторный рисунок как FILE: drawing.svg, без скриптов и внешних ресурсов. Если явно запрошена фотография или растровая генерация, объясни, что доступен SVG.',
  'Для других текстовых форматов используй FILE. Для бинарного формата, который не можешь создать, объясни ограничение обычным текстом.',
].join(' ');

export function generatedFile(answer: string, requestedGame = false) {
  const header = /^(GAME|FILE):[ \t]*([^\r\n]+)\r?\n/.exec(answer);
  if (!header) return null;
  const name = header[2].trim();
  const end = /\r?\nEND_FILE\s*$/.exec(answer);
  const closedHtml = /\.html?$/i.test(name) && /<\/html>\s*$/i.test(answer);
  if ((!end && !closedHtml) || !/^[\p{L}\p{N}_-][\p{L}\p{N} ._-]{0,75}\.[a-z\d]{1,10}$/iu.test(name))
    throw Error('Incomplete file');
  const content = answer.slice(header[0].length, end?.index);
  const game = header[1] === 'GAME' || (requestedGame && /\.html?$/i.test(name));
  if (!content.trim() || (game && (!/\.html?$/i.test(name) || !/<\/html>\s*$/i.test(content))))
    throw Error('Incomplete file');
  return { name, content, game };
}
