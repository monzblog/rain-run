// 撮影ページを1コマずつ描画してスクリーンショットし、ffmpeg で mp4 にする
// 使い方: npm run dev を起動した状態で node scripts/capture-promo.mjs
import { chromium } from 'playwright-core'
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'

const URL = process.env.PROMO_URL ?? 'http://localhost:5178/promo.html'
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const OUT = 'promo/frames'

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=metal', '--enable-gpu'] })
const page = await browser.newPage({ viewport: { width: 1080, height: 1080 }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.error('pageerror', e))
await page.goto(URL)
await page.waitForFunction(() => window.promo)
await page.evaluate(() => document.fonts.ready)
const { totalFrames, fps } = await page.evaluate(() => ({ totalFrames: window.promo.totalFrames, fps: window.promo.fps }))
const frame = page.locator('#frame')
for (let i = 0; i < totalFrames; i++) {
  await page.evaluate((i) => window.promo.renderFrame(i), i)
  await frame.screenshot({ path: `${OUT}/${String(i).padStart(4, '0')}.png` })
  if (i % 60 === 0) console.log(`frame ${i}/${totalFrames}`)
}
await browser.close()
execFileSync('ffmpeg', [
  '-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `${OUT}/%04d.png`,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart',
  'promo/rain-run-promo.mp4',
])
console.log('wrote promo/rain-run-promo.mp4')
