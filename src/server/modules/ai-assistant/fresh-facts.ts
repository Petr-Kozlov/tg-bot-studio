const dollar = /(?:курс.{0,24}(?:доллар|usd)|(?:доллар|usd).{0,24}(?:курс|рубл)|сколько.{0,20}(?:стоит|рублей).{0,12}доллар|usd\s*[/₽]\s*(?:rub)?)/iu;
const search = /перепровер|проверь|проверьте|поищи|погугли|найди в (?:сети|интернете)|актуальн|свеж(?:ие|ая|ий)|последн(?:ие новости|яя версия|ий релиз)|новости|выш(?:ла|ел|ли|ло)|выйдет|состоялся ли|дата выхода|сейчас|сегодня|на данный момент|сколько стоит|latest|released yet|look (?:it )?up/iu;

export function freshIntent(question: string) {
  const text = question.split('\nВопрос участника: ').at(-1) ?? question;
  if (dollar.test(text) && !/вчера|завтра|прошл|истори|прогноз|20\d\d|банк(?!а россии)|евро|тенге|гривн|почему|объясни|как (?:счита|формир)/iu.test(text)) return 'usd';
  if (search.test(text) || dollar.test(text)) return 'search';
  return null;
}

export async function officialDollar(now = new Date()) {
  const date = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Moscow' }).format(now);
  const url = 'https://www.cbr.ru/scripts/XML_daily.asp?date_req=' + date;
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(9000) });
    if (!response.ok) throw Error('CBR unavailable');
    const xml = await response.text();
    const day = /<ValCurs\b[^>]*\bDate="(\d{2}\.\d{2}\.\d{4})"/.exec(xml)?.[1];
    const usd = xml.match(/<Valute\b[^>]*>[\s\S]*?<\/Valute>/g)?.find(row => row.includes('<CharCode>USD</CharCode>'));
    const rate = /<Value>(\d+(?:,\d+)?)<\/Value>/.exec(usd ?? '')?.[1];
    if (!day || !rate || !usd?.includes('<Nominal>1</Nominal>')) throw Error('Invalid CBR quote');
    return 'Официальный курс ЦБ РФ на ' + day + ' — 1 доллар США = ' + rate + ' ₽.\n' + url;
  } catch {
    return 'Не удалось получить официальный курс у Банка России. ' + url;
  }
}

type SearchTool = { name?: string; output?: string };

export function sourcedReply(content: string, tools: SearchTool[] = []) {
  const opened = new Set<string>();
  for (const tool of tools) {
    if (tool.name !== 'browser.open' && tool.name !== 'browser.find') continue;
    const url = /(?:^|\n)(?:L\d+:\s*)?URL:\s*(https?:\/\/[^\s<>]+)/i.exec(tool.output ?? '')?.[1];
    if (url) opened.add(url);
  }
  if (!content.trim() || !opened.size) return 'Не удалось подтвердить ответ по открытой странице источника.';
  const urls = [...opened];
  const source = urls.find(url => content.includes(url)) ?? urls[urls.length - 1];
  const answer = content.replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/g, '$1')
    .replace(/https?:\/\/\S+/g, '').replace(/[〖【][^〖【〗】]*[〗】]/g, '').trim();
  return answer + '\n\n' + source;
}

