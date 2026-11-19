import {annualLegend,cityKey,drawAnnualImage,drawAnnualMap,drawShanghaiMap,layoutMapLabels,mapAttribution,shanghaiDistricts,shanghaiMapPlaces,shanghaiMetroLayers,shanghaiName} from './annual-review.js';
import {basemaps} from './basemaps.js';
import {periodCounts,addMatches,barHeights,brushLabelLayout} from './timeline.js';
import {palettes,resolveTheme,coordinateLabel} from './appearance.js';
import {criterion,toggleCriterion,matchesFilters,criterionLabel,eventParts,eventCriteria,rankSections,toggleRankHidden} from './filters.js';
import {selectEmoji} from './emoji.js';
import {placeTypes,placeIndex,regionFromAddress} from './place-categories.js';
import {parseCalendar,expand,details,escape as E,validCoord} from './core.js';
import {applyRules,gcjToWgs,normalizePlace,isPlaceExcluded,shortRegionName,geometryPolygons,containsPoint} from './organize.js';
const sourceTimeIds = {calendar:'cal-version', places:'place-version', blacklist:'blacklist-version'};
const mobileSource=document.documentElement?.dataset?.mobileSource;
const mobileImport=mobileSource==='import';
const importTypes={
 calendar:{label:'日历',accept:'.ics,text/calendar',route:'calendar'},
 places:{label:'地点',accept:'.csv,text/csv',route:'places'},
 blacklist:{label:'配置',accept:'.json,application/json',route:'config'},
};
const reviewMapOptions={focusVisitedCities:false,includeSouthChinaSea:true,includeChongming:true,innerRing:false};
const shanghaiLayerOptions={boundaries:true,roads:true,metro:false,landmarks:false};
try{
 const saved=JSON.parse(localStorage.getItem('atlas-review-map-options'));
 for(const key of Object.keys(reviewMapOptions)){
  if(typeof saved?.[key]==='boolean')reviewMapOptions[key]=saved[key];
 }
}catch{}
try{
 const saved=JSON.parse(localStorage.getItem('atlas-shanghai-layers'));
 for(const key of Object.keys(shanghaiLayerOptions)){
  if(typeof saved?.[key]==='boolean')shanghaiLayerOptions[key]=saved[key];
 }
}catch{}
const $=id=>document.getElementById(id);let currentTheme=resolveTheme(localStorage.getItem('atlas-theme'));const colors=()=>palettes[currentTheme];let collapsedSections={};try{collapsedSections=JSON.parse(localStorage.getItem('atlas-sections')||'{}')||{};}catch{}let activeCriteria=[];let rankHidden={places:[],types:[],partners:[],groups:[]};try{const saved=JSON.parse(localStorage.getItem('atlas-rank-hidden-v1'));for(const k of Object.keys(rankHidden))if(Array.isArray(saved?.[k]))rankHidden[k]=saved[k].filter(n=>typeof n==='string');}catch{}const openNotes=new Set();let source=[],filtered=[],world,china,cities=[],tab='places',limit=50,points=[];
const cityBoundaryParts=new Map();
let allCityBorders=false,cityIndexRequest,cityBoundaries=null,cityBoundaryRequest,boundaryLayer=null,overviewLayers=[],regionLabels=[],overviewLevel='',timelineKey='',timelineEvents=[],periods=[];
let highlightCityProvinces=false;
// Leaflet 1.7 can restore an animated zoom's old target after setView resets the map.
const map=L.map('map',{preferCanvas:true,zoomAnimation:false}).setView([32,108],4);let tiles=null;let csvVersion='',editingVersion='',placeLimit=100,activePanel='manage',settingsOpen=false;let markerLayer=null,heatLayer=null,placeToggles=null,reference={places:[]},rules={},configVersion='',emojiConfig={},blacklistBusy=false,blacklistEditing=-1,blacklistEditVersion='',baseCoords=new Map(),yearMin=2000,yearMax=2026,pickMode=false;
L.control.scale({imperial:false}).addTo(map);
$('provider').innerHTML=Object.entries(basemaps).map(([key,{label}])=>'<option value="'+key+'">'+label+'</option>').join('');
const savedProvider=localStorage.getItem('atlas-provider-v2');
$('provider').value=Object.hasOwn(basemaps,savedProvider)?savedProvider:'qh360';
const aliases={'China':'中国','Japan':'日本','South Korea':'韩国','United Kingdom':'英国','United States of America':'美国','France':'法国','Germany':'德国','Italy':'意大利','Spain':'西班牙','Thailand':'泰国','Singapore':'新加坡','Malaysia':'马来西亚','Australia':'澳大利亚','Canada':'加拿大','Indonesia':'印度尼西亚','Vietnam':'越南','New Zealand':'新西兰','Switzerland':'瑞士','Netherlands':'荷兰','Portugal':'葡萄牙','Russia':'俄罗斯','India':'印度','United Arab Emirates':'阿联酋','Philippines':'菲律宾','Cambodia':'柬埔寨','Nepal':'尼泊尔'};
let gaz=[];const normalize=s=>s.toLowerCase().replace(/\s+/g,'');
function setupGaz(){gaz=[];for(const f of world?.features||[]){const p=f.properties;const name=p.name||p.ADMIN||p.NAME;const coords=geometryPolygons(f.geometry).flat(2);let xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]);gaz.push({terms:[name,aliases[name]].filter(Boolean),country:aliases[name]||name,lat:(Math.min(...ys)+Math.max(...ys))/2,lon:(Math.min(...xs)+Math.max(...xs))/2,precision:'country'});}for(const f of china?.features||[]){const p=f.properties;gaz.push({terms:[p.name,p.name.replace(/省|市|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区/g,'')],country:'中国',province:p.name,city:['北京市','上海市','天津市','重庆市','香港特别行政区','澳门特别行政区'].includes(p.name)?p.name:'',lat:p.center?.[1],lon:p.center?.[0],precision:'province'});}for(const p of cities){gaz.push({terms:[p.name,p.name.replace(/市$/,'')],country:'中国',province:p.province,city:p.name,lat:p.center[1],lon:p.center[0],precision:'city'});}gaz=gaz.filter(p=>validCoord(p));}
function locate(name){const m=name.match(/(?:geo:)?(-?\d{1,2}\.\d{3,})\s*[,，;]\s*(-?\d{1,3}\.\d{3,})/i);if(m&&validCoord({lat:m[1],lon:m[2]}))return {...inferRegion(+m[1],+m[2]),lat:+m[1],lon:+m[2],precision:'exact'};const key=normalizePlace(name);const base=baseCoords.get(key);if(base){if(!validCoord(base)){const approx=lookup([base.city,base.province,base.country].filter(Boolean).join(' '))||lookup(name);return approx?{...approx,...Object.fromEntries(['country','province','city'].filter(k=>base[k]).map(k=>[k,base[k]]))}:null;}let p={lat:Number(base.lat),lon:Number(base.lon),precision:'exact'};[p.lat,p.lon]=toWgs(p.lat,p.lon,base.datum||$('datum').value);const inferred=base.country&&base.province&&base.city?{}:inferRegion(p.lat,p.lon);return {...inferred,...Object.fromEntries(['country','province','city'].filter(k=>base[k]).map(k=>[k,base[k]])),...p};}return lookup(name);}
function lookup(name){const s=normalize(name);let hits=gaz.filter(p=>p.terms.some(t=>{if(!t||t.length<2)return false;const term=normalize(t);if(s===term)return true;const official=/省$|市$|区$|县$|自治区$|特别行政区$/.test(t);return official&&s.startsWith(term);}));hits.sort((a,b)=>({city:3,province:2,country:1}[b.precision]-{city:3,province:2,country:1}[a.precision]));if(!hits.length)return null;const best=hits[0],peers=hits.filter(x=>x.precision===best.precision);if(peers.length>1){const qualified=peers.filter(x=>x.province&&s.includes(normalize(x.province.replace(/省|市/g,''))));if(qualified.length!==1)return null;return qualified[0];}return best;}
let cache=new Map();function pos(name){if(!cache.has(name))cache.set(name,locate(name));return cache.get(name);}
function setRecentRange(){
 const now=new Date(),from=new Date(now.getFullYear()-1,now.getMonth(),now.getDate()+1);
 const format=d=>d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
 $('from').value=format(from);
 $('to').value=format(now);
}
function load(text,keepRange=false,deferTimeline=false){const next=parseCalendar(text);const dates=next.map(e=>e.startDate?.toJSDate()).filter(d=>d&&!isNaN(d));if(!dates.length)throw Error('没有有效事件');source=next;if(!keepRange||!$('from').value||!$('to').value){setRecentRange();activeCriteria=[];}timelineKey='';setupYears();refresh({timeline:!deferTimeline,fitBeforeDraw:deferTimeline&&!keepRange});if(!keepRange&&!deferTimeline)fitPoints();}
let rangeCache;
function rangeEvents(from,to){
 const recurring=$('recurring').checked, exclude=$('exclude').checked;
 const key=[+from,+to,recurring,exclude].join('|');
 if(rangeCache?.key!==key||rangeCache.source!==source||rangeCache.rules!==rules){
  const result=expand(source,from,to,recurring);
  rangeCache={key,source,rules,errors:result.errors,capped:result.capped,
   events:applyRules(result.events,rules,exclude).events};
 }
 return rangeCache;
}
function refresh({timeline=true,fitBeforeDraw=false}={}){
 const from=new Date($('from').value+'T00:00:00'),to=new Date($('to').value+'T23:59:59.999');
 if(isNaN(from)||isNaN(to)||from>to){$('status').textContent='请选择有效的起止日期';return;}
 const result=rangeEvents(from,to);
 const draft=$('search').value.trim();
 const applied=draft?[...activeCriteria,criterion('keyword',draft,{scope:$('searchscope').value||'all',draft:true})]:activeCriteria;
 filtered=applied.length?result.events.filter(e=>matchesFilters(e,applied,placeType)):result.events;
 limit=50;
 $('status').textContent=result.errors||result.capped?'部分重复事件无法完整展开，请缩小时间范围。':'';
 if(timeline)syncYears();
 buildPoints();
 if(rankDrawerOpen)renderRank();
 renderEvents();
 if(settingsOpen&&activePanel==='manage')renderPlaces();
 if(fitBeforeDraw)fitPoints();
 draw();
}
function placeType(name){return baseCoords.get(normalizePlace(name))?.type?.trim() || 'other';}
function typeLabel(type){return Object.hasOwn(placeTypes,type) ? placeTypes[type] : type;}
const rankKinds={places:'place',types:'placeType',partners:'person',groups:'group'};
function counts(field){
 const countsByName=new Map();
 for(const event of filtered){
  const names=field==='groups' ? [eventParts(event.title).group].filter(Boolean)
   : field==='types' ? event.places.map(placeType) : event[field];
  for(const name of new Set(names))countsByName.set(name,(countsByName.get(name)||0)+1);
 }
 return [...countsByName].sort((a,b)=>b[1]-a[1]);
}
function applyCriterion(c){activeCriteria=toggleCriterion(activeCriteria,c);refresh();fitPoints();}
function setEntityFilter(field,name){applyCriterion(criterion(rankKinds[field],name,field==='types'?{label:typeLabel(name)}:{}));}
function setMapFilter(p){const level=mapLevel();const names=['place','shanghai'].includes(level)?[...p.names]:[...new Set(source.flatMap(e=>details(e).places))].filter(n=>{const a=pos(n);return a&&(level==='city'?[a.country,a.province,a.city].join('|')===p.regionKey:a[level]===p.name);});applyCriterion(names.length===1?criterion('place',names[0]):criterion('placeGroup',p.name,{values:names}));}
function renderRank(){
 const field=tab,kind=rankKinds[field],label=n=>field==='types'?typeLabel(n):n,all=counts(field),sections=rankSections(all,rankHidden[field]),max=all[0]?.[1]||1;
 const eye=hidden=>'<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>'+(hidden?'<path d="m3 3 18 18"/>':'')+'</svg>';
 const row=([n,c],i,hidden)=>'<div class="rankrow '+(hidden?'rank-demoted ':'')+(activeCriteria.some(c=>c.id===criterion(kind,n).id)?'selected':'')+'" data-rank-name="'+E(n)+'" role="button" tabindex="0"><span class="num">'+(hidden?'—':i+1)+'</span><div class="label">'+E(label(n))+'<div class="bar" style="width:'+100*c/max+'%"></div></div><b>'+c+'</b>'+'<button class="rank-eye" data-rank-eye="'+E(n)+'" title="'+(hidden?'恢复正常排行':'移到排行末尾')+'" aria-label="'+E((hidden?'恢复正常排行：':'移到排行末尾：')+label(n))+'" aria-pressed="'+hidden+'">'+eye(hidden)+'</button></div>';
 $('ranking').innerHTML=all.length?sections.visible.map((r,i)=>row(r,i,false)).join('')+(sections.hidden.length?'<div class="rank-divider" role="separator" aria-label="移至末尾的排行">已移至末尾</div>'+sections.hidden.map((r,i)=>row(r,i,true)).join(''):''):'<div class="empty">此范围内没有记录</div>';
 $('ranking').querySelectorAll('[data-rank-name]').forEach(el=>{el.onclick=()=>setEntityFilter(field,el.dataset.rankName);el.onkeydown=e=>{if(e.target&&e.target!==el)return;if(e.key==='Enter'||e.key===' '){e.preventDefault();setEntityFilter(field,el.dataset.rankName);}};});
 $('ranking').querySelectorAll('[data-rank-eye]').forEach(el=>el.onclick=e=>{e.stopPropagation();rankHidden[field]=toggleRankHidden(rankHidden[field],el.dataset.rankEye);try{localStorage.setItem('atlas-rank-hidden-v1',JSON.stringify(rankHidden));}catch{}renderRank();});
}
function renderEvents(){const rows=filtered;$('eventtitle').textContent='事件 · '+rows.length;const showPlaces=$('showplaces').checked,showPeople=$('showpeople').checked;$('events').classList.toggle('hide-places',!showPlaces);$('events').classList.toggle('hide-people',!showPeople);$('events').innerHTML=rows.slice(0,limit).map((e,i)=>{const key=(e.uid||e.title)+'|'+e.start.toISOString(),open=openNotes.has(key);return '<article class="event"><div class="eventrow"><button class="event-time" data-note="'+i+'" aria-expanded="'+open+'" aria-controls="eventnote-'+i+'" title="查看原始备注"><time>'+e.start.toLocaleDateString('zh-CN')+' '+e.start.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})+'</time></button><div class="eventname"><button class="eventtitle" data-filter-event="'+E(e.title)+'" title="按组别与事件筛选">'+E(e.title)+'</button></div><div class="eventplaces"'+(showPlaces?'':' hidden')+'>'+e.places.map(n=>'<button class="entitylink" data-filter-place="'+E(n)+'" aria-pressed="'+activeCriteria.some(c=>c.id===criterion('place',n).id)+'">'+E(n)+'</button>').join('')+'</div><div class="eventpeople"'+(showPeople?'':' hidden')+'>'+e.partners.map(n=>'<button class="entitylink" data-filter-person="'+E(n)+'" aria-pressed="'+activeCriteria.some(c=>c.id===criterion('person',n).id)+'">'+E(n)+'</button>').join('')+'</div></div><div class="eventnote" id="eventnote-'+i+'"'+(open?'':' hidden')+'>'+E(e.note||'无备注')+'</div></article>';}).join('')||'<div class="empty">无事件</div>';$('more').hidden=rows.length<=limit;$('events').querySelectorAll('[data-note]').forEach(el=>el.onclick=()=>{const e=rows[+el.dataset.note],key=(e.uid||e.title)+'|'+e.start.toISOString();if(openNotes.has(key))openNotes.delete(key);else openNotes.add(key);renderEvents();});$('events').querySelectorAll('[data-filter-place]').forEach(el=>el.onclick=()=>{setEntityFilter('places',el.dataset.filterPlace);});$('events').querySelectorAll('[data-filter-person]').forEach(el=>el.onclick=()=>{setEntityFilter('partners',el.dataset.filterPerson);});$('events').querySelectorAll('[data-filter-event]').forEach(el=>el.onclick=()=>{activeCriteria=eventCriteria(activeCriteria,el.dataset.filterEvent);refresh();fitPoints();});renderFilterChips();}
function renderFilterChips(){
 const draft=$('search').value.trim(), container=$('activefilters');
 container.innerHTML=activeCriteria.map((c,i)=>{
  const label=criterionLabel(c), divider=label.indexOf('：')+1;
  return '<button data-remove-filter="'+i+'">'+E(label.slice(0,divider))+'<strong>'+E(label.slice(divider))+'</strong> ×</button>';
 }).join('')+(draft?'<button data-remove-draft>搜索中：'+E(draft)+' ×</button>':'');
 container.querySelectorAll('[data-remove-filter]').forEach(el=>el.onclick=()=>{
  activeCriteria.splice(+el.dataset.removeFilter,1);
  refresh();
  fitPoints();
 });
 container.querySelector('[data-remove-draft]')?.addEventListener('click',()=>{$('search').value='';refresh();});
}

let regionAuto={};
function fillAddressRegions(){const f=$('editform'),address=f.elements.address.value;if(!address.trim())return;let fallback={};if(world&&china&&validCoord({lat:f.elements.lat.value,lon:f.elements.lon.value})){const [lat,lon]=toWgs(+f.elements.lat.value,+f.elements.lon.value,f.elements.datum.value);fallback=inferRegion(lat,lon);}const inferred=regionFromAddress(address,cities,china?.features.map(f=>f.properties.name)||[],fallback);for(const k of ['country','province','city']){const value=inferred[k]||'';if(!f.elements[k].value||f.elements[k].value===regionAuto[k])f.elements[k].value=value;regionAuto[k]=value;}}
const isClosed=v=>String(v||'').toLowerCase()==='no';
function edit(name=''){editingVersion=csvVersion;regionAuto={};$('editerror').textContent='';const original=baseCoords.get(normalizePlace(name));const p=original||{};const form=$('editform');for(const k of ['address','country','province','city','lat','lon','type','labels'])form.elements[k].value=p[k]||(k==='type'?'other':'');form.elements.location.value=original?.location||name;form.elements.location.readOnly=Boolean(name);form.elements.valid.value=isClosed(p.valid)?'no':'';form.dataset.origValid=p.valid||'';form.elements.datum.value=p.datum||(original&&validCoord(p)&&isMainland(+p.lat,+p.lon)?$('datum').value:'wgs84');fillAddressRegions();$('editor').showModal();}
async function readCSV(){const r=await fetch('api/places',{cache:'no-store'});if(!r.ok)throw Error('CSV 读取失败');const data=await r.json();csvVersion=data.version;reference.places=data.places;setupReference();cache.clear();return data;}
async function writeCSV(updates,version=csvVersion){const r=await fetch('api/places',{method:'POST',headers:{'Content-Type':'application/json','X-Atlas-Write':'1'},body:JSON.stringify({version,updates})});const data=await r.json();if(!r.ok)throw Error(data.error||'CSV 保存失败');csvVersion=data.version;reference.places=data.places;setupReference();cache.clear();refresh();updateDataTimes(['places']);}
for(const key of ['address','lat','lon','datum'])$('editform').elements[key].addEventListener('change',fillAddressRegions);$('editform').elements.address.addEventListener('input',fillAddressRegions);for(const key of ['country','province','city'])$('editform').elements[key].addEventListener('input',()=>{regionAuto[key]=null;});
$('editform').onsubmit=async e=>{e.preventDefault();const p=Object.fromEntries(new FormData(e.target));if(p.valid!=='no'){const ov=e.target.dataset.origValid||'';p.valid=(ov&&ov!=='no')?ov:'';}$('saveplace').disabled=true;$('editerror').textContent='';try{await writeCSV([p],editingVersion);$('editor').close();}catch(err){$('editerror').textContent=err.message;}finally{$('saveplace').disabled=false;}};
$('cancel').onclick=()=>$('editor').close();
$('ics').onchange=async e=>{try{const file=e.target.files[0];load(await file.text());showDataTime('calendar',file.lastModified);}catch{alert('日历解析失败，请检查 ICS 格式');}e.target.value='';};
function buildPoints(){const level=mapLevel();const m=new Map();for(const e of filtered){const seen=new Set();for(const name of e.places){const p=pos(name);if(!p)continue;const label=level==='place'?name:p[level];const key=level==='city'?[p.country,p.province,p.city].join('|'):label;if(!label||seen.has(key))continue;seen.add(key);let center=p;if(level!=='place'){center=gaz.find(x=>x[level]===label&&x.precision===level&&(level!=='city'||x.province===p.province))||p;}if(!m.has(key))m.set(key,{...center,name:label,regionKey:key,count:0,names:new Set(),eventTitles:[]});const v=m.get(key);v.count++;v.names.add(name);v.eventTitles.push(e.title);}}points=[...m.values()];}
function fitPoints(){
 if(mapLevel()==='shanghai')return;
 if(mapLevel()!=='place'){fitOverview();return;}
 const good=points.filter(p=>validCoord(p));
 if(!good.length)return;
 const coarse=typeof matchMedia==='function'&&matchMedia('(pointer: coarse)').matches;
 map.fitBounds(good.map(p=>displayPoint(p.lat,p.lon)),{padding:[35,35],maxZoom:15,...(coarse?{animate:false}:{})});
}
const isDomesticLevel=level=>level==='city'||level==='province';
let domesticLevel='province';
function mapLevel(){const level=$('level').value;return level==='domestic'?domesticLevel:level;}
let touchedAt=-Infinity,touchPreview=null,ignoreTouchClickUntil=0;
function recordMapTouch(event){
 touchedAt=event.type==='touchstart'||event.pointerType==='touch'?Date.now():-Infinity;
 ignoreTouchClickUntil=0;
}
$('map').addEventListener('pointerdown',recordMapTouch,true);
$('map').addEventListener('touchstart',recordMapTouch,{capture:true,passive:true});
function isMapTouch(event){
 if(!event)return false;
 if(event.pointerType)return event.pointerType==='touch';
 if(typeof event.sourceCapabilities?.firesTouchEvents==='boolean')return event.sourceCapabilities.firesTouchEvents;
 return (event.detail!==0||event.type==='contextmenu')&&Date.now()-touchedAt<2000;
}
function stopVisitEvent(original){
 if(!original)return;
 original._stopped=true;
 original.stopPropagation?.();
}
function clearTouchPreview(){
 if(!touchPreview)return;
 const {layer,text}=touchPreview;
 touchPreview=null;
 layer.closeTooltip();
 layer.setTooltipContent(text);
}
function bindMapVisit(layer,text,action,options={}){
 layer.bindTooltip(text,{className:'atlas-tooltip',direction:'top',...options});
 layer.on('click',event=>{
  if(pickMode)return;
  const original=event?.originalEvent;
  if(isMapTouch(original)){
   stopVisitEvent(original);
   if(Date.now()<ignoreTouchClickUntil){layer.closeTooltip();return;}
   const held=Number.isFinite(touchedAt)&&Date.now()-touchedAt>=500;
   if(touchPreview?.layer!==layer&&!held){
    clearTouchPreview();
    touchPreview={layer,text};
    layer.setTooltipContent(text+'<span class="atlas-touch-hint">再点一次筛选</span>');
    layer.openTooltip(event.latlng);
    return;
   }
  }
  clearTouchPreview();
  action();
 });
 layer.on('contextmenu',event=>{
  const original=event.originalEvent;
  if(pickMode||!isMapTouch(original))return;
  stopVisitEvent(original);
  original.preventDefault?.();
  ignoreTouchClickUntil=Date.now()+750;
  clearTouchPreview();
  action();
 });
 layer.on('dblclick',event=>{
  if(isMapTouch(event.originalEvent))stopVisitEvent(event.originalEvent);
 });
}
map.on('dragstart zoomstart',clearTouchPreview);
let hoverTip,hoverTarget,hoverText,hoverTimer,hoverPosition;
function hideHoverTip(){
 clearTimeout(hoverTimer);
 hoverTarget=null;
 hoverText='';
 if(hoverTip)hoverTip.hidden=true;
}
function positionHoverTip(){
 const {x,y}=hoverPosition;
 const half=hoverTip.offsetWidth/2;
 const left=Math.max(half+6,Math.min(window.innerWidth-half-6,x));
 const top=y+hoverTip.offsetHeight+18<=window.innerHeight?y+14:Math.max(4,y-hoverTip.offsetHeight-10);
 hoverTip.style.left=left+'px';
 hoverTip.style.top=top+'px';
}
document.addEventListener?.('pointermove',event=>{
 if(event.pointerType==='touch'||event.buttons){hideHoverTip();return;}
 const target=event.target.closest?.('[title],[data-hover-tip]');
 if(target?.hasAttribute('title')){
  target.dataset.hoverTip=target.getAttribute('title');
  target.removeAttribute('title');
 }
 const message=target?.dataset.hoverTip;
 if(!message){hideHoverTip();return;}
 hoverPosition={x:event.clientX,y:event.clientY};
 if(target===hoverTarget&&message===hoverText){
  if(hoverTip&&!hoverTip.hidden)positionHoverTip();
  return;
 }
 hideHoverTip();
 hoverTarget=target;
 hoverText=message;
 hoverTimer=setTimeout(()=>{
  if(!target.isConnected)return;
  if(!hoverTip){
   hoverTip=document.createElement('div');
   hoverTip.className='hover-tip';
   hoverTip.setAttribute('role','tooltip');
   document.body.append(hoverTip);
  }
  hoverTip.textContent=message;
  hoverTip.hidden=false;
  positionHoverTip();
 },250);
});
document.addEventListener?.('pointerout',event=>{
 if(hoverTarget&&!(event.relatedTarget instanceof Node&&hoverTarget.contains(event.relatedTarget)))hideHoverTip();
});
document.addEventListener?.('pointerdown',hideHoverTip);
document.addEventListener?.('scroll',hideHoverTip,true);
document.addEventListener?.('keydown',event=>{if(event.key==='Escape')hideHoverTip();});
let heatLibraryRequest;
function drawHeat(circles){
 if(typeof L.heatLayer==='function'){
  heatLayer=L.heatLayer(circles,{radius:28,blur:22,maxZoom:16,minOpacity:.25}).addTo(map);
  return;
 }
 if(heatLibraryRequest)return;
 const script=document.createElement('script');
 script.src='vendor/leaflet-heat.js';
 heatLibraryRequest=new Promise((resolve,reject)=>{
  script.onload=()=>typeof L.heatLayer==='function'?resolve():reject(Error('热力图组件不可用'));
  script.onerror=reject;
 });
 heatLibraryRequest.then(()=>{
  heatLibraryRequest=null;
  if(mapLevel()==='place'&&$('heatmap').checked)draw();
 }).catch(()=>{
  heatLibraryRequest=null;
  script.remove();
  if(mapLevel()==='place'&&$('heatmap').checked)$('mapnotice').textContent='热力图加载失败，可重新开启重试';
 });
 document.head.append(script);
}
function draw(){clearTouchPreview();shanghaiLayerControl.hidden=mapLevel()!=='shanghai';
 domesticLayerControl.hidden=!isDomesticLevel(mapLevel());
 domesticLayerControl.querySelector('summary').textContent=domesticLevel==='city'?'图层 · 城市':'图层 · 省份';
 for(const radio of domesticLayerControl.querySelectorAll('input[type="radio"]'))radio.checked=radio.value===domesticLevel;
 for(const input of domesticLayerControl.querySelectorAll('input[type="checkbox"]'))input.closest('label').hidden=mapLevel()!=='city';
 placeToggles.hidden=mapLevel()!=='place';
 for(const input of placeToggles.querySelectorAll('input'))input.checked=$(input.name).checked;const heat=Boolean($('heatmap')&&$('heatmap').checked)&&mapLevel()==='place';if(mapLevel()!=='place'){drawOverview();return;}map.options.zoomSnap=1;map.setMinZoom(0);map.setMaxZoom(18);overviewLevel='';clearOverview();if(!tiles||!map.hasLayer(tiles))setProvider(false);$('provider').disabled=false;$('provider').style.display='';if(markerLayer)map.removeLayer(markerLayer);if(heatLayer)map.removeLayer(heatLayer);const _agg=$('aggregate')?$('aggregate').checked:true;markerLayer=_agg?L.markerClusterGroup({maxClusterRadius:45,showCoverageOnHover:false,zoomToBoundsOnClick:true}):L.layerGroup();const circles=[];for(const p of points){if(!validCoord(p))continue;const coord=displayPoint(p.lat,p.lon);const marker=L.marker(coord,{icon:L.divIcon({className:'visit-marker '+(p.precision==='exact'?'exact':'approx'),html:'<span class="single-emoji">'+E(selectEmoji(p,baseCoords,emojiConfig))+'</span>',iconSize:[28,28],iconAnchor:[14,14]})});bindMapVisit(marker,E(p.name)+' · '+p.count+' 次',()=>setMapFilter(p));markerLayer.addLayer(marker);if(heat)circles.push([...coord,Math.min(1,Math.log2(p.count+1)/5)]);}if(heat)drawHeat(circles);markerLayer.addTo(map);}
map.on('click',e=>{clearTouchPreview();if(!pickMode)return;pickMode=false;const p=basemaps[$('provider').value]?.gcj02&&mapLevel()==='place'&&isMainland(e.latlng.lat,e.latlng.lng)?gcjToWgs(e.latlng.lat,e.latlng.lng):[e.latlng.lat,e.latlng.lng];$('editform').elements.lat.value=p[0].toFixed(6);$('editform').elements.lon.value=p[1].toFixed(6);$('editform').elements.datum.value='wgs84';$('editor').showModal();$('status').textContent='已选取坐标，点击保存完成标注';});
$('pickpoint').onclick=()=>{if(mapLevel()!=='place'){$('level').value='place';buildPoints();draw();fitPoints();}pickMode=true;$('editor').close();$('status').textContent='请在地图上点击精确位置（坐标仅存本机）';};
$('reset').onclick=()=>mapLevel()==='shanghai'?fitOverview():fitPoints();$('level').onchange=async()=>{const lv=mapLevel();if(lv==='shanghai'){await enterShanghaiMap();return;}if(lv==='country'&&!world){$('status').textContent='正在加载国家边界…';try{world=await (await fetch('data/world.json')).json();setupGaz();cache.clear();}catch{}finally{$('status').textContent='';}}if(mapLevel()!==lv)return;buildPoints();draw();fitPoints();};for(const id of ['from','to','recurring','exclude'])$(id).onchange=refresh;$('search').oninput=()=>{refresh();};$('searchscope').onchange=()=>refresh();$('searchform').onsubmit=e=>{e.preventDefault();const value=$('search').value.trim();if(!value)return;const c=criterion('keyword',value,{scope:$('searchscope').value||'all'});if(!activeCriteria.some(x=>x.id===c.id))activeCriteria.push(c);$('search').value='';refresh();fitPoints();};$('all').onclick=()=>loadOriginalRange();function loadOriginalRange(){const ds=source.map(e=>e.startDate.toJSDate().getTime());$('from').value=new Date(Math.min(...ds)).toISOString().slice(0,10);$('to').value=new Date(Math.max(Date.now(),...ds)).toISOString().slice(0,10);refresh();}$('year').onclick=()=>{setRecentRange();refresh();};$('more').onclick=()=>{limit+=50;renderEvents();};$('unselect').onclick=()=>{activeCriteria=[];$('search').value='';limit=50;refresh();};document.querySelectorAll('[data-panel]').forEach(el=>el.onclick=()=>{tab=el.dataset.tab;document.querySelectorAll('[data-panel]').forEach(x=>x.classList.toggle('active',x===el));renderRank();});document.querySelectorAll('[data-settings-panel]').forEach(el=>el.onclick=()=>{activePanel=el.dataset.settingsPanel;document.querySelectorAll('[data-settings-panel]').forEach(x=>x.classList.toggle('active',x===el));$('settings-drawer').querySelectorAll('[data-content]').forEach(x=>x.hidden=x.dataset.content!==activePanel);if(activePanel==='manage')renderPlaces();});
try{const pref=JSON.parse(localStorage.getItem('atlas-event-columns')||'{}');$('showplaces').checked=pref.places!==false;$('showpeople').checked=pref.people!==false;}catch{}for(const id of ['showplaces','showpeople'])$(id).onchange=()=>{localStorage.setItem('atlas-event-columns',JSON.stringify({places:$('showplaces').checked,people:$('showpeople').checked}));renderEvents();};


function setupReference(){baseCoords=placeIndex(reference.places,normalizePlace);$('referenceinfo').textContent=reference.places.length+' 条';$('datum').value=localStorage.getItem('atlas-datum-v2')||'gcj02';}
async function readConfigFiles(){const r=await fetch('api/config',{cache:'no-store'});if(!r.ok)throw Error('配置读取失败');const d=await r.json();rules=d;emojiConfig=d.emojis;configVersion=d.version;}
function renderBlacklist(){const all=rules.blacklist||[],type=$('blacklist-type').value||'all',q=$('blacklist-search').value.toLowerCase();$('blacklist-summary').textContent=all.length+' 条';if(!$('rule-list-details').open)return;$('blacklist-rows').innerHTML=all.map((r,i)=>({r,i})).filter(({r})=>(type==='all'||r.type===type)&&(!q||[r.value,r.reason,r.type].join(' ').toLowerCase().includes(q))).map(({r,i})=>'<div class="blacklist-row '+(r.enabled==='0'?'off':'')+'"><label class="check"><input type="checkbox" data-rule-toggle="'+i+'" '+(r.enabled!=='0'?'checked':'')+(blacklistBusy||mobileSource?' disabled':'')+' aria-label="启用此规则"><span class="rule-type">'+(r.type==='event'?'事件':'地点')+'</span></label><div class="rule-body"><b>'+E(r.value)+'</b><small>'+({contains:'包含关键词',exact:'完整名称',uid:'事件 UID'}[r.match_type]||r.match_type)+'</small></div><div class="rule-actions"><button data-rule-edit="'+i+'" '+(blacklistBusy||mobileSource?'disabled':'')+' title="编辑规则" aria-label="编辑规则">✎</button><button data-rule-delete="'+i+'" '+(blacklistBusy||mobileSource?'disabled':'')+' title="删除规则" aria-label="删除规则">🗑</button></div></div>').join('')||'<div class="empty">没有匹配规则</div>';$('blacklist-rows').querySelectorAll('[data-rule-toggle]').forEach(el=>el.onchange=async()=>{const rows=structuredClone(rules.blacklist);rows[+el.dataset.ruleToggle].enabled=el.checked?'1':'0';await persistBlacklist(rows);});$('blacklist-rows').querySelectorAll('[data-rule-edit]').forEach(el=>el.onclick=()=>editBlacklist(+el.dataset.ruleEdit));$('blacklist-rows').querySelectorAll('[data-rule-delete]').forEach(el=>el.onclick=async()=>{const rows=rules.blacklist.filter((r,i)=>i!==+el.dataset.ruleDelete);await persistBlacklist(rows);});}
async function persistBlacklist(rows,version=configVersion){if(blacklistBusy)return false;blacklistBusy=true;$('blacklist-error').textContent='';renderBlacklist();try{const response=await fetch('api/config',{method:'POST',headers:{'Content-Type':'application/json','X-Atlas-Write':'1'},body:JSON.stringify({version,blacklist:rows})});const d=await response.json();if(!response.ok)throw Error(d.error||'黑名单保存失败');rules=d;emojiConfig=d.emojis;configVersion=d.version;timelineKey='';refresh();updateDataTimes(['blacklist']);return true;}catch(e){$('blacklist-error').textContent=e.message;return false;}finally{blacklistBusy=false;renderBlacklist();}}
function editBlacklist(index=-1){blacklistEditing=index;blacklistEditVersion=configVersion;const r=rules.blacklist?.[index]||{type:$('blacklist-type').value==='place'?'place':'event',enabled:'1',match_type:'contains',value:'',reason:''};const f=$('blacklist-form');for(const k of ['type','match_type','value','reason'])f.elements[k].value=r[k]||'';f.elements.enabled.checked=r.enabled!=='0';$('blacklist-editor-title').textContent=index<0?'新增规则':'编辑规则';$('blacklist-form-error').textContent='';$('blacklist-editor').showModal();}
$('blacklist-form').onsubmit=async e=>{e.preventDefault();const f=e.target;const r={type:f.elements.type.value,enabled:f.elements.enabled.checked?'1':'0',match_type:f.elements.match_type.value,value:f.elements.value.value,reason:f.elements.reason.value};if(r.type==='place'&&r.match_type==='uid'){$('blacklist-form-error').textContent='UID 仅适用于事件';return;}$('save-blacklist').disabled=true;try{const rows=structuredClone(rules.blacklist||[]);if(blacklistEditing<0)rows.push(r);else rows[blacklistEditing]=r;if(await persistBlacklist(rows,blacklistEditVersion))$('blacklist-editor').close();else $('blacklist-form-error').textContent=$('blacklist-error').textContent;}finally{$('save-blacklist').disabled=false;}};
$('cancel-blacklist').onclick=()=>$('blacklist-editor').close();$('add-blacklist').onclick=()=>editBlacklist();$('blacklist-type').onchange=$('blacklist-search').oninput=renderBlacklist;$('reload-blacklist').onclick=async()=>{try{await reloadSource('blacklist');$('blacklist-error').textContent='';}catch(e){$('blacklist-error').textContent=e.message;}};
$('datum').onchange=()=>{localStorage.setItem('atlas-datum-v2',$('datum').value);cache.clear();refresh();};
function setupYears(){const ys=source.map(e=>e.startDate?.toJSDate().getFullYear()).filter(Number.isFinite);yearMin=Math.min(...ys);yearMax=Math.max(new Date().getFullYear(),...ys);}
function ensureTimeline(){const key=JSON.stringify([source.length,yearMin,yearMax,$('recurring').checked,$('exclude').checked,rules,csvVersion]);if(key!==timelineKey){timelineEvents=applyRules(expand(source,new Date(yearMin,0,1),new Date(yearMax,11,31,23,59,59),$('recurring').checked).events,rules,$('exclude').checked,new Set()).events;timelineKey=key;}}
function syncYears(){ensureTimeline();const monthly=$('timeunit').value==='month';let min,max;if(monthly){let fi=Infinity,li=-Infinity;for(const e of timelineEvents){const d=e.start;const i=d.getFullYear()*12+d.getMonth();if(i<fi)fi=i;if(i>li)li=i;}min=fi!==Infinity?fi:yearMin*12;max=li!==-Infinity?li:yearMax*12+11;}else{min=yearMin;max=yearMax;}const index=d=>monthly?Number(d.slice(0,4))*12+Number(d.slice(5,7))-1:Number(d.slice(0,4));const a=Math.max(min,Math.min(max,index($('from').value)||min)),b=Math.max(a,Math.min(max,index($('to').value)||max));for(const id of ['yearfrom','yearto']){$(id).min=min;$(id).max=max;}$('yearfrom').value=a;$('yearto').value=b;const label=i=>monthly?Math.floor(i/12)+'-'+String(i%12+1).padStart(2,'0'):String(i);periods=addMatches(periodCounts(timelineEvents,monthly,min,max),filtered,monthly,min);const peak=Math.max(1,...periods.map(p=>p.total));$('timeline-track').classList.toggle('monthly',monthly);$('timeline-track').style.minWidth='0';$('timeline-track').style.width='100%';$('period-start').textContent=label(a);$('period-end').textContent=label(b);$('yearbars').classList.toggle('single-selection',a===b);$('yearbars').innerHTML=periods.map(p=>{const normalFiltering=activeCriteria.length>0||Boolean($('search').value.trim());const heights=barHeights(p.total,normalFiltering?p.matched:0,peak);return '<button class="yearbar '+(p.index>=a&&p.index<=b?'selected ':'')+((monthly?Math.floor(p.index/12):p.index)%2?'year-dark':'year-light')+(monthly&&p.index%12===0&&p.index>min?' year-start':'')+'" data-period="'+p.index+'" data-total="'+p.total+'" data-matched="'+p.matched+'" title="'+label(p.index)+' · '+p.matched+'/'+p.total+'" aria-label="'+label(p.index)+'">'+(monthly?'':'<span class="barcount">'+(normalFiltering?p.matched+'/'+p.total:p.total)+'</span>')+'<span class="bar-stack" style="height:'+heights.total+'px"><i class="bar-original"></i>'+(normalFiltering?'<i class="bar-matched" style="height:'+heights.matched+'px"></i>':'')+'</span>'+(monthly?'':'<span class="year-full">'+label(p.index)+'</span><span class="year-short" aria-hidden="true">'+'&#39;'+label(p.index).slice(-2)+'</span>')+'</button>';}).join('');$('yearbars').querySelectorAll('[data-period]').forEach(el=>el.onclick=()=>selectPeriods(+el.dataset.period,+el.dataset.period));const n=periods.length;$('brushselection').style.left=(a-min)/n*100+'%';$('brushselection').style.width=(b-a+1)/n*100+'%';layoutTimelineLabels();for(const [id,value] of [['brushleft',a],['brushright',b]]){for(const [key,v] of [['aria-valuemin',min],['aria-valuemax',max],['aria-valuenow',value],['aria-valuetext',label(value)]])$(id).setAttribute(key,String(v));}}
function layoutTimelineLabels(){
 const track=$('brushtrack'),width=track.getBoundingClientRect().width;
 if(!width||!periods.length)return;
 const min=+$('yearfrom').min,max=+$('yearfrom').max,count=max-min+1;
 const monthly=$('timeunit').value==='month';
 const yearBars=$('timeline-track');
 const compact=!monthly&&(width-4*(count-1))/count<29;
 yearBars.classList.toggle('compact-years',compact);
 const start=$('period-start'),end=$('period-end');
 const anchor=i=>i/count*width;
 const startEdge=anchor(+$('yearfrom').value-min);
 const endEdge=anchor(+$('yearto').value-min+1);
 const labelWidth=el=>el.offsetWidth||el.textContent.length*6.5;
 const layout=brushLabelLayout(width,startEdge,endEdge,labelWidth(start),labelWidth(end));
 start.style.left=layout.start+'px';
 end.style.left=layout.end+'px';
 track.classList.toggle('stacked-endpoint',layout.split);
}
if(typeof ResizeObserver==='function')new ResizeObserver(layoutTimelineLabels).observe($('timeline-track'));
function selectPeriods(a,b){if($('timeunit').value==='month'){const ya=Math.floor(a/12),ma=a%12,yb=Math.floor(b/12),mb=b%12;$('from').value=ya+'-'+String(ma+1).padStart(2,'0')+'-01';$('to').value=yb+'-'+String(mb+1).padStart(2,'0')+'-'+new Date(yb,mb+1,0).getDate();}else{$('from').value=a+'-01-01';$('to').value=b+'-12-31';}refresh();}
$('yearfrom').oninput=()=>selectPeriods(+$('yearfrom').value,Math.max(+$('yearfrom').value,+$('yearto').value));$('yearto').oninput=()=>selectPeriods(Math.min(+$('yearfrom').value,+$('yearto').value),+$('yearto').value);$('timeunit').onchange=syncYears;

function inferRegion(lat,lon){const contains=f=>containsPoint(geometryPolygons(f.geometry),lon,lat);const province=china?.features.find(contains);if(province){const p=province.properties;const city=(cityBoundaries||cityBoundaryParts.get(String(p.adcode).slice(0,2)))?.features.find(f=>f.properties.province===p.name&&contains(f));return {country:'中国',province:p.name,city:city?.properties.name||(['北京市','上海市','天津市','重庆市'].includes(p.name)?p.name:'')};}if(!world)return {};const f=world.features.find(contains);if(f){const name=f.properties.name||f.properties.ADMIN||f.properties.NAME;return {country:aliases[name]||name};}return {};}

function toWgs(lat,lon,datum){if(datum==='bd09'){const x=lon-.0065,y=lat-.006,z=Math.sqrt(x*x+y*y)-.00002*Math.sin(y*Math.PI*3000/180),theta=Math.atan2(y,x)-.000003*Math.cos(x*Math.PI*3000/180);lat=z*Math.sin(theta);lon=z*Math.cos(theta);datum='gcj02';}return datum==='gcj02'&&isMainland(lat,lon)?gcjToWgs(lat,lon):[lat,lon];}
function displayPoint(lat,lon){if(mapLevel()!=='place'||!basemaps[$('provider').value]?.gcj02||!isMainland(lat,lon))return [lat,lon];const [a,b]=gcjToWgs(lat,lon);return [lat*2-a,lon*2-b];}
function setProvider(redraw=true){
 if(tiles)map.removeLayer(tiles);
 const value=$('provider').value;
 const {url,options}=basemaps[value]||basemaps.qh360;
 tiles=L.tileLayer(url,{maxZoom:18,...options});
 tiles.on('tileerror',()=>{$('mapnotice').textContent='底图加载失败，可切换另一底图';});
 tiles.on('tileload',()=>{$('mapnotice').textContent='';});
 if(mapLevel()==='place')tiles.addTo(map);
 localStorage.setItem('atlas-provider-v2',value);
 if(redraw)draw();
}
function clearRegionLabels(){for(const layer of regionLabels)map.removeLayer(layer);regionLabels=[];}
function clearOverview(){shanghaiBase?.stations.remove();if(shanghaiBase)shanghaiBase.visits=null;clearRegionLabels();for(const l of overviewLayers)map.removeLayer(l);overviewLayers=[];boundaryLayer=null;$('map').classList.remove('administrative','shanghai-overview');}
function fitOverview(){
 const level=mapLevel(),bounds=boundaryLayer?.getBounds();
 if(level==='shanghai'){
  map.invalidateSize({pan:false});
  const size=map.getSize();
  if(bounds?.isValid()&&size.x>70&&size.y>70)map.fitBounds(bounds,{padding:[24,24],maxZoom:12,animate:false,reset:true});
  else showShanghaiCenter();
 }else if(level==='province'||level==='city'){
  map.fitBounds([[17.9,72.5],[54,135.2]],{padding:[16,14],animate:false});
 }else if(bounds?.isValid())map.fitBounds(bounds,{padding:[35,35],maxZoom:5});
 else map.setView([30,105],3);
}
async function enterShanghaiMap(){
 showShanghaiCenter();
 if(!cityBoundaries||!shanghaiLandmarks){
  drawOverview();
  $('mapnotice').textContent='正在加载上海地图…';
  try{await Promise.all([loadCityBoundaries(),loadShanghaiLandmarks()]);}
  catch{if(mapLevel()==='shanghai')$('mapnotice').textContent='上海地图数据读取失败，请重新选择上海市';return;}
 }
 if(mapLevel()!=='shanghai')return;
 draw();
}
function showShanghaiCenter(){
 map.options.zoomSnap=1;
 map.setMaxZoom(18);
 map.setMinZoom(7);
 // With Leaflet's standard 100 px scale at Shanghai's latitude, zoom 9 shows 20 km.
 map.setView([31.23,121.47],9,{animate:false,reset:true});
}
function renderProvinceLabels(size){
 if(!china)return;
 const labels=[];
 const visited=new Set(points.filter(p=>p.count>0).map(p=>p.name));
 for(const feature of china.features){
  const name=shortRegionName(feature.properties.name);
  const coord=name&&labelPoint(feature);
  if(!coord)continue;
  const {x,y}=map.latLngToContainerPoint(coord);
  if(x<0||y<0||x>size.x||y>size.y)continue;
  const compact=['香港','澳门','北京','天津','上海'].includes(name);
  const direction=name==='香港'?[[1,1],[1,0],[0,1],[-1,1]]:name==='澳门'?[[-1,1],[-1,0],[0,1],[1,1]]:undefined;
  labels.push({name,coord,x,y,w:name.length*12+7,h:17,offset:compact?22:0,directions:direction,visited:visited.has(feature.properties.name)});
 }
 labels.sort((a,b)=>a.offset-b.offset);
 const view={x:0,y:0,width:size.x,height:size.y};
 for(const {name,coord,x,y,w,h,visited,anchor:[ax,ay]} of layoutMapLabels(labels,view,{maxShift:124})){
  const position=map.containerPointToLatLng([x,y]);
  const shifted=x!==ax||y!==ay;
  if(shifted){
   const color=colors().dark;
   const ratio=1/Math.max(1,2*Math.abs(x-ax)/w,2*Math.abs(y-ay)/h);
   const endpoint=map.containerPointToLatLng([x+(ax-x)*ratio,y+(ay-y)*ratio]);
   regionLabels.push(L.polyline([coord,endpoint],{color,weight:1,opacity:.68,interactive:false}).addTo(map));
   regionLabels.push(L.circleMarker(coord,{radius:1.5,fillColor:color,fillOpacity:.9,stroke:false,interactive:false}).addTo(map));
  }
  const icon=L.divIcon({className:'region-label province-label'+(shifted?' province-callout':'')+(visited?' visited-label':''),
   html:E(name),iconSize:[w,h],iconAnchor:[w/2,h/2]});
  regionLabels.push(L.marker(position,{icon,interactive:false,keyboard:false}).addTo(map));
 }
}
const CAPITALS={'北京市':'北京市','天津市':'天津市','河北省':'石家庄市','山西省':'太原市','内蒙古自治区':'呼和浩特市','辽宁省':'沈阳市','吉林省':'长春市','黑龙江省':'哈尔滨市','上海市':'上海市','江苏省':'南京市','浙江省':'杭州市','安徽省':'合肥市','福建省':'福州市','江西省':'南昌市','山东省':'济南市','河南省':'郑州市','湖北省':'武汉市','湖南省':'长沙市','广东省':'广州市','广西壮族自治区':'南宁市','海南省':'海口市','重庆市':'重庆市','四川省':'成都市','贵州省':'贵阳市','云南省':'昆明市','西藏自治区':'拉萨市','陕西省':'西安市','甘肃省':'兰州市','青海省':'西宁市','宁夏回族自治区':'银川市','新疆维吾尔自治区':'乌鲁木齐市','台湾省':'台北市','香港特别行政区':'香港','澳门特别行政区':'澳门'};const MUNI=['北京市','上海市','天津市','重庆市'];
let _regionNames=null;function zhCountry(pr){if(!pr)return '';const code=pr['ISO3166-1-Alpha-2']||pr.ISO_A2;try{if(code){_regionNames=_regionNames||new Intl.DisplayNames(['zh-CN'],{type:'region'});const n=_regionNames.of(String(code));if(n&&n!==code)return n;}}catch{}const raw=pr.name||pr.ADMIN||pr.NAME;return aliases[raw]||raw||'';}
const _labelPtCache=new WeakMap();
function labelPoint(f){if(f&&_labelPtCache.has(f))return _labelPtCache.get(f);let res=null;try{const polys=geometryPolygons(f.geometry);if(!polys.length)return null;let best=null,bestA=-1;for(const poly of polys){const r=poly[0];if(!r||!r.length)continue;let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;for(const pt of r){if(pt[0]<minx)minx=pt[0];if(pt[0]>maxx)maxx=pt[0];if(pt[1]<miny)miny=pt[1];if(pt[1]>maxy)maxy=pt[1];}const a=(maxx-minx)*(maxy-miny);if(a>bestA){bestA=a;best={poly,minx,maxx,miny,maxy};}}if(!best)return null;const outer=best.poly[0];const inside=(x,y)=>containsPoint([best.poly],x,y);let a=0,cx=0,cy=0;for(let i=0,j=outer.length-1;i<outer.length;j=i++){const x1=outer[j][0],y1=outer[j][1],x2=outer[i][0],y2=outer[i][1],cr=x1*y2-x2*y1;a+=cr;cx+=(x1+x2)*cr;cy+=(y1+y2)*cr;}const px=a?cx/(3*a):(best.minx+best.maxx)/2,py=a?cy/(3*a):(best.miny+best.maxy)/2;if(inside(px,py))res=[py,px];else{let best2=null,bd=Infinity;const N=24;for(let ix=0;ix<N;ix++)for(let iy=0;iy<N;iy++){const x=best.minx+(best.maxx-best.minx)*(ix+0.5)/N,y=best.miny+(best.maxy-best.miny)*(iy+0.5)/N;if(!inside(x,y))continue;const d=(x-px)*(x-px)+(y-py)*(y-py);if(d<bd){bd=d;best2=[y,x];}}res=best2||[py,px];}}catch{}if(f)_labelPtCache.set(f,res);return res;}
function renderRegionLabels(){if(typeof window==='undefined')return;syncShanghaiStations();clearRegionLabels();const level=mapLevel();if(level==='place'||level==='country'&&!world||level==='shanghai'&&!cityBoundaries)return;const size=map.getSize();if(level==='province'){renderProvinceLabels(size);return;}const src=level==='shanghai'?(shanghaiLayerOptions.boundaries?shanghaiDistricts(cityBoundaries):[]):level==='country'?world.features:cityFeatures();const lit=new Set((typeof points!=='undefined'?points:[]).filter(p=>p&&p.count>0).map(p=>p.name));const capName=f=>{const pr=f.properties||{};return CAPITALS[pr.province]===pr.name||MUNI.includes(pr.name);};let entries=src.map(f=>{const pr=f.properties||{};const raw=level==='country'?(pr.name||pr.ADMIN||pr.NAME):pr.name;const name=level==='country'?zhCountry(pr):raw;if(!name)return null;return {f,name,lit:lit.has(name)||lit.has(raw),cap:level==='city'&&capName(f),adcode:pr.adcode||0};}).filter(Boolean);const fnames=new Set(src.map(f=>f.properties.name));if(level==='city'){for(const q of (typeof points!=='undefined'?points:[])){if(!q||!q.count||!q.name||fnames.has(q.name)||!validCoord(q))continue;entries.push({f:null,name:q.name,pt:[+q.lat,+q.lon],lit:true,cap:false,adcode:0});}}const sp=n=>n==='南昌市'||n==='南昌';entries.sort((a,b)=>{if(a.lit!==b.lit)return a.lit?-1:1;if(level==='city'){const sa=sp(a.name),sb=sp(b.name);if(a.lit){if(sa!==sb)return sa?-1:1;if(a.cap!==b.cap)return a.cap?-1:1;return a.adcode-b.adcode;}if(a.cap!==b.cap)return a.cap?-1:1;return a.adcode-b.adcode;}return 0;});if(level==='city')entries=entries.filter(e=>e.lit);const placed=[];for(const en of entries){const{f,name}=en;let c=f?labelPoint(f):en.pt;let bounds=null;if(level==='shanghai'){if(c)c=gcjToWgs(...c);}else try{bounds=L.geoJSON(f).getBounds();}catch{}if(!c&&bounds&&bounds.isValid())c=bounds.getCenter();if(!c)continue;const pt=map.latLngToContainerPoint(c);if(pt.x<0||pt.y<0||pt.x>size.x||pt.y>size.y)continue;const allowSmall=level==='shanghai'||en.lit||en.cap||/香港|澳门/.test(name);if(!allowSmall&&bounds&&bounds.isValid()){const nw=map.latLngToContainerPoint(bounds.getNorthWest()),se=map.latLngToContainerPoint(bounds.getSouthEast());if(Math.abs(se.x-nw.x)<20||Math.abs(se.y-nw.y)<11)continue;}const text=shortRegionName(name);const font=level==='shanghai'?13:12,w=text.length*(font+1)+8;if(placed.some(p=>Math.abs(p.x-pt.x)<(p.w+w)/2&&Math.abs(p.y-pt.y)<16))continue;placed.push({x:pt.x,y:pt.y,w});const cls='region-label'+(en.lit&&level==='city'?' visited-label':!en.lit?' unlit':'');const mk=L.marker(c,{icon:L.divIcon({className:cls,html:E(text),iconSize:[w,font+4],iconAnchor:[w/2,(font+4)/2]}),interactive:false,keyboard:false}).addTo(map);regionLabels.push(mk);}if(level==='shanghai')renderShanghaiFeatureLabels(placed,size);}
function capitalCoord(prov){if(MUNI.includes(prov)){const cf=(china?.features||[]).find(f=>f.properties.name===prov);return cf&&cf.properties.center?[cf.properties.center[1],cf.properties.center[0]]:null;}const cap=CAPITALS[prov];if(!cap||!cityBoundaries)return null;const f=cityBoundaries.features.find(x=>x.properties.name===cap&&x.properties.province===prov);return f&&f.properties.center?[f.properties.center[1],f.properties.center[0]]:null;}
function renderCapitals(level){if(!china)return;if(level==='province'){for(const pf of china.features){const prov=pf.properties.name;if(!prov||prov==='北京市')continue;const c=capitalCoord(prov);if(!c)continue;const mk=L.circleMarker(c,{radius:3,color:'#fff',weight:1,fillColor:colors().accent,fillOpacity:1}).addTo(map);mk.bindTooltip(E(CAPITALS[prov]||prov),{className:'atlas-tooltip',direction:'top'});overviewLayers.push(mk);}}if(level==='province'||level==='country'){const bj=capitalCoord('北京市');if(bj){const star=L.marker(bj,{icon:L.divIcon({className:'capital-star',html:'★',iconSize:[18,18],iconAnchor:[9,9]}),interactive:true}).addTo(map);star.bindTooltip('北京',{className:'atlas-tooltip',direction:'top'});overviewLayers.push(star);}}}
function drawOverview(){
 if(tiles)map.removeLayer(tiles);
 if(markerLayer)map.removeLayer(markerLayer);
 if(heatLayer)map.removeLayer(heatLayer);
 clearOverview();
 $('provider').disabled=true;
 $('provider').style.display='none';
 placeToggles.hidden=true;
 $('mapnotice').textContent='';
 $('map').classList.add('administrative');
 const level=mapLevel();
 if(level==='shanghai'){drawShanghaiOverview();return;}
 if(!china||level==='country'&&!world)return;
 map.options.zoomSnap=level==='city'||level==='province'?.25:1;
 map.setMinZoom(2);
 map.setMaxZoom(18);
 const theme=colors();
 const emphasizeProvinces=level==='city'&&highlightCityProvinces;
 const visitedProvinces=new Set(emphasizeProvinces?points.map(point=>point.province):[]);
 const background=L.geoJSON(level==='country'?world:china,{
  style:feature=>({
   stroke:!emphasizeProvinces,color:theme.mid,weight:.8,
   fillColor:visitedProvinces.has(feature.properties.name)?theme.mid:theme.soft,fillOpacity:1,
  }),
  interactive:false
 }).addTo(map);
 overviewLayers.push(background);
 if(level==='city'&&allCityBorders&&cityBoundaries){
  const cityLines=L.geoJSON(cityBoundaries,{
   style:feature=>{
    const insideVisitedProvince=visitedProvinces.has(feature.properties.province);
    return {color:insideVisitedProvince?theme.soft:theme.mid,weight:insideVisitedProvince?1.2:.5,fill:false};
   },
   onEachFeature:(f,l)=>l.bindTooltip(E(shortRegionName(f.properties.name)),{className:'atlas-tooltip',direction:'center'})
  }).addTo(map);
  overviewLayers.push(cityLines);
 }else if(level==='city'&&allCityBorders){
  $('mapnotice').textContent='正在加载全部城市边界…';
 }
 const peak=Math.max(1,...points.map(p=>p.count)),used=[];
 const sourceFeatures=level==='country'?world.features:level==='province'?china.features:cityFeatures();
 for(const p of points){
  const f=sourceFeatures.find(f=>{
   const prop=f.properties,name=prop.name||prop.ADMIN||prop.NAME;
   if(level==='country')return zhCountry(prop)===p.name;
   if(level==='city')return name===p.name&&(!p.province||prop.province===p.province);
   return name===p.name;
  });
  const intensity=Math.sqrt(p.count/peak);
  const fillColor=theme.accent;
  const fillOpacity=emphasizeProvinces?.6+.35*intensity:.25+.65*intensity;
  let layer;
  if(f)layer=L.geoJSON(f,{style:{color:emphasizeProvinces?theme.soft:theme.accent,weight:1.2,fillColor,fillOpacity}});
  else if(validCoord(p))layer=L.circleMarker([p.lat,p.lon],{radius:8,fillColor,fillOpacity:emphasizeProvinces?.95:.8,color:level==='city'?theme.soft:'#fff',weight:1});
  if(!layer)continue;
  bindMapVisit(layer,E(shortRegionName(p.name))+' · '+p.count+' 次',()=>{
   setMapFilter(p);
   const bounds=layer.getBounds?.();
   if(bounds?.isValid())map.fitBounds(bounds,{padding:[45,45],maxZoom:level==='city'?10:level==='province'?7:5});
  },{sticky:true});
  layer.addTo(map);
  overviewLayers.push(layer);
  used.push(layer);
 }
 if(level==='city'&&(emphasizeProvinces||allCityBorders&&cityBoundaries)){
  const provinceLines=L.geoJSON(china,{
   style:{color:theme.accent,weight:1,opacity:.5,fill:false},
   interactive:false,
  }).addTo(map);
  overviewLayers.push(provinceLines);
 }
 boundaryLayer=used.length?L.featureGroup(used):null;
 const levelChanged=overviewLevel!==level&&!(isDomesticLevel(overviewLevel)&&isDomesticLevel(level));
 overviewLevel=level;
 if(levelChanged)fitOverview();
 renderCapitals(level);
 renderRegionLabels();
 if(level==='city')loadVisitedCityBoundaries();
}
$('provider').onchange=()=>setProvider();map.on('zoomend',()=>{if(mapLevel()!=='place')renderRegionLabels();});map.on('moveend',()=>{if(mapLevel()!=='place')renderRegionLabels();});if($('heatmap'))$('heatmap').onchange=()=>draw();if($('aggregate'))$('aggregate').onchange=()=>draw();document.querySelectorAll('.unit-toggle [data-unit]').forEach(b=>b.onclick=()=>{$('timeunit').value=b.dataset.unit;document.querySelectorAll('.unit-toggle [data-unit]').forEach(x=>x.classList.toggle('active',x===b));syncYears();});
const narrowDrawers=typeof matchMedia==='function'?matchMedia('(max-width:1280px)'):null;
let rankDrawerOpen=true, lastOpenedDrawer='rank', drawerResizeTimer;
function resizeMapForDrawers(){
 clearTimeout(drawerResizeTimer);
 drawerResizeTimer=setTimeout(()=>map.invalidateSize(),180);
}
function drawer(open,restoreFocus=true){
 if(open&&narrowDrawers?.matches&&settingsOpen)settingsDrawer(false,false);
 rankDrawerOpen=open;
 document.body.classList.toggle('drawer-closed',!open);
 $('drawer').inert=!open;
 $('drawer').setAttribute('aria-hidden',String(!open));
 $('toggle-drawer').setAttribute('aria-expanded',String(open));
 if(open){
  lastOpenedDrawer='rank';
  renderRank();
 }
 resizeMapForDrawers();
 if(restoreFocus){
  const button=(open&&$('drawer').querySelector('.drawertabs .active'))||$('toggle-drawer');
  button.focus?.({preventScroll:true});
 }
}
$('toggle-drawer').onclick=()=>drawer(!rankDrawerOpen);
if(typeof matchMedia==='function'&&matchMedia('(max-width:650px)').matches)drawer(false,false);
narrowDrawers?.addEventListener?.('change',event=>{
 if(event.matches&&rankDrawerOpen&&settingsOpen)drawer(false,false);
});
function renderPlaces(){if(!$('place-list-details').open)return;const q=$('placesearch').value.toLowerCase(),state=$('placestate').value||'all';const pendingAllowed=state==='pending'?new Set(applyRules(source.map(e=>({...details(e),uid:e.uid,start:e.startDate?.toJSDate()||new Date(0)})),rules,true).events.flatMap(e=>e.places).map(n=>normalizePlace(baseCoords.get(normalizePlace(n))?.location||n))):null;const names=[...new Set([...reference.places.map(p=>p.location),...source.flatMap(e=>details(e).places).map(n=>baseCoords.get(normalizePlace(n))?.location||n)])].sort((a,b)=>a.localeCompare(b,'zh-CN'));const lookupCSV=baseCoords;const rows=names.map(name=>{const row=lookupCSV.get(normalizePlace(name)),p=pos(name),disabled=isClosed(row?.valid);return {name,row,p,disabled};}).filter(({name,row,p,disabled})=>(!q||[name,row?.address,row?.type,placeTypes[row?.type],row?.labels,row?.aliases].join(' ').toLowerCase().includes(q))&&(state==='all'?!isPlaceExcluded(row||{location:name},rules):(state==='closed'?disabled:state==='pending'?!p&&pendingAllowed.has(normalizePlace(name))&&!isPlaceExcluded(row||{location:name},rules):state==='exact'?p?.precision==='exact':p&&p.precision!=='exact')));$('placelist').innerHTML=rows.slice(0,placeLimit).map(({name,row,p,disabled})=>(mobileSource?'<div class="placeitem"':'<button class="placeitem" data-edit="'+E(name)+'"')+' title="'+E(row?.address||name)+'">'+(row?.type?'<span class="place-type type-icon" title="'+E((placeTypes[row.type]||row.type))+'" aria-label="'+E(placeTypes[row.type]||row.type)+'">'+E(emojiConfig.typeEmojis?.[row.type]||'📍')+'</span>':'')+'<b>'+E(name)+'</b>'+(disabled?'<span class="closed-badge" title="已停业" aria-label="已停业">🔒</span>':'')+'<span class="place-coordinates">'+E(coordinateLabel(validCoord(row)?row:p?.precision==='exact'?p:null))+'</span>'+(mobileSource?'</div>':'</button>')).join('')||'<div class="empty">无匹配地点</div>';$('placelist').querySelectorAll('[data-edit]').forEach(el=>el.onclick=()=>edit(el.dataset.edit));$('placemore').hidden=rows.length<=placeLimit;}
$('placesearch').oninput=$('placestate').onchange=()=>{placeLimit=100;renderPlaces();};$('placemore').onclick=()=>{placeLimit+=100;renderPlaces();};$('addplace').onclick=()=>edit();$('reloadplaces').onclick=async()=>{try{await reloadSource('places');}catch(e){$('status').textContent=e.message;}};
setInterval(async()=>{if(document.documentElement?.dataset?.mobile==='1'||$('editor').open||$('blacklist-editor').open||blacklistBusy||document.hidden)return;try{const r=await fetch('api/places');if(!r.ok)return;const d=await r.json();let configChanged=false;const cr=await fetch('api/config');if(cr.ok){const c=await cr.json();if(c.version!==configVersion){rules=c;emojiConfig=c.emojis;configVersion=c.version;timelineKey='';configChanged=true;renderBlacklist();}}if(d.version!==csvVersion||configChanged){csvVersion=d.version;reference.places=d.places;setupReference();cache.clear();refresh();}}catch{}},15000);

let brush=null;const track=$('brushtrack');track.onpointerdown=e=>{const rect=track.getBoundingClientRect(),min=+$('yearfrom').min,max=+$('yearfrom').max,n=max-min+1;const cursor=Math.max(min,Math.min(max,min+Math.floor((e.clientX-rect.left)/rect.width*n)));const id=e.target.id,mode=id==='brushleft'?'left':id==='brushright'?'right':(e.target===track?'new':'move');brush={x:e.clientX,step:rect.width/n,a:+$('yearfrom').value,b:+$('yearto').value,min,max,mode,cursor};track.setPointerCapture(e.pointerId);e.preventDefault();if(mode==='new')selectPeriods(cursor,cursor);};track.onpointermove=e=>{if(!brush)return;const t=brush,d=Math.round((e.clientX-t.x)/t.step);let a=t.a,b=t.b;if(t.mode==='left')a=Math.max(t.min,Math.min(b,t.a+d));else if(t.mode==='right')b=Math.min(t.max,Math.max(a,t.b+d));else if(t.mode==='new'){const k=Math.max(t.min,Math.min(t.max,t.cursor+d));a=Math.min(t.cursor,k);b=Math.max(t.cursor,k);}else{const shift=Math.max(t.min-t.a,Math.min(t.max-t.b,d));a+=shift;b+=shift;}if(a!==+$('yearfrom').value||b!==+$('yearto').value)selectPeriods(a,b);};track.onpointerup=track.onpointercancel=()=>brush=null;for(const [id,side] of [['brushleft','left'],['brushright','right']])$(id).onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();let a=+$('yearfrom').value,b=+$('yearto').value;const min=+$('yearfrom').min,max=+$('yearfrom').max,delta=e.key==='ArrowRight'?1:-1;if(side==='left')a=e.key==='Home'?min:e.key==='End'?b:Math.max(min,Math.min(b,a+delta));else b=e.key==='End'?max:e.key==='Home'?a:Math.min(max,Math.max(a,b+delta));selectPeriods(a,b);};

function isMainland(lat,lon){if(!china||lon<72||lon>136||lat<17||lat>55)return false;return china.features.some(f=>!['香港特别行政区','澳门特别行政区','台湾省'].includes(f.properties.name)&&containsPoint(geometryPolygons(f.geometry),lon,lat));}

function applyTheme(key){
 currentTheme=resolveTheme(key);
 const theme=colors();
 for(const [tone,value] of Object.entries(theme)){
  if(tone!=='name')document.body.style.setProperty('--'+(tone==='dark'?'deep':tone),value);
 }
 document.querySelector('meta[name="theme-color"]')?.setAttribute('content',theme.canvas);
 document.body.setAttribute('data-theme',currentTheme);
 localStorage.setItem('atlas-theme',currentTheme);
 $('theme-current').innerHTML='<span class="theme-current-swatch" style="background:'+theme.accent+'" aria-hidden="true"></span>'+E(theme.name);
 document.querySelectorAll('[data-theme-choice]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.themeChoice===currentTheme)));
 if(china)draw();
}
const themeTones=[['canvas','画布'],['soft','浅色'],['mid','中色'],['dark','深色'],['highlight','对比色']];
function renderThemeOptions(){
 $('theme-options').innerHTML=Object.entries(palettes).map(([key,theme])=>{
 const samples=themeTones.map(([tone,label])=>
  '<span class="theme-sample"><span class="theme-swatch" style="background:'+theme[tone]+'" aria-hidden="true"></span>'+
  '<span>'+label+'</span><span class="theme-hex">'+theme[tone].toUpperCase()+'</span></span>'
 ).join('');
 return '<button type="button" data-theme-choice="'+key+'" aria-pressed="'+(key===currentTheme)+'">'+
  '<span class="theme-identity"><span class="theme-swatch theme-main-swatch" style="background:'+theme.accent+'" aria-hidden="true"></span>'+
  '<span><strong>'+E(theme.name)+'</strong><span class="theme-hex">'+theme.accent.toUpperCase()+'</span></span></span>'+
  '<span class="theme-samples">'+samples+'</span></button>';
 }).join('');
 $('theme-options').querySelectorAll('[data-theme-choice]').forEach(button=>button.onclick=()=>applyTheme(button.dataset.themeChoice));
}
for(const [id,render] of [['place-list-details',renderPlaces],['rule-list-details',renderBlacklist],['theme-list-details',renderThemeOptions]]){
 $(id).ontoggle=()=>{if($(id).open)render();};
}
function collapseSection(key){const closed=Boolean(collapsedSections[key]);$(key+'-body').hidden=closed;const button=$('collapse-'+key);button.setAttribute('aria-expanded',String(!closed));button.querySelector('.section-chevron')?.replaceChildren(document.createTextNode(closed?'▸':'▾'));if(key==='map'&&!closed)setTimeout(()=>{map.invalidateSize();fitPoints();},50);}
for(const key of ['map','timeline','eventlist']){$('collapse-'+key).onclick=()=>{collapsedSections[key]=!collapsedSections[key];localStorage.setItem('atlas-sections',JSON.stringify(collapsedSections));collapseSection(key);};collapseSection(key);}applyTheme(currentTheme);

function settingsDrawer(open,restoreFocus=true){
 if(open&&narrowDrawers?.matches&&rankDrawerOpen)drawer(false,false);
 settingsOpen=open;
 if(open)lastOpenedDrawer='settings';
 if(open&&activePanel==='manage')renderPlaces();
 document.body.classList.toggle('settings-open',open);
 $('settings-drawer').inert=!open;
 $('settings-drawer').setAttribute('aria-hidden',String(!open));
 $('toggle-settings').setAttribute('aria-expanded',String(open));
 resizeMapForDrawers();
 if(restoreFocus){
  const button=(open&&$('settings-drawer').querySelector('.settings-tabs .active'))||$('toggle-settings');
  button.focus?.({preventScroll:true});
 }
}
$('toggle-settings').onclick=()=>settingsDrawer(!settingsOpen);
document.addEventListener?.('keydown',e=>{
 if(e.key!=='Escape'||document.querySelector('dialog[open],.annual-overlay:not([hidden])'))return;
 if(settingsOpen&&(!rankDrawerOpen||lastOpenedDrawer==='settings'))settingsDrawer(false);
 else if(rankDrawerOpen)drawer(false);
});

function showDataTime(key,value){
 const date = value ? new Date(value) : null;
 $(sourceTimeIds[key]).textContent = date && !isNaN(date) ? date.toLocaleString('zh-CN',{hour12:false}) : '—';
}
async function updateDataTimes(keys=Object.keys(sourceTimeIds)){
 try{
  const response=await fetch('api/meta',{cache:'no-store'});
  if(!response.ok)return;
  const times=await response.json();
  for(const key of keys)showDataTime(key,times[key]);
 }catch{}
}
async function fetchCalendar(){
 const response=await fetch('api/calendar',{cache:'no-store'});
 if(!response.ok)throw Error('日历读取失败');
 const modified=response.headers?.get('Last-Modified');
 if(modified)showDataTime('calendar',modified);
 return response.text();
}
async function readCalendar(keepRange=false){
 load(await fetchCalendar(),keepRange);
}
async function reloadSource(key){
 if(key==='calendar')await readCalendar(true);
 if(key==='places'){
  await readCSV();
  refresh();
 }
 if(key==='blacklist'){
  await readConfigFiles();
  renderBlacklist();
  timelineKey='';
  refresh();
 }
 await updateDataTimes([key]);
}
document.querySelectorAll('[data-meta]').forEach(button=>{
 const key=button.dataset.meta;
 const {label:sourceLabel,accept,route}=importTypes[key];
 const label=mobileImport?'更新'+sourceLabel:button.getAttribute('aria-label');
 async function update(file){
  const status=$('meta-status');
  button.disabled=true;
  status.textContent=label+'中…';
  try{
   if(file){
    const result=await fetch('api/'+route,{method:'PUT',body:await file.text()});
    if(!result.ok)throw Error((await result.json()).error||'文件保存失败');
   }
   await reloadSource(key);
   status.textContent=label+'成功';
  }catch(error){
   status.textContent=label+'失败：'+error.message;
  }finally{
   button.disabled=false;
  }
 }
 if(!mobileImport){
  button.onclick=()=>update();
  return;
 }
 const input=document.createElement('input');
 input.type='file';
 input.accept=accept;
 input.hidden=true;
 input.dataset.upload=key;
 input.onchange=()=>{
  const file=input.files[0];
  input.value='';
  if(file)void update(file);
 };
 button.after(input);
 button.textContent='+';
 button.title=label;
 button.setAttribute('aria-label',label);
 button.onclick=()=>input.click();
});

async function loadCityBoundaries(){
 if(cityBoundaries)return;
 cityBoundaryRequest??=fetch('data/city-boundaries.json').then(async response=>{
  if(!response.ok)throw Error('城市边界读取失败');
  cityBoundaries=await response.json();
  cities=cityBoundaries.features.map(f=>f.properties).filter(p=>p.center);
  setupGaz();
  cache.clear();
 }).finally(()=>{cityBoundaryRequest=null;});
 await cityBoundaryRequest;
}
function cityFeatures(){
 return cityBoundaries?.features||[...cityBoundaryParts.values()].flatMap(part=>part.features);
}
let visitedCityRequest;
function loadVisitedCityBoundaries(){
 if(cityBoundaries||visitedCityRequest)return;
 const needIndex=!cities.length;
 const loadIndex=async()=>{
  if(!needIndex)return;
  cityIndexRequest??=fetch('data/city-index.json').then(async response=>{
   if(!response.ok)throw Error('城市索引读取失败');
   cities=await response.json();
   setupGaz();
   cache.clear();
  }).finally(()=>{cityIndexRequest=null;});
  await cityIndexRequest;
 };
 visitedCityRequest=(async()=>{
  await loadIndex();
  if(cityBoundaries||mapLevel()!=='city')return false;
  const names=new Set(counts('places').map(([name])=>pos(name)?.province));
  const codes=china.features.filter(f=>names.has(f.properties.name))
   .map(f=>String(f.properties.adcode).slice(0,2))
   .filter(code=>!cityBoundaryParts.has(code));
  await Promise.all(codes.map(async code=>{
   const response=await fetch('data/cities/'+code+'.json');
   if(response.status===404){cityBoundaryParts.set(code,{features:[]});return;}
   if(!response.ok)throw Error('已到访城市边界读取失败');
   cityBoundaryParts.set(code,await response.json());
  }));
  return needIndex||codes.length>0;
 })().then(changed=>{
  visitedCityRequest=null;
  if(changed){
   cache.clear();
   if(mapLevel()==='city'){buildPoints();drawOverview();}
  }
 }).catch(error=>{
  visitedCityRequest=null;
  if(mapLevel()==='city')$('mapnotice').textContent=error.message;
 });
}
function annualYears(){
 const ys=source.map(e=>e.startDate?.toJSDate().getFullYear()).filter(Number.isFinite);
 const now=new Date().getFullYear();
 return ys.length?{min:Math.min(...ys),max:Math.max(now,...ys)}:{min:now,max:now};
}
let annualAvailableYears=[];
function renderAnnualYearSelect(year,custom){
 const years=[...new Set([year,...annualAvailableYears])].sort((a,b)=>b-a);
 const select=$('annual-year-select');
 select.innerHTML=(custom?'<option value="" disabled>跨年统计</option>':'')+
  years.map(value=>'<option value="'+value+'">'+value+' 年度回顾</option>').join('');
 select.value=custom?'':String(year);
}
function reviewEvents(from,to){
 const events=expand(source,from,to,$('recurring').checked).events;
 return applyRules(events,rules,$('exclude').checked,new Set()).events.filter(e=>e.start>=from&&e.start<=to);
}
function summarizeReview(events){
 const days=new Set(),places=new Map(),partners=new Set();
 for(const event of events){
  const d=event.start;
  days.add(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));
  for(const name of new Set(event.places))places.set(name,(places.get(name)||0)+1);
  for(const name of event.partners)partners.add(name);
 }
 return {days:days.size,places,partners:partners.size};
}
const reviewDateFormat=date=>date.getFullYear()+'年'+(date.getMonth()+1)+'月'+date.getDate()+'日';
function reviewPeriod(from,to,custom){
 const start=new Date(from+'T00:00:00'),end=new Date(to+'T23:59:59.999');
 if(!from||!to||isNaN(start)||isNaN(end)||start>end)return null;
 const heading=custom?'跨年统计':start.getFullYear()+' 年度回顾';
 const filename=custom?'跨年统计_'+from+'_'+to:start.getFullYear()+'-年度回顾';
 return {start,end,heading,filename,custom,dates:custom?reviewDateFormat(start)+' – '+reviewDateFormat(end):''};
}
function previousReviewYear(date){
 const year=date.getFullYear()-1,month=date.getMonth();
 const day=Math.min(date.getDate(),new Date(year,month+1,0).getDate());
 return new Date(year,month,day,date.getHours(),date.getMinutes(),date.getSeconds(),date.getMilliseconds());
}
let shanghaiLandmarks,shanghaiLandmarkRequest,shanghaiBase,shanghaiLayerControl,domesticLayerControl;
function createMapLayerMenu(className,options,isChecked,onChange){
 const control=L.DomUtil.create('details','leaflet-control map-layer-control '+className);
 control.hidden=true;
 control.innerHTML='<summary>图层</summary><div>'+options.map(([key,label,group])=>
  '<label><input type="'+(group?'radio':'checkbox')+'" name="'+(group||key)+'"'+
  (group?' value="'+key+'"':'')+'> '+label+'</label>').join('')+'</div>';
 const optionKey=input=>input.type==='radio'?input.value:input.name;
 for(const input of control.querySelectorAll('input'))input.checked=isChecked(optionKey(input));
 control.addEventListener('change',event=>{
  onChange(optionKey(event.target),event.target.checked);
  draw();
 });
 L.DomEvent.disableClickPropagation(control);
 L.DomEvent.disableScrollPropagation(control);
 return control;
}
const placeLayerMenu=L.control({position:'topright'});
placeLayerMenu.onAdd=()=>{
 placeToggles=createMapLayerMenu('place-layer-control',[['heatmap','热力图'],['aggregate','聚合']],
  name=>$(name).checked,(name,checked)=>{$(name).checked=checked;});
 return placeToggles;
};
placeLayerMenu.addTo(map);
const domesticLayerMenu=L.control({position:'topright'});
domesticLayerMenu.onAdd=()=>{
 domesticLayerControl=createMapLayerMenu('domestic-layer-control',
  [['province','按省份','domestic-view'],['city','按城市','domestic-view'],
   ['all-boundaries','全部边界'],['highlight-provinces','高亮到访省份']],
  key=>key==='all-boundaries'?allCityBorders:key==='highlight-provinces'?highlightCityProvinces:key===domesticLevel,
  (name,checked)=>{
   if(isDomesticLevel(name)){
    domesticLevel=name;
    buildPoints();
    return;
   }
   if(name==='highlight-provinces'){
    highlightCityProvinces=checked;
    return;
   }
   allCityBorders=checked;
   if(!checked||cityBoundaries)return;
   loadCityBoundaries().then(()=>{
    if(mapLevel()==='city'){buildPoints();draw();}
   }).catch(error=>{
    allCityBorders=false;
    domesticLayerControl.querySelector('[name="all-boundaries"]').checked=false;
    if(mapLevel()==='city')$('mapnotice').textContent=error.message;
   });
  });
 return domesticLayerControl;
};
domesticLayerMenu.addTo(map);
const shanghaiToggles=L.control({position:'topright'});
shanghaiToggles.onAdd=()=>{
 shanghaiLayerControl=createMapLayerMenu('shanghai-layer-control',
  [['metro','轨道交通'],['roads','主要道路'],['boundaries','区行政边界'],['landmarks','主要地标']],
  name=>shanghaiLayerOptions[name],(name,checked)=>{
   shanghaiLayerOptions[name]=checked;
   localStorage.setItem('atlas-shanghai-layers',JSON.stringify(shanghaiLayerOptions));
  });
 return shanghaiLayerControl;
};
shanghaiToggles.addTo(map);
async function loadShanghaiLandmarks(){
 if(shanghaiLandmarks)return;
 shanghaiLandmarkRequest??=fetch('data/shanghai-landmarks.json').then(async response=>{
  if(!response.ok)throw Error('上海地图数据读取失败');
  shanghaiLandmarks=await response.json();
 }).finally(()=>{shanghaiLandmarkRequest=null;});
 await shanghaiLandmarkRequest;
}
const shanghaiAttribution='<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">'+mapAttribution+'</a>';
const shanghaiLabelZoom=14,shanghaiStationZoom=14;
function createShanghaiStations(data){
 const routes=new Map(data.metro.map(line=>[line.ref,line]));
 return L.layerGroup(data.stations.flatMap(({name,platforms})=>platforms.map(({ref,coordinates:[lon,lat]})=>{
  const {name:lineName,color}=routes.get(ref);
  return L.circleMarker([lat,lon],{radius:3,color,weight:1,fillColor:'#fff',fillOpacity:1})
   .bindTooltip(E(name)+' · '+E(lineName),{direction:'top',offset:[0,-4]});
 })));
}
function syncShanghaiStations(){
 const stations=shanghaiBase?.stations;
 if(!stations)return;
 const zoom=map.getZoom();
 const visible=mapLevel()==='shanghai'&&shanghaiLayerOptions.metro&&zoom>=shanghaiStationZoom;
 if(visible&&!map.hasLayer(stations)){
  stations.addTo(map);
  shanghaiBase.visits?.eachLayer(marker=>marker.bringToFront());
 }
 if(!visible&&map.hasLayer(stations))stations.remove();
}
function renderShanghaiFeatureLabels(placed,size){
 if(!shanghaiLandmarks)return;
 const zoom=map.getZoom();
 if(shanghaiLayerOptions.metro&&zoom>=shanghaiStationZoom&&shanghaiBase){
  shanghaiBase.stations.eachLayer(marker=>{
   const {x,y}=map.latLngToContainerPoint(marker.getLatLng());
   if(x>=0&&x<=size.x&&y>=0&&y<=size.y)placed.push({x,y,w:8,h:8});
  });
 }
 const available=({x,y,w,h})=>x>w/2+4&&x<size.x-w/2-4&&y>h/2+4&&y<size.y-h/2-4&&
  !placed.some(p=>Math.abs(p.x-x)<(p.w+w)/2+4&&Math.abs(p.y-y)<((p.h||16)+h)/2+2);
 function addLabel(name,point,angle,box,className){
  placed.push(box);
  const icon=L.divIcon({className:'shanghai-feature-label '+className,
   html:'<span style="transform:translate(-50%,-50%) rotate('+angle+'deg)">'+E(name)+'</span>',
   iconSize:[0,0],iconAnchor:[0,0]});
  regionLabels.push(L.marker(map.containerPointToLatLng(point),{icon,interactive:false,keyboard:false}).addTo(map));
 }
 if(shanghaiLayerOptions.landmarks){
  for(const {name,coordinates:[lon,lat]} of shanghaiLandmarks.landmarks){
   const {x,y}=map.latLngToContainerPoint([lat,lon]);
   const box={x,y:y-13,w:name.length*11+6,h:13};
   if(available(box))addLabel(name,[x,y-13],0,box,'landmark-label');
  }
 }
 if(zoom>=13)for(const {name,lines} of shanghaiLandmarks.rivers)addLineLabel(name,lines,'river-label');
 if(zoom<shanghaiLabelZoom)return;
 if(shanghaiLayerOptions.metro){
  for(const {name,lines,sharedLines,branching} of shanghaiLandmarks.metro){
   if(branching){
    for(const line of lines)addLineLabel(name,[line],'rail-label');
   }else if(!addLineLabel(name,lines,'rail-label')){
    addLineLabel(name,sharedLines,'rail-label');
   }
  }
 }
 if(shanghaiLayerOptions.roads){
  const features=shanghaiLandmarks.features;
  for(const {name,lines} of [...features.filter(f=>f.crossing),...features.filter(f=>!f.crossing)]){
   addLineLabel(name,lines,'road-label');
  }
 }
 function addLineLabel(name,lines,className){
  const w=name.length*11+4,h=13;
  let best, distance=Infinity;
  for(const line of lines){
   let prev=map.latLngToContainerPoint([line[0][1],line[0][0]]);
   for(let i=1;i<line.length;i++){
    const [lon,lat]=line[i];
    const next=map.latLngToContainerPoint([lat,lon]);
    const dx=next.x-prev.x,dy=next.y-prev.y;
    const from=prev;
    prev=next;
    const length=Math.hypot(dx,dy);
    if(length<10)continue;
    const t=Math.max(.15,Math.min(.85,((size.x/2-from.x)*dx+(size.y/2-from.y)*dy)/length**2));
    const x=from.x+t*dx,y=from.y+t*dy;
    const box={x,y,w:(w*Math.abs(dx)+h*Math.abs(dy))/length,h:(w*Math.abs(dy)+h*Math.abs(dx))/length};
    const score=Math.hypot(x-size.x/2,y-size.y/2);
    if(score>=distance||!available(box))continue;
    const angle=(Math.atan2(dy,dx)*180/Math.PI+270)%180-90;
    best={x,y,angle,box};
    distance=score;
   }
  }
  if(best)addLabel(name,[best.x,best.y],best.angle,best.box,className);
  return Boolean(best);
 }
}
function drawShanghaiOverview(){
 if(!china||!cityBoundaries||!shanghaiLandmarks)return;
 overviewLevel='shanghai';
 $('map').classList.add('shanghai-overview');
 map.setMinZoom(7);
 map.setMaxZoom(18);
 if(!shanghaiBase){
  const features=shanghaiDistricts(cityBoundaries);
  const districts={type:'FeatureCollection',features};
  const districtOptions={coordsToLatLng:([lon,lat])=>L.latLng(...gcjToWgs(lat,lon)),interactive:false};
  const land=L.geoJSON(districts,{...districtOptions,style:{stroke:false,fillOpacity:1}});
  const borders=L.geoJSON(districts,{...districtOptions,style:{weight:.8,dashArray:'4 4',fill:false}});
  const toLatLng=lines=>lines.map(line=>line.map(([lon,lat])=>[lat,lon]));
  const {waterAreas,features:landmarks}=shanghaiLandmarks;
  const water=L.layerGroup(waterAreas.map(rings=>L.polygon(toLatLng(rings),{
    color:'#a7bdcc',weight:.5,fillColor:'#a7bdcc',fillOpacity:1,interactive:false
   })),{attribution:shanghaiAttribution});
  const roads=L.featureGroup(landmarks.filter(({kind,crossing})=>kind==='road'&&!crossing)
   .map(({lines})=>L.polyline(toLatLng(lines),{weight:2.1,opacity:.9,interactive:false})));
  const crossings=L.featureGroup(landmarks.filter(({crossing})=>crossing)
   .map(({name,lines,crossing})=>L.polyline(toLatLng(lines),{
    weight:2.1,opacity:.9,dashArray:crossing==='tunnel'?'3 3':null
   }).bindTooltip(E(name),{sticky:true})));
  const metro=L.layerGroup(shanghaiMetroLayers(shanghaiLandmarks).map(({name,color,lines,shared,railway,dashArray})=>{
   const striped=shared||railway;
   return L.polyline(toLatLng(lines),{
    color,weight:striped?2.1:1.65,opacity:striped?1:.85,lineCap:striped?'butt':'round',dashArray
   }).bindTooltip(E(name),{sticky:true});
  }));
  const stations=createShanghaiStations(shanghaiLandmarks);
  const symbols={airport:'✈',station:'<span class="shanghai-rail-station-symbol" aria-hidden="true"></span>',attraction:'◆'};
  const landmarksLayer=L.layerGroup(shanghaiLandmarks.landmarks.map(({name,kind,coordinates:[lon,lat]})=>{
   const icon=L.divIcon({className:'shanghai-landmark-icon '+kind,html:symbols[kind],iconSize:[13,13],iconAnchor:[6.5,6.5]});
   return L.marker([lat,lon],{icon}).bindTooltip(E(name),{direction:'right'});
  }));
  shanghaiBase={land,borders,water,roads,crossings,metro,stations,landmarks:landmarksLayer};
 }
 const {land,borders,water,roads,crossings,metro,landmarks}=shanghaiBase;
 const theme=colors();
 land.setStyle({fillColor:theme.soft});
 borders.setStyle({color:theme.mid});
 roads.setStyle({color:theme.mid});
 crossings.setStyle({color:theme.mid});
 const layers=[land];
 if(shanghaiLayerOptions.boundaries)layers.push(borders);
 layers.push(water);
 if(shanghaiLayerOptions.roads)layers.push(roads,crossings);
 if(shanghaiLayerOptions.metro)layers.push(metro);
 if(shanghaiLayerOptions.landmarks)layers.push(landmarks);
 for(const layer of layers)layer.addTo(map);
 overviewLayers.push(...layers);
 boundaryLayer=land;
 const places=new Map(counts('places'));
 const mapPlaces=annualVisits(places.keys()).shanghaiPoints;
 const dots=L.layerGroup();
 for(const {name,lat,lon} of mapPlaces){
  const count=places.get(name);
  const marker=L.circleMarker([lat,lon],{
   radius:4.5,color:'#fff',weight:1,fillColor:theme.accent,fillOpacity:1
  });
  bindMapVisit(marker,E(name)+' · '+count+' 次',()=>setEntityFilter('places',name));
  dots.addLayer(marker);
 }
 dots.addTo(map);
 shanghaiBase.visits=dots;
 overviewLayers.push(dots);
 renderRegionLabels();
}
const provinceCities=new Set(['北京市','上海市','天津市','重庆市','香港特别行政区','澳门特别行政区']);
function annualVisits(names){
 const visits={provinces:new Set(),cities:new Set(),cityPoints:new Map(),shanghaiPoints:[],shanghaiUnlocated:0};
 const provinceNames=china.features.map(f=>f.properties.name).filter(Boolean);
 for(const name of names){
  const row=baseCoords.get(normalizePlace(name));
  const position=pos(name);
  const region={country:row?.country,province:row?.province,city:row?.city,...position};
  const province=provinceNames.find(n=>n===region.province||shortRegionName(n)===shortRegionName(region.province));
  const shanghaiAddress=/^(?:中国\s*)?(?:上海市|上海(?=\s|[^\s]{1,6}区))/.test(row?.address?.trim()||'');
  const inShanghai=(!region.country||region.country==='中国')&&(province===shanghaiName||
   !province&&(shortRegionName(region.city)===shortRegionName(shanghaiName)||/^31\d{4}$/.test(row?.adcode||'')||shanghaiAddress));
  if(inShanghai){
   if(position?.precision==='exact')visits.shanghaiPoints.push({name,lat:position.lat,lon:position.lon});
   else visits.shanghaiUnlocated++;
  }
  if(!province||region.country&&region.country!=='中国')continue;
  visits.provinces.add(province);
  if(!region.city)continue;
  if(provinceCities.has(province)){
   visits.cities.add(cityKey(province,province));
   continue;
  }
  const candidates=cityBoundaries.features.filter(f=>f.properties.province===province);
  const feature=candidates.find(f=>f.properties.name===region.city)
   ||candidates.find(f=>f.properties.level==='city'&&shortRegionName(f.properties.name)===shortRegionName(region.city));
  const key=cityKey(province,feature?.properties.name||region.city);
  if(feature){
   visits.cities.add(key);
  }else if(position?.precision==='exact'){
   visits.cities.add(key);
   visits.cityPoints.set(key,position);
  }
 }
 return visits;
}
function annualStats(period){
 const {start,end,custom}=period,evs=reviewEvents(start,end);
 const {days,places,partners}=summarizeReview(evs);
 const months=Array(12).fill(0);
 for(const {start} of evs)months[start.getMonth()]++;
 const visits=annualVisits(places.keys());
 const shanghaiPoints=shanghaiMapPlaces(cityBoundaries,visits.shanghaiPoints,reviewMapOptions.includeChongming);
 const stats=[['事件',evs.length],['记录天数',days],['到访地点',places.size],['同伴',partners]];
 if(!custom){
  ensureTimeline();
  const earlierPlaces=new Set(timelineEvents.filter(e=>e.start<start).flatMap(e=>e.places));
  const newPlaces=[...places.keys()].filter(name=>!earlierPlaces.has(name)).length;
  const delta=evs.length-reviewEvents(previousReviewYear(start),previousReviewYear(end)).length;
  stats[0]=['事件',evs.length,'('+(delta>0?'+':'')+delta+')','较上年事件数变化'];
  stats[2]=['到访地点/新地点',places.size,'('+newPlaces+')'];
 }
 return {
  ...period,months,visits,shanghaiPoints,stats,
  monthTitle:start.getFullYear()!==end.getFullYear()?'月度分布（按月份汇总）':'月度分布',
  shanghaiCoverage:'已标注'+shanghaiPoints.length+'个地点',
  shanghaiNote:visits.shanghaiUnlocated?visits.shanghaiUnlocated+' 个地点缺少精确坐标':'',
  coverage:visits.provinces.size+' 个省份 · '+visits.cities.size+' 个城市',
  top:[...places].sort((a,b)=>b[1]-a[1]).slice(0,5)
 };
}
function closeAnnual(){
 $('annual-review').hidden=true;
 $('annual').focus();
}
function reviewStatCards(stats){
 return stats.map(([label,value,detail,help])=>'<div class="annual-stat"><b>'+value
  +(detail?' <small'+(help?' title="'+E(help)+'" aria-label="'+E(help+' '+detail)+'"':'')+'>'+E(detail)+'</small>':'')
  +'</b><span>'+E(label)+'</span></div>').join('');
}
function editMetroExpense(filename){
 const expense=$('annual-metro-expense'),button=$('annual-metro-edit'),key='atlas-metro-expense:'+filename;
 let amount='';
 try{amount=localStorage.getItem(key)||'';}catch{}
 const display=()=>{
  expense.hidden=true;
  button.hidden=false;
  button.textContent=amount||'—';
  button.setAttribute('aria-label',amount?'编辑地铁费用，当前 '+amount+' 元':'点击填写地铁费用');
 };
 display();
 button.onclick=()=>{
  button.hidden=true;
  expense.hidden=false;
  expense.value=amount;
  expense.focus();
 };
 expense.onblur=()=>{
  if(expense.hidden)return;
  if(expense.validity?.valid===false){
   $('annual-status').textContent='金额须为非负数且最多两位小数，已保留原值。';
  }else{
   amount=expense.value;
   $('annual-status').textContent='';
   try{if(amount)localStorage.setItem(key,amount);else localStorage.removeItem(key);}catch{}
  }
  display();
 };
 expense.onkeydown=event=>{
  if(event.key!=='Enter'&&event.key!=='Escape')return;
  event.stopPropagation();
  event.preventDefault();
  if(event.key==='Escape')expense.value=amount;
  expense.blur();
  button.focus();
 };
 return ()=>amount;
}
function renderAnnual(year){
 const overlay=$('annual-review');
 overlay.dataset.year=year;
 const custom=overlay.dataset.mode==='range';
 const bounds=annualYears();
 $('annual-prev').disabled=year<=bounds.min;
 $('annual-next').disabled=year>=bounds.max;
 $('annual-prev').hidden=$('annual-next').hidden=custom;
 $('annual-range-controls').hidden=!custom;
 $('annual-mode').textContent=custom?'返回年度回顾':'跨年统计';
 $('annual-mode').setAttribute('aria-pressed',String(custom));
 $('annual-title').textContent=custom?'跨年统计':year+' 年度回顾';
 renderAnnualYearSelect(year,custom);
 $('annual-status').textContent='';
 const period=custom?reviewPeriod($('annual-range-from').value,$('annual-range-to').value,true)
  :reviewPeriod(year+'-01-01',year+'-12-31',false);
 if(!period){
  $('annual-body').innerHTML='<p class="annual-note">请选择有效的起止日期，结束日期须不早于开始日期。</p>';
  $('annual-export').disabled=true;
  $('annual-export').onclick=null;
  return;
 }
 const report=annualStats(period);
 const topPlaces=new Set(report.top.map(([name])=>name));
 const highlight=report.shanghaiPoints.some(place=>topPlaces.has(place.name));
 const peak=Math.max(1,...report.months);
 const bars=report.months.map((v,i)=>'<div class="annual-mbar" title="'+(i+1)+'月 · '+v+' 次"><strong>'+v+'</strong><i style="height:'+v/peak*108+'px"></i><span>'+(i+1)+'</span></div>').join('');
 const rows=items=>items.map(([name,total])=>'<div class="annual-row"><span class="annual-name" title="'+E(name)+'">'+E(name)+'</span><b>'+total+'</b></div>').join('')||'<div class="empty">—</div>';
 const palette=colors();
 const toggle=(id,key,label,position='')=>'<label class="annual-map-toggle'+(position?' '+position:'')+'">'
  +'<input id="'+id+'" type="checkbox"'+(reviewMapOptions[key]?' checked':'')+'>'+label+'</label>';
 const emphasizeNumbers=text=>text.split(/(\d+)/).map((part,i)=>i%2?'<strong>'+part+'</strong>':E(part)).join('');
 $('annual-body').innerHTML='<div class="annual-map-head"><h3>全国足迹：<span>'+emphasizeNumbers(report.coverage)+'</span></h3>'
  +'<div class="annual-legend">'+annualLegend.map((label,i)=>'<span><i style="background:'+E([palette.soft,palette.mid,palette.accent][i])+'"></i>'+label+'</span>').join('')
  +'</div></div><div class="annual-map-frame"><canvas id="annual-map" role="img" aria-label="'+E('全国足迹，'+report.coverage)+'"></canvas>'
  +'<div class="annual-national-toggles">'+toggle('annual-include-south-china-sea','includeSouthChinaSea','南海诸岛')
  +toggle('annual-focus-visited','focusVisitedCities','聚焦到访城市')+'</div></div>'
  +'<div class="annual-map-head"><h3>上海足迹：<span>'+emphasizeNumbers(report.shanghaiCoverage)+'</span></h3><span class="annual-map-credit">'+shanghaiAttribution+'</span></div>'
  +'<div class="annual-map-frame"><canvas id="annual-shanghai-map" role="img" aria-label="'+E('上海足迹，'+report.shanghaiCoverage)+'"></canvas>'
  +toggle('annual-include-chongming','includeChongming','崇明区')
  +toggle('annual-inner-ring','innerRing','内环','annual-map-toggle-east')+'</div>'
  +(report.shanghaiNote?'<p class="annual-note">'+E(report.shanghaiNote)+'</p>':'')+'<div class="annual-stats'+(custom?' annual-stats-range':'')+'">'
  +reviewStatCards(report.stats)
  +(custom?'':'<div class="annual-stat annual-expense"><b><button id="annual-metro-edit" type="button">—</button>'
   +'<input id="annual-metro-expense" type="number" min="0" step="0.01" inputmode="decimal" aria-label="地铁费用（元）" hidden></b><span>地铁费用（元）</span></div>')
  +'</div><div class="annual-summary"><section><h3>'+report.monthTitle+'</h3><div class="annual-months">'+bars+'</div></section>'
  +'<section><h3>'+(highlight?'<i class="annual-top-dot" style="background:'+palette.highlight+'" aria-hidden="true"></i>':'')
  +'常去地点 Top 5</h3>'+rows(report.top)+'</section></div>';
 const nationalMap=$('annual-map'), shanghaiMap=$('annual-shanghai-map');
 drawAnnualMap(nationalMap,china,cityBoundaries,report.visits,palette,reviewMapOptions.includeSouthChinaSea,reviewMapOptions.focusVisitedCities);
 const markers=drawShanghaiMap(shanghaiMap,cityBoundaries,shanghaiLandmarks,report.shanghaiPoints,
  {includeChongming:reviewMapOptions.includeChongming,innerRing:reviewMapOptions.innerRing,topPlaces,palette});
 for(const [id,key] of [['annual-focus-visited','focusVisitedCities'],['annual-include-south-china-sea','includeSouthChinaSea'],['annual-include-chongming','includeChongming'],['annual-inner-ring','innerRing']]){
  const control=$(id);
  control.checked=reviewMapOptions[key];
  control.onchange=()=>{
   reviewMapOptions[key]=control.checked;
   try{localStorage.setItem('atlas-review-map-options',JSON.stringify(reviewMapOptions));}catch{}
   renderAnnual(year);
   $(id).focus?.({preventScroll:true});
  };
 }
 shanghaiMap.onpointermove=event=>{
  const xScale=shanghaiMap.clientWidth/shanghaiMap.width, yScale=shanghaiMap.clientHeight/shanghaiMap.height;
  const names=markers.filter(({x,y})=>Math.hypot(x*xScale-event.offsetX,y*yScale-event.offsetY)<=5).map(p=>p.name);
  shanghaiMap.title=[...new Set(names)].join('\n');
 };
 shanghaiMap.onpointerleave=()=>{shanghaiMap.title='';};
 const amount=custom?null:editMetroExpense(period.filename);
 $('annual-export').disabled=false;
 $('annual-export').onclick=()=>{
  const stats=amount?[...report.stats,['地铁费用（元）',amount()]]:report.stats;
  return exportAnnual({...report,stats,highlight},nationalMap,shanghaiMap,palette);
 };
}
async function exportAnnual(report,nationalMap,shanghaiMap,palette){
 const status=$('annual-status');
 try{
  const image=document.createElement('canvas');
  drawAnnualImage(image,report,nationalMap,shanghaiMap,palette);
  const png=await new Promise(resolve=>image.toBlob(resolve,'image/png'));
  if(!png)throw Error('PNG 编码失败');
  const url=URL.createObjectURL(png);
  const link=document.createElement('a');
  link.download=report.filename+'.png';
  link.href=url;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  status.textContent='已生成 PNG 图片';
 }catch{
  status.textContent='图片导出失败，请重试';
 }
}
async function openAnnualReview(year){
 const overlay=$('annual-review');
 overlay.hidden=false;
 overlay.dataset.mode='year';
 $('annual-range-controls').hidden=true;
 $('annual-close').focus();
 $('annual-title').textContent=year+' 年度回顾';
 renderAnnualYearSelect(year,false);
 $('annual-body').textContent='';
 for(const id of ['annual-prev','annual-next','annual-export','annual-mode','annual-year-select'])$(id).disabled=true;
 $('annual-status').textContent='正在加载地图边界…';
 try{
  await Promise.all([loadCityBoundaries(),loadShanghaiLandmarks()]);
  if(!overlay.hidden){
   const {min,max}=annualYears();
   const events=reviewEvents(new Date(min+'-01-01T00:00:00'),new Date(max+'-12-31T23:59:59.999'));
   annualAvailableYears=[...new Set(events.map(event=>event.start.getFullYear()))];
   $('annual-mode').disabled=$('annual-year-select').disabled=false;
   renderAnnual(year);
  }
 }catch{
  $('annual-status').textContent='地图边界加载失败，请关闭后重试';
 }
}
$('annual').onclick=()=>{
 const {min,max}=annualYears();
 return openAnnualReview(Math.max(min,Math.min(max,new Date().getFullYear())));
};
$('annual-close').onclick=closeAnnual;
$('annual-mode').onclick=()=>{
 const overlay=$('annual-review'),year=Number(overlay.dataset.year);
 const custom=overlay.dataset.mode!=='range';
 overlay.dataset.mode=custom?'range':'year';
 if(custom&&!$('annual-range-from').value){
  $('annual-range-from').value=Math.max(annualYears().min,year-1)+'-01-01';
  $('annual-range-to').value=year+'-12-31';
 }
 renderAnnual(year);
};
$('annual-range-from').onchange=$('annual-range-to').onchange=()=>renderAnnual(Number($('annual-review').dataset.year));
$('annual-year-select').onchange=event=>{
 const year=Number(event.target.value);
 if(!year)return;
 $('annual-review').dataset.mode='year';
 renderAnnual(year);
};
$('annual-review').onclick=e=>{if(e.target===$('annual-review'))closeAnnual();};
$('annual-review').onkeydown=e=>{if(e.key==='Escape')closeAnnual();};
for(const [id,step] of [['annual-prev',-1],['annual-next',1]]){
 $(id).onclick=()=>renderAnnual(Number($('annual-review').dataset.year)+step);
}
async function startAtlas(){
 const [mapData,config,places,calendar]=await Promise.allSettled([
  fetch('data/china.json').then(response=>{
   if(!response.ok)throw Error('全国底图读取失败');
   return response.json();
  }),
  readConfigFiles(),readCSV(),fetchCalendar(),
 ]);
 if(mapData.status==='fulfilled'){
  china=mapData.value;
  setupGaz();
  cache.clear();
 }
 renderBlacklist();
 let calendarReady=false;
 if(calendar.status==='fulfilled'){
  try{load(calendar.value,false,true);calendarReady=true;}catch{}
 }
 if(!calendarReady){
  $('events').innerHTML='<div class="empty" role="status">未能读取日历，可从设置重新读取或导入日历。</div>';
  draw();
 }
 const missing=[];
 if(mapData.status==='rejected')missing.push('全国底图');
 if(config.status==='rejected')missing.push('配置');
 if(places.status==='rejected')missing.push('地点');
 if(!calendarReady)missing.push('日历');
 if(missing.length)$('status').textContent=missing.join('、')+'读取失败';
 if(!mobileSource||mobileImport)void updateDataTimes();
 if(calendarReady){
  if(typeof requestAnimationFrame==='function'&&!document.hidden){
   await new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
  }
  syncYears();
 }
}
await startAtlas();
(()=>{
 const level=new URLSearchParams(globalThis.location?.search).get('level');
 if(['place','shanghai','domestic','country'].includes(level))$('level').value=level;
 if(mapLevel()!=='place')$('level').dispatchEvent(new Event('change'));
})();
(()=>{try{const ay=new URLSearchParams(location.search).get('annual');if(ay)setTimeout(()=>{const b=annualYears(),y=Number(ay)||new Date().getFullYear();openAnnualReview(Math.max(b.min,Math.min(b.max,y)));},500);}catch{}})();
