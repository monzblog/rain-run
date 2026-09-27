// 理論モデル（検算とグラフ用）
// ランナーから見た雨は、速度 u = (風−速度, −終端速度) で斜めに降ってくる。
// 濡れる量 W = 雨水量密度 × |u| × (u 方向から見た体の投影面積) × 所要時間
// 投影面積は実際の人体モデルを歩容サイクルで平均し、シルエットをラスタライズして求める。
// 内訳として「止まっていても上から降ってくる分（時間に比例）」と
// 「動くことで余分に浴びる分」に分けて返す。

import { computePose, makePose, NPARTS, PARTS } from './body'
import type { RainSpec } from './rain'

const cache = new Map<string, number>()
const pose = makePose()
const CELL = 0.012
const PHASES = 6

function unionArea(caps: Float64Array, n: number): number {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (let i = 0; i < n; i++) {
    const o = i * 5
    const r = caps[o + 4]
    x0 = Math.min(x0, caps[o] - r, caps[o + 2] - r)
    x1 = Math.max(x1, caps[o] + r, caps[o + 2] + r)
    y0 = Math.min(y0, caps[o + 1] - r, caps[o + 3] - r)
    y1 = Math.max(y1, caps[o + 1] + r, caps[o + 3] + r)
  }
  let count = 0
  for (let y = y0 + CELL / 2; y < y1; y += CELL) {
    for (let x = x0 + CELL / 2; x < x1; x += CELL) {
      for (let i = 0; i < n; i++) {
        const o = i * 5
        const ax = caps[o], ay = caps[o + 1], r = caps[o + 4]
        const dx = caps[o + 2] - ax, dy = caps[o + 3] - ay
        const l2 = dx * dx + dy * dy
        const s = l2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / l2)) : 0
        const qx = x - ax - dx * s, qy = y - ay - dy * s
        if (qx * qx + qy * qy < r * r) {
          count++
          break
        }
      }
    }
  }
  return count * CELL * CELL
}

const capsBuf = new Float64Array(NPARTS * 5)

// 速度 v で動く人を、(dx, dy) 方向（x-y 平面内）から見た平均投影面積 (m^2)
export function projectedArea(v: number, dx: number, dy: number): number {
  const vk = Math.round(v * 20) / 20
  const ang = Math.round((Math.atan2(dy, dx) * 180) / Math.PI * 2) / 2
  const key = `${vk}|${ang}`
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const a = (ang * Math.PI) / 180
  // 視線に垂直な面への投影座標: s = p·n, t = z
  const nx = -Math.sin(a)
  const ny = Math.cos(a)
  let sum = 0
  for (let p = 0; p < PHASES; p++) {
    computePose(vk, (p / PHASES) * 2 * Math.PI, pose, 1)
    for (let i = 0; i < NPARTS; i++) {
      const o = i * 3
      capsBuf[i * 5] = pose.a[o] * nx + pose.a[o + 1] * ny
      capsBuf[i * 5 + 1] = pose.a[o + 2]
      capsBuf[i * 5 + 2] = pose.b[o] * nx + pose.b[o + 1] * ny
      capsBuf[i * 5 + 3] = pose.b[o + 2]
      capsBuf[i * 5 + 4] = PARTS[i].radius
    }
    sum += unionArea(capsBuf, NPARTS)
  }
  const res = sum / PHASES
  cache.set(key, res)
  return res
}

export interface TheoryResult {
  top: number // mL: 上から降ってくる分
  motion: number // mL: 動くことで余分に浴びる分
  total: number // mL
}

export function theoryWet(rain: RainSpec, v: number, wind: number, distance: number): TheoryResult {
  const time = distance / v
  const ux = wind - v
  const uy = -rain.meanVt
  const speed = Math.hypot(ux, uy)
  const total = rain.lwc * speed * projectedArea(v, ux, uy) * time * 1e6
  const top = rain.rate * projectedArea(v, 0, -1) * time * 1e6
  return { top, motion: Math.max(0, total - top), total }
}
