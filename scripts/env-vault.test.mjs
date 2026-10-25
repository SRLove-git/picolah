import test from 'node:test';
import assert from 'node:assert/strict';
import { chmod, link, lstat, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { run } from './env-vault.mjs';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO_ROOT, 'scripts/env-vault.mjs');

async function fixture(t) {
  const directory = await mkdtemp(join(tmpdir(), 'picolah-env-vault-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const paths = {
    directory, input: join(directory, 'source.env'), output: join(directory, 'production.env.enc'),
    key: join(directory, 'outside-repository.key'), plaintext: join(directory, 'restored.env'),
  };
  await writeFile(paths.input, 'TEST_SECRET=sample-test-only\nUNICODE=测试\n', { mode: 0o600 });
  paths.encrypt = (extra = []) => run(['encrypt', '--input', paths.input, '--output', paths.output, '--key-file', paths.key, ...extra]);
  paths.decrypt = (extra = []) => run(['decrypt', '--input', paths.output, '--output', paths.plaintext, '--key-file', paths.key, ...extra]);
  return paths;
}

async function absent(path) {
  await assert.rejects(lstat(path), { code: 'ENOENT' });
}

test('generates a private external binary key and round-trips exact bytes', async (t) => {
  const f = await fixture(t);
  await f.encrypt(['--generate-key']);
  await f.decrypt();
  assert.deepEqual(await readFile(f.plaintext), await readFile(f.input));
  assert.equal((await readFile(f.key)).length, 32);
  for (const path of [f.key, f.output, f.plaintext]) assert.equal((await stat(path)).mode & 0o777, 0o600);
  const artifactText = await readFile(f.output, 'utf8');
  const artifact = JSON.parse(artifactText);
  assert.deepEqual(Object.keys(artifact).sort(), ['algorithm', 'ciphertext', 'format', 'nonce', 'tag', 'version']);
  assert.equal(artifactText.includes('sample-test-only'), false);
  assert.equal(artifactText.includes(f.directory), false);
});

test('uses a fresh random nonce and ciphertext for each encryption', async (t) => {
  const f = await fixture(t);
  await f.encrypt(['--generate-key']);
  const first = JSON.parse(await readFile(f.output, 'utf8'));
  await f.encrypt(['--force']);
  const second = JSON.parse(await readFile(f.output, 'utf8'));
  assert.notEqual(first.nonce, second.nonce);
  assert.notEqual(first.ciphertext, second.ciphertext);
  assert.equal(Buffer.from(second.nonce, 'base64').length, 12);
  assert.equal(Buffer.from(second.tag, 'base64').length, 16);
});

test('rejects ciphertext, nonce and authentication-tag tampering without writing output', async (t) => {
  const f = await fixture(t);
  await f.encrypt(['--generate-key']);
  const original = JSON.parse(await readFile(f.output, 'utf8'));
  for (const field of ['ciphertext', 'nonce', 'tag']) {
    const value = Buffer.from(original[field], 'base64');
    value[0] ^= 1;
    await writeFile(f.output, JSON.stringify({ ...original, [field]: value.toString('base64') }));
    await assert.rejects(f.decrypt(), /Authentication failed/);
    await absent(f.plaintext);
  }
});

test('wrong key fails authentication and preserves existing plaintext even with --force', async (t) => {
  const f = await fixture(t);
  await f.encrypt(['--generate-key']);
  await writeFile(f.key, randomBytes(32));
  await writeFile(f.plaintext, 'unchanged', { mode: 0o600 });
  await assert.rejects(f.decrypt(['--force']), /Authentication failed/);
  assert.equal(await readFile(f.plaintext, 'utf8'), 'unchanged');
});

test('requires explicit overwrite and never replaces an existing key', async (t) => {
  const f = await fixture(t);
  await f.encrypt(['--generate-key']);
  const originalKey = await readFile(f.key);
  const originalArtifact = await readFile(f.output);
  await assert.rejects(f.encrypt(), /Output exists/);
  await assert.rejects(f.encrypt(['--generate-key', '--force']), /Key already exists/);
  assert.deepEqual(await readFile(f.key), originalKey);
  assert.deepEqual(await readFile(f.output), originalArtifact);
  await f.decrypt();
  await assert.rejects(f.decrypt(), /Output exists/);
  await chmod(f.plaintext, 0o644);
  await f.decrypt(['--force']);
  assert.equal((await stat(f.plaintext)).mode & 0o777, 0o600);
});

test('forbids keys inside the repository including symlinked parent directories', async (t) => {
  const f = await fixture(t);
  const insideKey = join(REPO_ROOT, `.env-vault-test-${randomUUID()}.key`);
  const command = (key) => run(['encrypt', '--input', f.input, '--output', f.output, '--key-file', key, '--generate-key']);
  await assert.rejects(command(insideKey), /outside the repository/);
  await absent(insideKey);
  const directoryLink = join(f.directory, 'repo-alias');
  await symlink(REPO_ROOT, directoryLink);
  await assert.rejects(command(join(directoryLink, 'forbidden.key')), /outside the repository/);
  await absent(f.output);
});

test('rejects path and hardlink aliases between input, key and output', async (t) => {
  const f = await fixture(t);
  await f.encrypt(['--generate-key']);
  await assert.rejects(run(['encrypt', '--input', f.input, '--output', f.input, '--key-file', f.key, '--force']), /different files/);
  await assert.rejects(run(['decrypt', '--input', f.output, '--output', f.key, '--key-file', f.key, '--force']), /different files/);
  const alias = join(f.directory, 'key-alias');
  await link(f.key, alias);
  await assert.rejects(run(['decrypt', '--input', f.output, '--output', alias, '--key-file', f.key, '--force']), /different files/);
  await assert.rejects(run(['encrypt', '--input', alias, '--output', f.output, '--key-file', f.key, '--force']), /different files/);
  assert.equal((await readFile(f.key)).length, 32);
});

test('rejects symbolic-link files rather than following them', async (t) => {
  const f = await fixture(t);
  await f.encrypt(['--generate-key']);
  await symlink(f.key, f.plaintext);
  await assert.rejects(f.decrypt(['--force']), /regular files/);
  assert.equal((await readFile(f.key)).length, 32);
});

test('enforces key length and private permissions', async (t) => {
  const f = await fixture(t);
  await f.encrypt(['--generate-key']);
  await chmod(f.key, 0o644);
  await assert.rejects(f.decrypt(), /permissions 600/);
  await chmod(f.key, 0o600);
  await writeFile(f.key, randomBytes(31));
  await assert.rejects(f.decrypt(), /32 binary bytes/);
  await absent(f.plaintext);
});

test('validates envelope fields, version, algorithm and canonical base64 lengths', async (t) => {
  const f = await fixture(t);
  await f.encrypt(['--generate-key']);
  const original = JSON.parse(await readFile(f.output, 'utf8'));
  const invalidArtifacts = [
    { ...original, version: 2 }, { ...original, format: 'other-format' }, { ...original, algorithm: 'aes-128-gcm' },
    { ...original, extra: 'not-allowed' }, { ...original, nonce: 'AA==' }, { ...original, tag: '' },
    { ...original, nonce: `${original.nonce}\n` }, { ...original, ciphertext: '!!!!' },
  ];
  for (const artifact of invalidArtifacts) {
    await writeFile(f.output, JSON.stringify(artifact));
    await assert.rejects(f.decrypt(), /artifact/);
    await absent(f.plaintext);
  }
});

test('limits plaintext size and does not generate a key for oversized input', async (t) => {
  const f = await fixture(t);
  await writeFile(f.input, Buffer.alloc(1024 * 1024 + 1));
  await assert.rejects(f.encrypt(['--generate-key']), /permitted size/);
  await absent(f.key);
  await absent(f.output);
});

test('requires explicit key generation and rejects ambiguous CLI arguments', async (t) => {
  const f = await fixture(t);
  await assert.rejects(f.encrypt(), /Key file does not exist/);
  await assert.rejects(f.encrypt(['--input', f.input]), /Duplicate argument/);
  await assert.rejects(f.encrypt(['--unknown']), /Unknown argument/);
  await assert.rejects(f.decrypt(['--generate-key']), /only allowed for encryption/);
  await assert.rejects(run(['encrypt', '--input']), /argument value/);
  await absent(f.key);
});

test('CLI never prints file contents or raw filesystem paths on success or failure', async (t) => {
  const f = await fixture(t);
  const result = spawnSync(process.execPath, [SCRIPT, 'encrypt', '--input', f.input, '--output', f.output, '--key-file', f.key, '--generate-key'], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const failed = spawnSync(process.execPath, [SCRIPT, 'decrypt', '--input', join(f.directory, 'missing-parent', 'secret-file'), '--output', f.plaintext, '--key-file', f.key], { encoding: 'utf8' });
  assert.equal(failed.status, 1);
  const logs = result.stdout + result.stderr + failed.stdout + failed.stderr;
  assert.equal(logs.includes(f.directory), false);
  assert.equal(logs.includes('sample-test-only'), false);
  assert.equal(logs.includes((await readFile(f.key)).toString('base64')), false);
});
