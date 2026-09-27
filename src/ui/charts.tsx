import { useMemo, useState } from 'react'
import { REGIONS } from '../sim/body'
import { makeRain } from '../sim/rain'
import { theoryWet } from '../sim/theory'

export interface RunPoint {
  speed: number
  wet: number // mL
}

// 速度 → 濡れる量 の曲線（理論）と、実際のシミュレーション結果の点
export function SpeedCurve(props: {
  rateMmH: number
  wind: number
  distance: number
  runs: RunPoint[]
  markers: { speed: number; color: string; label: string }[]
}) {
  const { rateMmH, wind, distance, runs, markers } = props
  const data = useMemo(() => {
    const rain = makeRain(rateMmH)
    const pts = []
    for (let v = 0.5; v <= 10.001; v += 0.25) pts.push({ v, ...theoryWet(rain, v, wind, distance) })
    return pts
  }, [rateMmH, wind, distance])
  const [hover, setHover] = useState<number | null>(null)

  const W = 560, H = 270, L = 44, R = 12, T = 26, B = 34
  const maxY = niceMax(Math.max(...data.map((d) => d.total), ...runs.map((r) => r.wet)) * 1.05)
  const sx = (v: number) => L + ((v - 0) / 10) * (W - L - R)
  const sy = (y: number) => T + (1 - y / maxY) * (H - T - B)
  const path = (key: 'total' | 'top' | 'motion') =>
    data.map((d, i) => `${i ? 'L' : 'M'}${sx(d.v).toFixed(1)},${sy(d[key]).toFixed(1)}`).join('')
  const best = data.reduce((a, b) => (b.total < a.total ? b : a))
  const ticks = Array.from({ length: 5 }, (_, i) => (maxY / 4) * i)
  const hd = hover !== null ? data[hover] : null

  return (
    <div className="chart">
      <div className="legend">
        <span><i className="sw" style={{ background: 'var(--ink)' }} />合計（理論）</span>
        <span><i className="sw dash" style={{ borderColor: 'var(--c-top)' }} />上から降ってくる分</span>
        <span><i className="sw dash" style={{ borderColor: 'var(--c-motion)' }} />動いて浴びる分</span>
        <span><i className="dot" />シミュレーション結果</span>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="移動速度と濡れる量の関係"
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect()
          const x = ((e.clientX - rect.left) / rect.width) * W
          const v = ((x - L) / (W - L - R)) * 10
          const i = Math.round((v - 0.5) / 0.25)
          setHover(i >= 0 && i < data.length ? i : null)
        }}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={sy(t)} y2={sy(t)} className="grid" />
            <text x={L - 6} y={sy(t) + 4} className="tick" textAnchor="end">{fmt(t)}</text>
          </g>
        ))}
        {[0, 2, 4, 6, 8, 10].map((v) => (
          <text key={v} x={sx(v)} y={H - B + 16} className="tick" textAnchor="middle">{v}</text>
        ))}
        <text x={(L + W - R) / 2} y={H - 4} className="axis" textAnchor="middle">速度 (m/s)</text>
        <text x={L - 6} y={12} className="axis" textAnchor="end">mL</text>
        {markers.map((m) => (
          <g key={m.label}>
            <line x1={sx(m.speed)} x2={sx(m.speed)} y1={T} y2={H - B} stroke={m.color} strokeWidth={1.5} strokeDasharray="3 3" />
            <text x={sx(m.speed) + 4} y={T + 10} className="tick" fill={m.color}>{m.label}</text>
          </g>
        ))}
        <path d={path('top')} fill="none" stroke="var(--c-top)" strokeWidth={2} strokeDasharray="5 4" />
        <path d={path('motion')} fill="none" stroke="var(--c-motion)" strokeWidth={2} strokeDasharray="5 4" />
        <path d={path('total')} fill="none" stroke="var(--ink)" strokeWidth={2.5} />
        {runs.map((r, i) => (
          <circle key={i} cx={sx(r.speed)} cy={sy(r.wet)} r={4.5} className="run-dot" />
        ))}
        {wind > 0.2 && (
          <text x={sx(best.v)} y={sy(best.total) + 18} className="tick" textAnchor="middle">▲最小 {best.v.toFixed(1)} m/s</text>
        )}
        {hd && (
          <g>
            <line x1={sx(hd.v)} x2={sx(hd.v)} y1={T} y2={H - B} className="cross" />
            <circle cx={sx(hd.v)} cy={sy(hd.total)} r={4} fill="var(--ink)" />
            <g transform={`translate(${Math.min(sx(hd.v) + 8, W - 150)},${T + 18})`}>
              <rect width={140} height={58} rx={6} className="tip" />
              <text x={8} y={16} className="tip-t">{hd.v.toFixed(2)} m/s（{(hd.v * 3.6).toFixed(1)} km/h）</text>
              <text x={8} y={33} className="tip-t">合計 {hd.total.toFixed(1)} mL</text>
              <text x={8} y={49} className="tip-s">上 {hd.top.toFixed(1)} / 動き {hd.motion.toFixed(1)}</text>
            </g>
          </g>
        )}
      </svg>
    </div>
  )
}

// 部位ごとの濡れ量（A/B の横棒）
export function RegionBars(props: { a: Float64Array; b: Float64Array; colors: string[]; names: string[] }) {
  const { a, b, colors, names } = props
  const max = Math.max(1e-9, ...a, ...b)
  return (
    <div className="bars">
      <div className="legend">
        {names.map((n, i) => (
          <span key={n}><i className="sw" style={{ background: colors[i] }} />{n}</span>
        ))}
      </div>
      {REGIONS.map((r, i) => (
        <div className="bar-row" key={r.id}>
          <div className="bar-label">{r.label}</div>
          <div className="bar-pair">
            {[a, b].map((arr, j) => (
              <div className="bar-line" key={j} title={`${names[j]}: ${(arr[i] * 1e6).toFixed(2)} mL`}>
                <div className="bar" style={{ width: `${(arr[i] / max) * 100}%`, background: colors[j] }} />
                <span className="bar-val">{(arr[i] * 1e6).toFixed(1)}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function niceMax(x: number) {
  const p = Math.pow(10, Math.floor(Math.log10(x)))
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (m * p >= x) return m * p
  return 10 * p
}
function fmt(x: number) {
  return x >= 10 ? x.toFixed(0) : x.toFixed(1)
}
