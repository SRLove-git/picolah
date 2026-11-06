import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EventEmitter } from 'node:events';
import { startSseHeartbeat } from './sse-heartbeat.ts';
test('idle streams emit comments and release their timers on disconnect or completion', (t) => {
  t.mock.timers.enable({ apis: ['setInterval'] });
  for (const event of ['close','finish'] as const) {
    const chunks:string[]=[];
    const response=Object.assign(new EventEmitter(),{destroyed:false,writableEnded:false,write:(value:any)=>{chunks.push(String(value));return true;}});
    startSseHeartbeat(response);
    t.mock.timers.tick(14_999);assert.equal(chunks.length,0);
    t.mock.timers.tick(1);assert.deepEqual(chunks,[': keep-alive\n\n']);
    response.emit(event);t.mock.timers.tick(60_000);assert.equal(chunks.length,1);
    assert.equal(response.listenerCount('close'),0);assert.equal(response.listenerCount('finish'),0);
  }
});
