// A deterministic, relationship-aware force layout. The graph is deliberately
// small: the explorer bounds the visible neighbourhood before calling this.
const WIDTH=1200, HEIGHT=720, ROOT={x:600,y:370};
const GROUPS={
  partners:{label:'PARTNERS',x:275,y:195},
  programmes:{label:'PROGRAMMES',x:930,y:180},
  startups:{label:'STARTUPS',x:255,y:535},
  founders:{label:'FOUNDERS',x:930,y:495},
  people:{label:'PEOPLE',x:945,y:330},
  providers:{label:'PROVIDERS',x:630,y:635},
};
const kindGroup={partner:'partners',programme:'programmes',startup:'startups',person:'people',provider:'providers'};

export function labelLines(name) {
  const words=String(name).trim().split(/\s+/), lines=[];
  for (const word of words) {
    const last=lines.length-1;
    if (last<0) lines.push(word);
    else if ((lines[last]+' '+word).length<=17) lines[last]+=' '+word;
    else lines.push(word);
  }
  if (lines.length>2) lines.splice(1,lines.length-1,lines.slice(1).join(' '));
  return lines.map(line=>line.length>21?line.slice(0,20)+'…':line);
}

function sizeFor(node,root) {
  const lines=labelLines(node.name);
  const longest=Math.max(...lines.map(line=>line.length),1);
  return {width:Math.max(root?188:130,Math.min(root?260:225,58+longest*(root?10:8.5))),
    height:root?76:(lines.length>1?62:52),lines};
}

function groupFor(node,rootId,edges) {
  if (node.kind==='person' && edges.some(edge=>edge.kind==='founded' &&
      ((edge.from===node.id&&edge.to===rootId)||(edge.to===node.id&&edge.from===rootId)))) return 'founders';
  return kindGroup[node.kind]||'partners';
}

function separate(a,b,padding=18) {
  let dx=b.x-a.x,dy=b.y-a.y;
  const overlapX=(a.width+b.width)/2+padding-Math.abs(dx);
  const overlapY=(a.height+b.height)/2+padding-Math.abs(dy);
  if (overlapX<=0 || overlapY<=0 || (a.fixed&&b.fixed)) return false;
  // Rectangular labels matter more than their circular icons.
  const horizontal=overlapX<overlapY*1.7;
  const amount=(horizontal?overlapX:overlapY)+.01;
  const sign=(horizontal?dx:dy)>=0?1:-1;
  const shareA=a.fixed?0:b.fixed?1:.5,shareB=b.fixed?0:a.fixed?1:.5;
  if (horizontal) {a.x-=sign*amount*shareA;b.x+=sign*amount*shareB;}
  else {a.y-=sign*amount*shareA;b.y+=sign*amount*shareB;}
  return true;
}

export function layoutNetwork(view,rootId,pinned=new Map()) {
  const root=view.nodes.find(node=>node.id===rootId);
  if (!root) throw new Error('Layout root not found');
  const groups=new Map();
  for (const node of view.nodes) if(node.id!==rootId) {
    const key=groupFor(node,rootId,view.edges);
    if(!groups.has(key)) groups.set(key,[]);
    groups.get(key).push(node);
  }
  const nodes=[];
  const rootSize=sizeFor(root,true), rootPin=pinned.get(rootId)||ROOT;
  nodes.push({...root,...rootSize,x:rootPin.x,y:rootPin.y,targetX:ROOT.x,targetY:ROOT.y,fixed:true,group:null});
  for (const [key,items] of groups) {
    const zone=GROUPS[key];
    items.sort((a,b)=>a.level-b.level||a.name.localeCompare(b.name)||a.id.localeCompare(b.id));
    const cols=items.length<=2?1:items.length<=6?2:3, rows=Math.ceil(items.length/cols);
    items.forEach((node,index)=>{
      const row=Math.floor(index/cols),col=index%cols;
      const x=zone.x+(col-(cols-1)/2)*192+(row%2?14:-8);
      const y=zone.y+(row-(rows-1)/2)*76;
      const pin=pinned.get(node.id),size=sizeFor(node,false);
      nodes.push({...node,...size,x:pin?.x??x,y:pin?.y??y,targetX:x,targetY:y,
        vx:0,vy:0,fixed:!!pin,group:key});
    });
  }
  const byId=new Map(nodes.map(node=>[node.id,node]));
  const edges=view.edges.filter(edge=>byId.has(edge.from)&&byId.has(edge.to));
  // Springs preserve the visual clusters while links and rectangular collision
  // forces make space for actual labels and linked second-hop nodes.
  for(let tick=0;tick<120;tick++) {
    const alpha=1-tick/150;
    for(const node of nodes) if(!node.fixed) {
      node.vx+=(node.targetX-node.x)*.012*alpha;
      node.vy+=(node.targetY-node.y)*.012*alpha;
    }
    for(const edge of edges) {
      const a=byId.get(edge.from),b=byId.get(edge.to),dx=b.x-a.x,dy=b.y-a.y;
      const distance=Math.hypot(dx,dy)||1,force=Math.max(0,distance-330)*.0007*alpha;
      if(!a.fixed){a.vx+=dx/distance*force;a.vy+=dy/distance*force;}
      if(!b.fixed){b.vx-=dx/distance*force;b.vy-=dy/distance*force;}
    }
    for(const node of nodes) if(!node.fixed) {
      node.vx*=.72;node.vy*=.72;node.x+=node.vx;node.y+=node.vy;
    }
    for(let i=0;i<nodes.length;i++) for(let j=i+1;j<nodes.length;j++) separate(nodes[i],nodes[j]);
  }
  // Finish with pure separation so a cooling spring cannot leave a label clash.
  for(let pass=0;pass<160;pass++) {
    let moved=false;
    for(let i=0;i<nodes.length;i++) for(let j=i+1;j<nodes.length;j++) moved=separate(nodes[i],nodes[j])||moved;
    if(!moved) break;
  }
  return {nodes,edges,groups:[...groups.keys()].map(key=>({key,label:GROUPS[key].label}))};
}

export function groupBounds(nodes) {
  if(!nodes.length) return null;
  const left=Math.min(...nodes.map(n=>n.x-n.width/2))-32;
  const right=Math.max(...nodes.map(n=>n.x+n.width/2))+32;
  const top=Math.min(...nodes.map(n=>n.y-n.height/2))-42;
  const bottom=Math.max(...nodes.map(n=>n.y+n.height/2))+28;
  return {cx:(left+right)/2,cy:(top+bottom)/2,rx:(right-left)/2,ry:(bottom-top)/2,labelY:top+22};
}

export function layoutBounds(layout) {
  const groups=layout.groups.map(group=>groupBounds(layout.nodes.filter(node=>node.group===group.key))).filter(Boolean);
  const left=Math.min(0,...layout.nodes.map(n=>n.x-n.width/2-45),...groups.map(g=>g.cx-g.rx-25));
  const top=Math.min(0,...layout.nodes.map(n=>n.y-n.height/2-45),...groups.map(g=>g.cy-g.ry-25));
  const right=Math.max(WIDTH,...layout.nodes.map(n=>n.x+n.width/2+45),...groups.map(g=>g.cx+g.rx+25));
  const bottom=Math.max(HEIGHT,...layout.nodes.map(n=>n.y+n.height/2+45),...groups.map(g=>g.cy+g.ry+25));
  return {x:left,y:top,width:right-left,height:bottom-top};
}
