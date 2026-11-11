import { escapeHtml as esc, sourceUrl } from './logic.js';

const $ = id => document.getElementById(id);
let canvas=$('atlas-globe');
const list=$('globe-location-list');
const detail=$('globe-detail');
const pause=$('globe-pause');
const motion=window.matchMedia('(prefers-reduced-motion: reduce)');
let locations=[], selected=null, globe=null;
const stage=$('globe-stage');
const loadingStatus=$('globe-loading-status');
const nextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
function updateLoading(message){loadingStatus.textContent=message;}
function showGlobeError(message){updateLoading(message);stage.classList.add('is-error');stage.setAttribute('aria-busy','false');}

// A finite, interruptible flight. The shortest longitude route avoids a full
// revolution when two places lie on opposite sides of the date line.
function createFlight(getAngles, setAngles, draw) {
  let frame=0, destination=null;
  function cancel(){if(frame)cancelAnimationFrame(frame);frame=0;destination=null;}
  function finish(){if(!destination)return;const end=destination;cancel();setAngles(end);draw();}
  function to(target, animate=true){
    cancel();
    const start=getAngles();
    const delta=Math.atan2(Math.sin(target.lon-start.lon),Math.cos(target.lon-start.lon));
    destination={lon:start.lon+delta,lat:target.lat};
    if(!animate||motion.matches){finish();return;}
    let started;
    function step(time){
      if(started===undefined)started=time;
      const t=Math.min(1,(time-started)/720), eased=1-Math.pow(1-t,3);
      setAngles({lon:start.lon+delta*eased,lat:start.lat+(destination.lat-start.lat)*eased});draw();
      if(t<1)frame=requestAnimationFrame(step);else{frame=0;destination=null;}
    }
    frame=requestAnimationFrame(step);
  }
  return {to,cancel,finish};
}

function showLocation(location, focusGlobe=true) {
  selected=location;
  list.querySelectorAll('button').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.location===location.id)));
  const rows=location.partners.map(partner=>{
    const link=sourceUrl(partner.source);
    return `<li><button type="button" data-partner="${esc(partner.name)}">${esc(partner.name)} <span aria-hidden="true">↗</span></button><span>${esc(partner.context)}</span>${link?`<a href="${esc(link)}" target="_blank" rel="noopener noreferrer" aria-label="Source for ${esc(partner.name)} in ${esc(location.city)}">Source ↗</a>`:''}</li>`;
  }).join('');
  detail.innerHTML=`<div class="globe-detail-content"><span class="globe-selected-label">Selected place</span><div class="globe-detail-title"><strong>${esc(location.city)}</strong><span>${esc(location.country)} · checked ${esc(location.checked)}</span></div><ul>${rows}</ul></div>`;
  if(globe) globe.select(location,focusGlobe);
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

function makeEarthCanvas(geojson) {
  const map=document.createElement('canvas'); map.width=2048; map.height=1024;
  const ctx=map.getContext('2d');
  ctx.fillStyle='#092b46'; ctx.fillRect(0,0,map.width,map.height);
  ctx.fillStyle='#82cfe2'; ctx.strokeStyle='#c1f1fa'; ctx.lineWidth=1.5;
  function ringPath(ring) {
    ring.forEach(([lng,lat],i)=>{const x=(lng+180)/360*map.width,y=(90-lat)/180*map.height; if(i===0)ctx.moveTo(x,y);else ctx.lineTo(x,y);});
    ctx.closePath();
  }
  for(const feature of geojson.features || []) {
    const geometry=feature.geometry || {};
    const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];
    for(const polygon of polygons) {ctx.beginPath(); for(const ring of polygon) ringPath(ring); ctx.fill('evenodd');ctx.stroke();}
  }
  return map;
}
function makeEarthTexture(geojson,THREE) {
  const texture=new THREE.CanvasTexture(makeEarthCanvas(geojson));texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=4;
  return texture;
}

// WebGL can be unavailable in restricted browsers or on older devices. This
// orthographic canvas rendering uses the same map, points and native controls.
function createCanvasGlobe(geojson) {
  const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Canvas unavailable');
  const texture=makeEarthCanvas(geojson),pixels=texture.getContext('2d').getImageData(0,0,texture.width,texture.height).data;
  const sphere=document.createElement('canvas');sphere.width=sphere.height=180;
  const sphereCtx=sphere.getContext('2d'),image=sphereCtx.createImageData(sphere.width,sphere.height);
  const normals=[];const size=sphere.width;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const nx=(x+.5-size/2)/(size/2),ny=-(y+.5-size/2)/(size/2),d=nx*nx+ny*ny;
    if(d<=1)normals.push([4*(y*size+x),nx,ny,Math.sqrt(1-d)]);
  }
  let centerLon=0,centerLat=0,playing=!motion.matches,visible=true,frame=0,last=0,down=null,markers=[],width=0,height=0;
  const rad=Math.PI/180;
  function project(lat,lon,radius,cx,cy){
    const p=lat*rad,l=lon*rad-centerLon,s=Math.sin(p),c=Math.cos(p),cl=Math.cos(l);
    return {x:cx+radius*c*Math.sin(l),y:cy-radius*(Math.cos(centerLat)*s-Math.sin(centerLat)*c*cl),z:Math.sin(centerLat)*s+Math.cos(centerLat)*c*cl};
  }
  function draw(){
    if(!width||!height)return;
    const sinLat=Math.sin(centerLat),cosLat=Math.cos(centerLat),out=image.data,w=texture.width,h=texture.height;
    for(const [index,x,y,z] of normals){
      const lat=Math.asin(Math.max(-1,Math.min(1,y*cosLat+z*sinLat)));
      const lon=centerLon+Math.atan2(x,z*cosLat-y*sinLat);
      const u=((lon/(2*Math.PI)+.5)%1+1)%1,v=Math.max(0,Math.min(.999999,.5-lat/Math.PI));
      const ti=(Math.floor(v*h)*w+Math.floor(u*w))*4,shade=.72+.28*z;
      out[index]=pixels[ti]*shade;out[index+1]=pixels[ti+1]*shade;out[index+2]=pixels[ti+2]*shade;out[index+3]=255;
    }
    sphereCtx.putImageData(image,0,0);ctx.clearRect(0,0,width,height);
    const radius=Math.min(width,height)*.45,cx=width/2,cy=height/2;
    ctx.save();ctx.shadowColor='#49cfff';ctx.shadowBlur=18;ctx.beginPath();ctx.arc(cx,cy,radius,0,2*Math.PI);ctx.fillStyle='#102a44';ctx.fill();ctx.restore();
    ctx.drawImage(sphere,cx-radius,cy-radius,radius*2,radius*2);
    ctx.strokeStyle='rgba(163,218,223,.2)';ctx.lineWidth=.7;
    function line(points){ctx.beginPath();let drawing=false;for(const [lat,lon] of points){const p=project(lat,lon,radius,cx,cy);if(p.z>0){if(!drawing)ctx.moveTo(p.x,p.y);else ctx.lineTo(p.x,p.y);drawing=true;}else drawing=false;}ctx.stroke();}
    for(let lat=-60;lat<=60;lat+=30){const pts=[];for(let lon=-180;lon<=180;lon+=3)pts.push([lat,lon]);line(pts);}
    for(let lon=-180;lon<180;lon+=30){const pts=[];for(let lat=-90;lat<=90;lat+=3)pts.push([lat,lon]);line(pts);}
    markers=[];
    for(const location of locations){const p=project(location.latitude,location.longitude,radius,cx,cy);if(p.z<=0)continue;markers.push({location,...p});const active=location.id===selected?.id;if(active){ctx.beginPath();ctx.arc(p.x,p.y,10,0,2*Math.PI);ctx.strokeStyle='#f2fffb';ctx.lineWidth=2;ctx.stroke();}ctx.beginPath();ctx.arc(p.x,p.y,active?5:3.5,0,2*Math.PI);ctx.fillStyle=active?'#fff':'#b8fff0';ctx.shadowColor='#a3fff0';ctx.shadowBlur=active?16:10;ctx.fill();ctx.shadowBlur=0;}
    ctx.beginPath();ctx.arc(cx,cy,radius,0,2*Math.PI);ctx.strokeStyle='rgba(181,228,220,.5)';ctx.lineWidth=1;ctx.stroke();
  }
  function resize(){const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;if(!width||!height)return;const dpr=Math.min(window.devicePixelRatio||1,2);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
  function syncPause(){pause.setAttribute('aria-label',playing?'Pause globe rotation':'Resume globe rotation');pause.textContent=playing?'Pause':'Play';}
  function tick(time){frame=0;if(playing&&visible&&!document.hidden){if(time-last>40){centerLon+=.004;draw();last=time;}frame=requestAnimationFrame(tick);}}
  function schedule(){if(!frame&&playing&&visible&&!document.hidden)frame=requestAnimationFrame(tick);else if(!playing)draw();}
  function setPlaying(value){playing=value;syncPause();draw();schedule();}
  const flight=createFlight(()=>({lon:centerLon,lat:centerLat}),angles=>{centerLon=angles.lon;centerLat=angles.lat;},draw);
  function select(location,focus=true,animate=true){if(focus){setPlaying(false);flight.to({lon:location.longitude*rad,lat:location.latitude*rad},animate);}else draw();}
  function pointAt(location,animate=true){flight.to({lon:location.longitude*rad,lat:location.latitude*rad},animate);}
  $('globe-left').addEventListener('click',()=>{flight.cancel();setPlaying(false);centerLon-=.38;draw();});
  $('globe-right').addEventListener('click',()=>{flight.cancel();setPlaying(false);centerLon+=.38;draw();});
  pause.addEventListener('click',()=>{flight.cancel();setPlaying(!playing);});
  canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;flight.cancel();down={x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false};canvas.setPointerCapture(event.pointerId);});
  canvas.addEventListener('pointermove',event=>{if(!down)return;const dx=event.clientX-down.x,dy=event.clientY-down.y;if(Math.hypot(event.clientX-down.startX,event.clientY-down.startY)>5)down.moved=true;if(down.moved){if(playing)setPlaying(false);centerLon-=dx*.008;centerLat=Math.max(-1.2,Math.min(1.2,centerLat+dy*.006));draw();}down.x=event.clientX;down.y=event.clientY;});
  canvas.addEventListener('pointerup',event=>{if(!down)return;const moved=down.moved;down=null;if(moved)return;const rect=canvas.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top;const hit=markers.map(marker=>({marker,d:Math.hypot(x-marker.x,y-marker.y)})).filter(row=>row.d<12).sort((a,b)=>a.d-b.d)[0];if(hit){setPlaying(false);showLocation(hit.marker.location,true);draw();}});
  canvas.addEventListener('pointercancel',()=>{down=null;});
  if('ResizeObserver' in window)new ResizeObserver(resize).observe(canvas);else window.addEventListener('resize',resize);
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){draw();schedule();}}).observe(canvas);
  document.addEventListener('visibilitychange',schedule);motion.addEventListener?.('change',event=>{if(event.matches){flight.finish();setPlaying(false);}});
  syncPause();resize();schedule();return {pointAt,select};
}

function createGlobe(geojson,THREE) {
  const renderer=new THREE.WebGLRenderer({canvas,alpha:true,antialias:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
  const scene=new THREE.Scene();
  const camera=new THREE.PerspectiveCamera(34,1,0.1,30);camera.position.set(0,0,3.8);
  const group=new THREE.Group();scene.add(group);
  group.rotation.set(.18,-Math.PI/2,0);
  const earth=new THREE.Mesh(new THREE.SphereGeometry(1,64,40),new THREE.MeshBasicMaterial({map:makeEarthTexture(geojson,THREE)}));group.add(earth);
  const lineMaterial=new THREE.LineBasicMaterial({color:0x64b7d3,transparent:true,opacity:.3});
  const rad=Math.PI/180;
  function point(lat,lon,r=1.003){return new THREE.Vector3(r*Math.cos(lat*rad)*Math.cos(lon*rad),r*Math.sin(lat*rad),-r*Math.cos(lat*rad)*Math.sin(lon*rad));}
  for(let lat=-60;lat<=60;lat+=30){const pts=[];for(let lon=-180;lon<=180;lon+=3)pts.push(point(lat,lon));group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),lineMaterial));}
  for(let lon=-180;lon<180;lon+=30){const pts=[];for(let lat=-90;lat<=90;lat+=3)pts.push(point(lat,lon));group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts),lineMaterial));}
  const pins=locations.map(location=>{
    const marker=new THREE.Mesh(new THREE.SphereGeometry(.024,12,8),new THREE.MeshBasicMaterial({color:0xa4f1e3}));
    marker.position.copy(point(location.latitude,location.longitude,1.018));marker.userData.location=location;group.add(marker);return marker;
  });
  const selectionRing=new THREE.Mesh(new THREE.RingGeometry(.049,.062,32),new THREE.MeshBasicMaterial({color:0xeffffb,side:THREE.DoubleSide,transparent:true,opacity:.95,depthWrite:false}));
  selectionRing.visible=false;group.add(selectionRing);
  const halo=new THREE.Mesh(new THREE.SphereGeometry(1.035,48,32),new THREE.MeshBasicMaterial({color:0x51d9ff,transparent:true,opacity:.14,side:THREE.BackSide}));scene.add(halo);
  let playing=!motion.matches, visible=true, frame=0, down=null;
  const raycaster=new THREE.Raycaster(), mouse=new THREE.Vector2();
  function syncPause(){pause.setAttribute('aria-label',playing?'Pause globe rotation':'Resume globe rotation');pause.textContent=playing?'Pause':'Play';}
  function draw(){renderer.render(scene,camera);}
  function tick(){frame=0;if(playing&&visible&&!document.hidden){group.rotation.y+=.0013;draw();frame=requestAnimationFrame(tick);}}
  function schedule(){if(!frame&&playing&&visible&&!document.hidden)frame=requestAnimationFrame(tick);else if(!playing)draw();}
  function resize(){const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;renderer.setSize(rect.width,rect.height,false);camera.aspect=rect.width/rect.height;camera.position.z=3.8/Math.min(1,camera.aspect);camera.updateProjectionMatrix();draw();}
  const flight=createFlight(()=>({lon:group.rotation.y,lat:group.rotation.x}),angles=>{group.rotation.y=angles.lon;group.rotation.x=angles.lat;},draw);
  function pointAt(location,animate=true){flight.to({lon:-Math.PI/2-location.longitude*rad,lat:location.latitude*rad},animate);}
  function select(location,focus=true){
    for(const pin of pins){const active=pin.userData.location.id===location.id;pin.scale.setScalar(active?1.7:1);pin.material.color.setHex(active?0xffffff:0xa4f1e3);}
    const position=point(location.latitude,location.longitude,1.035);selectionRing.position.copy(position);
    selectionRing.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),position.clone().normalize());selectionRing.visible=true;
    if(focus){setPlaying(false);pointAt(location);}else draw();
  }
  function setPlaying(value){playing=value;syncPause();draw();schedule();}
  $('globe-left').addEventListener('click',()=>{flight.cancel();setPlaying(false);group.rotation.y-=.38;draw();});
  $('globe-right').addEventListener('click',()=>{flight.cancel();setPlaying(false);group.rotation.y+=.38;draw();});
  pause.addEventListener('click',()=>{flight.cancel();setPlaying(!playing);});
  canvas.addEventListener('pointerdown',event=>{if(event.button!==0)return;flight.cancel();down={x:event.clientX,y:event.clientY,startX:event.clientX,startY:event.clientY,moved:false};canvas.setPointerCapture(event.pointerId);});
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
    if(hit&&(!surface||hit.distance<surface.distance)){setPlaying(false);showLocation(hit.object.userData.location,true);}
  });
  canvas.addEventListener('pointercancel',()=>{down=null;});
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();setPlaying(false);$('globe-hint').textContent='Globe unavailable; use the place buttons below.';});
  if('ResizeObserver' in window)new ResizeObserver(resize).observe(canvas);else window.addEventListener('resize',resize);
  if('IntersectionObserver' in window)new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;if(visible){draw();schedule();}}).observe(canvas);
  document.addEventListener('visibilitychange',schedule);
  motion.addEventListener?.('change',event=>{if(event.matches){flight.finish();setPlaying(false);}});
  syncPause();resize();schedule();return {pointAt,select};
}

try {
  const response=await fetch('./data/map-locations.json');if(!response.ok)throw new Error('Locations unavailable');
  locations=await response.json();if(!Array.isArray(locations)||!locations.length)throw new Error('No locations');
  $('globe-count').textContent=`${locations.length} places · curated sample`;
  updateLoading('Mapping the coastline…');
  await nextPaint();
  list.innerHTML=locations.map(location=>`<button type="button" data-location="${esc(location.id)}" aria-pressed="false">${esc(location.city)}</button>`).join('');
  showLocation(locations.find(location=>location.id==='london')||locations[0],false);
  try {
    const land=await fetch('./data/land.geojson');if(!land.ok)throw new Error('Map unavailable');
    const geojson=await land.json();
    updateLoading('Rendering the globe…');
    await nextPaint();
    try {const THREE=await import('./vendor/three.module.min.js');globe=createGlobe(geojson,THREE);}
    catch(error){const replacement=canvas.cloneNode(false);canvas.replaceWith(replacement);canvas=replacement;globe=createCanvasGlobe(geojson);}
    if(selected){globe.select(selected,false);globe.pointAt(selected,false);}
    await nextPaint();
    stage.classList.add('is-ready');
    stage.setAttribute('aria-busy','false');
    updateLoading('Globe ready');
  } catch(error) {
    console.warn('Startup Atlas globe could not be rendered:',error);
    canvas.hidden=true;document.querySelector('.globe-controls').hidden=true;
    $('globe-hint').textContent='Globe unavailable; use the place buttons below.';
    showGlobeError('Globe unavailable · use the place buttons below');
  }
} catch(error) {
  $('globe-count').textContent='Places unavailable';list.textContent='Locations could not be loaded. Refresh to try again.';
  canvas.hidden=true;document.querySelector('.globe-controls').hidden=true;$('globe-hint').hidden=true;
  showGlobeError('Places could not load · refresh to try again');
}
