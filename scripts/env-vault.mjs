#!/usr/bin/env node
import { constants } from 'node:fs';
import { lstat, open, realpath, rename, unlink } from 'node:fs/promises';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const FORMAT = 'picolah-env-vault';
const VERSION = 1;
const ALGORITHM = 'aes-256-gcm';
const MAX_PLAINTEXT = 1024 * 1024;
const MAX_ARTIFACT = Math.ceil(MAX_PLAINTEXT / 3) * 4 + 2048;
const AAD = Buffer.from(JSON.stringify({ format: FORMAT, version: VERSION, algorithm: ALGORITHM }));
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const NOFOLLOW = constants.O_NOFOLLOW ?? 0;

class VaultError extends Error {}

function parseArguments(args) {
  const [command, ...rest] = args;
  if (command !== 'encrypt' && command !== 'decrypt') {
    throw new VaultError('Use encrypt or decrypt with --input, --output and --key-file.');
  }
  const options = { command };
  for (let index = 0; index < rest.length; index += 1) {
    const flag = rest[index];
    if (!['--input', '--output', '--key-file', '--generate-key', '--force'].includes(flag)) {
      throw new VaultError('Unknown argument.');
    }
    const name = flag.slice(2);
    if (Object.hasOwn(options, name)) throw new VaultError('Duplicate argument.');
    if (name === 'force' || name === 'generate-key') {
      options[name] = true;
    } else {
      const value = rest[++index];
      if (!value || value.startsWith('--') || value.includes('\0')) throw new VaultError('Missing or invalid argument value.');
      options[name] = value;
    }
  }
  if (!options.input || !options.output || !options['key-file']) throw new VaultError('Input, output and key-file are required.');
  if (command === 'decrypt' && options['generate-key']) throw new VaultError('Key generation is only allowed for encryption.');
  return options;
}

async function inspectPath(value) {
  const absolute = resolve(value);
  const canonical = resolve(await realpath(dirname(absolute)), basename(absolute));
  let stat;
  try {
    stat = await lstat(canonical);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  if (stat && (!stat.isFile() || stat.isSymbolicLink())) throw new VaultError('Paths must refer to regular files, not symbolic links.');
  return { path: canonical, stat };
}

function assertDistinct(paths) {
  for (let i = 0; i < paths.length; i += 1) {
    for (let j = i + 1; j < paths.length; j += 1) {
      if (paths[i].path === paths[j].path || (paths[i].stat && paths[j].stat
        && paths[i].stat.dev === paths[j].stat.dev && paths[i].stat.ino === paths[j].stat.ino)) {
        throw new VaultError('Input, output and key must be different files.');
      }
    }
  }
}

function assertPrivateKey(stat) {
  if ((stat.mode & 0o777) !== 0o600 || (typeof process.getuid === 'function' && stat.uid !== process.getuid())) {
    throw new VaultError('Key must be owned by the current user with permissions 600.');
  }
  if (stat.size !== 32) throw new VaultError('Key must contain exactly 32 binary bytes.');
}

async function readBounded(file, maxBytes, isKey = false) {
  const handle = await open(file.path, constants.O_RDONLY | NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.dev !== file.stat.dev || stat.ino !== file.stat.ino) throw new VaultError('File changed during validation.');
    if (isKey) assertPrivateKey(stat);
    if (stat.size > maxBytes) throw new VaultError('Input exceeds the permitted size.');
    // A bounded read also handles a file growing after fstat without unbounded allocation.
    const buffer = Buffer.alloc(maxBytes + 1);
    let count = 0;
    while (count < buffer.length) {
      const { bytesRead } = await handle.read(buffer, count, buffer.length - count, null);
      if (bytesRead === 0) break;
      count += bytesRead;
    }
    if (count > maxBytes) throw new VaultError('Input exceeds the permitted size.');
    if (isKey && count !== 32) throw new VaultError('Key must contain exactly 32 binary bytes.');
    return buffer.subarray(0, count);
  } finally {
    await handle.close();
  }
}

async function writeNew(path, data) {
  const handle = await open(path, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | NOFOLLOW, 0o600);
  try {
    await handle.chmod(0o600);
    await handle.writeFile(data);
    await handle.sync();
  } catch (error) {
    await handle.close();
    await unlink(path).catch(() => {});
    throw error;
  }
  await handle.close();
}

async function writeOutput(output, data, force) {
  if (!force) return writeNew(output.path, data);
  // Write a new private inode before replacing the destination. Never truncate a
  // symlink/hardlink target, and never leave partial plaintext on authentication failure.
  const temporary = resolve(dirname(output.path), `.env-vault-${randomUUID()}.tmp`);
  try {
    await writeNew(temporary, data);
    await rename(temporary, output.path);
  } finally {
    await unlink(temporary).catch(() => {});
  }
}

function decodeBase64(value, expectedLength) {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new VaultError('Invalid encrypted artifact encoding.');
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value || (expectedLength !== undefined && decoded.length !== expectedLength)) {
    throw new VaultError('Invalid encrypted artifact length or encoding.');
  }
  return decoded;
}

function decryptArtifact(input, key) {
  let artifact;
  try { artifact = JSON.parse(input.toString('utf8')); } catch { throw new VaultError('Invalid encrypted artifact JSON.'); }
  if (!artifact || Array.isArray(artifact) || typeof artifact !== 'object'
    || Object.keys(artifact).sort().join(',') !== 'algorithm,ciphertext,format,nonce,tag,version'
    || artifact.format !== FORMAT || artifact.version !== VERSION || artifact.algorithm !== ALGORITHM) {
    throw new VaultError('Unsupported encrypted artifact format, version or algorithm.');
  }
  const nonce = decodeBase64(artifact.nonce, 12);
  const tag = decodeBase64(artifact.tag, 16);
  const ciphertext = decodeBase64(artifact.ciphertext);
  if (ciphertext.length > MAX_PLAINTEXT) throw new VaultError('Input exceeds the permitted size.');
  try {
    const decipher = createDecipheriv(ALGORITHM, key, nonce, { authTagLength: 16 });
    decipher.setAAD(AAD);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch {
    throw new VaultError('Authentication failed. No output was written.');
  }
}

export async function run(args) {
  const options = parseArguments(args);
  const [input, output, keyFile, repoRoot] = await Promise.all([
    inspectPath(options.input), inspectPath(options.output), inspectPath(options['key-file']), realpath(REPO_ROOT),
  ]);
  const keyRelative = relative(repoRoot, keyFile.path);
  if (!keyRelative || (!isAbsolute(keyRelative) && keyRelative !== '..' && !keyRelative.startsWith(`..${sep}`))) {
    throw new VaultError('Key file must be outside the repository.');
  }
  assertDistinct([input, output, keyFile]);
  if (!input.stat) throw new VaultError('Input file does not exist.');
  if (output.stat && !options.force) throw new VaultError('Output exists. Use --force only to intentionally replace it.');
  if (options['generate-key'] && keyFile.stat) throw new VaultError('Key already exists. Refusing to replace it.');
  if (!options['generate-key'] && !keyFile.stat) throw new VaultError('Key file does not exist.');
  const inputBytes = await readBounded(input, options.command === 'encrypt' ? MAX_PLAINTEXT : MAX_ARTIFACT);
  let key;
  try {
    if (options['generate-key']) {
      key = randomBytes(32);
      await writeNew(keyFile.path, key);
    } else {
      key = await readBounded(keyFile, 32, true);
    }
    let result;
    if (options.command === 'encrypt') {
      const nonce = randomBytes(12);
      const cipher = createCipheriv(ALGORITHM, key, nonce, { authTagLength: 16 });
      cipher.setAAD(AAD);
      const ciphertext = Buffer.concat([cipher.update(inputBytes), cipher.final()]);
      result = Buffer.from(`${JSON.stringify({
        format: FORMAT, version: VERSION, algorithm: ALGORITHM,
        nonce: nonce.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64'),
      }, null, 2)}\n`);
    } else {
      result = decryptArtifact(inputBytes, key);
    }
    try { await writeOutput(output, result, options.force); } finally { result.fill(0); }
  } finally {
    key?.fill(0);
    inputBytes.fill(0);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  run(process.argv.slice(2)).then(() => {
    console.log('Completed. Key material and file contents were not logged.');
  }).catch((error) => {
    // Do not surface raw filesystem/crypto errors, which can include secret paths.
    console.error(error instanceof VaultError ? error.message : 'Operation failed. Check file paths, permissions and available disk space.');
    process.exitCode = 1;
  });
}
