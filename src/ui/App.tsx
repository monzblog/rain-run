import { useEffect, useReducer, useRef, useState } from 'react'
import { Controller, LANE_COLORS, type Params } from '../view/controller'
import type { ColorMode } from '../view/humanMesh'
import { RegionBars, SpeedCurve, type RunPoint } from './charts'

const RAIN_PRESETS = [
  { v: 3, label: '小雨' },
  { v: 10, label: '本降り' },
  { v: 30, label: '土砂降り' },
  { v: 80, label: '猛烈な雨' },
]
const SPEED_PRESETS = [
  { v: 1.4, label: '歩く' },
  { v: 2.2, label: '早歩き' },
  { v: 3.5, label: 'ジョグ' },
  { v: 5.5, label: '走る' },
  { v: 8, label: '全力' },
]
const DISTANCE = 30

function rainWord(r: number) {
  if (r < 3) return '弱い雨'
  if (r < 10) return '普通の雨'
  if (r < 20) return 'やや強い雨'
  if (r < 30) return '強い雨'
  if (r < 50) return '激しい雨'
  if (r < 80) return '非常に激しい雨'
  return '猛烈な雨'
}
const kmh = (v: number) => (v * 3.6).toFixed(1)

export function App({ promo }: { promo: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const ctrlRef = useRef<Controller | null>(null)
  const [, force] = useReducer((x: number) => x + 1, 0)
  const [params, setParams] = useState<Params>({ rateMmH: 20, speedA: 1.4, speedB: 5.5, wind: 0, distance: DISTANCE })
  const [colorMode, setColorMode] = useState<ColorMode>('real')
  const [runs, setRuns] = useState<RunPoint[]>([])
  const recorded = useRef(false)

  useEffect(() => {
    const c = new Controller(canvasRef.current!, params)
    ctrlRef.current = c
    const unsub = c.subscribe(force)
    if (promo) (window as unknown as { __ctrl: Controller }).__ctrl = c
    else c.startLoop()
    return () => {
      unsub()
      c.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ctrl = ctrlRef.current
  const sims = ctrl?.sims ?? []
  const done = !!ctrl && sims.length > 0 && sims.every((s) => s.finished)

  // 走り終えたら結果を曲線グラフの点として記録
  useEffect(() => {
    if (done && !recorded.current) {
      recorded.current = true
      setRuns((r) => [...r, ...sims.map((s) => ({ speed: s.params.speed, wet: s.wetTotal * 1e6 }))])
    }
  })

  const update = (p: Partial<Params>) => {
    const next = { ...params, ...p }
    if (p.rateMmH !== undefined || p.wind !== undefined) setRuns([])
    setParams(next)
    recorded.current = false
    ctrl?.setParams(next)
  }

  const start = () => {
    recorded.current = false
    ctrl?.start()
  }

  const names = [laneName(params.speedA), laneName(params.speedB)]
  if (names[0] === names[1]) names[1] += '(B)'
  const wetA = sims[0]?.wetTotal * 1e6 || 0
  const wetB = sims[1]?.wetTotal * 1e6 || 0

  return (
    <div className={`app ${promo ? 'promo' : ''}`}>
      <header>
        <h1>雨の中、<em>走る</em>？<em>歩く</em>？</h1>
        <p>傘なしで雨の中を30m移動したら、どれだけ濡れる？ 雨粒を1粒ずつ降らせて物理シミュレーションで確かめます。</p>
      </header>

      <main>
        <section className="stage">
          <div className={`viewport ${ctrl?.layout ?? 'stack'}`}>
            <canvas ref={canvasRef} />
            {sims.map((s, i) => (
              <div key={i} className={`lane-hud lane-${i}`}>
                <div className="hud-top">
                  <span className="hud-name" style={{ background: LANE_COLORS[i] }}>{i === 0 ? 'A' : 'B'} {names[i]}</span>
                  <span className="hud-speed">{s.params.speed.toFixed(1)} m/s・{kmh(s.params.speed)} km/h</span>
                </div>
                <div className="hud-wet">
                  <b>{(s.wetTotal * 1e6).toFixed(1)}</b> mL
                  <small>{s.t.toFixed(1)} 秒 / {s.x.toFixed(1)} m</small>
                </div>
                <div className="hud-progress"><div style={{ width: `${(s.x / DISTANCE) * 100}%`, background: LANE_COLORS[i] }} /></div>
              </div>
            ))}
            {done && <Verdict wetA={wetA} wetB={wetB} names={names} />}
          </div>
          <div className="play-row">
            <button className="primary" onClick={start} disabled={ctrl?.running}>
              {ctrl?.running ? '移動中…' : done ? 'もう一度' : 'スタート'}
            </button>
            <div className="seg" role="group" aria-label="再生速度">
              {[1, 2, 4].map((k) => (
                <button key={k} className={ctrl?.playback === k ? 'on' : ''} onClick={() => { if (ctrl) ctrl.playback = k; force() }}>{k}×</button>
              ))}
            </div>
            <div className="seg" role="group" aria-label="表示">
              <button className={colorMode === 'real' ? 'on' : ''} onClick={() => { setColorMode('real'); ctrl?.setColorMode('real') }}>リアル</button>
              <button className={colorMode === 'heat' ? 'on' : ''} onClick={() => { setColorMode('heat'); ctrl?.setColorMode('heat') }}>濡れマップ</button>
            </div>
          </div>
        </section>

        <aside className="panel">
          <div className="field">
            <label>
              雨量 <b>{params.rateMmH} mm/h</b> <span className="muted">（{rainWord(params.rateMmH)}）</span>
            </label>
            <input type="range" min={1} max={100} step={1} value={params.rateMmH} onChange={(e) => update({ rateMmH: +e.target.value })} />
            <div className="chips">
              {RAIN_PRESETS.map((p) => (
                <button key={p.v} className={params.rateMmH === p.v ? 'on' : ''} onClick={() => update({ rateMmH: p.v })}>{p.label}</button>
              ))}
            </div>
          </div>
          {(['speedA', 'speedB'] as const).map((key, i) => (
            <div className="field" key={key}>
              <label>
                <i className="lane-dot" style={{ background: LANE_COLORS[i] }} />
                {i === 0 ? 'A' : 'B'} の速さ <b>{params[key].toFixed(1)} m/s</b> <span className="muted">（{kmh(params[key])} km/h）</span>
              </label>
              <input type="range" min={0.5} max={10} step={0.1} value={params[key]} onChange={(e) => update({ [key]: +e.target.value })} />
              <div className="chips">
                {SPEED_PRESETS.map((p) => (
                  <button key={p.v} className={params[key] === p.v ? 'on' : ''} onClick={() => update({ [key]: p.v })}>{p.label}</button>
                ))}
              </div>
            </div>
          ))}
          <div className="field">
            <label>
              風 <b>{params.wind === 0 ? '無風' : `${params.wind > 0 ? '追い風' : '向かい風'} ${Math.abs(params.wind).toFixed(1)} m/s`}</b>
            </label>
            <input type="range" min={-6} max={6} step={0.5} value={params.wind} onChange={(e) => update({ wind: +e.target.value })} />
            <div className="scale"><span>← 向かい風</span><span>追い風 →</span></div>
          </div>
        </aside>

        <section className="card">
          <h2>どこが濡れた？</h2>
          <p className="muted">体の部位ごとに当たった雨の量 (mL)。走ると頭や肩（上から降る分）が減り、胸や太もも（前から当たる分）はほぼ変わりません。</p>
          {sims.length === 2 && <RegionBars a={sims[0].wetByRegion} b={sims[1].wetByRegion} colors={LANE_COLORS} names={names} />}
        </section>

        <section className="card">
          <h2>速さと濡れ方の関係</h2>
          <p className="muted">
            雨量 {params.rateMmH} mm/h・{params.wind === 0 ? '無風' : `風 ${params.wind > 0 ? '+' : ''}${params.wind} m/s`}・{DISTANCE} m のとき。
            線は体のシルエットから求めた理論値、点は実際に走らせたシミュレーション結果です。
          </p>
          <SpeedCurve
            rateMmH={params.rateMmH}
            wind={params.wind}
            distance={DISTANCE}
            runs={runs}
            markers={[
              { speed: params.speedA, color: LANE_COLORS[0], label: 'A' },
              { speed: params.speedB, color: LANE_COLORS[1], label: 'B' },
            ]}
          />
        </section>

        <section className="card how">
          <h2>しくみ</h2>
          <ul>
            <li><b>雨粒</b>: 雨量から粒の大きさの分布（Marshall-Palmer分布）を作り、粒ごとに大きさに応じた落下速度（大粒ほど速く最大約9 m/s）で落とします。</li>
            <li><b>体</b>: 身長約1.75 mの人を14個のカプセル（頭・胴・腕・脚・足）で表し、速さに応じて歩き⇔走りのフォーム（歩幅・ピッチ・膝の曲げ・腕振り・前傾）が変わります。</li>
            <li><b>当たり判定</b>: 1/240秒ごとに、雨粒の軌跡と振っている手足を含む体の表面との交差を計算し、当たった位置と水の量を記録します。</li>
            <li><b>結論</b>: 上から降ってくる分は「かかった時間」に比例するので速いほど減り、前から突っ込む分は「進んだ距離」でほぼ決まるので速さによらず一定。だから無風なら<b>走った方が濡れない</b>。ただし追い風のときは風と同じ速さで進むのが最小になります。</li>
          </ul>
        </section>
      </main>
      <footer className="muted">物理モデルは簡略化したものです。服の吸水や跳ね返りは考慮していません。</footer>
    </div>
  )
}

function laneName(v: number) {
  if (v < 1.9) return '歩く'
  if (v < 2.8) return '早歩き'
  if (v < 4.5) return 'ジョグ'
  if (v < 7) return '走る'
  return '全力疾走'
}

function Verdict({ wetA, wetB, names }: { wetA: number; wetB: number; names: string[] }) {
  const less = wetA <= wetB ? 0 : 1
  const hi = Math.max(wetA, wetB)
  const lo = Math.min(wetA, wetB)
  const pct = hi > 0 ? ((hi - lo) / hi) * 100 : 0
  return (
    <div className="verdict">
      <span style={{ color: LANE_COLORS[less] }}>{names[less]}</span> の方が <b>{pct.toFixed(0)}%</b> 濡れない
      <small>{wetA.toFixed(1)} mL vs {wetB.toFixed(1)} mL</small>
    </div>
  )
}
