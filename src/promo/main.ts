// X 宣伝用の動画を書き出すための撮影ページ（1080x1080・30fps）
// window.promo.renderFrame(i) を 0 から順番に呼ぶと、そのコマの状態を描画する。

import { Controller, LANE_COLORS } from '../view/controller'
import { RunnerSim } from '../sim/runnerSim'
import './promo.css'

const FPS = 30
const S = {
  title: [0, 45],
  race: [45, 210],
  wetmap: [210, 285],
  rains: [285, 375],
  speeds: [375, 465],
  cta: [465, 540],
} as const
const TOTAL = S.cta[1]
const WALK = 1.4
const RUN = 5.5
const RACE_SEC = 4.2 // 両者がこの秒数でゴールするよう早送りする
const SEEDS = [11, 12, 13, 14]

const canvas = document.getElementById('c') as HTMLCanvasElement
const overlay = document.getElementById('overlay') as HTMLDivElement
const ctrl = new Controller(canvas, { rateMmH: 20, speedA: WALK, speedB: RUN, wind: 0, distance: 30 })
ctrl.renderer.setPixelRatio(1)

// 雨量別の比較（実際にシミュレーションを回した結果）
const RAINS = [
  { r: 5, label: '小雨 5mm/h' },
  { r: 20, label: '強い雨 20mm/h' },
  { r: 50, label: '激しい雨 50mm/h' },
]
// 雨粒の大きさのばらつきで試行ごとに ±1割ほど変わるので、4回の平均を使う
function avgWet(rateMmH: number, speed: number) {
  let sum = 0
  for (const seed of SEEDS) {
    const s = new RunnerSim({ rateMmH, speed, wind: 0, distance: 30, seed })
    s.start()
    while (!s.finished) s.advance(0.05)
    sum += s.wetTotal * 1e6
  }
  return sum / SEEDS.length
}
const rainResults = RAINS.map(({ r }) => [WALK, RUN].map((speed) => avgWet(r, speed)))
const SPEEDS = [
  { v: 1.4, label: '歩く' },
  { v: 2.2, label: '早歩き' },
  { v: 3.5, label: 'ジョグ' },
  { v: 5.5, label: '走る' },
  { v: 8, label: '全力' },
]
const speedResults = SPEEDS.map(({ v }) => avgWet(20, v))

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const ease = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
const within = (f: number, [a, b]: readonly [number, number]) => f >= a && f < b

let lastFrame = -1
let html = ''
function setOverlay(h: string) {
  if (h !== html) {
    overlay.innerHTML = h
    html = h
  }
}

function hud() {
  return '<div class="divider"></div>' + ctrl.sims
    .map((s, i) => {
      const name = i === 0 ? '歩く' : '走る'
      return `<div class="hud hud-${i}">
        <span class="pill" style="background:${LANE_COLORS[i]}">${name}</span>
        <span class="spd">${(s.params.speed * 3.6).toFixed(0)} km/h</span>
        <div class="wet"><b>${(s.wetTotal * 1e6).toFixed(1)}</b> mL <small>${s.t.toFixed(1)}秒</small></div>
        <div class="bar"><div style="width:${(s.x / 30) * 100}%;background:${LANE_COLORS[i]}"></div></div>
      </div>`
    })
    .join('')
}

function rainBars(p: number) {
  const max = Math.max(...rainResults.flat())
  const rows = RAINS.map((r, k) => {
    const [w, run] = rainResults[k]
    const q = ease(p * 1.6 - k * 0.2)
    const pct = ((w - run) / w) * 100
    return `<div class="rrow">
      <div class="rlabel">${r.label}</div>
      <div class="rbars">
        <div class="rb"><div class="fill" style="width:${(w / max) * 100 * q}%;background:${LANE_COLORS[0]}"></div><span>${(w * q).toFixed(0)} mL</span></div>
        <div class="rb"><div class="fill" style="width:${(run / max) * 100 * q}%;background:${LANE_COLORS[1]}"></div><span>${(run * q).toFixed(0)} mL</span></div>
      </div>
      <div class="rpct" style="opacity:${clamp01(p * 3 - 1 - k * 0.3)}">−${pct.toFixed(0)}%</div>
    </div>`
  }).join('')
  return `<div class="panel">
    <div class="ptitle">どんな雨でも、<br/>走った方が濡れない</div>
    <div class="legend"><span><i style="background:${LANE_COLORS[0]}"></i>歩く 5km/h</span><span><i style="background:${LANE_COLORS[1]}"></i>走る 20km/h</span></div>
    ${rows}
  </div>`
}

function speedColumns(p: number) {
  const max = Math.max(...speedResults)
  const cols = SPEEDS.map((sp, k) => {
    const q = ease(p * 1.8 - k * 0.12)
    const w = speedResults[k]
    const color = k === 0 ? LANE_COLORS[0] : k === 3 ? LANE_COLORS[1] : '#6b7680'
    return `<div class="col">
      <div class="cval" style="opacity:${clamp01(q * 2 - 0.6)}">${w.toFixed(0)}<small>mL</small></div>
      <div class="cbar" style="height:${(w / max) * 100 * q}%;background:${color}"></div>
      <div class="clabel">${sp.label}<small>${(sp.v * 3.6).toFixed(0)} km/h</small></div>
    </div>`
  }).join('')
  return `<div class="panel">
    <div class="ptitle">速いほど濡れない。<br/>でも減り方はだんだん頭打ち</div>
    <div class="legend"><span>強い雨 20mm/h・30m（4回平均）</span></div>
    <div class="cols">${cols}</div>
  </div>`
}

function renderFrame(f: number) {
  if (f !== lastFrame + 1) throw new Error(`frames must be sequential: ${lastFrame} -> ${f}`)
  lastFrame = f
  if (f === S.race[0]) {
    ctrl.lanePlayback = [WALK, RUN].map((v) => 30 / v / RACE_SEC)
    ctrl.start()
  }
  if (f === S.wetmap[0]) {
    // 正面やや上からゆっくり回して、上から濡れた分と前から濡れた分を見せる
    ctrl.setColorMode('heat')
    for (const l of ctrl.lanes) {
      l.human.satMm = 0.03
      l.human.setMode('heat')
      l.camAngle = 0.75
      l.orbitSpeed = -0.35
      l.orbitHeight = 1.95
      l.orbitRadius = 2.5
    }
  }
  ctrl.tick(1 / FPS)

  const t = (r: readonly [number, number]) => (f - r[0]) / (r[1] - r[0])
  if (within(f, S.title)) {
    setOverlay(`<div class="divider"></div><div class="title" style="opacity:${ease(t(S.title) * 3)}">
      <div class="sub">傘がない！30m先まで</div>
      <h1><em>走る</em>？ <em>歩く</em>？</h1>
      <div class="sub">どっちが濡れない？</div>
    </div>`)
  } else if (within(f, S.race)) {
    const done = ctrl.done
    const [a, b] = ctrl.sims.map((s) => s.wetTotal * 1e6)
    setOverlay(`${hud()}
      <div class="tag">強い雨 20mm/h・30m ／ 雨粒を1粒ずつ物理シミュレーション（早送り）</div>
      ${done ? `<div class="verdict"><em>走る</em>方が <b>${(((a - b) / a) * 100).toFixed(0)}%</b> 濡れない</div>` : ''}`)
  } else if (within(f, S.wetmap)) {
    setOverlay(`${hud()}
      <div class="tag">どこが濡れた？（濡れマップ）</div>
      <div class="note n0">歩く → 頭・肩（上から）</div>
      <div class="note n1">走る → 胸・太もも（前から）</div>`)
  } else if (within(f, S.rains)) {
    setOverlay(`<div class="dim"></div>${rainBars(t(S.rains))}`)
  } else if (within(f, S.speeds)) {
    setOverlay(`<div class="dim"></div>${speedColumns(t(S.speeds))}`)
  } else {
    setOverlay(`<div class="dim"></div><div class="title cta" style="opacity:${ease(t(S.cta) * 3)}">
      <h1>雨の中、<em>走る</em>？<em>歩く</em>？</h1>
      <div class="sub">雨量・速さ・風を変えて<br/>ブラウザで試せます</div>
      <div class="chip">☔ 物理シミュレーター</div>
    </div>`)
  }
}

;(window as unknown as { promo: unknown }).promo = { renderFrame, totalFrames: TOTAL, fps: FPS }
// 手動確認用: ?play でリアルタイム再生
if (new URLSearchParams(location.search).has('play')) {
  let f = 0
  const loop = () => {
    renderFrame(f++)
    if (f < TOTAL) requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}
