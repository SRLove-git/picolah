import { chromium } from '@playwright/test';
import { mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
const out = process.env.CAPY_FRAME_OUT || '/tmp/picolah-capy-frames-v1', tmp = `/tmp/picolah-capy-frame-bake-${process.pid}`;
await mkdir(out, { recursive: true }); await mkdir(tmp, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL || "chrome" });
try {
  const page = await browser.newPage();
  await page.goto(`${process.env.CAPY_BAKE_ORIGIN || 'http://127.0.0.1:5178'}/scripts/capy-frames/index.html`);
  await page.waitForFunction(() => typeof window.bake === 'function');
  await page.waitForTimeout(1500);
  await page.waitForFunction(() => typeof window.bake === "function");
  const variants = await page.evaluate(() => window.variants);
  const selected = process.argv.slice(2), manifest = {};
  for (const { id } of variants.filter(v => !selected.length || selected.includes(v.id))) {
    const movements = id === 'wave' ? ['alive', 'play', 'wake']
      : ['sleep', 'snack', 'reach'].includes(id) ? ['alive']
      : ['alive', 'walk', 'kick-left', 'kick-right', ...(id === 'idle' ? [] : ['pet', 'feed', 'rest', 'wake', 'play'])];
    for (const movement of movements) {
      const key = movement === 'alive' ? id : `${id}-${movement}`;
      const result = await page.evaluate(([id, movement]) => window.bake(id, movement), [id, movement]);
      for (const [i, frame] of result.frames.entries()) {
        await writeFile(`${tmp}/frame-${String(i).padStart(2, '0')}.png`, Buffer.from(frame.png, 'base64')); delete frame.png;
      }
      const ffmpeg = spawnSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', `${tmp}/frame-%02d.png`, '-vf', 'tile=4x4', '-frames:v', '1', `${tmp}/sheet.png`], { encoding: 'utf8' });
      if (ffmpeg.status) throw new Error(ffmpeg.stderr);
      const encoded = spawnSync('cwebp', ['-quiet', '-q', '88', '-m', '6', `${tmp}/sheet.png`, '-o', `${out}/${key}.webp`], { encoding: 'utf8' });
      if (encoded.status) throw new Error(encoded.stderr);
      manifest[key] = { ...result, columns: 4,
        rig: key.startsWith('dressed-') ? 'dressed' : key.startsWith('shopping') ? 'shopping' : key.split('-')[0],
        frames: result.frames.map(frame => [
          ...[...frame.hands, ...frame.feet].flatMap(p => [p.x, p.y, p.z]),
          ...['head', 'chest', 'bag', 'hand', 'feet'].flatMap(key => { const a = frame.anchors[key]; return [a.x, a.y, a.angle, a.scale]; }),
        ].map(value => Math.round(value * 10000))),
      };
      console.log(key, (await readFile(`${out}/${key}.webp`)).length);
    }
  }
  let existing = {}; try { existing = JSON.parse(await readFile(`${out}/manifest.json`, 'utf8')); } catch {}
  await writeFile(`${out}/manifest.json`, JSON.stringify({ ...existing, ...manifest }));
} finally { await Promise.race([browser.close(), new Promise(resolve => setTimeout(resolve, 3000))]); await rm(tmp, { recursive: true, force: true }); }

process.exit(0);
