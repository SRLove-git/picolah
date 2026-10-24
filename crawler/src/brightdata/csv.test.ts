import assert from 'node:assert/strict';
import test from 'node:test';
import { parseCsv, parseCsvRecords } from './csv.ts';

test('parses quoted commas, doubled quotes and embedded newlines', () => {
  const csv = 'name,note,price\r\n"a, b","line1\nline2","1,299.00"\r\n"quote ""x""","",5\r\n';
  const { headers, rows } = parseCsv(csv);
  assert.deepEqual(headers, ['name', 'note', 'price']);
  assert.deepEqual(rows, [
    ['a, b', 'line1\nline2', '1,299.00'],
    ['quote "x"', '', '5'],
  ]);
});

test('strips a UTF-8 BOM and ignores a trailing empty line', () => {
  const records = parseCsvRecords('\ufeffid,title\n1,hello\n');
  assert.deepEqual(records, [{ id: '1', title: 'hello' }]);
});

test('parses a header-only document', () => {
  const parsed = parseCsv('a,b\n');
  assert.deepEqual(parsed.headers, ['a', 'b']);
  assert.deepEqual(parsed.rows, []);
});

test('handles a final field without a trailing newline', () => {
  const parsed = parseCsv('a,b\n1,2');
  assert.deepEqual(parsed.rows, [['1', '2']]);
});

test('rejects an unterminated quoted field', () => {
  assert.throws(() => parseCsv('a,b\n"oops,2\n'), /引号未闭合/);
});
