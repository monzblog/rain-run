// SNS ショート動画（縦型 1080x1920・30fps・約25秒）の撮影ページ
// Shorts / Reels / TikTok の UI に隠れないよう、文字は上 230px・下 350px・右 140px を避けて置く。

import {
  RAINS, RUN, SPEEDS, WALK, avgWet, clamp01, columnsHtml, ease, exposePromo, hudHtml, makeController,
  makeOverlay, progress, rainBarsHtml, sequentialGuard, speedColumns, startRace, startWetmap, within,
} from './common'
import './short.css'

const S = {
  hook: [0, 45],
  race: [45, 225],
  wetmap: [225, 315],
  rains: [315, 420],
  speeds: [420, 525],
  wind: [525, 645],
  cta: [645, 750],
} as const

const ctrl = makeController(document.getElementById('c') as HTMLCanvasElement)
const setOverlay = makeOverlay(document.getElementById('overlay') as HTMLDivElement)
const guard = sequentialGuard()
const rainResults = RAINS.map(({ r }) => [WALK, RUN].map((speed) => avgWet(r, speed)))
const speedResults = SPEEDS.map(({ v }) => avgWet(20, v))
// 追い風 3m/s のときの速さ別（「風と同じ速さがベスト」説の検証）
const TAIL = 3
const WIND_SPEEDS = [1.5, 3, 4.5, 6, 8]
const windResults = WIND_SPEEDS.map((v) => avgWet(20, v, TAIL))
const windMin = windResults.indexOf(Math.min(...windResults))

function renderFrame(f: number) {
  guard(f)
  if (f === S.race[0]) startRace(ctrl)
  if (f === S.wetmap[0]) startWetmap(ctrl, 3.2, 1.9)
  ctrl.tick(1 / 30)

  if (within(f, S.hook)) {
    const p = progress(f, S.hook)
    setOverlay(`<div class="divider"></div><div class="title">
      <div class="sub" style="opacity:${ease(p * 4)}">傘がない！<br/>30m先まで</div>
      <h1 style="opacity:${ease(p * 4 - 0.6)}"><em>走る</em>？<br/><em>歩く</em>？</h1>
      <div class="sub" style="opacity:${ease(p * 4 - 1.4)}">どっちが濡れない？</div>
    </div>`)
  } else if (within(f, S.race)) {
    const [a, b] = ctrl.sims.map((s) => s.wetTotal * 1e6)
    setOverlay(`${hudHtml(ctrl)}
      <div class="tag">強い雨 20mm/h・30m<br/>雨粒1粒ずつの物理シミュ（早送り）</div>
      ${ctrl.done ? `<div class="verdict"><em>走る</em>方が<br/><b>${(((a - b) / a) * 100).toFixed(0)}%</b> 濡れない</div>` : ''}`)
  } else if (within(f, S.wetmap)) {
    setOverlay(`${hudHtml(ctrl)}
      <div class="note n0">歩く → <b>頭・肩</b><small>上から降る雨</small></div>
      <div class="note n1">走る → <b>胸・太もも</b><small>前から当たる雨</small></div>`)
  } else if (within(f, S.rains)) {
    setOverlay(`<div class="dim"></div>${rainBarsHtml(rainResults, progress(f, S.rains), 'どんな雨でも<br/>走った方が<br/>濡れない')}`)
  } else if (within(f, S.speeds)) {
    setOverlay(`<div class="dim"></div>${columnsHtml(speedColumns(speedResults), progress(f, S.speeds), '速いほど減る。<br/>でも頭打ち', '強い雨 20mm/h・30m（4回平均）')}`)
  } else if (within(f, S.wind)) {
    const p = progress(f, S.wind)
    const cols = WIND_SPEEDS.map((v, k) => ({
      label: `${v}`,
      sub: 'm/s',
      value: windResults[k],
      color: k === windMin ? '#1baf7a' : v === TAIL ? '#c98500' : '#6b7680',
      badge: k === windMin ? '最小' : v === TAIL ? '風と同じ' : undefined,
    }))
    setOverlay(`<div class="dim"></div>
      ${columnsHtml(cols, p, 'よく聞く<br/>「追い風なら<br/>風と同じ速さ」', `追い風 ${TAIL}m/s・強い雨・30m（4回平均）`,
        `<div class="twist" style="opacity:${clamp01(p * 3 - 1.6)}">→ シミュレーションでは<br/><b>もっと速い方が濡れない</b></div>`)}`)
  } else {
    setOverlay(`<div class="dim"></div><div class="title cta" style="opacity:${ease(progress(f, S.cta) * 3)}">
      <h1>雨の中<br/><em>走る</em>？<em>歩く</em>？</h1>
      <div class="sub">雨量・速さ・風を変えて<br/>ブラウザで試せます</div>
      <div class="url">rain-run.monzblog.com</div>
    </div>`)
  }
}

exposePromo(renderFrame, S.cta[1])
