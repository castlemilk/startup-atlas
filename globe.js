import { escapeHtml as esc, sourceUrl } from './logic.js';

const $ = id => document.getElementById(id);
const canvas=$('atlas-globe');
const list=$('globe-location-list');
const detail=$('globe-detail');
const pause=$('globe-pause');
const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
let locations=[], selected=null, globe=null;

function showLocation(location, focusGlobe=true) {
  selected=location;
  list.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.location===location.id)));
  const rows=location.partners.map(partner=>{
    const link=sourceUrl(partner.source);
    return `<li><button type="button" data-partner="${esc(partner.name)}">${esc(partner.name)} <span aria-hidden="true">↗</span></button><span>${esc(partner.context)}</span>${link?`<a href="${esc(link)}" target="_blank" rel="noopener noreferrer" aria-label="Source for ${esc(partner.name)} in ${esc(location.city)}">Source ↗</a>`:''}</li>`;
  }).join('');
  detail.innerHTML=`<div class="globe-detail-title"><strong>${esc(location.city)}</strong><span>${esc(location.country)} · checked ${esc(location.checked)}</span></div><ul>${rows}</ul>`;
  if (focusGlobe && globe) globe.pointAt(location);
}

list.addEventListener('click',event=>{
  const button=event.target.closest('button[data-location]');
  const location=locations.find(item=>item.id===button?.dataset.location);
  if(location) showLocation(location);
});
detail.addEventListener('click',event=>{
  const button=event.target.closest('button[data-partner]');
  if(button) window.dispatchEvent(new CustomEvent('atlas:find-partner',{detail:{name:button.dataset.partner}}));
});

function makeEarthTexture(geojson,THREE) {
  const map=document.createElement('canvas'); map.width=2048; map.height=1024;
  const ctx=map.getContext('2d');
  ctx.fillStyle='#102a44'; ctx.fillRect(0,0,map.width,map.height);
  ctx.fillStyle='#91c3ce'; ctx.strokeStyle='#b1d4dc'; ctx.lineWidth=1.5;
  function ringPath(ring) {
    ring.forEach(([lng,lat],i)=>{const x=(lng+180)/360*map.width,y=(90-lat)/180*map.height; if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});
    ctx.closePath();
  }
  for(const feature of geojson.features || []) {
    const geometry=feature.geometry || {};
    const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];
    for(const polygon of polygons) {ctx.beginPath(); for(const ring of polygon) ringPath(ring); ctx.fill('evenodd');ctx.stroke();}
  }
  const texture=new THREE.CanvasTexture(map);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  return texture;
}

function createGlobe(geojson,THREE) {
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(34,1,0.1,30);camera.position.set(0,0,3.8);
  const group=new THREE.Group();scene.add(group);
  group.rotation.set(.18,-Math.PI/2,0);
  const earth=new THREE.Mesh(new THREE.SphereGeometry(1,64,40),new THREE.MeshBasicMaterial({map:makeEarthTexture(geojson,THREE)}));group.add(earth);
  const lineMaterial=new THREE.LineBasicMaterial({color:0x5f9cb3,transparent:true,opacity:.25});
  const rad=Math.PI/180;
  function point(lat,lon,r=1.003){return new THREE.Vector3(r*Math.cos(lat*rad)*Math.cos(lon*rad),r*Math.sin(lat*rad),-r*Math.cos(lat*rad)*Math.sin(lon*rad));}
  for(let lat=-60;lat<=60;lat+=30){const pts=[];for(let lon=-180;lon<=180;lon+=3)pts.push(point(lat,lon));group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),lineMaterial));}
  for(let lon=-180;lon<180;lon+=30){const pts=[];for(let lat=-90;lat<=90;lat+=3)pts.push(point(lat,lon));group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),lineMaterial));}
  const pins=locations.map(location=>{
    const marker=new THREE.Mesh(new THREE.SphereGeometry(.024,12,8),new THREE.MeshBasicMaterial({color:0xa4f1e3}));
    marker.position.copy(point(location.latitude,location.longitude,1.018));marker.userData.location=location;group.add(marker);return marker;
  });
  const halo=new THREE.Mesh(new THREE.SphereGeometry(1.035,48,32),new THREE.MeshBasicMaterial({color:0x9cd9ec,transparent:true,opacity:.09,side:THREE.BackSide}));scene.add(halo);
  let playing=!motion.matches, visible=true, frame=0, down=null;
  const raycaster=new THREE.Raycaster(), mouse=new THREE.Vector2();
  function syncPause(){pause.setAttribute('aria-label',playing?'Pause globe rotation':'Resume globe rotation');pause.textContent=playing?'Ⅱ':'▶';}
  function draw(){renderer.render(scene,camera);}
  function tick(){frame=0;if(playing&&visible&&!document.hidden){group.rotation.y+=.0013;draw();frame=requestAnimationFrame(tick);}}
  function schedule(){if(!frame&&playing&&visible&&!document.hidden)frame=requestAnimationFrame(tick);else if(!playing)draw();}
  function resize(){const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.updateProjectionMatrix();draw();}
  function pointAt(location){group.rotation.y=-Math.PI/2-location.longitude*rad;group.rotation.x=location.latitude*rad;draw();}
  function setPlaying(value){playing=value;syncPause();draw();schedule();}
  $('globe-left').addEventListener('click',()=>{setPlaying(false);group.rotation.y-=.38;draw();});
  $('globe-right').addEventListener('click',()=>{setPlaying(false);group.rotation.y+=.38;draw();});
  pause.addEventListener('click',()=>setPlaying(!playing));
  canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;down={x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{
    if(!down)return;const dx=event.clientX-down.x,dy=event.clientY-down.y;
    if(Math.hypot(event.clientX-down.startX,event.clientY-down.startY)>5)down.moved=true;
    if(down.moved){if(playing)setPlaying(false);group.rotation.y+=dx*.008;group.rotation.x=THREE.MathUtils.clamp(group.rotation.x+dy*.006,-1.2,1.2);draw();}
    down.x=event.clientX;down.y=event.clientY;
  });
  canvas.addEventListener('pointerup',event=>{
    if(!down)return;const moved=down.moved;down=null;if(moved)return;
    const rect=canvas.getBoundingClientRect();mouse.set((event.clientX-rect.left)/rect.width*2-1,-((event.clientY-rect.top)/rect.height)*2+1);
    raycaster.setFromCamera(mouse,camera);const hit=raycaster.intersectObjects(pins)[0];const surface=raycaster.intersectObject(earth)[0];
    if(hit&&(!surface||hit.distance<surface.distance)){setPlaying(false);showLocation(hit.object.userData.location,false);}
  });
  canvas.addEventListener('pointercancel',()=>{down=null;});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();setPlaying(false);$('globe-hint').textContent='Globe unavailable; use the place buttons below.';});
  if('ResizeObserver' in window)new ResizeObserver(resize).observe(canvas);else window.addEventListener('resize',resize);
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){draw();schedule();}}).observe(canvas);
  document.addEventListener('visibilitychange',schedule);
  motion.addEventListener?.('change',event=>{if(event.matches)setPlaying(false);});
  syncPause();resize();schedule();return {pointAt};
}

try {
  const response=await fetch('./data/map-locations.json');if(!response.ok)throw new Error('Locations unavailable');
  locations=await response.json();if(!Array.isArray(locations)||!locations.length)throw new Error('No locations');
  $('globe-count').textContent=`${locations.length} places · curated sample`;
  list.innerHTML=locations.map(location=>`<button type="button" data-location="${esc(location.id)}" aria-pressed="false">${esc(location.city)}</button>`).join('');
  showLocation(locations.find(location=>location.id==='london')||locations[0],false);
  try {
    const [land,THREE]=await Promise.all([fetch('./data/land.geojson'),import('./vendor/three.module.min.js')]);
    if(!land.ok)throw new Error('Map unavailable');
    globe=createGlobe(await land.json(),THREE);
    if(selected)globe.pointAt(selected);
  } catch(error) {
    canvas.hidden=true;document.querySelector('.globe-controls').hidden=true;
    $('globe-hint').textContent='Globe unavailable; use the place buttons below.';
  }
} catch(error) {
  $('globe-count').textContent='Places unavailable';list.textContent='Locations could not be loaded. Refresh to try again.';
  canvas.hidden=true;document.querySelector('.globe-controls').hidden=true;$('globe-hint').hidden=true;
}
