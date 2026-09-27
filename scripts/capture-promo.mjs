// 撮影ページを1コマずつ描画してスクリーンショットし、ffmpeg で mp4 にする
// 使い方: npm run dev を起動した状態で
//   node scripts/capture-promo.mjs          … 正方形 1080x1080（X 用）
//   node scripts/capture-promo.mjs short    … 縦型 1080x1920（ショート動画用・雨音つき）
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'

const FORMATS = {
  square: { page: 'promo.html', width: 1080, height: 1080, out: 'promo/rain-run-promo.mp4', rainSound: false },
  short: { page: 'short.html', width: 1080, height: 1920, out: 'promo/rain-run-short.mp4', rainSound: true },
}
const format = FORMATS[process.argv[2] ?? 'square']
if (!format) throw new Error(`unknown format: ${process.argv[2]} (square | short)`)
const BASE = process.env.PROMO_BASE ?? 'http://localhost:5178'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = 'promo/frames'

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=metal', '--enable-gpu'] })
const page = await browser.newPage({ viewport: { width: format.width, height: format.height }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.error('pageerror', e))
await page.goto(`${BASE}/${format.page}`)
await page.waitForFunction(() => window.promo, null, { timeout: 120000 })
await page.evaluate(() => document.fonts.ready)
const { totalFrames, fps } = await page.evaluate(() => ({ totalFrames: window.promo.totalFrames, fps: window.promo.fps }))
const frame = page.locator('#frame')
for (let i = 0; i < totalFrames; i++) {
  await page.evaluate((i) => window.promo.renderFrame(i), i)
  await frame.screenshot({ path: `${OUT}/${String(i).padStart(4, '0')}.png` })
  if (i % 60 === 0) console.log(`frame ${i}/${totalFrames}`)
}
await browser.close()

const duration = totalFrames / fps
const video = ['-framerate', String(fps), '-i', `${OUT}/%04d.png`]
// 雨音: ピンクノイズを帯域制限して揺らぎをつけた環境音（素材の著作権を気にしなくてよい合成音）
const audio = format.rainSound
  ? ['-f', 'lavfi', '-i', `anoisesrc=color=pink:amplitude=0.6:duration=${duration}:seed=7`,
     '-filter_complex', `[1:a]highpass=f=500,lowpass=f=7000,tremolo=f=0.3:d=0.25,volume=0.35,afade=t=in:d=0.6,afade=t=out:st=${duration - 1}:d=1[a]`,
     '-map', '0:v', '-map', '[a]', '-c:a', 'aac', '-b:a', '160k']
  : []
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', ...video, ...audio,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-r', String(fps),
  '-movflags', '+faststart', '-shortest', format.out,
])
console.log(`wrote ${format.out}`)
