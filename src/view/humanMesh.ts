// カプセルで組んだ人体メッシュ。頂点ごとの濡れ量(mm)を持ち、色で濡れ具合を表示する。

import * as THREE from 'three'
import { NPARTS, PARTS, type Material, type Pose } from '../sim/body'
import type { HitEvent } from '../sim/runnerSim'

const BASE: Record<Material, THREE.Color> = {
  skin: new THREE.Color('#e3b594'),
  shirt: new THREE.Color('#d9dde2'),
  pants: new THREE.Color('#c8b27e'),
  shoe: new THREE.Color('#f1f1ee'),
}
// 濡れた布は暗く、少し青みがかる
const WET: Record<Material, THREE.Color> = {
  skin: new THREE.Color('#b98367'),
  shirt: new THREE.Color('#5d6c80'),
  pants: new THREE.Color('#6b5a37'),
  shoe: new THREE.Color('#7d8791'),
}
// ヒートマップ（乾=白 → 青 → 紫）
const HEAT = [new THREE.Color('#f4f6f8'), new THREE.Color('#7fc4f5'), new THREE.Color('#2a78d6'), new THREE.Color('#3b1f8f')]

export type ColorMode = 'real' | 'heat'

const SIGMA = 0.028 // 水滴が布に広がる半径 (m)
const SAT_MM = 0.014 // この濡れ量(mm)で色がほぼ変わりきる

interface PartMesh {
  mesh: THREE.Mesh
  local: Float32Array // 頂点のローカル座標
  wet: Float32Array // 頂点ごとの濡れ量 (mm)
  colors: Float32Array
  dirty: boolean
}

export class HumanMesh {
  readonly group = new THREE.Group()
  private parts: PartMesh[] = []
  mode: ColorMode = 'real'
  satMm = SAT_MM

  constructor() {
    const tmp = new THREE.Color()
    for (let i = 0; i < NPARTS; i++) {
      const def = PARTS[i]
      const len = partLength(i)
      const geo = new THREE.CapsuleGeometry(def.radius, len, 8, 18, Math.max(1, Math.round(len / 0.03)))
      const pos = geo.getAttribute('position') as THREE.BufferAttribute
      const local = new Float32Array(pos.array as Float32Array)
      const colors = new Float32Array(pos.count * 3)
      tmp.copy(BASE[def.material])
      for (let v = 0; v < pos.count; v++) tmp.toArray(colors, v * 3)
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
      const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, metalness: 0 })
      const mesh = new THREE.Mesh(geo, mat)
      mesh.castShadow = true
      this.group.add(mesh)
      this.parts.push({ mesh, local, wet: new Float32Array(pos.count), colors, dirty: false })
    }
  }

  reset() {
    for (const p of this.parts) {
      p.wet.fill(0)
      p.dirty = true
    }
  }

  setMode(mode: ColorMode) {
    this.mode = mode
    for (const p of this.parts) p.dirty = true
  }

  applyPose(pose: Pose) {
    for (let i = 0; i < NPARTS; i++) {
      const o = i * 3
      const ax = pose.a[o], ay = pose.a[o + 1], az = pose.a[o + 2]
      const dx = pose.b[o] - ax, dy = pose.b[o + 1] - ay
      const m = this.parts[i].mesh
      m.position.set(ax + dx / 2, ay + dy / 2, az)
      m.rotation.set(0, 0, Math.atan2(-dx, dy))
    }
  }

  addHit(h: HitEvent) {
    const p = this.parts[h.part]
    const inv = 1 / (2 * SIGMA * SIGMA)
    const amp = (h.volume / (2 * Math.PI * SIGMA * SIGMA)) * 1000 // m -> mm
    const l = p.local
    const cut = 9 * SIGMA * SIGMA
    for (let v = 0, n = p.wet.length; v < n; v++) {
      const dx = l[v * 3] - h.lx, dy = l[v * 3 + 1] - h.ly, dz = l[v * 3 + 2] - h.lz
      const d2 = dx * dx + dy * dy + dz * dz
      if (d2 < cut) p.wet[v] += amp * Math.exp(-d2 * inv)
    }
    p.dirty = true
  }

  updateColors() {
    const c = new THREE.Color()
    for (let i = 0; i < NPARTS; i++) {
      const p = this.parts[i]
      if (!p.dirty) continue
      p.dirty = false
      const mat = PARTS[i].material
      for (let v = 0, n = p.wet.length; v < n; v++) {
        const k = 1 - Math.exp(-p.wet[v] / this.satMm)
        if (this.mode === 'real') {
          c.copy(BASE[mat]).lerp(WET[mat], k)
        } else {
          const x = Math.min(0.999, k) * (HEAT.length - 1)
          const j = Math.floor(x)
          c.copy(HEAT[j]).lerp(HEAT[j + 1], x - j)
        }
        c.toArray(p.colors, v * 3)
      }
      const attr = p.mesh.geometry.getAttribute('color') as THREE.BufferAttribute
      attr.needsUpdate = true
      const m = p.mesh.material as THREE.MeshStandardMaterial
      // 濡れた部分は少しつやが出る
      m.roughness = this.mode === 'real' ? 0.75 : 0.9
    }
  }
}

// ポーズに依存しないパーツ長（端点間の距離）
const lengthCache: number[] = []
function partLength(i: number): number {
  if (!lengthCache.length) {
    const fixed = [0.04, 0.07, 0.34, 0.34, 0.29, 0.36, 0.29, 0.36, 0.43, 0.42, 0.22, 0.43, 0.42, 0.22]
    lengthCache.push(...fixed)
  }
  return lengthCache[i]
}
