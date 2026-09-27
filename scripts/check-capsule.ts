import { capsuleHit } from '../src/sim/runnerSim'
function inside(x:number,y:number,z:number,a:number[],b:number[],r:number){const bx=b[0]-a[0],by=b[1]-a[1],bz=b[2]-a[2];const l=bx*bx+by*by+bz*bz;const s=Math.min(1,Math.max(0,((x-a[0])*bx+(y-a[1])*by+(z-a[2])*bz)/l));const qx=x-a[0]-bx*s,qy=y-a[1]-by*s,qz=z-a[2]-bz*s;return qx*qx+qy*qy+qz*qz<r*r}
let agree=0, fn=0, fp=0
const a=[0,1,0.05], b=[0.1,1.4,0.05], r=0.115
for(let i=0;i<200000;i++){
  const ox=(Math.random()-0.5)*0.8, oy=0.7+Math.random()*1, oz=(Math.random()-0.5)*0.4
  const dx=-(Math.random()*0.3), dy=-(Math.random()*0.3)
  let gt=false; if(!inside(ox,oy,oz,a,b,r)) for(let k=0;k<=200;k++){ if(inside(ox+dx*k/200,oy+dy*k/200,oz,a,b,r)){gt=true;break} }
  if(inside(ox,oy,oz,a,b,r)) continue
  const t=capsuleHit(ox,oy,oz,dx,dy,a[0],a[1],a[2],b[0],b[1],b[2],r)
  const h=t>=0
  if(h===gt)agree++; else if(gt)fn++; else fp++
}
console.log({agree,fn,fp})
