// 1レーン分の3Dシーン: 道路・街灯・見た目用の雨・水しぶき・ランナー・追従カメラ

import * as THREE from 'three'
import type { RunnerSim, HitEvent } from '../sim/runnerSim'
import { computePose, makePose } from '../sim/body'
import { terminalVelocity, sampleDiameter } from '../sim/rain'
import { makeRng } from '../sim/rng'
import { HumanMesh } from './humanMesh'

const RAIN_BOX = { x: 7, y: 6, z0: -6, z1: 3.5 }
const MAX_STREAKS = 7000
const MAX_SPLASH = 400

function textSprite(text: string, color = '#ffffff', size = 0.9) {
  const c = document.createElement('canvas')
  c.width = 256
  c.height = 128
  const g = c.getContext('2d')!
  g.font = 'bold 72px system-ui, sans-serif'
  g.fillStyle = color
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  g.fillText(text, 128, 64)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, fog: true }))
  s.scale.set(size * 2, size, 1)
  return s
}

export class LaneView {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200)
  readonly human = new HumanMesh()
  private streaks: THREE.LineSegments
  private streakPos: Float32Array
  private sx: Float32Array
  private sy: Float32Array
  private sz: Float32Array
  private svy: Float32Array
  private nStreaks = 0
  private wind = 0
  private splash: THREE.Points
  private splashPos: Float32Array
  private splashAge: Float32Array
  private splashHead = 0
  private rng = makeRng(7)
  private camAngle = 0
  private sim: RunnerSim | null = null
  private standPose = makePose()

  constructor(accent: string) {
    const fogColor = new THREE.Color('#56626d')
    this.scene.background = fogColor
    this.scene.fog = new THREE.Fog(fogColor, 8, 45)
    this.scene.add(new THREE.HemisphereLight('#c9d6e3', '#2b3036', 1.6))
    const sun = new THREE.DirectionalLight('#ffffff', 1.3)
    sun.position.set(-4, 10, 6)
    this.scene.add(sun)

    // 濡れた路面
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 4),
      new THREE.MeshStandardMaterial({ color: '#2d3237', roughness: 0.35, metalness: 0.2 }),
    )
    road.rotation.x = -Math.PI / 2
    road.position.set(15, 0, 0)
    this.scene.add(road)
    const side = new THREE.Mesh(
      new THREE.PlaneGeometry(90, 30),
      new THREE.MeshStandardMaterial({ color: '#3c4540', roughness: 0.9 }),
    )
    side.rotation.x = -Math.PI / 2
    side.position.set(15, -0.01, -12)
    this.scene.add(side)
    const lineMat = new THREE.MeshBasicMaterial({ color: '#d7dbe0' })
    for (const z of [-1.6, 1.6]) {
      const l = new THREE.Mesh(new THREE.PlaneGeometry(90, 0.08), lineMat)
      l.rotation.x = -Math.PI / 2
      l.position.set(15, 0.005, z)
      this.scene.add(l)
    }
    // スタート・ゴール・5m ごとの目盛り
    for (let m = 0; m <= 30; m += 5) {
      const isEnd = m === 0 || m === 30
      const mark = new THREE.Mesh(
        new THREE.PlaneGeometry(isEnd ? 0.25 : 0.06, 3.2),
        new THREE.MeshBasicMaterial({ color: isEnd ? accent : '#9aa3ab' }),
      )
      mark.rotation.x = -Math.PI / 2
      mark.position.set(m, 0.006, 0)
      this.scene.add(mark)
      const label = textSprite(m === 0 ? 'START' : m === 30 ? 'GOAL' : `${m}m`, isEnd ? accent : '#dfe4e8', isEnd ? 0.5 : 0.4)
      label.position.set(m, 0.3, -1.9)
      this.scene.add(label)
    }
    // 街灯（スピード感の手がかり）
    const poleMat = new THREE.MeshStandardMaterial({ color: '#23272b', roughness: 0.6 })
    const lampMat = new THREE.MeshBasicMaterial({ color: '#fff3cf' })
    for (let x = -10; x <= 45; x += 4) {
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 3.6, 8), poleMat)
      pole.position.set(x, 1.8, -3.4)
      this.scene.add(pole)
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 8), lampMat)
      lamp.position.set(x, 3.6, -3.15)
      this.scene.add(lamp)
    }
    // 遠景のビル
    const bRng = makeRng(3)
    for (let x = -20; x < 60; x += 3 + bRng() * 3) {
      const h = 4 + bRng() * 12
      const b = new THREE.Mesh(
        new THREE.BoxGeometry(2.5 + bRng() * 2, h, 3),
        new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(0.58, 0.08, 0.28 + bRng() * 0.1) }),
      )
      b.position.set(x, h / 2, -14 - bRng() * 6)
      this.scene.add(b)
    }

    this.scene.add(this.human.group)

    // 見た目用の雨（物理計算とは別。密度は降水強度に比例）
    this.streakPos = new Float32Array(MAX_STREAKS * 6)
    this.sx = new Float32Array(MAX_STREAKS)
    this.sy = new Float32Array(MAX_STREAKS)
    this.sz = new Float32Array(MAX_STREAKS)
    this.svy = new Float32Array(MAX_STREAKS)
    const sg = new THREE.BufferGeometry()
    sg.setAttribute('position', new THREE.BufferAttribute(this.streakPos, 3))
    this.streaks = new THREE.LineSegments(
      sg,
      new THREE.LineBasicMaterial({ color: '#d5e3f0', transparent: true, opacity: 0.45 }),
    )
    this.streaks.frustumCulled = false
    this.scene.add(this.streaks)

    // 体に当たった雨の水しぶき
    this.splashPos = new Float32Array(MAX_SPLASH * 3).fill(-999)
    this.splashAge = new Float32Array(MAX_SPLASH).fill(99)
    const pg = new THREE.BufferGeometry()
    pg.setAttribute('position', new THREE.BufferAttribute(this.splashPos, 3))
    this.splash = new THREE.Points(
      pg,
      new THREE.PointsMaterial({ color: '#e8f6ff', size: 0.02, transparent: true, opacity: 0.6, depthWrite: false }),
    )
    this.splash.frustumCulled = false
    this.scene.add(this.splash)
  }

  bind(sim: RunnerSim) {
    this.sim = sim
    this.human.reset()
    this.wind = sim.params.wind
    this.nStreaks = Math.min(MAX_STREAKS, Math.round(300 + sim.params.rateMmH * 70))
    for (let i = 0; i < this.nStreaks; i++) this.respawnStreak(i, true)
    this.splashAge.fill(99)
    this.camAngle = 0
    sim.onHit = (h) => this.onHit(h)
  }

  private respawnStreak(i: number, anywhere: boolean) {
    const cx = this.sim ? this.sim.x : 0
    this.sx[i] = cx + (this.rng() * 2 - 1) * RAIN_BOX.x
    this.sy[i] = anywhere ? this.rng() * RAIN_BOX.y : RAIN_BOX.y
    this.sz[i] = RAIN_BOX.z0 + this.rng() * (RAIN_BOX.z1 - RAIN_BOX.z0)
    this.svy[i] = -terminalVelocity(sampleDiameter(2.5, this.rng()))
  }

  private onHit(h: HitEvent) {
    if (!this.sim) return
    // 当たりが多い強雨では表示を間引く
    this.human.addHit(h)
    if (this.rng() > 0.35 / this.sim.weight) return
    const i = this.splashHead
    this.splashHead = (this.splashHead + 1) % MAX_SPLASH
    this.splashPos[i * 3] = h.wx + this.sim.x
    this.splashPos[i * 3 + 1] = h.wy
    this.splashPos[i * 3 + 2] = h.wz
    this.splashAge[i] = 0
  }

  update(dt: number, simDt: number) {
    const sim = this.sim
    if (!sim) return
    // ランナー
    const g = this.human.group
    g.position.set(sim.x, 0, 0)
    if (sim.started && !sim.finished) this.human.applyPose(sim.pose)
    else {
      computePose(sim.params.speed, 0, this.standPose, 0)
      this.human.applyPose(this.standPose)
    }
    this.human.updateColors()

    // 雨（ワールド座標で降らせ、ランナーの周りに保つ）
    const cx = sim.x
    const pos = this.streakPos
    for (let i = 0; i < this.nStreaks; i++) {
      this.sx[i] += this.wind * simDt
      this.sy[i] += this.svy[i] * simDt
      if (this.sy[i] < 0) this.respawnStreak(i, false)
      if (this.sx[i] < cx - RAIN_BOX.x) this.sx[i] += 2 * RAIN_BOX.x
      else if (this.sx[i] > cx + RAIN_BOX.x) this.sx[i] -= 2 * RAIN_BOX.x
      // 線の長さ = 1/40 秒ぶんの移動量（モーションブラー）
      const k = 1 / 40
      pos[i * 6] = this.sx[i]
      pos[i * 6 + 1] = this.sy[i]
      pos[i * 6 + 2] = this.sz[i]
      pos[i * 6 + 3] = this.sx[i] - this.wind * k
      pos[i * 6 + 4] = this.sy[i] - this.svy[i] * k
      pos[i * 6 + 5] = this.sz[i]
    }
    for (let i = this.nStreaks * 6; i < pos.length; i++) pos[i] = -999
    ;(this.streaks.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true

    // 水しぶき
    for (let i = 0; i < MAX_SPLASH; i++) {
      if (this.splashAge[i] > 0.25) {
        this.splashPos[i * 3 + 1] = -999
        continue
      }
      this.splashAge[i] += simDt
      this.splashPos[i * 3] -= sim.finished ? 0 : 0.2 * simDt
      this.splashPos[i * 3 + 1] -= 0.6 * simDt
    }
    ;(this.splash.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true

    // カメラ: 走行中は斜め前方の横から追従、ゴール後はぐるっと回って濡れ方を見せる
    const target = new THREE.Vector3(cx + 0.15, 0.95, 0)
    let desired: THREE.Vector3
    if (sim.finished) {
      this.camAngle += dt * 0.6
      const a = 0.35 + this.camAngle
      desired = new THREE.Vector3(cx + Math.sin(a) * 2.7, 1.45, Math.cos(a) * 2.7)
    } else {
      desired = new THREE.Vector3(cx + 1.3, 1.3, 3.1)
    }
    const f = 1 - Math.exp(-dt * 6)
    if (!sim.started) this.camera.position.copy(desired)
    else this.camera.position.lerp(desired, f)
    this.camera.lookAt(target)
  }
}
