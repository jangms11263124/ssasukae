// SoundTouch AudioWorklet processor를 public으로 복사한다 (addModule은 정적 URL 필요)
import { copyFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const processorPath = require.resolve('@soundtouchjs/audio-worklet/processor');
const outDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/soundtouch');

await mkdir(outDir, { recursive: true });
await copyFile(processorPath, path.join(outDir, 'soundtouch-processor.js'));

console.log('[copy-assets] soundtouch-processor.js copied to public/soundtouch');
