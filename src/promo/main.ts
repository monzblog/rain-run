// X 宣伝用の動画を書き出すための撮影ページ（1080x1080・30fps）
// window.promo.renderFrame(i) を 0 から順番に呼ぶと、そのコマの状態を描画する。

import {
  RAINS, RUN, SPEEDS, WALK, avgWet, columnsHtml, ease, exposePromo, hudHtml, makeController,
  makeOverlay, progress, rainBarsHtml, sequentialGuard, speedColumns, startRace, startWetmap, within,
} from './common'
import './promo.css'

const S = {
  title: [0, 45],
  race: [45, 210],
  wetmap: [210, 285],
  rains: [285, 375],
  speeds: [375, 465],
  cta: [465, 540],
} as const

const ctrl = makeController(document.getElementById('c') as HTMLCanvasElement)
const setOverlay = makeOverlay(document.getElementById('overlay') as HTMLDivElement)
const guard = sequentialGuard()
const rainResults = RAINS.map(({ r }) => [WALK, RUN].map((speed) => avgWet(r, speed)))
const speedResults = SPEEDS.map(({ v }) => avgWet(20, v))

function renderFrame(f: number) {
  guard(f)
  if (f === S.race[0]) startRace(ctrl)
  if (f === S.wetmap[0]) startWetmap(ctrl)
  ctrl.tick(1 / 30)

  if (within(f, S.title)) {
    setOverlay(`<div class="divider"></div><div class="title" style="opacity:${ease(progress(f, S.title) * 3)}">
      <div class="sub">傘がない！30m先まで</div>
      <h1><em>走る</em>？ <em>歩く</em>？</h1>
      <div class="sub">どっちが濡れない？</div>
    </div>`)
  } else if (within(f, S.race)) {
    const [a, b] = ctrl.sims.map((s) => s.wetTotal * 1e6)
    setOverlay(`${hudHtml(ctrl)}
      <div class="tag">強い雨 20mm/h・30m ／ 雨粒を1粒ずつ物理シミュレーション（早送り）</div>
      ${ctrl.done ? `<div class="verdict"><em>走る</em>方が <b>${(((a - b) / a) * 100).toFixed(0)}%</b> 濡れない</div>` : ''}`)
  } else if (within(f, S.wetmap)) {
    setOverlay(`${hudHtml(ctrl)}
      <div class="tag">どこが濡れた？（濡れマップ）</div>
      <div class="note n0">歩く → 頭・肩（上から）</div>
      <div class="note n1">走る → 胸・太もも（前から）</div>`)
  } else if (within(f, S.rains)) {
    setOverlay(`<div class="dim"></div>${rainBarsHtml(rainResults, progress(f, S.rains), 'どんな雨でも、<br/>走った方が濡れない')}`)
  } else if (within(f, S.speeds)) {
    setOverlay(`<div class="dim"></div>${columnsHtml(speedColumns(speedResults), progress(f, S.speeds), '速いほど濡れない。<br/>でも減り方はだんだん頭打ち', '強い雨 20mm/h・30m（4回平均）')}`)
  } else {
    setOverlay(`<div class="dim"></div><div class="title cta" style="opacity:${ease(progress(f, S.cta) * 3)}">
      <h1>雨の中、<em>走る</em>？<em>歩く</em>？</h1>
      <div class="sub">雨量・速さ・風を変えて<br/>ブラウザで試せます</div>
      <div class="chip">☔ 物理シミュレーター</div>
    </div>`)
  }
}

exposePromo(renderFrame, S.cta[1])
