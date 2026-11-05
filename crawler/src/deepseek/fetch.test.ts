import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchDeepSeekPage } from './fetch.ts';
const url='https://shop.example.com/product';
const valid={apiKey:'secret-test-key',validateUrl:async()=>{}};
const page={title:'Sony WH-CH720N',content:'# Sony WH-CH720N\nPrice: USD 89.99\nIn stock'};
const code=(expected:string)=>(error:any)=>{assert.equal(error.code,expected);assert.ok(!error.message.includes(valid.apiKey));return true;};
test('Fetch validates the target before one authenticated fixed-endpoint call with no geographic constraint',async()=>{
 let validated=false,calls=0;
 const result=await fetchDeepSeekPage(url+'#details',{...valid,validateUrl:async u=>{assert.equal(u,url);validated=true;},fetchImpl:async(u,init)=>{
  calls++;assert.ok(validated);assert.equal(u,'https://api.deepseek.com/v1/tools/fetch');assert.equal(init?.redirect,'error');
  assert.equal(new Headers(init?.headers).get('authorization'),'Bearer '+valid.apiKey);assert.deepEqual(JSON.parse(String(init?.body)),{url});
  return Response.json(page);
 }});
 assert.deepEqual(result,{format:'markdown',...page});assert.equal(calls,1);
});
test('Fetch rejects missing credentials, unsafe URLs and private DNS without provider calls',async()=>{
 const unexpected=async()=>{throw Error('must not call');};
 await assert.rejects(fetchDeepSeekPage(url,{...valid,apiKey:'',fetchImpl:unexpected}),code('DEEPSEEK_FETCH_NOT_CONFIGURED'));
 for(const u of ['https://127.0.0.1/x','http://shop.example.com/product','https://user:password@shop.example.com/','https://shop.example.com/?api_key=secret'])
  await assert.rejects(fetchDeepSeekPage(u,{...valid,fetchImpl:unexpected}),code('UNSAFE_WEB_URL'));
 await assert.rejects(fetchDeepSeekPage(url,{...valid,validateUrl:async()=>{throw Object.assign(Error('private'),{code:'UNSAFE_WEB_URL'});},fetchImpl:unexpected}),code('UNSAFE_WEB_URL'));
});
test('HTTP errors and redirects stay sanitized, with no provider retries',async()=>{
 for(const [status,expected] of [[400,'WEB_PAGE_HTTP_ERROR'],[401,'WEB_PAGE_AUTH_FAILED'],[402,'WEB_PAGE_PAYMENT_REQUIRED'],[403,'WEB_PAGE_POLICY_REJECTED'],[404,'WEB_PAGE_SOURCE_FAILED'],[408,'WEB_PAGE_TIMEOUT'],[413,'WEB_PAGE_HTTP_ERROR'],[429,'WEB_PAGE_RATE_LIMITED'],[500,'WEB_PAGE_PROVIDER_ERROR'],[504,'WEB_PAGE_TIMEOUT'],[302,'WEB_PAGE_REDIRECT_REJECTED']] as const){
  let calls=0;await assert.rejects(fetchDeepSeekPage(url,{...valid,fetchImpl:async()=>{calls++;return Response.json({error:{message:valid.apiKey}},{status});}}),error=>{
   code(expected)(error);if(status>=400) assert.equal((error as any).status,status);return true;
  });assert.equal(calls,1);
 }
 await assert.rejects(fetchDeepSeekPage(url,{...valid,fetchImpl:async()=>Response.json(page,{headers:{location:'https://other.example.com/'}})}),code('WEB_PAGE_REDIRECT_REJECTED'));
});
test('HTTP 200 busy/challenge pages and malformed envelopes never become usable product content',async()=>{
 for(const body of [{title:'Server Busy',content:'Please try again.'},{title:'Just a moment...',content:'Verifying your browser'},{title:'',content:'Access denied'}, {title:'Sei un robot?',content:'Verifica di sicurezza'}, {title:'Bist du ein Roboter?',content:'Bitte bestätigen'}])
  await assert.rejects(fetchDeepSeekPage(url,{...valid,fetchImpl:async()=>Response.json(body)}),code('WEB_PAGE_SOURCE_FAILED'));
 for(const body of [null,[],{}, {title:'x',content:''},{title:'x',content:[]},{...page,error:'private'}])
  await assert.rejects(fetchDeepSeekPage(url,{...valid,fetchImpl:async()=>Response.json(body)}),code('WEB_PAGE_PARSE_FAILED'));
});
test('Fetch enforces both declared and streaming response byte limits',async()=>{
 for(const response of [()=>Response.json(page,{headers:{'content-length':String(2*1024*1024+1)}}),()=>new Response('x'.repeat(2*1024*1024+1))])
  await assert.rejects(fetchDeepSeekPage(url,{...valid,fetchImpl:async()=>response()}),code('WEB_PAGE_RESPONSE_TOO_LARGE'));
});
test('Fetch bounds non-cooperative requests and cancels stalled response bodies',async context=>{
 const original=AbortSignal.timeout;
 context.mock.method(AbortSignal,'timeout',(ms:number)=>ms===12000?AbortSignal.abort():original.call(AbortSignal,ms));
 await assert.rejects(fetchDeepSeekPage(url,{...valid,fetchImpl:()=>new Promise(()=>{})}),code('WEB_PAGE_TIMEOUT'));
 context.mock.restoreAll();
 const controller=new AbortController();let cancelled=false;
 context.mock.method(AbortSignal,'timeout',(ms:number)=>ms===12000?controller.signal:original.call(AbortSignal,ms));
 await assert.rejects(fetchDeepSeekPage(url,{...valid,fetchImpl:async()=>new Response(new ReadableStream({pull(){controller.abort();},cancel(){cancelled=true;}},{highWaterMark:0}))}),code('WEB_PAGE_TIMEOUT'));
 assert.ok(cancelled);
});
