// 1人分のランナーと、その周囲の雨滴の粒子シミュレーション
// ランナーと一緒に動く箱の中で雨滴を1粒ずつ動かし、体のカプセルとの衝突を判定する。
// 箱から出た雨滴は反対側の面から入り直す（一様な雨の中を進むのと等価）。
// 雨滴が多すぎる強雨では1粒子が複数の実雨滴を代表する（superdroplet）。

import { computePose, copyPose, makePose, NPARTS, NREGIONS, PARTS, classifyHit, gaitFor, type Pose } from './body'
import { dropVolume, makeRain, sampleDiameter, terminalVelocity, type RainSpec } from './rain'
import { makeRng } from './rng'

export interface SimParams {
  rateMmH: number
  speed: number // m/s
  wind: number // m/s（+ は追い風）
  distance: number // m
  seed: number
}

export const BOX = { x0: -0.9, x1: 1.0, y0: 0, y1: 2.1, z0: -0.3, z1: 0.3 }
const BOX_V = (BOX.x1 - BOX.x0) * (BOX.y1 - BOX.y0) * (BOX.z1 - BOX.z0)
export const MAX_DROPS = 2500
export const SUBSTEP = 1 / 120

export interface HitEvent {
  part: number
  // パーツのローカル座標（メッシュと同じ規約: y=軸方向, z=体の横方向, x=軸と直交する前後方向）
  lx: number
  ly: number
  lz: number
  // ランナー基準のワールド位置（水しぶき表示用）
  wx: number
  wy: number
  wz: number
  volume: number // m^3
}

export class RunnerSim {
  readonly params: SimParams
  readonly rain: RainSpec
  readonly weight: number
  readonly n: number
  private rng: () => number
  private px: Float64Array
  private py: Float64Array
  private pz: Float64Array
  private vy: Float64Array
  private vol: Float64Array
  pose: Pose = makePose()
  private prev: Pose = makePose()
  x = 0 // 進んだ距離
  t = 0 // 経過時間
  phase = 0
  started = false
  finished = false
  wetTotal = 0 // m^3
  wetByPart = new Float64Array(NPARTS)
  wetByRegion = new Float64Array(NREGIONS)
  hitCount = 0
  onHit: ((h: HitEvent) => void) | null = null
  private idle = 0

  constructor(params: SimParams) {
    this.params = params
    this.rng = makeRng(params.seed)
    this.rain = makeRain(params.rateMmH)
    const real = this.rain.numberDensity * BOX_V
    this.n = Math.max(1, Math.min(MAX_DROPS, Math.round(real)))
    this.weight = real / this.n
    this.px = new Float64Array(this.n)
    this.py = new Float64Array(this.n)
    this.pz = new Float64Array(this.n)
    this.vy = new Float64Array(this.n)
    this.vol = new Float64Array(this.n)
    for (let i = 0; i < this.n; i++) {
      this.px[i] = BOX.x0 + this.rng() * (BOX.x1 - BOX.x0)
      this.py[i] = BOX.y0 + this.rng() * (BOX.y1 - BOX.y0)
      this.pz[i] = BOX.z0 + this.rng() * (BOX.z1 - BOX.z0)
      const d = sampleDiameter(this.rain.lambda, this.rng())
      this.vy[i] = -terminalVelocity(d)
      this.vol[i] = dropVolume(d) * this.weight
    }
    computePose(params.speed, 0, this.pose, 0)
    copyPose(this.pose, this.prev)
  }

  get duration() {
    return this.params.distance / this.params.speed
  }

  start() {
    this.started = true
  }

  // 実時間 dt 分シミュレーションを進める
  advance(dt: number) {
    if (!this.started || this.finished) {
      this.idle += dt
      return
    }
    let remain = dt
    while (remain > 1e-9 && !this.finished) {
      const h = Math.min(SUBSTEP, remain, (this.params.distance - this.x) / this.params.speed + 1e-9)
      this.substep(h)
      remain -= h
      if (this.x >= this.params.distance - 1e-7) {
        this.x = this.params.distance
        this.finished = true
        computePose(this.params.speed, this.phase, this.pose, 0)
      }
    }
  }

  private substep(dt: number) {
    const v = this.params.speed
    const g = gaitFor(v)
    copyPose(this.pose, this.prev)
    this.phase += 2 * Math.PI * g.strideFreq * dt
    // 走り出し0.4秒で歩容の振幅を立ち上げる
    const amp = Math.min(1, this.t / 0.4)
    computePose(v, this.phase, this.pose, amp)
    this.x += v * dt
    this.t += dt

    const ux = this.params.wind - v
    const pa = this.prev.a
    const pb = this.prev.b
    const na = this.pose.a
    const nb = this.pose.b
    // 各カプセルの平均移動量（ドロップの相対運動に使う）と AABB
    const cdx = cdxBuf
    const cdy = cdyBuf
    let bx0 = Infinity, bx1 = -Infinity, by1 = -Infinity
    for (let k = 0; k < NPARTS; k++) {
      const o = k * 3
      cdx[k] = (na[o] - pa[o] + nb[o] - pb[o]) * 0.5
      cdy[k] = (na[o + 1] - pa[o + 1] + nb[o + 1] - pb[o + 1]) * 0.5
      // 相対運動ぶん広げた当たり候補の範囲
      const r = PARTS[k].radius + Math.abs(cdx[k]) + Math.abs(cdy[k]) + 0.01
      aabb[k * 4] = Math.min(pa[o], pb[o]) - r
      aabb[k * 4 + 1] = Math.max(pa[o], pb[o]) + r
      aabb[k * 4 + 2] = Math.min(pa[o + 1], pb[o + 1]) - r
      aabb[k * 4 + 3] = Math.max(pa[o + 1], pb[o + 1]) + r
      bx0 = Math.min(bx0, aabb[k * 4])
      bx1 = Math.max(bx1, aabb[k * 4 + 1])
      by1 = Math.max(by1, aabb[k * 4 + 3])
    }

    const { px, py, pz, vy, vol } = this
    for (let i = 0; i < this.n; i++) {
      const x0 = px[i]
      const y0 = py[i]
      const z0 = pz[i]
      const dxd = ux * dt
      const dyd = vy[i] * dt
      let x1 = x0 + dxd
      let y1 = y0 + dyd
      if (
        z0 > -0.27 && z0 < 0.27 &&
        Math.min(y0, y1) < by1 && Math.max(x0, x1) > bx0 && Math.min(x0, x1) < bx1
      ) {
        let best = 2
        let bestK = -1
        let bnx = 0
        let bny = 0
        let bnz = 0
        for (let k = 0; k < NPARTS; k++) {
          const b = k * 4
          if (Math.max(x0, x1) < aabb[b] || Math.min(x0, x1) > aabb[b + 1]) continue
          if (Math.max(y0, y1) < aabb[b + 2] || Math.min(y0, y1) > aabb[b + 3]) continue
          const o = k * 3
          // カプセル基準の相対運動
          const rdx = dxd - cdx[k]
          const rdy = dyd - cdy[k]
          const t = capsuleHit(
            x0, y0, z0, rdx, rdy,
            pa[o], pa[o + 1], pa[o + 2], pb[o], pb[o + 1], pb[o + 2],
            PARTS[k].radius,
          )
          if (t >= 0 && t < best) {
            best = t
            bestK = k
            bnx = hitN[0]
            bny = hitN[1]
            bnz = hitN[2]
          }
        }
        if (bestK >= 0) {
          this.registerHit(bestK, bnx, bny, bnz, vol[i])
          this.respawn(i, ux)
          continue
        }
      }
      // 境界の周期的な入れ替え（再注入位置はランダム化）
      if (y1 < BOX.y0) {
        y1 += BOX.y1 - BOX.y0
        x1 = BOX.x0 + this.rng() * (BOX.x1 - BOX.x0)
        pz[i] = BOX.z0 + this.rng() * (BOX.z1 - BOX.z0)
      }
      if (x1 < BOX.x0) {
        x1 += BOX.x1 - BOX.x0
        y1 = BOX.y0 + this.rng() * (BOX.y1 - BOX.y0)
        pz[i] = BOX.z0 + this.rng() * (BOX.z1 - BOX.z0)
      } else if (x1 > BOX.x1) {
        x1 -= BOX.x1 - BOX.x0
        y1 = BOX.y0 + this.rng() * (BOX.y1 - BOX.y0)
        pz[i] = BOX.z0 + this.rng() * (BOX.z1 - BOX.z0)
      }
      px[i] = x1
      py[i] = y1
    }
  }

  // 当たった雨滴は、流入量に比例した確率で上面か前後面から入り直させる
  private respawn(i: number, ux: number) {
    const w = BOX.x1 - BOX.x0
    const hgt = BOX.y1 - BOX.y0
    const topFlux = -this.vy[i] * w
    const sideFlux = Math.abs(ux) * hgt
    if (this.rng() * (topFlux + sideFlux) < topFlux) {
      this.px[i] = BOX.x0 + this.rng() * w
      this.py[i] = BOX.y1 - this.rng() * 0.01
    } else {
      this.px[i] = ux < 0 ? BOX.x1 - 0.001 : BOX.x0 + 0.001
      this.py[i] = BOX.y0 + this.rng() * hgt
    }
    this.pz[i] = BOX.z0 + this.rng() * (BOX.z1 - BOX.z0)
  }

  private registerHit(k: number, nx: number, ny: number, nz: number, volume: number) {
    const o = k * 3
    const a = this.pose.a
    const b = this.pose.b
    // 現在のポーズ上の接触点（パーツ表面）を求める
    const ax = a[o], ay = a[o + 1], az = a[o + 2]
    const dx = b[o] - ax, dy = b[o + 1] - ay
    const len = Math.hypot(dx, dy) || 1e-6
    const r = PARTS[k].radius
    const hp = hitP
    // 衝突時の軸上パラメータを使って現在ポーズ上に写す
    const s = Math.min(1, Math.max(0, hp[3]))
    const cx = ax + dx * s + nx * r
    const cy = ay + dy * s + ny * r
    const cz = az + nz * r
    const mx = ax + dx * 0.5
    const my = ay + dy * 0.5
    const ex = dx / len
    const ey = dy / len
    // ローカル座標: y=軸方向, z=横方向, x = 軸×横 (d × e_z)
    const rx = cx - mx
    const ry = cy - my
    const ev: HitEvent = {
      part: k,
      lx: rx * ey - ry * ex,
      ly: rx * ex + ry * ey,
      lz: cz - az,
      wx: cx,
      wy: cy,
      wz: cz,
      volume,
    }
    this.wetTotal += volume
    this.wetByPart[k] += volume
    this.wetByRegion[classifyHit(k, nx, ny)] += volume
    this.hitCount++
    this.onHit?.(ev)
  }
}

const cdxBuf = new Float64Array(NPARTS)
const cdyBuf = new Float64Array(NPARTS)
const aabb = new Float64Array(NPARTS * 4)
const hitN = new Float64Array(3)
const hitP = new Float64Array(4) // [x,y,z, 軸パラメータ]

// 線分 p→p+d（t∈[0,1]）とカプセル(A,B,r)の最初の交点の t を返す。当たらなければ -1。
// 交点の法線を hitN に、軸上パラメータを hitP[3] に書き込む。
export function capsuleHit(
  ox: number, oy: number, oz: number, dx: number, dy: number,
  ax: number, ay: number, az: number, bx: number, by: number, bz: number,
  r: number,
): number {
  const bax = bx - ax, bay = by - ay, baz = bz - az
  const baba = bax * bax + bay * bay + baz * baz
  // 始点がすでに内部（振った手足に入り込まれた場合）
  {
    const oax = ox - ax, oay = oy - ay, oaz = oz - az
    const s = Math.min(1, Math.max(0, (oax * bax + oay * bay + oaz * baz) / baba))
    const qx = ox - (ax + bax * s), qy = oy - (ay + bay * s), qz = oz - (az + baz * s)
    const d2 = qx * qx + qy * qy + qz * qz
    if (d2 < r * r) {
      const dl = Math.sqrt(d2) || 1
      hitN[0] = qx / dl
      hitN[1] = qy / dl
      hitN[2] = qz / dl
      hitP[3] = s
      return 0
    }
  }
  const dl = Math.hypot(dx, dy)
  if (dl < 1e-12) return -1
  const rdx = dx / dl, rdy = dy / dl // rdz = 0（雨は横方向に動かない）
  const oax = ox - ax, oay = oy - ay, oaz = oz - az
  const bard = bax * rdx + bay * rdy
  const baoa = bax * oax + bay * oay + baz * oaz
  const rdoa = rdx * oax + rdy * oay
  const oaoa = oax * oax + oay * oay + oaz * oaz
  const a = baba - bard * bard
  let t = -1
  if (a > 1e-10) {
    const b = baba * rdoa - baoa * bard
    const c = baba * oaoa - baoa * baoa - r * r * baba
    const h = b * b - a * c
    if (h < 0) return -1
    t = (-b - Math.sqrt(h)) / a
    const y = baoa + t * bard
    if (!(y > 0 && y < baba)) {
      t = capT(y <= 0 ? oax : ox - bx, y <= 0 ? oay : oy - by, y <= 0 ? oaz : oz - bz, rdx, rdy, r)
    }
  } else {
    // 軸と平行に進む場合は手前側の半球だけ見ればよい
    const toA = bard > 0
    t = capT(toA ? oax : ox - bx, toA ? oay : oy - by, toA ? oaz : oz - bz, rdx, rdy, r)
  }
  if (t < 0 || t > dl) return -1
  const hx = ox + rdx * t, hy = oy + rdy * t, hz = oz
  const s = Math.min(1, Math.max(0, ((hx - ax) * bax + (hy - ay) * bay + (hz - az) * baz) / baba))
  const nx = hx - (ax + bax * s), ny = hy - (ay + bay * s), nz = hz - (az + baz * s)
  const nl = Math.hypot(nx, ny, nz) || 1
  hitN[0] = nx / nl
  hitN[1] = ny / nl
  hitN[2] = nz / nl
  hitP[3] = s
  return t / dl
}

function capT(ocx: number, ocy: number, ocz: number, rdx: number, rdy: number, r: number) {
  const b = rdx * ocx + rdy * ocy
  const c = ocx * ocx + ocy * ocy + ocz * ocz - r * r
  const h = b * b - c
  if (h <= 0) return -1
  return -b - Math.sqrt(h)
}
