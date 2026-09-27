// 雨滴の物理モデル
// - 粒径分布: Marshall-Palmer 型の指数分布 N(D) = N0·exp(-ΛD)
// - 終端速度: Atlas et al. (1973) の近似式 v(D) = 9.65 - 10.3·exp(-0.6D)
// N0 は「分布から計算した降水強度 = 指定した降水強度」になるよう数値的に正規化する

export const D_MIN = 0.5 // mm（これより小さい霧雨成分は水量への寄与が小さいので省略）
export const D_MAX = 6.0 // mm

export function terminalVelocity(dMm: number): number {
  return Math.max(0.5, 9.65 - 10.3 * Math.exp(-0.6 * dMm))
}

export function dropVolume(dMm: number): number {
  const d = dMm * 1e-3
  return (Math.PI / 6) * d * d * d // m^3
}

export interface RainSpec {
  rateMmH: number
  rate: number // m/s（降水強度）
  lambda: number // 1/mm
  numberDensity: number // 個/m^3
  lwc: number // 空気1m^3あたりの水の体積 (m^3/m^3)
  meanVt: number // 質量加重平均の終端速度 (m/s)
}

export function makeRain(rateMmH: number): RainSpec {
  const r = Math.max(0.1, rateMmH)
  const lambda = 4.1 * Math.pow(r, -0.21)
  const bins = 400
  const dd = (D_MAX - D_MIN) / bins
  let n = 0
  let lwc = 0
  let flux = 0
  for (let i = 0; i < bins; i++) {
    const d = D_MIN + (i + 0.5) * dd
    const count = Math.exp(-lambda * d) * dd
    const vol = dropVolume(d)
    n += count
    lwc += count * vol
    flux += count * vol * terminalVelocity(d)
  }
  const rate = r / 3.6e6
  const n0 = rate / flux
  return {
    rateMmH: r,
    rate,
    lambda,
    numberDensity: n0 * n,
    lwc: n0 * lwc,
    meanVt: flux / lwc,
  }
}

// 空気中に存在する雨滴の粒径を分布に従ってサンプリング（打ち切り指数分布の逆関数法）
export function sampleDiameter(lambda: number, u: number): number {
  const span = 1 - Math.exp(-lambda * (D_MAX - D_MIN))
  return D_MIN - Math.log(1 - u * span) / lambda
}
