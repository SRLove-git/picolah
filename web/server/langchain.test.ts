import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, test } from 'node:test';
import { z } from 'zod';

const requests: Array<Record<string, unknown>> = [];
const server = createServer(async (request, response) => {
  let raw = '';
  for await (const chunk of request) raw += chunk;
  const body = JSON.parse(raw) as Record<string, unknown>;
  requests.push(body);

  if (body.stream) {
    response.writeHead(200, { 'content-type': 'text/event-stream' });
    response.write(
      `data: ${JSON.stringify({
        id: 'chatcmpl-stream',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'mock-model',
        choices: [{ index: 0, delta: { role: 'assistant', content: '最低价' }, finish_reason: null }],
      })}\n\n`,
    );
    response.write(
      `data: ${JSON.stringify({
        id: 'chatcmpl-stream',
        object: 'chat.completion.chunk',
        created: 1,
        model: 'mock-model',
        choices: [{ index: 0, delta: { content: '是 S$400' }, finish_reason: null }],
      })}\n\n`,
    );
    response.end('data: [DONE]\n\n');
    return;
  }

  response.writeHead(200, { 'content-type': 'application/json' });
  response.end(JSON.stringify({
    id: 'chatcmpl-json',
    object: 'chat.completion',
    created: 1,
    model: 'mock-model',
    choices: [{
      index: 0,
      message: { role: 'assistant', content: '{"intent":"compare"}' },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 },
  }));
});

await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
if (!address || typeof address === 'string') throw new Error('mock LLM server did not bind');

process.env.LLM_API_KEY = 'test-key';
process.env.LLM_BASE_URL = `http://127.0.0.1:${address.port}`;
process.env.LLM_MODEL = 'mock-model';

const {
  invokeStructuredAgent,
  streamAgentAnswer,
  toLangChainMessages,
} = await import('./agent/langchain.ts');

after(() => new Promise<void>((resolve, reject) => {
  server.close((error) => (error ? reject(error) : resolve()));
}));

test('LangChain agent converts messages and validates JSON-mode output', async () => {
  const messages = [
    { role: 'system' as const, content: '只输出 JSON' },
    { role: 'user' as const, content: '只看 Lazada' },
  ];
  const converted = toLangChainMessages(messages);
  assert.deepEqual(converted.map((message) => message.type), ['system', 'human']);

  const result = await invokeStructuredAgent({
    messages,
    schema: z.object({ intent: z.enum(['compare', 'recommend']) }),
    name: 'TestUnderstanding',
  });

  assert.deepEqual(result, { intent: 'compare' });
  assert.equal(requests[0].model, 'mock-model');
  assert.deepEqual(requests[0].response_format, { type: 'json_object' });
});

test('LangChain answer writer exposes provider stream chunks', async () => {
  let answer = '';
  for await (const delta of streamAgentAnswer({
    messages: [{ role: 'user', content: '哪里最便宜' }],
    temperature: 0.3,
    maxTokens: 80,
  })) {
    answer += delta;
  }

  assert.equal(answer, '最低价是 S$400');
  assert.equal(requests[1].stream, true);
});
