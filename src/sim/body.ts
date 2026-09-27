// 人体モデル: 身長約1.75mの人をカプセル(線分+半径)の集合で表す
// 座標系（ランナー基準）: x = 進行方向, y = 上, z = 右手側（左は -z）
// 速度に応じて歩行⇔走行の歩容（歩幅・ピッチ・膝の曲げ・腕振り・前傾）が変化する

export type Material = 'skin' | 'shirt' | 'pants' | 'shoe'

export interface PartDef {
  id: string
  radius: number
  material: Material
  kind: 'head' | 'neck' | 'torso' | 'upperArm' | 'foreArm' | 'thigh' | 'shin' | 'foot'
}

export const PARTS: PartDef[] = [
  { id: 'head', radius: 0.1, material: 'skin', kind: 'head' },
  { id: 'neck', radius: 0.05, material: 'skin', kind: 'neck' },
  { id: 'torsoL', radius: 0.115, material: 'shirt', kind: 'torso' },
  { id: 'torsoR', radius: 0.115, material: 'shirt', kind: 'torso' },
  { id: 'upperArmL', radius: 0.045, material: 'shirt', kind: 'upperArm' },
  { id: 'foreArmL', radius: 0.04, material: 'skin', kind: 'foreArm' },
  { id: 'upperArmR', radius: 0.045, material: 'shirt', kind: 'upperArm' },
  { id: 'foreArmR', radius: 0.04, material: 'skin', kind: 'foreArm' },
  { id: 'thighL', radius: 0.075, material: 'pants', kind: 'thigh' },
  { id: 'shinL', radius: 0.055, material: 'pants', kind: 'shin' },
  { id: 'footL', radius: 0.045, material: 'shoe', kind: 'foot' },
  { id: 'thighR', radius: 0.075, material: 'pants', kind: 'thigh' },
  { id: 'shinR', radius: 0.055, material: 'pants', kind: 'shin' },
  { id: 'footR', radius: 0.045, material: 'shoe', kind: 'foot' },
]
export const NPARTS = PARTS.length

// 体の部位ごとの集計区分
export const REGIONS = [
  { id: 'head', label: '頭' },
  { id: 'shoulder', label: '肩・上面' },
  { id: 'chest', label: '胸・お腹' },
  { id: 'back', label: '背中' },
  { id: 'arm', label: '腕' },
  { id: 'thigh', label: '太もも' },
  { id: 'shin', label: 'すね・ふくらはぎ' },
  { id: 'foot', label: '足（靴）' },
] as const
export const NREGIONS = REGIONS.length

// ヒット位置の法線(ランナー基準)から集計区分を決める
export function classifyHit(part: number, nx: number, ny: number): number {
  switch (PARTS[part].kind) {
    case 'head':
    case 'neck':
      return 0
    case 'torso':
      if (ny > 0.55) return 1
      return nx >= 0 ? 2 : 3
    case 'upperArm':
    case 'foreArm':
      return 4
    case 'thigh':
      return 5
    case 'shin':
      return 6
    case 'foot':
      return 7
  }
}

// ポーズ: 各パーツの端点 A, B（ランナー基準座標）
export interface Pose {
  a: Float64Array // NPARTS*3
  b: Float64Array
}
export function makePose(): Pose {
  return { a: new Float64Array(NPARTS * 3), b: new Float64Array(NPARTS * 3) }
}
export function copyPose(src: Pose, dst: Pose) {
  dst.a.set(src.a)
  dst.b.set(src.b)
}

const L_THIGH = 0.43
const L_SHIN = 0.42
const FOOT_L = 0.22
const HIP_Z = 0.09
const SHOULDER_Z = 0.2
const L_UARM = 0.29
const L_FARM = 0.36
const DEG = Math.PI / 180

const smoothstep = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}
const lerp = (a: number, b: number, t: number) => a + (b - a) * t

export interface Gait {
  runFactor: number // 0=歩き 1=走り
  cadence: number // 歩/秒
  strideFreq: number // 周期/秒（左右1往復）
  stepLength: number // m
  hipAmp: number
  kneeMax: number
  kneeMin: number
  armAmp: number
  elbow: number
  lean: number
}

export function gaitFor(v: number): Gait {
  const s = smoothstep(1.9, 3.0, v)
  const cadence = 1.55 + 0.25 * v
  const stepLength = v / cadence
  const hipAmp = Math.min(0.75, Math.asin(Math.min(0.9, stepLength / 1.8))) * lerp(1, 0.8, s)
  return {
    runFactor: s,
    cadence,
    strideFreq: cadence / 2,
    stepLength,
    hipAmp,
    kneeMax: lerp(55, 95, s) * DEG + s * 12 * DEG * Math.min(1, Math.max(0, (v - 3) / 4)),
    kneeMin: lerp(5, 20, s) * DEG,
    armAmp: lerp(0.25, 0.6, s),
    elbow: lerp(0.25, 1.5, s),
    lean: (2 + 1.6 * v) * DEG,
  }
}

const tmp = new Float64Array(NPARTS * 6)
function setPart(i: number, ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const o = i * 6
  tmp[o] = ax
  tmp[o + 1] = ay
  tmp[o + 2] = az
  tmp[o + 3] = bx
  tmp[o + 4] = by
  tmp[o + 5] = bz
}

// amp: 0 で直立（スタート前・ゴール後）、1 で通常の歩容
export function computePose(v: number, phase: number, out: Pose, amp = 1) {
  const g = gaitFor(v)
  const s = g.runFactor * amp
  // --- 脚（骨盤中心を y=0 として相対座標で計算） ---
  let minY = Infinity
  for (let side = 0; side < 2; side++) {
    const z = side === 0 ? -HIP_Z : HIP_Z
    const lp = phase + (side === 0 ? 0 : Math.PI)
    const hip = g.hipAmp * amp * Math.sin(lp)
    const knee = (g.kneeMin + g.kneeMax * Math.pow(Math.max(0, Math.cos(lp)), 1.5)) * amp
    const kx = L_THIGH * Math.sin(hip)
    const ky = -L_THIGH * Math.cos(hip)
    const shin = hip - knee
    const axx = kx + L_SHIN * Math.sin(shin)
    const ayy = ky - L_SHIN * Math.cos(shin)
    const fa = shin * 0.7
    const hx = axx - 0.05
    const hy = ayy - 0.035
    const tx = hx + FOOT_L * Math.cos(fa)
    const ty = hy + FOOT_L * Math.sin(fa)
    const base = side === 0 ? 8 : 11
    setPart(base, 0, 0, z, kx, ky, z)
    setPart(base + 1, kx, ky, z, axx, ayy, z)
    setPart(base + 2, hx, hy, z, tx, ty, z)
    minY = Math.min(minY, hy - 0.045, ty - 0.045)
  }
  // 骨盤の高さ: 最も低い足が地面に接するように（走りは少し浮く）
  const flight = s * 0.04 * Math.max(0, Math.sin(2 * phase))
  const pelvisY = -minY + flight
  // --- 上半身 ---
  const lean = g.lean * (amp > 0 ? 1 : 0.3)
  const ux = Math.sin(lean)
  const uy = Math.cos(lean)
  const up = (d: number, z: number, i: number, d2: number) =>
    setPart(i, ux * d, uy * d, z, ux * d2, uy * d2, z)
  up(0.69, 0, 0, 0.73) // head (sphere-ish)
  up(0.53, 0, 1, 0.6) // neck
  up(0.1, -0.085, 2, 0.44)
  up(0.1, 0.085, 3, 0.44)
  for (let side = 0; side < 2; side++) {
    const z = side === 0 ? -SHOULDER_Z : SHOULDER_Z
    const lp = phase + (side === 0 ? 0 : Math.PI)
    const sx = ux * 0.46
    const sy = uy * 0.46
    const a = lean * 0.5 - g.armAmp * amp * Math.sin(lp)
    const ex = sx + L_UARM * Math.sin(a)
    const ey = sy - L_UARM * Math.cos(a)
    const f = a + lerp(0.1, g.elbow, amp)
    const hx = ex + L_FARM * Math.sin(f)
    const hy = ey - L_FARM * Math.cos(f)
    const base = side === 0 ? 4 : 6
    setPart(base, sx, sy, z, ex, ey, z)
    setPart(base + 1, ex, ey, z, hx, hy, z)
  }
  for (let i = 0; i < NPARTS; i++) {
    const o = i * 6
    out.a[i * 3] = tmp[o]
    out.a[i * 3 + 1] = tmp[o + 1] + pelvisY
    out.a[i * 3 + 2] = tmp[o + 2]
    out.b[i * 3] = tmp[o + 3]
    out.b[i * 3 + 1] = tmp[o + 4] + pelvisY
    out.b[i * 3 + 2] = tmp[o + 5]
  }
}
