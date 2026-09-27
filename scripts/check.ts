import { RunnerSim } from '../src/sim/runnerSim'
import { theoryWet } from '../src/sim/theory'
import { makeRain } from '../src/sim/rain'
const R = 20, rain = makeRain(R)
for (const [v, w] of [[1.4, 1.4], [5, 5], [1.4, 0], [5, 0], [8, 0], [3, 3], [3, -3]]) {
  let tot = 0
  for (let seed = 1; seed <= 3; seed++) {
    const s = new RunnerSim({ rateMmH: R, speed: v, wind: w, distance: 30, seed })
    s.start(); while (!s.finished) s.advance(1 / 60); tot += s.wetTotal * 1e6
  }
  const th = theoryWet(rain, v, w, 30)
  console.log(`v=${v} wind=${w} sim=${(tot / 3).toFixed(2)} theory top=${th.top.toFixed(2)} motion=${th.motion.toFixed(2)} total=${th.total.toFixed(2)}`)
}
