// 2レーン（A/B）のシミュレーションと描画をまとめて回す

import * as THREE from 'three'
import { RunnerSim } from '../sim/runnerSim'
import { LaneView } from './lane'
import type { ColorMode } from './humanMesh'

export interface Params {
  rateMmH: number
  speedA: number
  speedB: number
  wind: number
  distance: number
}

export const LANE_COLORS = ['#3987e5', '#d95926']

export class Controller {
  readonly renderer: THREE.WebGLRenderer
  readonly lanes = [new LaneView(LANE_COLORS[0]), new LaneView(LANE_COLORS[1])]
  sims: RunnerSim[] = []
  params: Params
  playback = 1
  // レーンごとの早送り倍率（プロモ動画で両者を同時にゴールさせる用）。null なら playback を使う
  lanePlayback: number[] | null = null
  running = false
  layout: 'stack' | 'side' = 'stack'
  private raf = 0
  private last = 0
  private listeners = new Set<() => void>()
  private seed = 1

  constructor(private canvas: HTMLCanvasElement, params: Params) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true })
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio))
    this.renderer.setScissorTest(true)
    this.params = params
    this.reset()
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }
  private emit() {
    for (const fn of this.listeners) fn()
  }

  setParams(p: Params) {
    this.params = p
    this.reset()
  }

  setColorMode(m: ColorMode) {
    for (const l of this.lanes) l.human.setMode(m)
  }

  reset(newSeed = false) {
    if (newSeed) this.seed++
    const p = this.params
    this.sims = [p.speedA, p.speedB].map(
      (speed, i) => new RunnerSim({ rateMmH: p.rateMmH, speed, wind: p.wind, distance: p.distance, seed: this.seed * 10 + i }),
    )
    this.sims.forEach((s, i) => this.lanes[i].bind(s))
    this.running = false
    this.emit()
  }

  start() {
    if (this.sims.some((s) => s.started)) this.reset(true)
    this.sims.forEach((s) => s.start())
    this.running = true
    this.emit()
  }

  get done() {
    return this.sims.every((s) => s.finished)
  }

  // 実時間 dt 進める（プロモ動画の書き出し時は外から固定 dt で呼ぶ）
  tick(dt: number) {
    this.sims.forEach((s, i) => {
      const simDt = dt * (this.lanePlayback?.[i] ?? this.playback)
      s.advance(simDt)
      this.lanes[i].update(dt, this.running ? simDt : dt)
    })
    if (this.running && this.done) this.running = false
    this.render()
  }

  render() {
    const w = this.canvas.clientWidth
    const h = this.canvas.clientHeight
    const r = this.renderer
    if (this.canvas.width !== Math.floor(w * r.getPixelRatio()) || this.canvas.height !== Math.floor(h * r.getPixelRatio())) {
      r.setSize(w, h, false)
    }
    this.layout = w / h > 1.5 ? 'side' : 'stack'
    for (let i = 0; i < 2; i++) {
      const lane = this.lanes[i]
      let x = 0, y = 0, vw = w, vh = h
      if (this.layout === 'side') {
        vw = w / 2
        x = i * vw
      } else {
        vh = h / 2
        y = (1 - i) * vh // WebGL は下が原点
      }
      r.setViewport(x, y, vw, vh)
      r.setScissor(x, y, vw, vh)
      lane.camera.aspect = vw / vh
      lane.camera.updateProjectionMatrix()
      r.render(lane.scene, lane.camera)
    }
  }

  startLoop() {
    const loop = (t: number) => {
      const dt = this.last ? Math.min(0.05, (t - this.last) / 1000) : 1 / 60
      this.last = t
      this.tick(dt)
      if (this.frameCount++ % 4 === 0) this.emit()
      this.raf = requestAnimationFrame(loop)
    }
    this.raf = requestAnimationFrame(loop)
  }
  private frameCount = 0

  stopLoop() {
    cancelAnimationFrame(this.raf)
    this.last = 0
  }

  dispose() {
    this.stopLoop()
    this.renderer.dispose()
  }
}
