import { expect, test } from 'bun:test';
import { Bot } from 'grammy';
import { applyDocumentEdits } from '../modules/ai-assistant/source-document';
import { registerGroupChat } from '../modules/ai-assistant/group-chat';
import type { AiConfig } from '../modules/ai-assistant/ai-assistant.service';

test('patches exact original ranges, preserving unrelated CRLF and game identity', () => {
  const source = { name: 'index.html', content: 'aaa\r\nbbb\r\nccc', game: true };
  const edit = (edits: unknown) => applyDocumentEdits(source, 'EDIT\n' + JSON.stringify({ edits }));
  expect(edit([{before:'bbb\nccc',after:'BBB\nCCC'}])).toEqual({ ...source, content:'aaa\r\nBBB\r\nCCC' });
  expect(() => edit([{before:'aa',after:'x'}])).toThrow();
  expect(() => edit([{before:'bbb',after:'x'},{before:'bbb\nccc',after:'y'}])).toThrow();
  expect(() => edit([{before:'absent',after:'x'}])).toThrow();
});

test('reads addressed documents and uncached bot replies and sends updated original filename', async () => {
  const bot = new Bot('42:test', {botInfo:{id:42,username:'GameDevBot',is_bot:true} as never});
  const doc = { file_id:'file', file_name:'index.html', file_size:3010 };
  const original = 'a'.repeat(3000) + 'timeout(10)';
  const chat = { id:-100, type:'supergroup' };
  const sent: string[] = [];
  bot.api.config.use(async (_, method, p) => {
    if (method === 'getFile') return {ok:true,result:{file_path:'documents/test.html'}} as never;
    if (method === 'getChatMember') return {ok:true,result:{status:'member'}} as never;
    if (method === 'sendDocument') sent.push((p as any).document.filename);
    return {ok:true,result:{message_id:900 + sent.length}} as never;
  });
  registerGroupChat(bot,'-100',{} as AiConfig,{
    isConfigured:()=>true, postComment:async()=>'',
    groupAnswer:async(_config,_turns,_actor,_image,file)=>{
      expect(file?.content).toBe(original);
      return 'EDIT\n{"edits":[{"before":"timeout(10)","after":"nextFrame()"}]}';
    },
  },'bot');
  const before = globalThis.fetch;
  try {
    globalThis.fetch = Object.assign(async()=>new Response(original),{preconnect:before.preconnect});
    const base = { chat, date:1, from:{id:6,first_name:'Тест',is_bot:false} };
    const reply = { ...base, message_id:11, from:bot.botInfo, document:doc };
    const inputs = [{document:doc,caption:'Файл для коллег'},
      {document:doc,caption:'@GameDevBot исправь',caption_entities:[{type:'mention',offset:0,length:11}]},
      {reply_to_message:reply,text:'исправь таймер'}];
    for (const [i,msg] of inputs.entries())
      await bot.handleUpdate({update_id:i+1,message:{...base,message_id:i+1,...msg}} as never);
    expect(sent).toEqual(['index.html','index.html']);
  } finally { globalThis.fetch = before; }
});
