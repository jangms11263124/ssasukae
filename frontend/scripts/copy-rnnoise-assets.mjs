// @sapphi-red/web-noise-suppressor의 워크릿/wasm 파일을 public으로 복사
// (AudioWorklet과 wasm은 정적 URL로 서빙되어야 하므로 번들에 포함시키지 않음)
import { copyFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const distDir = path.dirname(require.resolve('@sapphi-red/web-noise-suppressor'))
const outDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../public/noise-suppressor'
)

await mkdir(outDir, { recursive: true })

const targets = [
  ['rnnoise/workletProcessor.js', 'rnnoiseWorklet.js'],
  ['rnnoise.wasm', 'rnnoise.wasm'],
  ['rnnoise_simd.wasm', 'rnnoise_simd.wasm'],
]

for (const [src, dest] of targets) {
  await copyFile(path.join(distDir, src), path.join(outDir, dest))
}

console.log(`[copy-assets] ${targets.length} files copied to public/noise-suppressor`)
