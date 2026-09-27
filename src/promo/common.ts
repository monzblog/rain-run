// 宣伝動画（正方形・縦型ショート）で共通に使う部品

import { Controller, LANE_COLORS } from '../view/controller'
import { RunnerSim } from '../sim/runnerSim'

export const FPS = 30
export const WALK = 1.4
export const RUN = 5.5
export const RACE_SEC = 4.2 // 両者がこの秒数でゴールするよう早送りする
const SEEDS = [11, 12, 13, 14]

export const RAINS = [
  { r: 5, label: '小雨 5mm/h' },
  { r: 20, label: '強い雨 20mm/h' },
  { r: 50, label: '激しい雨 50mm/h' },
]
export const SPEEDS = [
  { v: 1.4, label: '歩く' },
  { v: 2.2, label: '早歩き' },
  { v: 3.5, label: 'ジョグ' },
  { v: 5.5, label: '走る' },
  { v: 8, label: '全力' },
]

export const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
export const ease = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
export const within = (f: number, [a, b]: readonly [number, number]) => f >= a && f < b
export const progress = (f: number, [a, b]: readonly [number, number]) => (f - a) / (b - a)

// 雨粒の大きさのばらつきで試行ごとに ±1割ほど変わるので、4回の平均を使う
export function avgWet(rateMmH: number, speed: number, wind = 0) {
  let sum = 0
  for (const seed of SEEDS) {
    const s = new RunnerSim({ rateMmH, speed, wind, distance: 30, seed })
    s.start()
    while (!s.finished) s.advance(0.05)
    sum += s.wetTotal * 1e6
  }
  return sum / SEEDS.length
}

export function makeController(canvas: HTMLCanvasElement) {
  const ctrl = new Controller(canvas, { rateMmH: 20, speedA: WALK, speedB: RUN, wind: 0, distance: 30 })
  ctrl.renderer.setPixelRatio(1)
  return ctrl
}

export function startRace(ctrl: Controller) {
  ctrl.lanePlayback = [WALK, RUN].map((v) => 30 / v / RACE_SEC)
  ctrl.start()
}

// 正面やや上からゆっくり回して、上から濡れた分と前から濡れた分を見せる
export function startWetmap(ctrl: Controller, radius = 2.5, height = 1.95) {
  ctrl.setColorMode('heat')
  for (const l of ctrl.lanes) {
    l.human.satMm = 0.03
    l.human.setMode('heat')
    l.camAngle = 0.75
    l.orbitSpeed = -0.35
    l.orbitHeight = height
    l.orbitRadius = radius
  }
}

export function makeOverlay(el: HTMLElement) {
  let html = ''
  return (h: string) => {
    if (h !== html) {
      el.innerHTML = h
      html = h
    }
  }
}

export function hudHtml(ctrl: Controller) {
  return (
    '<div class="divider"></div>' +
    ctrl.sims
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
  )
}

export function rainBarsHtml(results: number[][], p: number, title: string) {
  const max = Math.max(...results.flat())
  const rows = RAINS.map((r, k) => {
    const [w, run] = results[k]
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
    <div class="ptitle">${title}</div>
    <div class="legend"><span><i style="background:${LANE_COLORS[0]}"></i>歩く 5km/h</span><span><i style="background:${LANE_COLORS[1]}"></i>走る 20km/h</span></div>
    ${rows}
  </div>`
}

export interface Column {
  label: string
  sub: string
  value: number
  color: string
  badge?: string
}

export function columnsHtml(cols: Column[], p: number, title: string, note: string, extra = '') {
  const max = Math.max(...cols.map((c) => c.value))
  const body = cols.map((c, k) => {
    const q = ease(p * 1.8 - k * 0.12)
    return `<div class="col">
      ${c.badge ? `<div class="badge" style="opacity:${clamp01(p * 3 - 1.2)}">${c.badge}</div>` : ''}
      <div class="cval" style="opacity:${clamp01(q * 2 - 0.6)}">${c.value.toFixed(0)}<small>mL</small></div>
      <div class="cbar" style="height:${(c.value / max) * 100 * q}%;background:${c.color}"></div>
      <div class="clabel">${c.label}<small>${c.sub}</small></div>
    </div>`
  }).join('')
  return `<div class="panel">
    <div class="ptitle">${title}</div>
    <div class="legend"><span>${note}</span></div>
    <div class="cols">${body}</div>
    ${extra}
  </div>`
}

export function speedColumns(results: number[]): Column[] {
  return SPEEDS.map((sp, k) => ({
    label: sp.label,
    sub: `${(sp.v * 3.6).toFixed(0)} km/h`,
    value: results[k],
    color: k === 0 ? LANE_COLORS[0] : k === 3 ? LANE_COLORS[1] : '#6b7680',
  }))
}

export function exposePromo(renderFrame: (f: number) => void, totalFrames: number) {
  ;(window as unknown as { promo: unknown }).promo = { renderFrame, totalFrames, fps: FPS }
  // 手動確認用: ?play でリアルタイム再生
  if (new URLSearchParams(location.search).has('play')) {
    let f = 0
    const loop = () => {
      renderFrame(f++)
      if (f < totalFrames) requestAnimationFrame(loop)
    }
    requestAnimationFrame(loop)
  }
}

export function sequentialGuard() {
  let last = -1
  return (f: number) => {
    if (f !== last + 1) throw new Error(`frames must be sequential: ${last} -> ${f}`)
    last = f
  }
}
