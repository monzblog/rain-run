// 追い風のときの速さ別の濡れ量（シミュレーション3回平均 vs 理論）
import { RunnerSim } from '../src/sim/runnerSim'
import { theoryWet } from '../src/sim/theory'
import { makeRain } from '../src/sim/rain'
const R = 20, rain = makeRain(R)
for (const w of [3, 5]) {
  console.log(`--- 追い風 ${w} m/s`)
  for (const v of [2, 3, 4, 5, 6, 8]) {
    let tot = 0
    for (let seed = 1; seed <= 3; seed++) {
      const s = new RunnerSim({ rateMmH: R, speed: v, wind: w, distance: 30, seed })
      s.start(); while (!s.finished) s.advance(0.05); tot += s.wetTotal * 1e6
    }
    console.log(`v=${v} sim=${(tot / 3).toFixed(2)} theory=${theoryWet(rain, v, w, 30).total.toFixed(2)}`)
  }
}
