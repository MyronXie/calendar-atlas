import {annualLegend,cityKey,drawAnnualImage,drawAnnualMap,drawShanghaiMap,layoutMapLabels,mapAttribution,shanghaiDistricts,shanghaiMapPlaces,shanghaiMetroLayers,shanghaiName} from './lib/annual-review.js';
import {basemaps} from './lib/basemaps.js';
import {periodCounts,addMatches,barHeights,timelineCountLayout,monthlyColumns,frequencyBuckets,periodRange,dateBucket,dateBucketLabel,dateConditionGroups,dateBucketGroups} from './lib/timeline.js';
import {palettes,nightPalettes,resolveTheme,coordinateLabel,highlightLabelColor} from './lib/appearance.js';
import {criterion,toggleCriterion,createEventMatcher,matchesCriterionText,matchesCriterionDate,searchableEventNote,searchCriterion,criterionDisplay,eventParts,eventCriteria,rankSections,toggleRankHidden} from './lib/filters.js';
import {selectEmoji} from './lib/emoji.js';
import {placeTypes,placeIndex,regionFromAddress} from './lib/place-categories.js';
import {parseCalendar,expand,details,escape as E,validCoord,setPlaceResolver} from './lib/core.js';
import {applyRules,normalizePlace,isPlaceExcluded} from './lib/organize.js';
import {gcjToWgs,shortRegionName,geometryPolygons,containsPoint} from './lib/geo.js';
import {compareCalendars} from './lib/calendar-import.js';
import {isTrip,occurrenceCounts,occurrenceDays,tripDates,tripDateRange,tripDetails,tripPlace,tripSelectLabel,tripShareFilename} from './lib/travel.js';
import {compact as normalize,search as searchName} from './lib/place-name.js';
import {classifyActivity} from './lib/activity.js';
const sourceTimeIds = {calendar:'cal-version', places:'place-version', blacklist:'blacklist-version'};
const mobileSource=document.documentElement?.dataset?.mobileSource;
const mobileImport=mobileSource==='import';
const importTypes={
 calendar:{accept:'.ics,text/calendar',route:'calendar'},
 places:{accept:'.csv,text/csv',route:'places'},
 blacklist:{accept:'.json,application/json',route:'config'},
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
const $=id=>document.getElementById(id);let currentTheme=resolveTheme(localStorage.getItem('atlas-theme'));let nightMode=localStorage.getItem('atlas-night')==='1';const colors=()=> (nightMode?nightPalettes:palettes)[currentTheme];const collapsedSections={map:true,timeline:true,eventlist:false};let activeCriteria=[];let rankHidden={places:[],partners:[],groups:[],activities:[],areas:[]};try{const saved=JSON.parse(localStorage.getItem('atlas-rank-hidden-v1'));for(const k of Object.keys(rankHidden))if(Array.isArray(saved?.[k]))rankHidden[k]=saved[k].filter(n=>typeof n==='string');}catch{}let source=[],filtered=[],world,china,cities=[],tab='places',limit=50,points=[];
const countOptionIds=['merge-same-day','split-trip-days','recurring'];
try{
 const saved=JSON.parse(localStorage.getItem('atlas-count-options'));
 for(const id of countOptionIds)if(typeof saved?.[id]==='boolean')$(id).checked=saved[id];
}catch{}
let countedRows,filteredView,panelRefreshTimer;
let draftCriterion,appliedCriteria=[];
const cityBoundaryParts=new Map();
let allCityBorders=false,cityIndexRequest,cityBoundaries=null,cityBoundaryRequest,boundaryLayer=null,overviewLayers=[],regionLabels=[],overviewLevel='',timelineKey='',timelineEvents=[];
let highlightCityProvinces=false;
// Leaflet 1.7 can restore an animated zoom's old target after setView resets the map.
const map=L.map('map',{preferCanvas:true,zoomAnimation:false}).setView([32,108],4);let tiles=null;let csvVersion='',editingVersion='',placeLimit=100,activePanel='manage',settingsOpen=false;let markerLayer=null,heatLayer=null,placeToggles=null,reference={places:[]},rules={},configVersion='',emojiConfig={},blacklistBusy=false,blacklistEditing=-1,blacklistEditVersion='',baseCoords=new Map(),yearMin=2000,yearMax=2026,pickMode=false;
const observesMapSize=typeof ResizeObserver==='function';
if(observesMapSize)new ResizeObserver(([{contentRect}])=>{
 if(contentRect.width&&contentRect.height)map.invalidateSize({animate:false});
}).observe($('map'));
L.control.scale({imperial:false}).addTo(map);
const regionLabelPane='atlas-labels';
map.createPane(regionLabelPane);
const basemapOptions=Object.entries(basemaps).map(([key,{label}])=>'<option value="'+key+'">'+E(label)+'</option>').join('');
$('provider').innerHTML=basemapOptions;
const savedProvider=localStorage.getItem('atlas-provider-v2');
$('provider').value=Object.hasOwn(basemaps,savedProvider)?savedProvider:'qh360';
const aliases={'China':'中国','Japan':'日本','South Korea':'韩国','United Kingdom':'英国','United States of America':'美国','France':'法国','Germany':'德国','Italy':'意大利','Spain':'西班牙','Thailand':'泰国','Singapore':'新加坡','Malaysia':'马来西亚','Australia':'澳大利亚','Canada':'加拿大','Indonesia':'印度尼西亚','Vietnam':'越南','New Zealand':'新西兰','Switzerland':'瑞士','Netherlands':'荷兰','Portugal':'葡萄牙','Russia':'俄罗斯','India':'印度','United Arab Emirates':'阿联酋','Philippines':'菲律宾','Cambodia':'柬埔寨','Nepal':'尼泊尔'};
let gaz=[];
function setupGaz(){gaz=[];for(const f of world?.features||[]){const p=f.properties;const name=p.name||p.ADMIN||p.NAME;const coords=geometryPolygons(f.geometry).flat(2);let xs=coords.map(p=>p[0]),ys=coords.map(p=>p[1]);gaz.push({terms:[name,aliases[name]].filter(Boolean),country:aliases[name]||name,lat:(Math.min(...ys)+Math.max(...ys))/2,lon:(Math.min(...xs)+Math.max(...xs))/2,precision:'country'});}for(const f of china?.features||[]){const p=f.properties;gaz.push({terms:[p.name,p.name.replace(/省|市|壮族自治区|回族自治区|维吾尔自治区|自治区|特别行政区/g,'')],country:'中国',province:p.name,city:['北京市','上海市','天津市','重庆市','香港特别行政区','澳门特别行政区'].includes(p.name)?p.name:'',lat:p.center?.[1],lon:p.center?.[0],precision:'province'});}for(const p of cities){gaz.push({terms:[p.name,p.name.replace(/市$/,'')],country:'中国',province:p.province,city:p.name,lat:p.center[1],lon:p.center[0],precision:'city'});}gaz=gaz.filter(p=>validCoord(p));}
function locate(name){const m=name.match(/(?:geo:)?(-?\d{1,2}\.\d{3,})\s*[,，;]\s*(-?\d{1,3}\.\d{3,})/i);if(m&&validCoord({lat:m[1],lon:m[2]}))return {...inferRegion(+m[1],+m[2]),lat:+m[1],lon:+m[2],precision:'exact'};const key=normalizePlace(name);const base=baseCoords.get(key);if(base){if(!validCoord(base)){const approx=lookup([base.city,base.province,base.country].filter(Boolean).join(' '))||lookup(name);return approx?{...approx,...Object.fromEntries(['country','province','city'].filter(k=>base[k]).map(k=>[k,base[k]]))}:null;}let p={lat:Number(base.lat),lon:Number(base.lon),precision:'exact'};[p.lat,p.lon]=toWgs(p.lat,p.lon,base.datum||$('datum').value);const inferred=base.country&&base.province&&base.city?{}:inferRegion(p.lat,p.lon);return {...inferred,...Object.fromEntries(['country','province','city'].filter(k=>base[k]).map(k=>[k,base[k]])),...p};}return lookup(name);}
function lookup(name){const s=normalize(name);let hits=gaz.filter(p=>p.terms.some(t=>{if(!t||t.length<2)return false;const term=normalize(t);if(s===term)return true;const official=/省$|市$|区$|县$|自治区$|特别行政区$/.test(t);return official&&s.startsWith(term);}));hits.sort((a,b)=>({city:3,province:2,country:1}[b.precision]-{city:3,province:2,country:1}[a.precision]));if(!hits.length)return null;const best=hits[0],peers=hits.filter(x=>x.precision===best.precision);if(peers.length>1){const qualified=peers.filter(x=>x.province&&s.includes(normalize(x.province.replace(/省|市/g,''))));if(qualified.length!==1)return null;return qualified[0];}return best;}
let cache=new Map();function pos(name){if(!cache.has(name))cache.set(name,locate(name));return cache.get(name);}
let timeMode='overview',overviewUnit='year',selectedRange=[],timelineYearsDirty=true;
const focusView=()=>timeMode==='focus';
const dateInputValue=date=>date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
function setRecentRange(){
 const now=new Date(),from=new Date(now.getFullYear()-1,now.getMonth(),now.getDate()+1);
 selectedRange=[dateInputValue(from),dateInputValue(now)];
}
function load(text,keepRange=false,startup=false){
 const next=parseCalendar(text);
 if(!next.some(event=>Number.isFinite(event.startDate?.toJSDate().getTime())))throw Error('没有有效事件');
 source=next;
 $('timeline-range').disabled=false;
 if(!keepRange||!selectedRange.length){
  setRecentRange();
  activeCriteria=[];
 }
 timelineKey='';
 timelineYearsDirty=true;
 refresh({deferPanels:startup});
 if(!keepRange&&!startup)fitPoints();
}
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
function searchEventCriterion(value,events){
 const scope=$('searchscope').value||'all';
 const canonical=(scope==='all'||scope==='place')?baseCoords.get(normalizePlace(value))?.location||value:value;
 return searchCriterion(scope,canonical,events);
}
function refresh({timeline=true,deferPanels=false}={}){
 if(!selectedRange.length)return;
 clearTimeout(panelRefreshTimer);
 const [start,end]=selectedRange;
 const from=new Date(start+'T00:00:00'),to=new Date(end+'T23:59:59.999');
 const rangeLabel=start.replaceAll('-','/')+'-'+end.replaceAll('-','/');
 setSectionTitle('timeline-range-label',rangeLabel);
 const result=rangeEvents(from,to);
 const draftRaw=$('search').value.trim();
 draftCriterion=draftRaw?searchEventCriterion(draftRaw,result.events):null;
 appliedCriteria=draftCriterion&&!activeCriteria.some(c=>c.id===draftCriterion.id)?[...activeCriteria,draftCriterion]:activeCriteria;
 const dates=appliedCriteria.filter(c=>c.kind==='time');
 const others=appliedCriteria.filter(c=>c.kind!=='time');
 $('timeline-range').setAttribute('aria-label','修改时间范围 '+rangeLabel);
 const scoped=dates.length?result.events.filter(createEventMatcher(dates,placeType)):result.events;
 filtered=others.length?scoped.filter(createEventMatcher(others,placeType,rankValues)):scoped;
 countedRows=null;
 filteredView={events:result.events,scoped:dates.length?scoped:null,matched:others.length?filtered:null,from,to};
 limit=50;
 $('status').textContent=result.errors||result.capped?'部分重复事件无法完整展开，请缩小时间范围。':'';
 renderDateConditions(dates);
 renderEvents();
 renderFilterChips();
 if(deferPanels)panelRefreshTimer=setTimeout(()=>refreshVisiblePanels(timeline),110);
 else refreshVisiblePanels(timeline);
}
function renderTimePanel(timeline=true){
 if(collapsedSections.timeline||!filteredView)return;
 const {events,scoped,matched,from,to}=filteredView;
 renderTimeStats(events,scoped,matched,from,to);
 if(focusView())renderFocusChart();
 else if(timeline)renderOverviewChart();
}
function refreshVisiblePanels(timeline){
 renderTimePanel(timeline);
 if(rankDrawerOpen)renderRank();
 renderMapResults();
 if(settingsOpen&&activePanel==='manage')renderPlaces();
}
function currentCountedRows(){
 if(!countedRows)countedRows=filteredView
  ?[...occurrenceDays(filtered,filteredView.from,filteredView.to,$('split-trip-days').checked,true)]:[];
 return countedRows;
}
const rangeDialog=$('timeline-range-dialog');
const rangeFields=[$('from'),$('to')];
function showRangeError(invalid){
 const error=$('timeline-range-error');
 error.hidden=!invalid;
 error.textContent=invalid?'起始日期须早于或等于终止日期。':'';
 for(const field of rangeFields)field.setAttribute('aria-invalid',String(invalid));
}
$('timeline-range').onclick=()=>{
 if(!selectedRange.length)return;
 [rangeFields[0].value,rangeFields[1].value]=selectedRange;
 showRangeError(false);
 rangeDialog.showModal();
 $('timeline-range-cancel').focus?.({preventScroll:true});
};
$('timeline-range-cancel').onclick=()=>rangeDialog.close();
for(const field of rangeFields)field.oninput=()=>showRangeError(false);
$('timeline-range-form').onsubmit=event=>{
 event.preventDefault();
 const [start,end]=rangeFields.map(field=>field.value);
 if(!start||!end||new Date(start)>new Date(end)){
  showRangeError(true);
  return;
 }
 rangeDialog.close();
 setTimeRange(start,end);
};

function activityStats(events,rows,places=new Set(rows.flatMap(row=>row.places))){
 return [
  ['事件',events.length],
  ['天数',new Set(rows.map(row=>row.day)).size],
  ['地点',places.size],
  ['同伴',new Set(rows.flatMap(row=>row.event.partners)).size],
 ];
}
let renderedDateCriteria;
function renderDateConditions(criteria){
 const signature=JSON.stringify(criteria.map(c=>c.id));
 if(signature===renderedDateCriteria)return;
 renderedDateCriteria=signature;
 const chips=$('timeline-date-conditions');
 const groups=dateConditionGroups(criteria);
 chips.hidden=!groups.length;
 const indicator=$('timeline-range-indicator'),wasHidden=indicator.hidden;
 updateFilterHint('timeline-range-indicator',groups.map(group=>group.label));
 if(indicator.hidden!==wasHidden)scheduleSectionTools();
 chips.innerHTML=groups.map(({label},index)=>filterChip('data-remove-date="'+index+'"','移除日期条件：'+label,label)).join('');
 for(const button of chips.querySelectorAll('[data-remove-date]'))button.onclick=()=>{
  const index=Number(button.dataset.removeDate),{scope,values}=groups[index];
  activeCriteria=activeCriteria.filter(c=>c.kind!=='time'||c.scope!==scope||!values.includes(Number(c.value)));
  refresh();
  fitPoints();
  (chips.querySelector('[data-remove-date="'+index+'"]')||chips.querySelector('[data-remove-date]')||$('search')).focus?.({preventScroll:true});
 };
}
function renderTimeStats(events,scoped,matched,from,to){
 const split=$('split-trip-days').checked;
 const summaries=new Map();
 const summarize=records=>{
  if(!summaries.has(records))summaries.set(records,activityStats(records,[...occurrenceDays(records,from,to,split)]));
  return summaries.get(records);
 };
 const totals=summarize(events),dates=scoped?summarize(scoped):null,matches=matched?summarize(matched):null;
 const stats=$('timeline-stats');
 const weights=[];
 const separator='<span aria-hidden="true"> / </span>';
 const distribution=[matches?'筛选命中':null,dates?'日期条件':null,'范围总数'].filter(Boolean).join(' / ');
 stats.innerHTML=totals.map(([label,total],i)=>{
  const hit=matches?.[i][1],dated=dates?.[i][1];
  const count=(matches?'<strong class="timeline-stat-hit">'+hit+'</strong>'+separator:'')
   +(dates?'<span class="timeline-stat-dates">'+dated+'</span>'+separator:'')+total;
  const description=matches||dates?' aria-label="'+(matches?'命中 '+hit+'，':'')+(dates?'日期条件 '+dated+'，':'')+'共 '+total+'"':'';
  const digits=[total,hit,dated].filter(n=>n!==undefined).map(String).join('/').length;
  weights.push('minmax(0,'+Math.max(5,digits)+'fr)');
  return '<div title="'+distribution+'"><dt>'+label+'：</dt><dd'+description+'>'
   +'<span class="timeline-stat-number">'+count+'</span></dd></div>';
 }).join('');
 stats.style.setProperty('--timeline-stat-columns',weights.join(' '));
 fitTimeStatValues();
}
let focusUnit='month';
const frequencyButtons=document.querySelectorAll('[data-frequency]');
const dateCriterion=(unit,value)=>criterion('time',String(value),{scope:unit,label:dateBucketLabel(value,unit)});
function renderFocusChart(){
 if(collapsedSections.timeline||!filteredView)return;
 const {events,scoped,matched,from,to}=filteredView;
 const rows=frequencyBuckets(events,scoped,matched,focusUnit,from,to);
 const bars=$('day-frequency-bars');
 const peak=Math.max(1,...rows.map(row=>row.total));
 const current=dateCriterion(focusUnit,dateBucket(new Date(),focusUnit));
 $('timeline-current').title='选择'+current.label;
 bars.innerHTML=rows.map(row=>{
  const {value,label,title,total,scoped,matched:hit}=row;
  const active=activeCriteria.some(c=>c.id===dateCriterion(focusUnit,value).id);
  const description=barDescription(title,total,matched?hit:null,filteredView.scoped?scoped:null);
  const shortLabel=focusUnit==='year'?'&#39;'+label.slice(-2):label;
  return '<button type="button" class="yearbar frequency-bar'+(active?' selected':'')+'" data-frequency-bucket="'+value
   +'" data-total="'+total+'" data-scoped="'+scoped+'" data-matched="'+hit+'" aria-pressed="'+active+'" title="'+E(description)+'" aria-label="'+E(description)+'">'
   +timelineBar({total,inRange:total,scoped:filteredView.scoped?scoped:null,matched:matched?hit:null,peak,label,shortLabel})+'</button>';
 }).join('');
 for(const bar of bars.querySelectorAll('[data-frequency-bucket]'))bar.onclick=()=>{
  const value=Number(bar.dataset.frequencyBucket);
  applyCriterion(dateCriterion(focusUnit,value));
  bars.querySelector('[data-frequency-bucket="'+value+'"]')?.focus({preventScroll:true});
 };
 renderDateGroups(rows.length);
 fitFrequencyChart();
}
function toggleTimelineButton(button,active){
 button.classList.toggle('active',active);
 button.setAttribute('aria-pressed',String(active));
}
for(const button of frequencyButtons)button.onclick=()=>{
 focusUnit=button.dataset.frequency;
 for(const option of frequencyButtons)toggleTimelineButton(option,option===button);
 renderFocusChart();
};
$('timeline-current').onclick=()=>{
 if(!selectedRange.length)return;
 activeCriteria=activeCriteria.filter(c=>c.kind!=='time'||c.scope!==focusUnit);
 activeCriteria.push(dateCriterion(focusUnit,dateBucket(new Date(),focusUnit)));
 refresh();
};
function clearDateConditions(){
 activeCriteria=activeCriteria.filter(c=>c.kind!=='time');
 refresh();
}
$('timeline-clear-dates').onclick=clearDateConditions;
function renderDateGroups(slots){
 const bar=$('focus-date-groups'),unit=focusUnit;
 const groups=dateBucketGroups(unit);
 bar.hidden=!groups.length;
 if(bar.hidden)return;
 bar.style.setProperty('--frequency-slots',slots);
 const selected=new Set(activeCriteria.filter(c=>c.kind==='time'&&c.scope===unit).map(c=>Number(c.value)));
 const parts=groups.flatMap(group=>group.ranges.map(([start,end])=>({group,start,end}))).sort((a,b)=>a.start-b.start);
 const offset=unit==='hour'||unit==='weekday'?1:0;
 bar.innerHTML=parts.map(({group,start,end})=>{
  const active=group.values.every(value=>selected.has(value));
  const edge=hour=>String(hour).padStart(2,'0')+':00';
  const [first,last]=group.ranges;
  const label=group.label+(unit==='hour'?' '+edge((last||first)[0])+'–'+edge(first[1]):'');
  return '<button type="button" style="grid-column:'+(start+offset)+' / '+(end+offset)+'" data-date-part="'+start
   +'" title="'+label+'" aria-label="'+label+'" aria-pressed="'+active+'">'+group.label+'</button>';
 }).join('');
 for(const button of bar.querySelectorAll('[data-date-part]'))button.onclick=()=>{
  const part=parts.find(item=>item.start===Number(button.dataset.datePart));
  const criteria=part.group.values.map(value=>dateCriterion(unit,value));
  const ids=new Set(criteria.map(c=>c.id));
  const remove=part.group.values.every(value=>selected.has(value));
  activeCriteria=activeCriteria.filter(c=>!ids.has(c.id));
  if(!remove)activeCriteria.push(...criteria);
  refresh();
  bar.querySelector('[data-date-part="'+part.start+'"]')?.focus({preventScroll:true});
 };
}
function fitFrequencyChart(){
 const bars=$('day-frequency-bars');
 fitTimelineColumns(bars,bars.clientWidth,bars.childElementCount);
}
function fitTimeStatValues(){
 const stats=$('timeline-stats');
 if(!stats.clientWidth)return;
 const values=[...stats.querySelectorAll('.timeline-stat-number')];
 for(const value of values)value.style.fontSize='';
 const sizes=values.map(value=>{
  const width=value.getBoundingClientRect().width,available=value.parentElement.clientWidth;
  return width>available?Math.floor(parseFloat(getComputedStyle(value).fontSize)*available/width*10)/10:null;
 });
 for(const [i,size] of sizes.entries())if(size!==null)values[i].style.fontSize=size+'px';
}
if(typeof ResizeObserver==='function'){
 new ResizeObserver(fitTimeStatValues).observe($('timeline-stats'));
 new ResizeObserver(fitFrequencyChart).observe($('day-frequency-bars'));
}
function placeType(name){return baseCoords.get(normalizePlace(name))?.type?.trim() || 'other';}
const rankKinds={places:'place',partners:'person',groups:'group',activities:'activity',areas:'businessArea'};
let activityCache=new WeakMap();
function eventActivity(event){
 if(!activityCache.has(event))activityCache.set(event,classifyActivity(event,name=>baseCoords.get(normalizePlace(name))));
 return activityCache.get(event);
}
function businessArea(name){
 return (baseCoords.get(normalizePlace(name))?.business_area??'').normalize('NFKC').trim();
}
function rankValues(event,kind){
 if(kind==='businessArea')return event.places.map(businessArea).filter(Boolean);
 const activity=eventActivity(event);
 return activity?[activity.label]:[];
}
function counts(field){
 const countsByName=field==='activities'?occurrenceCounts(filtered,event=>rankValues(event,'activity'),false)
  :field==='areas'?occurrenceCounts(
   filteredView?occurrenceDays(filtered,filteredView.from,filteredView.to,true):[],
   ({places})=>places.map(businessArea).filter(Boolean),true)
  :field==='groups'?occurrenceCounts(filtered,event=>[eventParts(event.title).group].filter(Boolean),false)
  :occurrenceCounts(currentCountedRows(),({event,places})=>field==='places'?places:event.partners,$('merge-same-day').checked);
 return [...countsByName].sort((a,b)=>b[1]-a[1]);
}
function applyCriterion(c){activeCriteria=toggleCriterion(activeCriteria,c);refresh();fitPoints();}
function setEntityFilter(field,name){applyCriterion(criterion(rankKinds[field],name));}
function setMapFilter(p){const level=mapLevel();const names=['place','shanghai'].includes(level)?[...p.names]:[...new Set(source.flatMap(e=>details(e).places))].filter(n=>{const a=pos(n);return a&&(level==='city'?[a.country,a.province,a.city].join('|')===p.regionKey:a[level]===p.name);});applyCriterion(names.length===1?criterion('place',names[0]):criterion('placeGroup',p.name,{values:names}));}
function renderRank(){
 $('rank-place-options').hidden=tab!=='places';
 const field=tab==='places'&&$('rank-by-area').checked?'areas':tab;
 const kind=rankKinds[field],all=counts(field),sections=rankSections(all,rankHidden[field]),max=all[0]?.[1]||1;
 const ranking=$('ranking');
 const hiddenIcon='<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/><path d="m3 3 18 18"/></svg>';
 const row=([name,count],index,hidden)=>{
  const selected=activeCriteria.some(c=>c.id===criterion(kind,name).id);
  const action=hidden?'恢复排行':'不参与排名';
  return '<div class="rankrow '+(hidden?'rank-demoted ':'')+(selected?'selected':'')+'">'
   +'<button type="button" class="num" data-rank-toggle="'+E(name)+'" title="'+action
   +'" aria-label="'+E(name+'，'+(hidden?'不参与排名，':'第 '+(index+1)+' 名，')+action)
   +'" aria-pressed="'+hidden+'">'+(hidden?hiddenIcon:index+1)+'</button>'
   +'<button type="button" class="rank-filter" data-rank-name="'+E(name)+'" aria-pressed="'+selected
   +'"><span class="label">'+E(name)+'<span class="bar" style="width:'+100*count/max+'%"></span></span><b>'
   +count+'</b></button></div>';
 };
 ranking.innerHTML=all.length?sections.visible.map((r,i)=>row(r,i,false)).join('')
  +(sections.hidden.length?'<div class="rank-divider">不参与排名</div>'+sections.hidden.map((r,i)=>row(r,i,true)).join(''):'')
  :'<div class="empty">'+(field==='areas'?'此范围内没有已标注商圈的到访。'
   :field==='activities'?'此范围内没有识别到活动类型。':'此范围内没有记录')+'</div>';
 for(const button of ranking.querySelectorAll('[data-rank-name]')){
  button.onclick=()=>{
   setEntityFilter(field,button.dataset.rankName);
   if((field==='activities'||field==='areas')&&narrowDrawers?.matches)drawer(false);
  };
 }
 for(const button of ranking.querySelectorAll('[data-rank-toggle]')){
  button.onclick=()=>{
   const name=button.dataset.rankToggle,restoreFocus=document.activeElement===button;
   rankHidden[field]=toggleRankHidden(rankHidden[field],name);
   try{localStorage.setItem('atlas-rank-hidden-v1',JSON.stringify(rankHidden));}catch{}
   renderRank();
   if(restoreFocus)[...ranking.querySelectorAll('[data-rank-toggle]')].find(item=>item.dataset.rankToggle===name)?.focus({preventScroll:true});
  };
 }
}
$('rank-by-area').onchange=renderRank;
const expandedEventPlaces=new Set();
const eventKey=event=>(event.uid||event.title)+'|'+event.start.toISOString();
const eventColumns={places:true,people:true};
const filterHighlights=(kind,value)=>appliedCriteria.some(c=>matchesCriterionText(c,kind,value));
function eventTitleText(title){
 const {group,name}=eventParts(title);
 const mark=(kind,value,text)=>filterHighlights(kind,value)?'<mark class="filter-highlight">'+E(text)+'</mark>':E(text);
 if(!group)return mark('event',name,title);
 const separator=title.search(/[\]】]/)+1;
 return mark('group',group,title.slice(0,separator))+mark('event',name,title.slice(separator));
}
const entityIcon=(kind,extraClass='')=>'<svg class="entity-icon '+extraClass+'" width="16" height="16" aria-hidden="true"><use href="#icon-'+kind+'"/></svg>';
function filterChip(attribute,label,value,icon=''){
 return '<button type="button" '+attribute+' aria-label="'+E(label)+'">'
  +(icon?entityIcon(icon):'')+'<strong>'+E(value)+'</strong>'+entityIcon('dialog-close','filter-chip-dismiss')+'</button>';
}
function highlightNote(text,values){
 const alternatives=[...new Set(values)].filter(Boolean).sort((a,b)=>b.length-a.length)
  .map(value=>value.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'));
 if(!alternatives.length)return E(text);
 let html='',start=0;
 for(const match of text.matchAll(new RegExp(alternatives.join('|'),'gi'))){
  html+=E(text.slice(start,match.index))+'<mark class="filter-highlight">'+E(match[0])+'</mark>';
  start=match.index+match[0].length;
 }
 return html+E(text.slice(start));
}
function eventEntities(names,kind,index,visible,expanded=false,matchedNames=null){
 const isPlace=kind==='place';
 const wrapper='evententities '+(isPlace?'eventplaces':'eventpeople')+(expanded?' is-expanded':'');
 const hidden=visible?'':' hidden';
 if(!names.length)return '<div class="'+wrapper+'"'+hidden+'></div>';
 const links=names.map(name=>{
  const matched=Boolean(matchedNames&&matchedNames.has(name));
  return '<button class="entitylink'+(matched||filterHighlights(kind,name)?' filter-highlight':'')+'" data-filter-'+kind+'="'+E(name)+'" aria-pressed="'
   +activeCriteria.some(c=>c.id===criterion(kind,name).id)+'"'+(matched?' data-place-match="1"':'')+'>'+E(name)+'</button>';
 }).join('');
 const listId=isPlace?' id="eventplaces-'+index+'"':'';
 const icon=entityIcon(kind,'event-entity-icon');
 const more=isPlace?'<button type="button" class="event-action event-places-more" data-place-toggle="'+index+'" aria-controls="eventplaces-'+index
  +'" aria-expanded="'+expanded+'" aria-label="'+(expanded?'收起地点':'展开地点')+'" title="'+(expanded?'收起地点':'展开地点')+'" hidden>'+entityIcon('chevron')+'</button>':'';
 return '<div class="'+wrapper+'"'+hidden+'>'+icon+'<div class="event-entity-list"'+listId+'>'+links+'</div>'+more+'</div>';
}
let eventLayoutFrame=0;
function scheduleEventLayout(){
 if(eventLayoutFrame||typeof requestAnimationFrame!=='function')return;
 eventLayoutFrame=requestAnimationFrame(()=>{
  eventLayoutFrame=0;
  for(const group of $('events').querySelectorAll('.eventplaces:not([hidden])')){
   const list=group.querySelector('.event-entity-list'),button=group.querySelector('.event-places-more');
   if(!list||!button)continue;
   let expanded=group.classList.contains('is-expanded');
   const twoLines=2*parseFloat(getComputedStyle(list).lineHeight);
   const bottom=list.getBoundingClientRect().top+twoLines;
   // 仅当命中的地点被折叠（超出两行可视范围）时才自动展开；已能完整显示则保持原状
   if(!expanded&&[...group.querySelectorAll('[data-place-match]')].some(link=>link.getBoundingClientRect().bottom>bottom+1)){
    group.classList.add('is-expanded');
    expanded=true;
    button.setAttribute('aria-expanded','true');
    button.setAttribute('aria-label','收起地点');
    button.title='收起地点';
   }
   button.hidden=!expanded&&list.scrollHeight<=twoLines+1;
   for(const link of list.children)link.inert=!expanded&&link.getBoundingClientRect().bottom>bottom+1;
  }
 });
}
if(typeof ResizeObserver==='function')new ResizeObserver(scheduleEventLayout).observe($('events'));
function updateToolbarHeight(){
 const toolbar=document.querySelector('.app-toolbar');
 if(toolbar)document.body.style.setProperty('--toolbar-height',toolbar.getBoundingClientRect().height+'px');
}
const toolbar=document.querySelector('.app-toolbar');
if(toolbar&&typeof ResizeObserver==='function')new ResizeObserver(updateToolbarHeight).observe(toolbar);
updateToolbarHeight();
let eventJumpFrame=0;
const toolbarBottom=()=>document.querySelector('.app-toolbar')?.getBoundingClientRect().bottom||0;
function scheduleEventJump(){
 if(eventJumpFrame||typeof requestAnimationFrame!=='function')return;
 eventJumpFrame=requestAnimationFrame(()=>{
  eventJumpFrame=0;
  const button=$('events-back-top');
  if(button)button.hidden=window.scrollY<160;
 });
}
globalThis.addEventListener?.('scroll',scheduleEventJump,{passive:true});
globalThis.addEventListener?.('resize',scheduleEventJump);
function scrollToHeading(id){
 if(typeof window==='undefined')return;
 const heading=$(id);
 if(!heading)return;
 window.scrollBy({top:heading.getBoundingClientRect().top-toolbarBottom()-6,
  behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 heading.focus({preventScroll:true});
}
$('events-back-top').onclick=()=>{
 window.scrollTo({top:0,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 scheduleEventJump();
};
function revealTimeline(){
 const heading=$('timeline-header');
 heading.scrollIntoView?.({block:'start',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});
 $('collapse-timeline').focus?.({preventScroll:true});
}
function selectEventRange(event){
 const {start,end}=tripDates(event);
 selectedRange=[start,end];
 setTimeMode('focus');
 if(collapsedSections.timeline)setSectionCollapsed('timeline',false);
 if(typeof matchMedia==='function')revealTimeline();
}
function eventClock(date){
 return String(date.getHours()).padStart(2,'0')+':'+String(date.getMinutes()).padStart(2,'0');
}
function showEventDetails(event){
 const dialog=$('event-detail-dialog');
 const activity=eventActivity(event);
 const source=activity?[activity.source,activity.place].filter(Boolean).join(' · '):'';
 const note=searchableEventNote(event.note);
 const day=dateInputValue(event.start);
 const endDay=event.end>event.start?dateInputValue(event.end):day;
 const time=event.allDay?day+' · 全天':day+' '+eventClock(event.start)
  +(event.end>event.start?' 至 '+(endDay===day?'':endDay+' ')+eventClock(event.end):'');
 const rows=[
  ['时间',time],
  ['活动类型',activity?activity.label+'（'+source+'）':'未识别'],
  ['地点',event.places.join('、')],
  ['商圈', [...new Set(rankValues(event,'businessArea'))].join('、')],
  ['同伴',event.partners.join('、')],
  ['备注',note],
 ];
 $('event-detail-title').textContent=event.title;
 $('event-detail-data').innerHTML=rows.filter(([,value])=>value)
  .map(([label,value])=>'<dt>'+E(label)+'</dt><dd>'+E(value)+'</dd>').join('');
 $('event-detail-filter').onclick=()=>{
  dialog.close();
  filterSameEvent(event);
  $('search').focus?.({preventScroll:true});
 };
 dialog.showModal();
}
$('event-detail-close').onclick=()=>$('event-detail-dialog').close();
function filterSameEvent(event){
 activeCriteria=eventCriteria(activeCriteria,event.title);
 refresh();
 fitPoints();
}
function renderEvents(){
 const rows=filtered,container=$('events');
 $('eventtitle').textContent='事件 · '+rows.length;
 // 有地点/人物筛选且对应列被收起时，临时展开该列，保证匹配到的名称可见
 const forcePlaces=appliedCriteria.some(c=>['place','placeGroup','placeType','businessArea'].includes(c.kind)||c.kind==='keyword'&&c.scope==='place');
 const forcePeople=appliedCriteria.some(c=>c.kind==='person'||c.kind==='keyword'&&c.scope==='person');
 const showPlaces=eventColumns.places||forcePlaces,showPeople=eventColumns.people||forcePeople;
 container.classList.toggle('hide-places',!showPlaces);
 container.classList.toggle('hide-people',!showPeople);
 let previousDay='';
 container.innerHTML=rows.slice(0,limit).map((event,i)=>{
  const key=eventKey(event);
  const start=event.start,year=String(start.getFullYear());
  const [month,date]=[start.getMonth()+1,start.getDate()]
   .map(value=>String(value).padStart(2,'0'));
  const dateField=(unit,value)=>appliedCriteria.some(c=>c.scope===unit&&matchesCriterionDate(c,start,event.allDay))
   ?'<mark class="filter-highlight">'+value+'</mark>':value;
  const day=year+'-'+month+'-'+date;
  const weekday='（'+dateField('weekday','日一二三四五六'[start.getDay()])+'）';
  const heading=day===previousDay?'':'<h3 class="event-day"><time datetime="'+day+'">'
   +dateField('year',year)+'/'+dateField('month',month)+'/'+dateField('date',date)+weekday+'</time></h3>';
  previousDay=day;
  const startClock=eventClock(start);
  const hasEnd=!event.allDay&&event.end>start;
  const endClock=hasEnd?eventClock(event.end):'';
  const endDay=hasEnd?dateInputValue(event.end):day;
  const time=event.allDay?'全天':dateField('hour',startClock);
  const timeLabel=event.allDay?day+' 全天':day+' '+startClock+(hasEnd?' 至 '+(endDay===day?'':endDay+' ')+endClock:'');
  const endTime=hasEnd?'<time class="event-time-end" datetime="'+event.end.toISOString()+'">'+endClock+'</time>':'';
  const trip=isTrip(event)?'<button type="button" class="event-action event-trip" data-trip-event="'+i+'" aria-label="查看行程详细" title="查看行程详细">'+entityIcon('trip')+'</button>':'';
  // 备注关键词命中：只检查说明性文字（忽略 Partner/Place 行），命中时高亮显示
  const noteText=searchableEventNote(event.note);
  const noteMatches=noteText?appliedCriteria.filter(c=>c.kind==='keyword'&&matchesCriterionText(c,'note',noteText)):[];
  let noteHtml='';
  if(noteMatches.length){
   const note=highlightNote(noteText,noteMatches.map(c=>c.value));
   noteHtml='<div class="event-note">'+entityIcon('note','event-entity-icon')+'<span>'+note+'</span></div>';
  }
  // 地点命中（含关键字）：先标记，是否展开由布局测量决定，已能完整显示则不展开
  const matchedPlaces=new Set(event.places.filter(name=>appliedCriteria.some(c=>
   (c.kind==='place'||c.kind==='placeGroup')&&matchesCriterionText(c,'place',name)
   ||c.kind==='placeType'&&placeType(name)===c.value
   ||c.kind==='businessArea'&&searchName(businessArea(name))===searchName(c.value)
   ||c.kind==='keyword'&&matchesCriterionText(c,'place',name))));
  return heading+'<article class="event"><div class="eventrow"><button type="button" class="event-time" data-event-range="'+i
   +'" title="'+E(timeLabel)+'" aria-label="'+E('查看 '+timeLabel+' 的事件')+'"><time datetime="'+(event.allDay?day:event.start.toISOString())+'">'+time+'</time>'+endTime+'</button>'
   +'<div class="event-details"><div class="eventname"><button type="button" class="eventtitle" data-event-detail="'+i
   +'" aria-haspopup="dialog" aria-controls="event-detail-dialog">'+eventTitleText(event.title)+'</button>'
   +'<button type="button" class="event-action" data-filter-event="'+i+'" title="筛选此事件" aria-label="筛选此事件">'
   +entityIcon('filter')+'</button>'+trip+'</div>'
   +eventEntities(event.places,'place',i,showPlaces,expandedEventPlaces.has(key),matchedPlaces)
   +eventEntities(event.partners,'person',i,showPeople)
   +noteHtml
   +'</div></div></article>';
 }).join('')||(appliedCriteria.length?'<div class="empty">当前筛选无事件 <button type="button" data-reset-event-filters>清除全部筛选</button></div>'
  :'<div class="empty">这个时段无事件 <button type="button" data-change-event-range>修改时间范围</button></div>');
 $('more').hidden=rows.length<=limit;
 container.querySelectorAll('[data-place-toggle]').forEach(button=>button.onclick=()=>{
  const key=eventKey(rows[+button.dataset.placeToggle]),expanded=!expandedEventPlaces.has(key);
  if(expanded)expandedEventPlaces.add(key);
  else expandedEventPlaces.delete(key);
  button.parentElement.classList.toggle('is-expanded',expanded);
  button.title=expanded?'收起地点':'展开地点';
  button.setAttribute('aria-expanded',String(expanded));
  button.setAttribute('aria-label',expanded?'收起地点':'展开地点');
  scheduleEventLayout();
 });
 container.querySelectorAll('[data-event-range]').forEach(el=>el.onclick=()=>selectEventRange(rows[+el.dataset.eventRange]));
 for(const [kind,field] of [['place','places'],['person','partners']]){
  const key=kind==='place'?'filterPlace':'filterPerson';
  container.querySelectorAll('[data-filter-'+kind+']').forEach(el=>el.onclick=()=>setEntityFilter(field,el.dataset[key]));
 }
 container.querySelectorAll('[data-filter-event]').forEach(el=>el.onclick=()=>{
  filterSameEvent(rows[+el.dataset.filterEvent]);
  $('search').focus?.({preventScroll:true});
 });
 container.querySelectorAll('[data-event-detail]').forEach(el=>el.onclick=()=>showEventDetails(rows[+el.dataset.eventDetail]));
 container.querySelector('[data-reset-event-filters]')?.addEventListener('click',()=>{
  activeCriteria=[];$('search').value='';refresh();fitPoints();$('search').focus?.();
 });
 container.querySelector('[data-change-event-range]')?.addEventListener('click',()=>$('timeline-range').click());
 container.querySelectorAll('[data-trip-event]').forEach(el=>el.onclick=()=>openTrips(rows[+el.dataset.tripEvent]));
 scheduleEventLayout();
 scheduleEventJump();
}
function renderFilterChips(){
 const container=$('activefilters');
 updateFilterHint('event-filter-indicator',appliedCriteria.filter(c=>c.kind!=='time').map(c=>criterionDisplay(c).value));
 const chip=(c,attribute)=>{
  const {label,icon,value}=criterionDisplay(c);
  return filterChip(attribute,'移除'+label+'筛选：'+value,icon?value:label+'：'+value,icon);
 };
 container.innerHTML=activeCriteria.map((c,i)=>c.kind==='time'?'':chip(c,'data-remove-filter="'+i+'"')).join('')
  +(draftCriterion&&!activeCriteria.some(c=>c.id===draftCriterion.id)?chip(draftCriterion,'data-remove-draft'):'');
 $('filter-summary').hidden=!container.innerHTML&&$('timeline-date-conditions').hidden;
 container.querySelectorAll('[data-remove-filter]').forEach(el=>el.onclick=()=>{
  const index=+el.dataset.removeFilter;
  activeCriteria.splice(index,1);
  refresh();
  fitPoints();
  (container.querySelector('[data-remove-filter="'+index+'"]')||container.querySelector('button')||$('search')).focus?.({preventScroll:true});
 });
 container.querySelector('[data-remove-draft]')?.addEventListener('click',()=>{$('search').value='';refresh();$('search').focus?.({preventScroll:true});});
}

let regionAuto={};
function fillAddressRegions(){const f=$('editform'),address=f.elements.address.value;if(!address.trim())return;let fallback={};if(world&&china&&validCoord({lat:f.elements.lat.value,lon:f.elements.lon.value})){const [lat,lon]=toWgs(+f.elements.lat.value,+f.elements.lon.value,f.elements.datum.value);fallback=inferRegion(lat,lon);}const inferred=regionFromAddress(address,cities,china?.features.map(f=>f.properties.name)||[],fallback);for(const k of ['country','province','city']){const value=inferred[k]||'';if(!f.elements[k].value||f.elements[k].value===regionAuto[k])f.elements[k].value=value;regionAuto[k]=value;}}
const isClosed=v=>String(v||'').toLowerCase()==='no';
function edit(name=''){editingVersion=csvVersion;regionAuto={};$('editerror').textContent='';const original=baseCoords.get(normalizePlace(name));const p=original||{};const form=$('editform');for(const k of ['address','country','province','city','lat','lon','type','labels','business_area'])form.elements[k].value=p[k]||(k==='type'?'other':'');form.elements.location.value=original?.location||name;form.elements.location.readOnly=Boolean(name);form.elements.valid.value=isClosed(p.valid)?'no':'';form.dataset.origValid=p.valid||'';form.elements.datum.value=p.datum||(original&&validCoord(p)&&isMainland(+p.lat,+p.lon)?$('datum').value:'wgs84');fillAddressRegions();$('editor').showModal();}
async function readCSV(){const r=await fetch('api/places',{cache:'no-store'});if(!r.ok)throw Error('CSV 读取失败');const data=await r.json();csvVersion=data.version;reference.places=data.places;setupReference();return data;}
async function writeCSV(updates,version=csvVersion){const r=await fetch('api/places',{method:'POST',headers:{'Content-Type':'application/json','X-Atlas-Write':'1'},body:JSON.stringify({version,updates})});const data=await r.json();if(!r.ok)throw Error(data.error||'CSV 保存失败');csvVersion=data.version;reference.places=data.places;setupReference();refresh();updateDataTimes(['places']);}
for(const key of ['address','lat','lon','datum'])$('editform').elements[key].addEventListener('change',fillAddressRegions);$('editform').elements.address.addEventListener('input',fillAddressRegions);for(const key of ['country','province','city'])$('editform').elements[key].addEventListener('input',()=>{regionAuto[key]=null;});
$('editform').onsubmit=async e=>{e.preventDefault();const p=Object.fromEntries(new FormData(e.target));if(p.valid!=='no'){const ov=e.target.dataset.origValid||'';p.valid=(ov&&ov!=='no')?ov:'';}$('saveplace').disabled=true;$('editerror').textContent='';try{await writeCSV([p],editingVersion);$('editor').close();}catch(err){$('editerror').textContent=err.message;}finally{$('saveplace').disabled=false;}};
$('cancel').onclick=()=>$('editor').close();
let calendarPreviewBusy=false;
$('desktop-calendar-import').onclick=()=>$('ics').click();
$('calendar-preview-close').onclick=()=>$('calendar-preview').close();
$('calendar-preview').oncancel=event=>{if(calendarPreviewBusy)event.preventDefault();};
$('ics').onchange=async event=>{
 const file=event.target.files[0];
 event.target.value='';
 if(!file||mobileSource)return;
 const dialog=$('calendar-preview'),status=$('calendar-preview-status'),body=$('calendar-preview-body');
 const inspect=$('calendar-preview-only'),save=$('calendar-preview-save'),close=$('calendar-preview-close');
 body.innerHTML='';
 inspect.disabled=save.disabled=true;
 status.textContent='正在核对日历…';
 if(!dialog.open)dialog.showModal();
 try{
  const [text,response]=await Promise.all([file.text(),fetch('api/calendar',{cache:'no-store'})]);
  if(!response.ok&&response.status!==404)throw Error('无法读取本地日历');
  const current=response.ok?await response.text():'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';
  const version=response.headers?.get('ETag');
  const result=compareCalendars(current,text,name=>baseCoords.has(normalizePlace(name)));
  const eventText=record=>[record.start.slice(0,10),record.title,
   ...(record.addedPlaces?.length?['新增地点 '+record.addedPlaces.join('、')]:[]),
   ...(record.addedPartners?.length?['新增同伴 '+record.addedPartners.join('、')]:[])].filter(Boolean).join(' · ');
  const sections=[
   ['新增事件',result.added,eventText],
   ['更新事件',result.changed,eventText],
   ['本次文件未包含',result.missing,eventText],
   ['地点库未匹配',result.unmatched,name=>name],
  ];
  body.innerHTML=sections.map(([label,rows],i)=>'<details data-preview-section="'+i+'"><summary>'+label+
   ' <strong>'+rows.length+'</strong></summary><ol></ol></details>').join('');
  body.querySelectorAll('[data-preview-section]').forEach(section=>section.ontoggle=()=>{
   if(!section.open)return;
   const [,rows,format]=sections[Number(section.dataset.previewSection)];
   const list=section.querySelector('ol');
   if(!list.childElementCount)list.innerHTML=rows.map(row=>'<li>'+E(format(row))+'</li>').join('');
  });
  status.textContent=result.missing.length
   ?file.name+' · 替换后，当前文件独有的 '+result.missing.length+' 条事件只会保留在备份中。'
   :file.name+' · 核对后可选择查看或替换。';
  inspect.disabled=false;
  save.disabled=!version;
  inspect.onclick=()=>{load(text);dialog.close();};
  save.onclick=async()=>{
   calendarPreviewBusy=true;
   save.disabled=inspect.disabled=close.disabled=true;
   try{
    const saved=await fetch('api/calendar',{method:'POST',
     headers:{'Content-Type':'application/json','X-Atlas-Write':'1'},body:JSON.stringify({version,text})});
    if(!saved.ok)throw Error((await saved.json()).error||'替换日历失败');
    load(text,true);
    await updateDataTimes(['calendar']);
    status.textContent='本地日历已替换。原文件备份保存在 atlas-data/.backups。';
   }catch(error){
    status.textContent=error.message;
    inspect.disabled=false;
    save.disabled=false;
   }finally{calendarPreviewBusy=false;close.disabled=false;}
  };
 }catch(error){status.textContent=error.message||'无法读取日历';}
};
function buildPoints(){
 const level=mapLevel(),byKey=new Map(),placeNames=new Set();
 const totals=occurrenceCounts(currentCountedRows(),({places})=>{
  const keys=[];
  for(const name of places){
   placeNames.add(name);
   const p=pos(name);
   if(!p)continue;
   const label=level==='place'?name:p[level];
   if(!label)continue;
   const key=level==='city'?[p.country,p.province,p.city].join('|'):label;
   if(!byKey.has(key)){
    const center=level==='place'?p:gaz.find(x=>x[level]===label&&x.precision===level&&(level!=='city'||x.province===p.province))||p;
    byKey.set(key,{...center,name:label,regionKey:key,names:new Set()});
   }
   byKey.get(key).names.add(name);
   keys.push(key);
  }
  return keys;
 },$('merge-same-day').checked);
 points=[...byKey.values()].map(p=>({...p,count:totals.get(p.regionKey)}));
 setSectionTitle('map-title','地点 · '+placeNames.size);
}
function renderMapResults(fit=false){
 if($('map-body').hidden)return;
 buildPoints();
 draw();
 if(fit)fitPoints();
}
function fitPoints(){
 if($('map-body').hidden)return;
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
 return nextText=>{
  text=nextText;
  layer.setTooltipContent(text);
 };
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
const placeMarkers=new Map();
let clusteredPlaces;
function updatePlaceMarkerSize(){
 const zoom=map.getZoom();
 $('map').dataset.markerSize=typeof zoom!=='number'?'standard':zoom<=7?'wide':zoom>12?'detail':'standard';
}
map.on('zoomend',updatePlaceMarkerSize);
updatePlaceMarkerSize();
function drawPlaceMarkers(heat){
 const aggregate=$('aggregate').checked;
 const overlap=aggregate&&placeMarkers.size
  ?points.reduce((count,point)=>count+Number(placeMarkers.has(point.regionKey)),0):0;
 const largeChange=aggregate&&placeMarkers.size&&
  points.length+placeMarkers.size-2*overlap>Math.max(100,Math.min(points.length,placeMarkers.size)/2);
 if(!markerLayer||aggregate!==clusteredPlaces||largeChange){
  // Bulk range changes are cheaper to cluster off the map.
  if(markerLayer)map.removeLayer(markerLayer);
  markerLayer=aggregate?L.markerClusterGroup({maxClusterRadius:45,showCoverageOnHover:false,zoomToBoundsOnClick:true}):L.layerGroup();
  placeMarkers.clear();
  clusteredPlaces=aggregate;
 }
 const gcj=Boolean(basemaps[$('provider').value]?.gcj02);
 const visible=new Set(), additions=[], removals=[], circles=[];
 const icon=(emoji,precision)=>L.divIcon({className:'visit-marker '+(precision==='exact'?'exact':'approx'),
  html:'<span class="visit-marker-face"><span class="single-emoji">'+E(emoji)+'</span></span>',iconSize:[28,28],iconAnchor:[14,14]});
 for(const point of points){
  if(!validCoord(point))continue;
  const key=point.regionKey;
  let record=placeMarkers.get(key);
  const coord=record?.gcj===gcj&&record.point.lat===point.lat&&record.point.lon===point.lon
   ?record.coord:displayPoint(point.lat,point.lon);
  const emoji=selectEmoji(point,baseCoords,emojiConfig);
  if(!record){
   const marker=L.marker(coord,{icon:icon(emoji,point.precision)});
   record={marker,point};
   record.updateTooltip=bindMapVisit(marker,E(point.name)+' · '+point.count+' 次',()=>setMapFilter(record.point));
   placeMarkers.set(key,record);
   additions.push(marker);
  }else{
   if(coord[0]!==record.coord[0]||coord[1]!==record.coord[1])record.marker.setLatLng(coord);
   if(emoji!==record.emoji||point.precision!==record.point.precision)record.marker.setIcon(icon(emoji,point.precision));
   if(point.count!==record.point.count)record.updateTooltip(E(point.name)+' · '+point.count+' 次');
  }
  Object.assign(record,{point,coord,emoji,gcj});
  visible.add(key);
  if(heat)circles.push([...coord,Math.min(1,Math.log2(point.count+1)/5)]);
 }
 for(const [key,record] of placeMarkers){
  if(visible.has(key))continue;
  removals.push(record.marker);
  placeMarkers.delete(key);
 }
 if(aggregate){
  if(removals.length)markerLayer.removeLayers(removals);
  if(additions.length)markerLayer.addLayers(additions);
 }else{
  for(const marker of removals)markerLayer.removeLayer(marker);
  for(const marker of additions)markerLayer.addLayer(marker);
 }
 if(heat)drawHeat(circles);
 if(!map.hasLayer(markerLayer))markerLayer.addTo(map);
}
function draw(){if($('map-body').hidden)return;clearTouchPreview();shanghaiLayerControl.hidden=mapLevel()!=='shanghai';
 domesticLayerControl.hidden=!isDomesticLevel(mapLevel());
 domesticLayerControl.querySelector('summary').textContent=domesticLevel==='city'?'图层 · 城市':'图层 · 省份';
 for(const radio of domesticLayerControl.querySelectorAll('input[type="radio"]'))radio.checked=radio.value===domesticLevel;
 for(const input of domesticLayerControl.querySelectorAll('input[type="checkbox"]'))input.closest('label').hidden=mapLevel()!=='city';
 placeToggles.hidden=mapLevel()!=='place';
 for(const input of placeToggles.querySelectorAll('input'))input.checked=$(input.name).checked;const heat=Boolean($('heatmap')&&$('heatmap').checked)&&mapLevel()==='place';if(mapLevel()!=='place'){drawOverview();return;}map.options.zoomSnap=1;map.setMinZoom(0);map.setMaxZoom(18);overviewLevel='';clearOverview();if(!tiles||!map.hasLayer(tiles))setProvider(false);$('provider').disabled=false;$('provider').style.display='';if(heatLayer)map.removeLayer(heatLayer);drawPlaceMarkers(heat);}
map.on('click',e=>{clearTouchPreview();if(!pickMode)return;pickMode=false;const p=basemaps[$('provider').value]?.gcj02&&mapLevel()==='place'&&isMainland(e.latlng.lat,e.latlng.lng)?gcjToWgs(e.latlng.lat,e.latlng.lng):[e.latlng.lat,e.latlng.lng];$('editform').elements.lat.value=p[0].toFixed(6);$('editform').elements.lon.value=p[1].toFixed(6);$('editform').elements.datum.value='wgs84';$('editor').showModal();$('status').textContent='已选取坐标，点击保存完成标注';});
$('pickpoint').onclick=async()=>{
 $('level').value='place';
 if($('map-body').hidden)await setSectionCollapsed('map',false);
 else await loadMainMap();
 if($('map-body').hidden||mapLevel()!=='place')return;
 pickMode=true;
 $('editor').close();
 $('status').textContent='请在地图上点击精确位置（坐标仅存本机）';
};
$('reset').onclick=()=>{if(mapLevel()==='shanghai')fitOverview();else renderMapResults(true);};
$('level').onchange=loadMainMap;
$('exclude').onchange=refresh;
function previewSearch(event){if(!event?.isComposing)refresh({deferPanels:true});}
$('search').oninput=$('search').oncompositionend=$('searchscope').onchange=previewSearch;
$('searchform').onsubmit=event=>{
 event.preventDefault();
 const value=$('search').value.trim();
 if(!value)return;
 const criterion=searchEventCriterion(value,rangeCache?.events||[]);
 if(!activeCriteria.some(item=>item.id===criterion.id))activeCriteria.push(criterion);
 $('search').value='';
 refresh();
 fitPoints();
};
$('more').onclick=()=>{
 const list=$('eventlist-body'),winTop=window.scrollY,listTop=list.scrollTop;
 limit+=50;
 renderEvents();
 const restore=()=>{
  list.scrollTop=listTop;
  if(window.scrollY!==winTop)window.scrollTo({top:winTop,behavior:'instant'});
 };
 restore();
 if(typeof requestAnimationFrame==='function')requestAnimationFrame(restore);
};
$('unselect').onclick=()=>{activeCriteria=activeCriteria.filter(c=>c.kind==='time');$('search').value='';refresh();};
document.querySelectorAll('[data-panel]').forEach(el=>el.onclick=()=>{tab=el.dataset.tab;document.querySelectorAll('[data-panel]').forEach(x=>x.classList.toggle('active',x===el));renderRank();});document.querySelectorAll('[data-settings-panel]').forEach(el=>el.onclick=()=>{activePanel=el.dataset.settingsPanel;document.querySelectorAll('[data-settings-panel]').forEach(x=>x.classList.toggle('active',x===el));$('settings-drawer').querySelectorAll('[data-content]').forEach(x=>x.hidden=x.dataset.content!==activePanel);if(activePanel==='manage')renderPlaces();});
try{
 const pref=JSON.parse(localStorage.getItem('atlas-event-columns')||'{}');
 for(const key of Object.keys(eventColumns))eventColumns[key]=pref[key]!==false;
}catch{}
for(const [id,key] of [['showplaces','places'],['showpeople','people']]){
 const button=$(id);
 button.setAttribute('aria-pressed',String(eventColumns[key]));
 button.onclick=()=>{
  eventColumns[key]=!eventColumns[key];
  button.setAttribute('aria-pressed',String(eventColumns[key]));
  try{localStorage.setItem('atlas-event-columns',JSON.stringify(eventColumns));}catch{}
  renderEvents();
 };
}


function setupReference(){
 baseCoords=placeIndex(reference.places,normalizePlace);
 setPlaceResolver(name=>baseCoords.get(normalizePlace(name))?.location||name);
 cache.clear();
 rangeCache=null;
 timelineKey='';
 activityCache=new WeakMap();
 $('referenceinfo').textContent=reference.places.length+' 条';
 $('datum').value=localStorage.getItem('atlas-datum-v2')||'gcj02';
}
async function readConfigFiles(){const r=await fetch('api/config',{cache:'no-store'});if(!r.ok)throw Error('配置读取失败');const d=await r.json();rules=d;emojiConfig=d.emojis;configVersion=d.version;}
function renderBlacklist(){const all=rules.blacklist||[],type=$('blacklist-type').value||'all',q=$('blacklist-search').value.toLowerCase();$('blacklist-summary').textContent=all.length+' 条';if(!$('rule-list-details').open)return;$('blacklist-rows').innerHTML=all.map((r,i)=>({r,i})).filter(({r})=>(type==='all'||r.type===type)&&(!q||[r.value,r.reason,r.type].join(' ').toLowerCase().includes(q))).map(({r,i})=>'<div class="blacklist-row '+(r.enabled==='0'?'off':'')+'"><label class="check"><input type="checkbox" data-rule-toggle="'+i+'" '+(r.enabled!=='0'?'checked':'')+(blacklistBusy||mobileSource?' disabled':'')+' aria-label="启用此规则"><span class="rule-type">'+(r.type==='event'?'事件':'地点')+'</span></label><div class="rule-body"><b>'+E(r.value)+'</b><small>'+({contains:'包含关键词',exact:'完整名称',uid:'事件 UID'}[r.match_type]||r.match_type)+'</small></div><div class="rule-actions"><button data-rule-edit="'+i+'" '+(blacklistBusy||mobileSource?'disabled':'')+' title="编辑规则" aria-label="编辑规则">'+entityIcon('edit')+'</button><button data-rule-delete="'+i+'" '+(blacklistBusy||mobileSource?'disabled':'')+' title="删除规则" aria-label="删除规则">'+entityIcon('trash')+'</button></div></div>').join('')||'<div class="empty">没有匹配规则</div>';$('blacklist-rows').querySelectorAll('[data-rule-toggle]').forEach(el=>el.onchange=async()=>{const rows=structuredClone(rules.blacklist);rows[+el.dataset.ruleToggle].enabled=el.checked?'1':'0';await persistBlacklist(rows);});$('blacklist-rows').querySelectorAll('[data-rule-edit]').forEach(el=>el.onclick=()=>editBlacklist(+el.dataset.ruleEdit));$('blacklist-rows').querySelectorAll('[data-rule-delete]').forEach(el=>el.onclick=async()=>{const rows=rules.blacklist.filter((r,i)=>i!==+el.dataset.ruleDelete);await persistBlacklist(rows);});}
async function persistBlacklist(rows,version=configVersion){if(blacklistBusy)return false;blacklistBusy=true;$('blacklist-error').textContent='';renderBlacklist();try{const response=await fetch('api/config',{method:'POST',headers:{'Content-Type':'application/json','X-Atlas-Write':'1'},body:JSON.stringify({version,blacklist:rows})});const d=await response.json();if(!response.ok)throw Error(d.error||'黑名单保存失败');rules=d;emojiConfig=d.emojis;configVersion=d.version;timelineKey='';refresh();updateDataTimes(['blacklist']);return true;}catch(e){$('blacklist-error').textContent=e.message;return false;}finally{blacklistBusy=false;renderBlacklist();}}
function editBlacklist(index=-1){blacklistEditing=index;blacklistEditVersion=configVersion;const r=rules.blacklist?.[index]||{type:$('blacklist-type').value==='place'?'place':'event',enabled:'1',match_type:'contains',value:'',reason:''};const f=$('blacklist-form');for(const k of ['type','match_type','value','reason'])f.elements[k].value=r[k]||'';f.elements.enabled.checked=r.enabled!=='0';$('blacklist-editor-title').textContent=index<0?'新增规则':'编辑规则';$('blacklist-form-error').textContent='';$('blacklist-editor').showModal();}
$('blacklist-form').onsubmit=async e=>{e.preventDefault();const f=e.target;const r={type:f.elements.type.value,enabled:f.elements.enabled.checked?'1':'0',match_type:f.elements.match_type.value,value:f.elements.value.value,reason:f.elements.reason.value};if(r.type==='place'&&r.match_type==='uid'){$('blacklist-form-error').textContent='UID 仅适用于事件';return;}$('save-blacklist').disabled=true;try{const rows=structuredClone(rules.blacklist||[]);if(blacklistEditing<0)rows.push(r);else rows[blacklistEditing]=r;if(await persistBlacklist(rows,blacklistEditVersion))$('blacklist-editor').close();else $('blacklist-form-error').textContent=$('blacklist-error').textContent;}finally{$('save-blacklist').disabled=false;}};
$('cancel-blacklist').onclick=()=>$('blacklist-editor').close();$('add-blacklist').onclick=()=>editBlacklist();$('blacklist-type').onchange=$('blacklist-search').oninput=renderBlacklist;
$('datum').onchange=()=>{localStorage.setItem('atlas-datum-v2',$('datum').value);cache.clear();refresh();};
function ensureTimelineYears(){
 if(!timelineYearsDirty)return;
 let min=Infinity,max=new Date().getFullYear();
 const splitTrips=$('split-trip-days').checked;
 for(const event of source){
  const year=event.startDate?.toJSDate().getFullYear();
  if(Number.isFinite(year)){
   min=Math.min(min,year);
   max=Math.max(max,year);
  }
  if(splitTrips&&isTrip({title:event.summary})){
   try{
    const end=event.endDate?.toJSDate();
    const last=new Date(+end-1).getFullYear();
    if(last>max)max=last;
   }catch{}
  }
 }
 yearMin=Number.isFinite(min)?min:max;
 yearMax=max;
 timelineYearsDirty=false;
}
function timelineMonthBounds(){
 const byTripDays=$('split-trip-days').checked;
 let first=Infinity,last=-Infinity;
 for(const event of timelineEvents){
  const start=event.start;
  first=Math.min(first,start.getFullYear()*12+start.getMonth());
  const end=byTripDays&&isTrip(event)&&event.end>start?new Date(+event.end-1):start;
  last=Math.max(last,end.getFullYear()*12+end.getMonth());
 }
 return [Number.isFinite(first)?first:yearMin*12,Number.isFinite(last)?last:yearMax*12+11];
}
for(const id of countOptionIds)$(id).onchange=()=>{
 try{localStorage.setItem('atlas-count-options',JSON.stringify(Object.fromEntries(countOptionIds.map(id=>[id,$(id).checked]))));}catch{}
 if(!source.length)return;
 if(id==='split-trip-days')timelineYearsDirty=true;
 refresh({timeline:id!=='merge-same-day'});
};
function ensureTimeline(){
 ensureTimelineYears();
 const recurring=$('recurring').checked,exclude=$('exclude').checked;
 const key=JSON.stringify([source.length,yearMin,yearMax,recurring,exclude,rules,csvVersion]);
 if(key===timelineKey)return;
 timelineEvents=applyRules(expand(source,new Date(yearMin,0,1),new Date(yearMax,11,31,23,59,59,999),recurring).events,rules,exclude,new Set()).events;
 timelineKey=key;
}
function heightPreference(id,{min,max,fallback,apply}){
 const input=$(id),label=$(id+'-label'),handle=$(id+'-handle'),key='atlas-'+id;
 handle.setAttribute('aria-valuemin',String(min));
 handle.setAttribute('aria-valuemax',String(max));
 let stored=Number(localStorage.getItem(key));
 if(!Number.isFinite(stored)||stored<min||stored>max)stored=0;
 const update=(value,customized)=>{
  input.value=String(value);
  label.textContent=value+' px';
  handle.setAttribute('aria-valuenow',String(value));
  apply(value,customized);
 };
 update(stored||fallback(),Boolean(stored));
 input.oninput=()=>update(Number(input.value),true);
 input.onchange=()=>{
  stored=Number(input.value);
  localStorage.setItem(key,String(stored));
 };
 setupPanelHeightHandle(handle,input);
 return ()=>{if(!stored)update(fallback(),false);};
}
function setupPanelHeightHandle(handle,input){
 let drag;
 const setValue=value=>{
  const previous=input.value;
  input.value=String(value);
  if(input.value===previous)return false;
  input.dispatchEvent(new Event('input',{bubbles:true}));
  return true;
 };
 const save=()=>input.dispatchEvent(new Event('change',{bubbles:true}));
 handle.addEventListener('pointerdown',event=>{
  if(drag||!event.isPrimary||event.button!==0)return;
  drag={id:event.pointerId,y:event.clientY,height:Number(input.value),changed:false};
  handle.focus({preventScroll:true});
  handle.setPointerCapture(event.pointerId);
  document.body.classList.add('height-dragging');
  event.preventDefault();
 });
 globalThis.addEventListener?.('pointermove',event=>{
  if(event.pointerId!==drag?.id)return;
  if(setValue(drag.height+event.clientY-drag.y))drag.changed=true;
 });
 const stop=event=>{
  if(event.pointerId!==drag?.id)return;
  if(drag.changed)save();
  drag=null;
  document.body.classList.remove('height-dragging');
 };
 globalThis.addEventListener?.('pointerup',stop);
 globalThis.addEventListener?.('pointercancel',stop);
 handle.addEventListener('keydown',event=>{
  if(event.key!=='ArrowUp'&&event.key!=='ArrowDown')return;
  event.preventDefault();
  const step=Number(input.step);
  if(setValue(Number(input.value)+(event.key==='ArrowDown'?step:-step)))save();
 });
}
let chartHeight;
heightPreference('timeline-height',{
 min:110,max:230,fallback:()=>150,
 apply(value){
  chartHeight=value;
  document.body.style.setProperty('--timeline-chart-height',value+'px');
 },
});
const chartHeightInput=$('timeline-height'),changeChartHeight=chartHeightInput.oninput;
chartHeightInput.oninput=()=>{
 changeChartHeight();
 if(focusView())renderFocusChart();
 else renderOverviewChart();
};
function defaultMapHeight(){
 if(typeof matchMedia!=='function')return 360;
 const viewport=window.innerHeight;
 const responsive=matchMedia('(max-width:650px)').matches?Math.max(170,viewport*.32):
  matchMedia('(max-width:1100px),(max-height:760px)').matches?Math.max(200,viewport*.4):Math.max(300,viewport*.58);
 return Math.max(170,Math.min(800,Math.round(responsive/10)*10));
}
const syncMapHeight=heightPreference('map-height',{
 min:170,max:800,fallback:defaultMapHeight,
 apply(value,customized){
  document.body.style.setProperty('--map-height',customized?value+'px':'');
  if(!observesMapSize&&!$('map-body').hidden)map.invalidateSize({animate:false});
 },
});
globalThis.addEventListener?.('resize',syncMapHeight,{passive:true});
function barDescription(label,total,matched,scoped){
 return label+' · '+[matched,scoped,total].filter(value=>value!==null).join(' / ')+' 条事件';
}
function timelineBar({total,inRange,scoped,matched,peak,label,shortLabel}){
 const plot=chartHeight-54;
 const range=barHeights(total,inRange,peak,plot),dates=barHeights(total,scoped??0,peak,plot),hit=barHeights(total,matched??0,peak,plot);
 const distinctDate=scoped!==total&&scoped!==matched;
 const layout=timelineCountLayout(range.total,distinctDate?dates.matched:0,hit.matched);
 const count=(value,className,position)=>position?'<span class="bar-number '+className+(position.inside?' inside':'')
  +'" style="--count-digits:'+String(value).length+';bottom:'+position.bottom+'px" aria-hidden="true">'+value+'</span>':'';
 return '<span class="bar-stack" style="height:'+range.total+'px;--range-height:'+range.matched+'px;--scoped-height:'+dates.matched+'px;--matched-height:'+hit.matched+'px">'
  +'<i class="bar-original"></i><i class="bar-range"></i>'+(scoped===null?'':'<i class="bar-scoped"></i>')+(matched===null?'':'<i class="bar-matched"></i>')
  +(total?count(total,'barcount',layout.total)+count(scoped,'bar-date-count',layout.dated)+count(matched,'bar-match-count',layout.hit):'')
  +'</span>'+(label?'<span class="bar-label"><span class="year-full">'+label+'</span><span class="year-short" aria-hidden="true">'+shortLabel+'</span></span>':'');
}
const periodIndex=(date,monthly)=>Number(date.slice(0,4))*(monthly?12:1)+(monthly?Number(date.slice(5,7))-1:0);
const monthLabel=index=>Math.floor(index/12)+'-'+String(index%12+1).padStart(2,'0');
const overviewBars=$('yearbars');
let overviewBounds,overviewMonths;
function renderOverviewChart(){
 if(collapsedSections.timeline||focusView()||!filteredView)return;
 ensureTimeline();
 const monthly=overviewUnit==='month';
 const [min,max]=monthly?timelineMonthBounds():[yearMin,yearMax];
 overviewBounds=[min,max];
 const [a,b]=selectedRange.map(date=>periodIndex(date,monthly));
 const periods=periodCounts(timelineEvents,monthly,min,max);
 addMatches(periods,filteredView.events,monthly,min,'inRange');
 const hasDates=Boolean(filteredView.scoped);
 if(hasDates)addMatches(periods,filteredView.scoped,monthly,min,'scoped');
 const hasMatches=Boolean(filteredView.matched);
 if(hasMatches)addMatches(periods,filteredView.matched,monthly,min);
 const peak=Math.max(1,...periods.map(p=>p.total));
 $('timeline-track').classList.toggle('monthly',monthly);
 $('timeline-month-axis').hidden=!monthly;
 overviewBars.innerHTML=periods.map(({index,total,inRange=0,scoped=0,matched})=>{
  const date=monthly?monthLabel(index):String(index);
  const hit=hasMatches?matched:null;
  const selected=index>=a&&index<=b;
  const dates=hasDates?scoped:null;
  const description=barDescription(date,total,hit,dates);
  return '<button type="button" class="yearbar '+(selected?'selected ':'')+(monthly&&index>min&&index%12===0?'year-start':'')
   +'" data-period="'+index+'" data-total="'+total+'" data-matched="'+(hit??0)+'" aria-pressed="'+selected+'" title="'+description+'" aria-label="'+description+'">'
   +timelineBar({total,inRange,scoped:dates,matched:hit,peak,label:monthly?'':date,shortLabel:'&#39;'+date.slice(-2)})+'</button>';
 }).join('');
 for(const button of overviewBars.querySelectorAll('[data-period]'))button.onclick=event=>{
  const index=Number(button.dataset.period);
  const start=event?.shiftKey?periodIndex(selectedRange[0],monthly):index;
  selectPeriods(Math.max(min,Math.min(max,start)),index);
  if(!event?.detail)overviewBars.querySelector('[data-period="'+index+'"]')?.focus({preventScroll:true});
 };
 fitOverviewChart();
}
function fitTimelineColumns(container,width,count,monthly=false){
 if(!width||!count)return;
 const compact=!monthly&&(width-4*(count-1))/count<29;
 container.classList.toggle('compact-years',compact);
 const gap=monthly?0:compact?1:4;
 container.style.setProperty('--count-column',String(Math.max(1,(width-gap*(count-1))/count)));
}
function fitOverviewChart(){
 const width=overviewBars.clientWidth;
 if(!width||!overviewBounds)return;
 const monthly=overviewUnit==='month';
 const [min,max]=overviewBounds,count=max-min+1;
 fitTimelineColumns($('timeline-track'),width,count,monthly);
 if(!monthly)return;
 const track=$('timeline-track');
 overviewMonths=monthlyColumns(width,min,max);
 const {columnWidth,yearGap,groups}=overviewMonths;
 track.style.setProperty('--month-width',columnWidth+'px');
 track.style.setProperty('--count-column',String(columnWidth));
 track.style.setProperty('--month-year-gap',yearGap+'px');
 track.classList.toggle('readable-counts',columnWidth>=18);
 const [a,b]=selectedRange.map(date=>periodIndex(date,true));
 const labels=groups.map(({year,start,end,left,width:span})=>{
  const center=left+span/2,full=span>=39,half=full?17:11;
  return {year,center,left:center-half,right:center+half,selected:a<end&&b>=start,label:full?year:'’'+String(year).slice(-2)};
 });
 const shown=[];
 for(const label of [...labels.filter(item=>item.selected),...labels.filter(item=>!item.selected)]){
  if(label.left<0||label.right>width||shown.some(other=>label.left<other.right+3&&label.right+3>other.left))continue;
  shown.push(label);
 }
 $('timeline-month-axis').innerHTML=shown.sort((a,b)=>a.year-b.year).map(({center,year,label,selected})=>
  '<span data-axis-year="'+year+'"'+(selected?' class="selected-year"':'')+' style="left:'+center+'px">'+label+'</span>').join('');
}
if(typeof ResizeObserver==='function')new ResizeObserver(fitOverviewChart).observe(overviewBars);
function setTimeRange(start,end){
 selectedRange=[start,end];
 refresh();
}
function selectPeriods(first,last){
 setTimeRange(...periodRange(first,last,overviewUnit==='month'));
}
function setTimeMode(mode){
 timeMode=mode;
 const focus=focusView();
 $('timeline-chart').hidden=focus;
 $('timeline-focus').hidden=!focus;
 $('overview-tools').hidden=focus;
 $('focus-tools').hidden=!focus;
 toggleTimelineButton($('timeline-mode-overview'),!focus);
 toggleTimelineButton($('timeline-mode-focus'),focus);
 refresh();
 scheduleSectionTools();
}
$('timeline-mode-overview').onclick=()=>setTimeMode('overview');
$('timeline-mode-focus').onclick=()=>setTimeMode('focus');
for(const unit of ['year','month'])$('timeline-overview-'+unit).onclick=()=>{
 if(overviewUnit===unit)return;
 overviewUnit=unit;
 for(const option of ['year','month'])toggleTimelineButton($('timeline-overview-'+option),option===unit);
 renderOverviewChart();
};
$('timeline-recent').onclick=()=>{
 if(!source.length)return;
 setRecentRange();
 refresh();
};
$('timeline-all').onclick=()=>{
 if(!source.length)return;
 ensureTimeline();
 if(!timelineEvents.length)return;
 let first=Infinity,last=-Infinity;
 for(const event of timelineEvents){
  first=Math.min(first,+event.start);
  last=Math.max(last,event.end>event.start?+event.end-1:+event.start);
 }
 setTimeRange(dateInputValue(new Date(first)),dateInputValue(new Date(Math.max(last,Date.now()))));
};
let sectionLayoutPending=false;
function setSectionTitle(id,text){
 const element=$(id);
 if(element.textContent===text)return;
 element.textContent=text;
 scheduleSectionTools();
}
function scheduleSectionTools(){
 if(typeof requestAnimationFrame!=='function'){
  fitSectionTools();
  return;
 }
 if(sectionLayoutPending)return;
 sectionLayoutPending=true;
 requestAnimationFrame(()=>{
  sectionLayoutPending=false;
  fitSectionTools();
 });
}
function fitSectionTools(){
 for(const id of ['timeline-header','map-header']){
  const header=$(id),title=header.querySelector('.header-title'),tools=header.querySelector('.header-tools');
  if(!title||!tools||tools.hidden)continue;
  const style=getComputedStyle(header);
  const available=header.getBoundingClientRect().width-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight);
  const remaining=available-title.getBoundingClientRect().width-parseFloat(style.columnGap);
  if(id==='timeline-header'){
   header.classList.remove('tools-on-next-line');
   header.classList.add('measuring-tools');
   const fit=width=>{
    delete header.dataset.toolSize;
    for(const size of ['icons','short','compact','narrow','tight']){
     if(tools.getBoundingClientRect().width<=width)return true;
     header.dataset.toolSize=size;
    }
    return tools.getBoundingClientRect().width<=width;
   };
   const fitsBesideTitle=fit(remaining);
   if(!fitsBesideTitle)fit(available);
   header.classList.remove('measuring-tools');
   header.classList.toggle('tools-on-next-line',!fitsBesideTitle);
  }else{
   header.classList.remove('compact-tools');
   header.classList.toggle('compact-tools',tools.getBoundingClientRect().width>remaining+.5);
  }
 }
}
if(typeof ResizeObserver==='function'){
 const widths=new Map();
 const observer=new ResizeObserver(entries=>{
  if(entries.every(entry=>widths.get(entry.target)===entry.contentRect.width))return;
  for(const {target,contentRect} of entries)widths.set(target,contentRect.width);
  scheduleSectionTools();
 });
 for(const id of ['timeline-header','map-header'])observer.observe($(id));
}

const floatingHint=$('floating-hint');
let hintOwner,hintLocked=false,hintTimer;
function hideFloatingHint(){
 clearTimeout(hintTimer);
 hintOwner?.removeAttribute?.('aria-describedby');
 hintOwner=null;
 hintLocked=false;
 floatingHint.hidden=true;
}
function showFloatingHint(owner,label,locked=false){
 hideFloatingHint();
 hintOwner=owner;
 hintLocked=locked;
 floatingHint.textContent=label;
 floatingHint.hidden=false;
 const anchor=owner.getBoundingClientRect(),{width,height}=floatingHint.getBoundingClientRect();
 const left=Math.min(window.innerWidth-width-6,Math.max(6,(anchor.left+anchor.right-width)/2));
 const top=anchor.top-height-7>=6?anchor.top-height-7:Math.min(window.innerHeight-height-6,anchor.bottom+7);
 floatingHint.style.left=left+'px';
 floatingHint.style.top=Math.max(6,top)+'px';
 owner.setAttribute('aria-describedby','floating-hint');
}
function updateFilterHint(id,values){
 const indicator=$(id),description=values.join(' | ');
 if(hintOwner===indicator&&indicator.dataset.hint!==description)hideFloatingHint();
 indicator.dataset.hint=description;
 indicator.hidden=!description;
}
for(const id of ['timeline-range-indicator','event-filter-indicator']){
 const indicator=$(id);
 let touchGesture,longPressed=false;
 const clearTouch=()=>{clearTimeout(touchGesture?.timer);touchGesture=null;};
 const show=locked=>{if(indicator.dataset.hint)showFloatingHint(indicator,indicator.dataset.hint,locked);};
 indicator.onpointerenter=event=>{if(event.pointerType==='mouse')show(false);};
 indicator.onpointerleave=()=>{if(hintOwner===indicator&&!hintLocked)hideFloatingHint();};
 indicator.onblur=()=>{if(hintOwner===indicator)hideFloatingHint();};
 indicator.onpointerdown=event=>{
  clearTouch();
  longPressed=false;
  if(event.pointerType!=='touch')return;
  touchGesture={x:event.clientX,y:event.clientY,timer:setTimeout(()=>{
   longPressed=true;
   show(true);
  },430)};
 };
 indicator.onpointermove=event=>{
  if(touchGesture&&Math.hypot(event.clientX-touchGesture.x,event.clientY-touchGesture.y)>6)clearTouch();
 };
 indicator.onpointerup=clearTouch;
 indicator.onpointercancel=()=>{clearTouch();if(hintOwner===indicator)hideFloatingHint();};
 indicator.oncontextmenu=event=>{if(touchGesture||longPressed)event.preventDefault();};
 indicator.onclick=()=>{
  if(longPressed){longPressed=false;return;}
  if(hintOwner===indicator&&hintLocked)hideFloatingHint();
  else show(true);
 };
}
document.addEventListener?.('pointerdown',event=>{
 if(hintOwner&&!hintOwner.contains(event.target))hideFloatingHint();
},true);
document.addEventListener?.('scroll',hideFloatingHint,{capture:true,passive:true});
globalThis.addEventListener?.('resize',hideFloatingHint,{passive:true});
document.addEventListener?.('keydown',event=>{
 if(event.key==='Escape'&&hintOwner){
  hideFloatingHint();
  event.stopImmediatePropagation();
 }
},true);

function enableTimelineHold(chart){
 let gesture,handled;
 const stop=()=>{
  clearTimeout(gesture?.timer);
  gesture=null;
 };
 chart.addEventListener('pointerdown',event=>{
  stop();
  handled=null;
  if(event.pointerType!=='touch'||!event.isPrimary||!matchMedia('(orientation: portrait)').matches)return;
  const bar=event.target.closest('.yearbar');
  if(!bar)return;
  gesture={id:event.pointerId,x:event.clientX,y:event.clientY,timer:setTimeout(()=>{
   if(!bar.isConnected)return;
   handled=event.pointerId;
   showFloatingHint(bar,bar.title);
   hintTimer=setTimeout(hideFloatingHint,2000);
  },460)};
 },true);
 chart.addEventListener('pointermove',event=>{
  if(gesture?.id!==event.pointerId)return;
  if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)<5)return;
  stop();
  handled=null;
  hideFloatingHint();
 },true);
 chart.addEventListener('pointerup',stop,true);
 chart.addEventListener('pointercancel',()=>{
  stop();
  handled=null;
  hideFloatingHint();
 },true);
 chart.addEventListener('click',event=>{
  if(handled==null||event.detail===0)return;
  event.preventDefault();
  event.stopPropagation();
 },true);
 chart.addEventListener('contextmenu',event=>{
  if(gesture||handled!=null)event.preventDefault();
 });
 return event=>handled!=null&&handled===event.pointerId;
}
const overviewHold=enableTimelineHold(overviewBars);
enableTimelineHold($('day-frequency-bars'));

let periodGesture;
function periodAt(x){
 const rect=overviewBars.getBoundingClientRect();
 const [min,max]=overviewBounds;
 const hit=document.elementFromPoint(x,rect.top+rect.height/2)?.closest('[data-period]');
 if(hit&&overviewBars.contains(hit))return Number(hit.dataset.period);
 if(overviewUnit==='month'&&overviewMonths){
  const offset=x-rect.left,{groups,columnWidth,yearGap}=overviewMonths;
  const group=groups.find(item=>offset<item.left+item.width+yearGap/2)||groups.at(-1);
  return Math.max(group.start,Math.min(group.end-1,group.start+Math.floor((offset-group.left)/columnWidth)));
 }
 return Math.max(min,Math.min(max,min+Math.floor((x-rect.left)/rect.width*(max-min+1))));
}
function previewPeriods(first,last){
 for(const button of overviewBars.querySelectorAll('[data-period]')){
  const index=Number(button.dataset.period);
  button.classList.toggle('period-preview',index>=Math.min(first,last)&&index<=Math.max(first,last));
 }
}
overviewBars.onpointerdown=event=>{
 const button=event.target.closest('[data-period]');
 if(!button||!event.isPrimary||event.button!==0||event.shiftKey)return;
 const start=Number(button.dataset.period);
 periodGesture={id:event.pointerId,x:event.clientX,start,dragged:false};
 overviewBars.setPointerCapture(event.pointerId);
};
overviewBars.onpointermove=event=>{
 const gesture=periodGesture;
 if(!gesture||event.pointerId!==gesture.id)return;
 if(!gesture.dragged&&Math.abs(event.clientX-gesture.x)<5)return;
 gesture.dragged=true;
 overviewBars.classList.add('choosing-range');
 previewPeriods(gesture.start,periodAt(event.clientX));
};
overviewBars.onpointerup=event=>{
 if(!periodGesture||event.pointerId!==periodGesture.id)return;
 const {start,dragged}=periodGesture;
 periodGesture=null;
 overviewBars.classList.remove('choosing-range');
 if(!overviewHold(event))selectPeriods(start,dragged?periodAt(event.clientX):start);
};
overviewBars.onpointercancel=overviewBars.onlostpointercapture=()=>{
 if(!periodGesture)return;
 periodGesture=null;
 overviewBars.classList.remove('choosing-range');
 for(const button of overviewBars.querySelectorAll('.period-preview'))button.classList.remove('period-preview');
};

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
 if(mapLevel()==='place'&&!$('map-body').hidden)tiles.addTo(map);
 localStorage.setItem('atlas-provider-v2',value);
 if(redraw)draw();
}
function clearRegionLabels(){for(const layer of regionLabels)map.removeLayer(layer);regionLabels=[];}
function clearOverview(keepLayer){
 shanghaiBase?.stations.remove();
 if(shanghaiBase)shanghaiBase.visits=null;
 clearRegionLabels();
 for(const layer of overviewLayers)if(layer!==keepLayer)map.removeLayer(layer);
 overviewLayers=[];
 boundaryLayer=null;
 $('map').classList.remove('administrative','shanghai-overview');
}
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
   regionLabels.push(L.polyline([coord,endpoint],{pane:regionLabelPane,color,weight:1,opacity:.68,interactive:false}).addTo(map));
   regionLabels.push(L.circleMarker(coord,{pane:regionLabelPane,radius:1.5,fillColor:color,fillOpacity:.9,stroke:false,interactive:false}).addTo(map));
  }
  const icon=L.divIcon({className:'region-label province-label'+(shifted?' province-callout':'')+(visited?' visited-label':''),
   html:E(name),iconSize:[w,h],iconAnchor:[w/2,h/2]});
  regionLabels.push(L.marker(position,{pane:regionLabelPane,icon,interactive:false,keyboard:false}).addTo(map));
 }
}
const CAPITALS={'北京市':'北京市','天津市':'天津市','河北省':'石家庄市','山西省':'太原市','内蒙古自治区':'呼和浩特市','辽宁省':'沈阳市','吉林省':'长春市','黑龙江省':'哈尔滨市','上海市':'上海市','江苏省':'南京市','浙江省':'杭州市','安徽省':'合肥市','福建省':'福州市','江西省':'南昌市','山东省':'济南市','河南省':'郑州市','湖北省':'武汉市','湖南省':'长沙市','广东省':'广州市','广西壮族自治区':'南宁市','海南省':'海口市','重庆市':'重庆市','四川省':'成都市','贵州省':'贵阳市','云南省':'昆明市','西藏自治区':'拉萨市','陕西省':'西安市','甘肃省':'兰州市','青海省':'西宁市','宁夏回族自治区':'银川市','新疆维吾尔自治区':'乌鲁木齐市','台湾省':'台北市','香港特别行政区':'香港','澳门特别行政区':'澳门'};const MUNI=['北京市','上海市','天津市','重庆市'];
let _regionNames=null;function zhCountry(pr){if(!pr)return '';const code=pr['ISO3166-1-Alpha-2']||pr.ISO_A2;try{if(code){_regionNames=_regionNames||new Intl.DisplayNames(['zh-CN'],{type:'region'});const n=_regionNames.of(String(code));if(n&&n!==code)return n;}}catch{}const raw=pr.name||pr.ADMIN||pr.NAME;return aliases[raw]||raw||'';}
const _labelPtCache=new WeakMap();
function labelPoint(f){if(f&&_labelPtCache.has(f))return _labelPtCache.get(f);let res=null;try{const polys=geometryPolygons(f.geometry);if(!polys.length)return null;let best=null,bestA=-1;for(const poly of polys){const r=poly[0];if(!r||!r.length)continue;let minx=1e9,maxx=-1e9,miny=1e9,maxy=-1e9;for(const pt of r){if(pt[0]<minx)minx=pt[0];if(pt[0]>maxx)maxx=pt[0];if(pt[1]<miny)miny=pt[1];if(pt[1]>maxy)maxy=pt[1];}const a=(maxx-minx)*(maxy-miny);if(a>bestA){bestA=a;best={poly,minx,maxx,miny,maxy};}}if(!best)return null;const outer=best.poly[0];const inside=(x,y)=>containsPoint([best.poly],x,y);let a=0,cx=0,cy=0;for(let i=0,j=outer.length-1;i<outer.length;j=i++){const x1=outer[j][0],y1=outer[j][1],x2=outer[i][0],y2=outer[i][1],cr=x1*y2-x2*y1;a+=cr;cx+=(x1+x2)*cr;cy+=(y1+y2)*cr;}const px=a?cx/(3*a):(best.minx+best.maxx)/2,py=a?cy/(3*a):(best.miny+best.maxy)/2;if(inside(px,py))res=[py,px];else{let best2=null,bd=Infinity;const N=24;for(let ix=0;ix<N;ix++)for(let iy=0;iy<N;iy++){const x=best.minx+(best.maxx-best.minx)*(ix+0.5)/N,y=best.miny+(best.maxy-best.miny)*(iy+0.5)/N;if(!inside(x,y))continue;const d=(x-px)*(x-px)+(y-py)*(y-py);if(d<bd){bd=d;best2=[y,x];}}res=best2||[py,px];}}catch{}if(f)_labelPtCache.set(f,res);return res;}
function renderRegionLabels(){if(typeof window==='undefined')return;syncShanghaiStations();clearRegionLabels();const level=mapLevel();if(level==='place'||level==='country'&&!world||level==='shanghai'&&!cityBoundaries)return;const size=map.getSize();if(level==='province'){renderProvinceLabels(size);return;}const src=level==='shanghai'?(shanghaiLayerOptions.boundaries?shanghaiDistricts(cityBoundaries):[]):level==='country'?world.features:cityFeatures();const lit=new Set((typeof points!=='undefined'?points:[]).filter(p=>p&&p.count>0).map(p=>p.name));const capName=f=>{const pr=f.properties||{};return CAPITALS[pr.province]===pr.name||MUNI.includes(pr.name);};let entries=src.map(f=>{const pr=f.properties||{};const raw=level==='country'?(pr.name||pr.ADMIN||pr.NAME):pr.name;const name=level==='country'?zhCountry(pr):raw;if(!name)return null;return {f,name,lit:lit.has(name)||lit.has(raw),cap:level==='city'&&capName(f),adcode:pr.adcode||0};}).filter(Boolean);const fnames=new Set(src.map(f=>f.properties.name));if(level==='city'){for(const q of (typeof points!=='undefined'?points:[])){if(!q||!q.count||!q.name||fnames.has(q.name)||!validCoord(q))continue;entries.push({f:null,name:q.name,pt:[+q.lat,+q.lon],lit:true,cap:false,adcode:0});}}const sp=n=>n==='南昌市'||n==='南昌';entries.sort((a,b)=>{if(a.lit!==b.lit)return a.lit?-1:1;if(level==='city'){const sa=sp(a.name),sb=sp(b.name);if(a.lit){if(sa!==sb)return sa?-1:1;if(a.cap!==b.cap)return a.cap?-1:1;return a.adcode-b.adcode;}if(a.cap!==b.cap)return a.cap?-1:1;return a.adcode-b.adcode;}return 0;});if(level==='city')entries=entries.filter(e=>e.lit);const placed=[];for(const en of entries){const{f,name}=en;let c=f?labelPoint(f):en.pt;let bounds=null;if(level==='shanghai'){if(c)c=gcjToWgs(...c);}else try{bounds=L.geoJSON(f).getBounds();}catch{}if(!c&&bounds&&bounds.isValid())c=bounds.getCenter();if(!c)continue;const pt=map.latLngToContainerPoint(c);if(pt.x<0||pt.y<0||pt.x>size.x||pt.y>size.y)continue;const allowSmall=level==='shanghai'||en.lit||en.cap||/香港|澳门/.test(name);if(!allowSmall&&bounds&&bounds.isValid()){const nw=map.latLngToContainerPoint(bounds.getNorthWest()),se=map.latLngToContainerPoint(bounds.getSouthEast());if(Math.abs(se.x-nw.x)<20||Math.abs(se.y-nw.y)<11)continue;}const text=shortRegionName(name);const font=level==='shanghai'?13:12,w=text.length*(font+1)+8;if(placed.some(p=>Math.abs(p.x-pt.x)<(p.w+w)/2&&Math.abs(p.y-pt.y)<16))continue;placed.push({x:pt.x,y:pt.y,w});const cls='region-label'+(en.lit&&level==='city'?' visited-label':!en.lit?' unlit':'');const mk=L.marker(c,{pane:regionLabelPane,icon:L.divIcon({className:cls,html:E(text),iconSize:[w,font+4],iconAnchor:[w/2,(font+4)/2]}),interactive:false,keyboard:false}).addTo(map);regionLabels.push(mk);}if(level==='shanghai')renderShanghaiFeatureLabels(placed,size);}
function capitalCoord(prov){if(MUNI.includes(prov)){const cf=(china?.features||[]).find(f=>f.properties.name===prov);return cf&&cf.properties.center?[cf.properties.center[1],cf.properties.center[0]]:null;}const cap=CAPITALS[prov];if(!cap||!cityBoundaries)return null;const f=cityBoundaries.features.find(x=>x.properties.name===cap&&x.properties.province===prov);return f&&f.properties.center?[f.properties.center[1],f.properties.center[0]]:null;}
function renderCapitals(level){if(!china)return;if(level==='province'){for(const pf of china.features){const prov=pf.properties.name;if(!prov||prov==='北京市')continue;const c=capitalCoord(prov);if(!c)continue;const mk=L.circleMarker(c,{pane:regionLabelPane,radius:3,color:'#fff',weight:1,fillColor:colors().accent,fillOpacity:1}).addTo(map);mk.bindTooltip(E(CAPITALS[prov]||prov),{className:'atlas-tooltip',direction:'top'});overviewLayers.push(mk);}}if(level==='province'||level==='country'){const bj=capitalCoord('北京市');if(bj){const star=L.marker(bj,{pane:regionLabelPane,icon:L.divIcon({className:'capital-star',html:'★',iconSize:[18,18],iconAnchor:[9,9]}),interactive:true}).addTo(map);star.bindTooltip('北京',{className:'atlas-tooltip',direction:'top'});overviewLayers.push(star);}}}
let cityOutlineLayer, cityOutlineStyle;
function drawOverview(){
 const level=mapLevel();
 const showCityOutlines=level==='city'&&allCityBorders&&cityBoundaries;
 if(tiles)map.removeLayer(tiles);
 if(markerLayer)map.removeLayer(markerLayer);
 if(heatLayer)map.removeLayer(heatLayer);
 clearOverview(showCityOutlines?cityOutlineLayer:null);
 $('provider').disabled=true;
 $('provider').style.display='none';
 placeToggles.hidden=true;
 $('mapnotice').textContent='';
 $('map').classList.add('administrative');
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
 if(showCityOutlines){
  const styleKey=JSON.stringify([currentTheme,...[...visitedProvinces].sort()]);
  const style=feature=>{
   const visited=visitedProvinces.has(feature.properties.province);
   return {color:visited?theme.soft:theme.mid,weight:visited?1.2:.5,fill:false};
  };
  if(!cityOutlineLayer){
   cityOutlineLayer=L.geoJSON(cityBoundaries,{
    style,onEachFeature:(f,l)=>l.bindTooltip(E(shortRegionName(f.properties.name)),{className:'atlas-tooltip',direction:'center'})
   });
  }else if(cityOutlineStyle!==styleKey)cityOutlineLayer.setStyle(style);
  cityOutlineStyle=styleKey;
  if(!map.hasLayer(cityOutlineLayer))cityOutlineLayer.addTo(map);
  cityOutlineLayer.bringToFront();
  overviewLayers.push(cityOutlineLayer);
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
$('provider').onchange=()=>setProvider();
map.on('zoom',event=>{
 if(event.pinch&&mapLevel()!=='place')$('map').classList.add('vector-pinching');
});
function finishRegionZoom(){
 if(mapLevel()!=='place')renderRegionLabels();
 $('map').classList.remove('vector-pinching');
}
map.on('moveend',finishRegionZoom);
$('map').addEventListener('touchcancel',finishRegionZoom);
if($('heatmap'))$('heatmap').onchange=()=>draw();if($('aggregate'))$('aggregate').onchange=()=>draw();
const narrowDrawers=typeof matchMedia==='function'?matchMedia('(max-width:1280px)'):null;
const overlayDrawers=typeof matchMedia==='function'?matchMedia('(max-width:650px)'):null;
let rankDrawerOpen=false, lastOpenedDrawer='rank', drawerResizeTimer, drawerScrollPosition=null;
function updateDrawerLayout(){
 syncDrawerOverlay();
 if(!observesMapSize){
  clearTimeout(drawerResizeTimer);
  drawerResizeTimer=setTimeout(()=>map.invalidateSize(),180);
 }
}
// 双栏分割条：可拖动调整时间/事件宽度；不持久化，单屏↔双屏切换后恢复平分
function setupSplitter(){
 const panel=document.querySelector('.home-panels'),handle=$('home-splitter'),mainEl=document.querySelector('main');
 if(!panel||!handle)return;
 const overview=panel.querySelector('.home-overview');
 let splitActive=false,pointerId=null,grabOffset=0;
 const stop=()=>{pointerId=null;document.body.classList.remove('split-dragging');};
 const update=()=>{
  const active=getComputedStyle(panel).display==='grid';
  if(active===splitActive)return;
  splitActive=active;
  if(!active){
   stop();
   panel.style.removeProperty('--split-left');
  }
 };
 const syncGutter=()=>panel.style.setProperty('--overview-scrollbar',(overview.offsetWidth-overview.clientWidth)+'px');
 if(typeof ResizeObserver==='function'){
  new ResizeObserver(update).observe(mainEl);
  new ResizeObserver(syncGutter).observe(overview);
 }
 syncGutter();
 window.addEventListener('resize',update);update();
 const setLeft=clientX=>{
  const rect=panel.getBoundingClientRect();
  const minimum=parseFloat(getComputedStyle(panel).getPropertyValue('--split-min'));
  const left=Math.max(minimum,Math.min(rect.width-minimum-handle.offsetWidth,clientX-rect.left));
  panel.style.setProperty('--split-left','min('+left+'px, calc(100% - var(--split-min) - var(--split-handle)))');
 };
 handle.addEventListener('pointerdown',event=>{
  if(!splitActive||pointerId!==null||event.button!==0)return;
  pointerId=event.pointerId;
  grabOffset=event.clientX-handle.getBoundingClientRect().left;
  handle.focus({preventScroll:true});
  handle.setPointerCapture(pointerId);
  document.body.classList.add('split-dragging');event.preventDefault();
 });
 window.addEventListener('pointermove',event=>{
  if(event.pointerId!==pointerId)return;
  if(event.buttons)setLeft(event.clientX-grabOffset);
  else stop();
 });
 const stopPointer=event=>{if(event.pointerId===pointerId)stop();};
 window.addEventListener('pointerup',stopPointer);
 window.addEventListener('pointercancel',stopPointer);
 window.addEventListener('blur',stop);
 handle.addEventListener('keydown',event=>{
  if(!splitActive||!['ArrowLeft','ArrowRight'].includes(event.key))return;
  event.preventDefault();
  const current=handle.getBoundingClientRect().left;
  setLeft(current+(event.key==='ArrowRight'?24:-24));
 });
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
 updateDrawerLayout();
 if(restoreFocus){
  const button=(open&&$('drawer').querySelector('.drawertabs .active'))||$('toggle-drawer');
  button.focus?.({preventScroll:true});
 }
}
$('toggle-drawer').onclick=()=>drawer(!rankDrawerOpen);
narrowDrawers?.addEventListener?.('change',event=>{
 if(event.matches&&rankDrawerOpen&&settingsOpen)drawer(false,false);
});
function renderPlaces(){if(!$('place-list-details').open)return;const q=$('placesearch').value.toLowerCase(),state=$('placestate').value||'all';const pendingAllowed=state==='pending'?new Set(applyRules(source.map(e=>({...details(e),uid:e.uid,start:e.startDate?.toJSDate()||new Date(0)})),rules,true).events.flatMap(e=>e.places).map(n=>normalizePlace(baseCoords.get(normalizePlace(n))?.location||n))):null;const names=[...new Set([...reference.places.map(p=>p.location),...source.flatMap(e=>details(e).places).map(n=>baseCoords.get(normalizePlace(n))?.location||n)])].sort((a,b)=>a.localeCompare(b,'zh-CN'));const lookupCSV=baseCoords;const rows=names.map(name=>{const row=lookupCSV.get(normalizePlace(name)),p=pos(name),disabled=isClosed(row?.valid);return {name,row,p,disabled};}).filter(({name,row,p,disabled})=>(!q||[name,row?.address,row?.type,placeTypes[row?.type],row?.labels,row?.aliases].join(' ').toLowerCase().includes(q))&&(state==='all'?!isPlaceExcluded(row||{location:name},rules):(state==='closed'?disabled:state==='pending'?!p&&pendingAllowed.has(normalizePlace(name))&&!isPlaceExcluded(row||{location:name},rules):state==='exact'?p?.precision==='exact':p&&p.precision!=='exact')));$('placelist').innerHTML=rows.slice(0,placeLimit).map(({name,row,p,disabled})=>(mobileSource?'<div class="placeitem"':'<button class="placeitem" data-edit="'+E(name)+'"')+' title="'+E(row?.address||name)+'">'+(row?.type?'<span class="place-type type-icon" title="'+E((placeTypes[row.type]||row.type))+'" aria-label="'+E(placeTypes[row.type]||row.type)+'">'+E(emojiConfig.typeEmojis?.[row.type]||'📍')+'</span>':'')+'<b>'+E(name)+'</b>'+(disabled?'<span class="closed-badge" title="已停业" aria-label="已停业">'+entityIcon('lock')+'</span>':'')+'<span class="place-coordinates">'+E(coordinateLabel(validCoord(row)?row:p?.precision==='exact'?p:null))+'</span>'+(mobileSource?'</div>':'</button>')).join('')||'<div class="empty">无匹配地点</div>';$('placelist').querySelectorAll('[data-edit]').forEach(el=>el.onclick=()=>edit(el.dataset.edit));$('placemore').hidden=rows.length<=placeLimit;}
$('placesearch').oninput=$('placestate').onchange=()=>{placeLimit=100;renderPlaces();};$('placemore').onclick=()=>{placeLimit+=100;renderPlaces();};$('addplace').onclick=()=>edit();



function isMainland(lat,lon){if(!china||lon<72||lon>136||lat<17||lat>55)return false;return china.features.some(f=>!['香港特别行政区','澳门特别行政区','台湾省'].includes(f.properties.name)&&containsPoint(geometryPolygons(f.geometry),lon,lat));}

function applyTheme(key){
 currentTheme=resolveTheme(key);
 const theme=colors();
 document.body.setAttribute('data-color-mode',nightMode?'night':'day');
 document.body.style.setProperty('--surface',theme.surface||'#ffffff');
 $('night-mode').setAttribute('aria-pressed',String(nightMode));
 const hitInk=highlightLabelColor(theme);
 document.body.style.setProperty('--bar-match-ink',hitInk);
 const selectedInk=highlightLabelColor({highlight:theme.accent,dark:theme.dark});
 document.body.style.setProperty('--selected-ink',selectedInk);
 document.body.style.setProperty('--bar-hit-edge',hitInk==='#fff'?theme.dark:theme.soft);
 document.body.style.setProperty('--bar-date-edge',selectedInk==='#fff'?theme.dark:theme.soft);
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
function renderThemeOptions(){
 const themeTones=[['canvas','画布'],['soft',nightMode?'底色':'浅色'],['mid','中色'],['dark',nightMode?'正文':'深色'],['highlight','对比色']];
 $('theme-options').innerHTML=Object.entries(nightMode?nightPalettes:palettes).map(([key,theme])=>{
 const samples=themeTones.map(([tone,label])=>
  '<span class="theme-sample"><span class="theme-swatch" style="background:'+theme[tone]+'" aria-hidden="true"></span>'+
  '<span>'+label+'</span></span>'
 ).join('');
 return '<button type="button" data-theme-choice="'+key+'" aria-pressed="'+(key===currentTheme)+'">'+
  '<span class="theme-identity"><span class="theme-swatch theme-main-swatch" style="background:'+theme.accent+'" aria-hidden="true"></span>'+
  '<span><strong>'+E(theme.name)+'</strong><span class="theme-hex">'+theme.accent.toUpperCase()+'</span></span></span>'+
  '<span class="theme-samples">'+samples+'</span></button>';
 }).join('');
 $('theme-options').querySelectorAll('[data-theme-choice]').forEach(button=>button.onclick=()=>applyTheme(button.dataset.themeChoice));
}
for(const [id,render] of [['rule-list-details',renderBlacklist],['theme-list-details',renderThemeOptions]]){
 $(id).ontoggle=()=>{if($(id).open)render();};
}
$('place-list-details').ontoggle=()=>{
 if(!$('place-list-details').open)return;
 renderPlaces();
 if(!china)void loadChina().then(renderPlaces).catch(()=>{});
};
function collapseSection(key){
 const closed=Boolean(collapsedSections[key]);
 $(key+'-body').hidden=closed;
 $('collapse-'+key).setAttribute('aria-expanded',String(!closed));
 if(key==='timeline')$('timeline-controls').hidden=closed;
 if(key==='eventlist')$('event-display-options').hidden=$('event-filters').hidden=closed;
 if(key==='map'){
  $('map-tools').hidden=closed;
  if(!closed)map.invalidateSize({pan:false});
  else if(!$('map-title').textContent)$('map-title').textContent='地点';
 }
}
function setSectionCollapsed(key,closed){
 collapsedSections[key]=closed;
 collapseSection(key);
 if(key==='map'&&!closed){
  scheduleSectionTools();
  return loadMainMap();
 }
 if(key==='timeline'&&!closed){
  renderTimePanel();
  scheduleSectionTools();
 }
}
for(const key of ['map','timeline','eventlist']){
 $('collapse-'+key).onclick=()=>setSectionCollapsed(key,!collapsedSections[key]);
 collapseSection(key);
}
$('night-mode').onclick=()=>{
 nightMode=!nightMode;
 localStorage.setItem('atlas-night',nightMode?'1':'0');
 applyTheme(currentTheme);
 if($('theme-list-details').open)renderThemeOptions();
};
applyTheme(currentTheme);

function settingsDrawer(open,restoreFocus=true){
 if(open&&narrowDrawers?.matches&&rankDrawerOpen)drawer(false,false);
 settingsOpen=open;
 if(open)lastOpenedDrawer='settings';
 if(open&&activePanel==='manage')renderPlaces();
 document.body.classList.toggle('settings-open',open);
 $('settings-drawer').inert=!open;
 $('settings-drawer').setAttribute('aria-hidden',String(!open));
 $('toggle-settings').setAttribute('aria-expanded',String(open));
 updateDrawerLayout();
 if(restoreFocus){
  const button=(open&&$('settings-drawer').querySelector('.settings-tabs .active'))||$('toggle-settings');
  button.focus?.({preventScroll:true});
 }
}
$('toggle-settings').onclick=()=>settingsDrawer(!settingsOpen);
function syncDrawerOverlay(){
 const active=Boolean(overlayDrawers?.matches&&(rankDrawerOpen||settingsOpen));
 const overlay=$('drawer-scrim'),main=document.querySelector('main');
 overlay.hidden=!active;
 if(main)main.inert=active;
 for(const [id,open] of [['drawer',rankDrawerOpen],['settings-drawer',settingsOpen]]){
  const panel=$(id);
  if(active&&open){
   panel.setAttribute('role','dialog');
   panel.setAttribute('aria-modal','true');
  }else{
   panel.removeAttribute?.('role');
   panel.removeAttribute?.('aria-modal');
  }
 }
 if(active&&drawerScrollPosition===null){
  drawerScrollPosition=window.scrollY;
  document.body.style.setProperty('--drawer-scroll-offset',-drawerScrollPosition+'px');
  document.body.classList.add('drawer-modal');
 }else if(!active&&drawerScrollPosition!==null){
  const top=drawerScrollPosition;
  drawerScrollPosition=null;
  document.body.classList.remove('drawer-modal');
  document.body.style.setProperty('--drawer-scroll-offset','');
  window.scrollTo({top,behavior:'instant'});
 }
}
$('close-rank-drawer').onclick=()=>drawer(false);
$('close-settings-drawer').onclick=()=>settingsDrawer(false);
drawer(false,false);
overlayDrawers?.addEventListener?.('change',syncDrawerOverlay);
for(const [id,direction,close] of [['drawer',-1,drawer],['settings-drawer',1,settingsDrawer]]){
 const panel=$(id);
 let touch,suppressClick=false;
 panel.addEventListener('pointerdown',event=>{
  touch=null;
  suppressClick=false;
  if(event.pointerType!=='touch'||!event.isPrimary||event.target.closest('input,select,textarea,[contenteditable]'))return;
  touch={id:event.pointerId,x:event.clientX,y:event.clientY};
 });
 panel.addEventListener('pointerup',event=>{
  if(touch?.id!==event.pointerId)return;
  const distance=direction*(event.clientX-touch.x),vertical=Math.abs(event.clientY-touch.y);
  touch=null;
  if(distance<48||distance<1.6*vertical)return;
  suppressClick=true;
  event.preventDefault();
  close(false);
 });
 panel.addEventListener('pointercancel',()=>{touch=null;});
 panel.addEventListener('click',event=>{
  if(!suppressClick||event.detail===0)return;
  suppressClick=false;
  event.preventDefault();
  event.stopImmediatePropagation();
 },true);
}

document.addEventListener?.('keydown',e=>{
 if(e.key!=='Escape'||document.querySelector('dialog[open]'))return;
 if(settingsOpen&&(!rankDrawerOpen||lastOpenedDrawer==='settings'))settingsDrawer(false);
 else if(rankDrawerOpen)drawer(false);
});

function showDataTime(key,value){
 const date = value ? new Date(value) : null;
 const target=$(sourceTimeIds[key]);
 if(!date||isNaN(date)){
  target.textContent='—';
  target.removeAttribute?.('datetime');
  return;
 }
 const clock=[date.getHours(),date.getMinutes()].map(n=>String(n).padStart(2,'0')).join(':');
 target.textContent=dateInputValue(date).replaceAll('-','/')+' '+clock;
 target.setAttribute('datetime',date.toISOString());
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
  $('blacklist-error').textContent='';
  renderBlacklist();
  timelineKey='';
  refresh();
 }
 await updateDataTimes([key]);
}
const sourceStatusIds={calendar:'meta-status',places:'place-reload-status',blacklist:'config-reload-status'};
const busySources=new Set();
async function updateSource(key,button,file){
 if(busySources.has(key))return;
 const status=$(sourceStatusIds[key]);
 const label=button.getAttribute('aria-label');
 const {route}=importTypes[key];
 const syncing=!mobileSource&&button.id==='outlook-calendar-sync';
 const controls=document.querySelectorAll('[data-meta="'+key+'"],[data-upload-source="'+key+'"]'
  +(key==='calendar'?',#desktop-calendar-import':''));
 busySources.add(key);
 for(const control of controls)control.disabled=true;
 status.textContent=label+'中…';
 let syncResult;
 try{
  if(syncing){
   const response=await fetch('api/calendar/outlook-sync',{method:'POST',headers:{'X-Atlas-Write':'1'}});
   const result=await response.json();
   if(!response.ok)throw Error(result.error||'Outlook 日历导出失败');
   syncResult=result;
  }else if(file){
   const result=await fetch('api/'+route,{method:'PUT',body:await file.text()});
   if(!result.ok)throw Error((await result.json()).error||'文件保存失败');
  }
  await reloadSource(key);
  status.textContent=syncResult
   ?(syncResult.changed?'Outlook 日历已同步':'Outlook 导出内容与本地日历一致')
   :label+'成功';
 }catch(error){
  status.textContent=syncResult?'已完成 Outlook 同步，页面刷新失败：'+error.message:label+'失败：'+error.message;
 }finally{
  busySources.delete(key);
  for(const control of controls)control.disabled=false;
 }
}
for(const button of document.querySelectorAll('[data-meta]')){
 if(mobileSource&&button.id==='outlook-calendar-sync'){
  button.title='刷新日历';
  button.setAttribute('aria-label','刷新日历');
 }
 button.onclick=()=>updateSource(button.dataset.meta,button);
}
if(mobileImport)for(const button of document.querySelectorAll('[data-upload-source]')){
 const key=button.dataset.uploadSource;
 const input=document.createElement('input');
 input.type='file';
 input.accept=importTypes[key].accept;
 input.hidden=true;
 input.onchange=()=>{
  const file=input.files[0];
  input.value='';
  if(file)void updateSource(key,button,file);
 };
 button.after(input);
 button.onclick=()=>input.click();
}


function progressTarget(){return document.querySelector('#annual-review[open]')?$('annual-status'):$('mapnotice');}
async function fetchJsonWithProgress(url,label){
 const response=await fetch(url);
 if(!response.ok)throw Error(label+'读取失败');
 const total=Number(response.headers?.get?.('Content-Length'))||0;
 const target=progressTarget();
 if(!response.body||typeof response.body.getReader!=='function'){
  const data=await response.json(); if(target)target.textContent=''; return data;
 }
 const reader=response.body.getReader(),chunks=[]; let received=0;
 while(true){
  const {done,value}=await reader.read(); if(done)break;
  chunks.push(value); received+=value.length;
  if(target)target.textContent='正在加载'+label+'… '+(total?Math.round(received/total*100)+'%（'+Math.round(received/1024)+'KB / '+Math.round(total/1024)+'KB）':'已加载 '+Math.round(received/1024)+'KB');
 }
 const bytes=new Uint8Array(received); let offset=0;
 for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 const data=JSON.parse(new TextDecoder().decode(bytes));
 if(target)target.textContent='';
 return data;
}
async function loadCityBoundaries(){
 if(cityBoundaries)return;
 cityBoundaryRequest??=fetchJsonWithProgress('data/city-boundaries.json','城市边界').then(async data=>{
  cityBoundaries=data;
  cities=cityBoundaries.features.map(f=>f.properties).filter(p=>p.center);
  setupGaz();
  cache.clear();
 }).finally(()=>{cityBoundaryRequest=null;});
 await cityBoundaryRequest;
}
let chinaRequest,worldRequest;
function loadChina(){
 if(china)return Promise.resolve(china);
 chinaRequest??=fetch('data/china.json').then(response=>{
  if(!response.ok)throw Error('全国底图读取失败');
  return response.json();
 }).then(data=>{
  china=data;
  setupGaz();
  cache.clear();
  return data;
 }).finally(()=>{chinaRequest=null;});
 return chinaRequest;
}
async function loadMainMap(){
 if($('map-body').hidden)return;
 const level=mapLevel(),chinaWasReady=Boolean(china);
 if(level==='place'){
  renderMapResults(true);
  if(chinaWasReady)return;
 }else{
  draw();
  $('mapnotice').textContent='正在加载地图…';
 }
 try{
  if(level==='country'&&!world)worldRequest??=fetchJsonWithProgress('data/world.json','国家边界').then(data=>{
   world=data;
   setupGaz();
   cache.clear();
  }).finally(()=>{worldRequest=null;});
  await Promise.all([loadChina(),level==='country'?worldRequest:null]);
 }catch{
  if(!$('map-body').hidden&&mapLevel()===level)$('mapnotice').textContent='地图数据读取失败，请重新打开地点地图';
  return;
 }
 if($('map-body').hidden||mapLevel()!==level)return;
 if(level==='shanghai')await enterShanghaiMap();
 else renderMapResults(true);
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
 const now=new Date().getFullYear();
 ensureTimelineYears();
 return source.length?{min:yearMin,max:Math.max(now,yearMax)}:{min:now,max:now};
}
let annualAvailableYears=[];
function renderAnnualYearSelect(year,custom){
 const select=$('annual-year-select');
 select.innerHTML='<option value="range">跨年统计</option>'+
  annualAvailableYears.map(value=>'<option value="'+value+'">'+value+'年</option>').join('');
 select.value=custom?'range':String(year);
}
function reviewEvents(from,to,includeOverlapping=false){
 ensureTimelineYears();
 const inRange=event=>event.start<=to&&(event.start>=from||includeOverlapping&&event.end>from);
 if(from>=new Date(yearMin,0,1)&&to<new Date(yearMax+1,0,1)){
  ensureTimeline();
  return timelineEvents.filter(inRange);
 }
 const events=expand(source,from,to,$('recurring').checked).events;
 return applyRules(events,rules,$('exclude').checked).events.filter(inRange);
}
let tripEvents=[],tripMap,tripMarkers,tripRoutes,tripLayerControl,tripShareData,tripTileLayer;
const tripHiddenPlaces=new Map();
let tripExportView,tripSharePreview,tripShareRequest=0;
const tripExportSize=420;
let tripLinesEnabled=true;
const tripColors=['#3d664e','#315987','#874939','#695087','#856020','#2e6a71'];
function tripProviderKey(){
 const stored=localStorage.getItem('atlas-trip-provider');
 return Object.hasOwn(basemaps,stored)?stored:'osm';
}
function setTripProvider(key){
 if(!Object.hasOwn(basemaps,key))key='osm';
 localStorage.setItem('atlas-trip-provider',key);
 $('trip-provider-pref').value=key;
 if(!tripMap)return;
 if(tripTileLayer)tripMap.removeLayer(tripTileLayer);
 const {url,options}=basemaps[key];
 tripTileLayer=L.tileLayer(url,{maxZoom:18,...options}).addTo(tripMap);
}
function setupTripProvider(){
 const select=$('trip-provider-pref');
 select.innerHTML=basemapOptions;
 select.value=tripProviderKey();
 select.onchange=()=>setTripProvider(select.value);
}
function setupDesktopTypography(){
 if(mobileSource)return;
 const size=$('ui-font-size');
 size.innerHTML=Array.from({length:7},(_,i)=>{
  const value=12+i;
  return '<option value="'+value+'">'+value+' px</option>';
 }).join('');
 const savedSize=Number(localStorage.getItem('atlas-ui-font-size'));
 size.value=Number.isInteger(savedSize)&&savedSize>=12&&savedSize<=18?String(savedSize):'15';
 const apply=()=>{
  document.body.style.setProperty('--app-font-size',size.value+'px');
  scheduleSectionTools();
 };
 size.onchange=()=>{
  localStorage.setItem('atlas-ui-font-size',size.value);
  apply();
 };
 apply();
 $('desktop-typography').hidden=false;
}
function tripDayLabel(day){
 if(day.number===null)return day.label;
 const [,month,date]=day.label.split('-').map(Number);
 const weekday='日一二三四五六'[new Date(day.label+'T00:00:00Z').getUTCDay()];
 return 'Day '+day.number+'：'+month+'月'+date+'日（'+weekday+'）';
}
function tripTabLabel(day){
 if(day.number===null)return E(day.label);
 const [,month,date]=day.label.split('-').map(Number);
 return '<span class="trip-date-long">'+month+'月'+date+'日</span><span class="trip-date-short">'+month+'/'+date+'</span>';
}
const tripDayColor=day=>day.number===null?'#6b6761':tripColors[(day.number-1)%tripColors.length];
function tripDayBadge(number){
 if(number===null)return '?';
 if(number<=20)return String.fromCharCode(0x245f+number);
 if(number<=35)return String.fromCharCode(0x323c+number);
 if(number<=50)return String.fromCharCode(0x328d+number);
 return '('+number+')';
}
function updateTripLines(){
 if(!tripRoutes)return;
 if(tripLinesEnabled)tripRoutes.addTo(tripMap);
 else tripMap.removeLayer(tripRoutes);
}
function fitTripMap(map,points,padding,maxZoom){
 map.invalidateSize({pan:false,animate:false});
 map.fitBounds(points.map(point=>point.coord),{padding:[padding,padding],maxZoom,animate:false});
}
const tripResize=typeof ResizeObserver==='function'?new ResizeObserver(()=>{
 tripMap?.invalidateSize({pan:false,animate:false});
}):null;
function addTripRoutes(lines,layer){
 for(const {route,color} of lines){
  L.polyline(route,{color,weight:3,opacity:.82,dashArray:'7 5',className:'trip-route-line',interactive:false}).addTo(layer);
 }
}
function addTripPins(points,layer){
 for(const {coord,badges,labels} of points){
  const html=[...badges].map(([number,color])=>'<span class="trip-pin-badge" style="background:'+color+'">'+number+'</span>').join('');
  const width=badges.size*22+(badges.size-1)*2;
  const names=[...labels];
  const icon=L.divIcon({className:'trip-pin',html,iconSize:[width,22],iconAnchor:[width/2,11]});
  const marker=L.marker(coord,{icon,alt:names.join('、')});
  marker.bindTooltip(names.map(E).join('<br>'),{direction:'top'});
  marker.addTo(layer);
 }
}
function tripDayKey(day){return day.number===null?day.label:'#'+day.number;}
function renderTripDays(days,overview,hiddenByDay){
 const list=$('trip-locations');
 const groups=days.map(day=>{
  const hiddenSet=hiddenByDay.get(tripDayKey(day));
  return {day,label:tripDayLabel(day),color:tripDayColor(day),locations:day.places.map(name=>{
   const position=pos(name);
   return {name,position,located:position?.precision==='exact'&&validCoord(position),hidden:Boolean(hiddenSet&&hiddenSet.has(name))};
  })};
 });
 list.innerHTML=groups.map(({day,label,color,locations})=>{
  const stops=locations.map(({name,located,hidden})=>located
   ?'<li><button type="button" class="trip-place-toggle" title="切换地图显示" data-trip-place="'+E(name)+'" data-trip-day="'+E(tripDayKey(day))+'" aria-pressed="'+(!hidden)
    +'"><span>'+E(name)+'</span><small aria-hidden="true">已隐藏</small></button></li>'
   :'<li class="trip-place-unlocated">'+E(name)+' <small>未定位</small></li>').join('');
  return '<details class="trip-group" open><summary><i style="background:'+color+'" aria-hidden="true"></i>'+E(label)
   +'</summary>'+(stops?'<ol>'+stops+'</ol>':'<p>暂无地点记录。</p>')+'</details>';
 }).join('');
 list.scrollTop=0;
 list.onclick=event=>{
  const button=event.target.closest('[data-trip-place]');
  if(!button)return;
  const {tripPlace:name,tripDay:dayKey}=button.dataset;
  let set=hiddenByDay.get(dayKey);
  if(!set){set=new Set();hiddenByDay.set(dayKey,set);}
  const hidden=!set.has(name);
  if(hidden)set.add(name);else set.delete(name);
  const group=groups.find(item=>tripDayKey(item.day)===dayKey);
  const location=group?.locations.find(item=>item.name===name);
  if(location)location.hidden=hidden;
  for(const control of list.querySelectorAll('[data-trip-place]')){
   if(control.dataset.tripPlace===name&&control.dataset.tripDay===dayKey)control.setAttribute('aria-pressed',String(!hidden));
  }
  renderTripMap(groups,overview,false);
 };
 renderTripMap(groups,overview,true);
}
function renderTripMap(groups,overview,refit){
 const canvas=$('trip-map');
 tripMarkers?.clearLayers();
 tripRoutes?.clearLayers();
 const pointsByCoordinate=new Map(),lines=[];
 for(const {day,color,locations} of groups){
  const route=[];
  for(const [index,{name,position,located,hidden}] of locations.entries()){
   if(located&&!hidden){
    const coord=[position.lat,position.lon],key=coord.join(',');
    const number=overview?(day.number??'?'):index+1;
    if(!pointsByCoordinate.has(key))pointsByCoordinate.set(key,{coord,badges:new Map(),labels:new Set()});
    const point=pointsByCoordinate.get(key);
    point.badges.set(number,color);
    point.labels.add(overview?tripDayBadge(day.number)+' '+name:name);
    route.push(coord);
   }
  }
  if(day.number!==null&&route.length>1)lines.push({route,color,number:day.number});
 }
 const points=[...pointsByCoordinate.values()];
 const shareGroups=groups.map(group=>({...group,locations:group.locations
  .flatMap((location,index)=>location.hidden?[]:[{...location,number:index+1}])}));
 tripShareData={groups:shareGroups,points,lines,overview};
 updateTripShareControls();
 const hasLocations=groups.some(group=>group.locations.length);
 const hasLocatedStops=groups.some(group=>group.locations.some(location=>location.located));
 canvas.hidden=!points.length;
 if(tripLayerControl)tripLayerControl.hidden=!lines.length;
 $('trip-status').textContent=!hasLocations?'暂无地点记录。':points.length?''
  :hasLocatedStops?'当前没有显示在地图上的地点。':'暂无已定位的地点。';
 if(!points.length)return;
 const initialize=!tripMap;
 if(initialize){
  tripMap=L.map('trip-map',{zoomAnimation:false,fadeAnimation:false,scrollWheelZoom:false}).setView(points[0].coord,14);
  tripResize?.observe(canvas);
  tripRoutes=L.layerGroup();
  tripMarkers=L.layerGroup().addTo(tripMap);
  const layerMenu=L.control({position:'topright'});
  layerMenu.onAdd=()=>{
   tripLayerControl=createMapLayerMenu('trip-layer-control',[['routes','连线']],()=>tripLinesEnabled,
    (_,checked)=>{tripLinesEnabled=checked;},updateTripLines);
   return tripLayerControl;
  };
  layerMenu.addTo(tripMap);
 }
 tripLayerControl.hidden=!lines.length;
 addTripRoutes(lines,tripRoutes);
 updateTripLines();
 addTripPins(points,tripMarkers);
 if(initialize||refit)fitTripMap(tripMap,points,24,15);
 if(initialize){
  setTripProvider(tripProviderKey());
 }
}
function renderTrip(event){
 const title=$('trip-title'),summary=$('trip-summary'),tabs=$('trip-day-tabs');
 $('trip-share').hidden=!event;
 title.textContent=event?.title||'旅游行程';
 if(!event){
  summary.innerHTML='';
  tabs.innerHTML='';
  renderTripDays([],true,new Map());
  $('trip-status').textContent='日历里没有识别到「××之旅」事件。';
  return;
 }
 const {start,end,days}=tripDetails(event);
 const key=eventKey(event);
 if(!tripHiddenPlaces.has(key))tripHiddenPlaces.set(key,new Map());
 const hiddenByDay=tripHiddenPlaces.get(key);
 summary.innerHTML='<span>'+E(tripDateRange(start,end))+'</span>'
  +(event.partners.length?'<span class="trip-partners" aria-label="'+E('同伴：'+event.partners.join('、'))+'">'
   +entityIcon('person')+event.partners.map(name=>'<span>'+E(name)+'</span>').join(' ')+'</span>':'');
 const overview=start!==end;
 tabs.innerHTML=(overview?'<button type="button" data-trip-day="-1" aria-pressed="true">总览</button>':'')
  +days.map((day,i)=>'<button type="button" data-trip-day="'+i+'" aria-pressed="'+!overview+'">'+tripTabLabel(day)+'</button>').join('');
 tabs.scrollLeft=0;
 for(const button of tabs.querySelectorAll('[data-trip-day]')){
  button.onclick=()=>{
   for(const other of tabs.querySelectorAll('[data-trip-day]'))other.setAttribute('aria-pressed',String(button===other));
   const index=Number(button.dataset.tripDay);
   renderTripDays(index===-1?days:[days[index]],index===-1,hiddenByDay);
   $('trip-share-status').textContent='';
  };
 }
 renderTripDays(days,overview,hiddenByDay);
}
function clearTripExportMap(){
 tripExportView?.map.remove();
 tripExportView=null;
}
function prepareTripExportMap(data){
 if(tripExportView?.data===data)return tripExportView;
 clearTripExportMap();
 const element=$('trip-export-map');
 element.style.width=element.style.height=tripExportSize+'px';
 const map=L.map(element,{zoomAnimation:false,fadeAnimation:false,zoomControl:false,attributionControl:false,boxZoom:false,
  scrollWheelZoom:false,doubleClickZoom:false,dragging:false,touchZoom:false,keyboard:false,zoomSnap:.25});
 const {url,options,exportCredit}=basemaps[tripProviderKey()];
 const view={map,data,credit:exportCredit};
 tripExportView=view;
 fitTripMap(map,data.points,28,15);
 view.tiles=L.tileLayer(url,{maxZoom:18,...options,crossOrigin:true}).addTo(map);
 return view;
}
async function updateTripShareControls(){
 const dialog=$('trip-share-dialog');
 const data=tripShareData,event=tripEvents[Number($('trip-choice').value)];
 if(!dialog.open||!data||!event)return;
 const request=++tripShareRequest;
 const current=()=>request===tripShareRequest&&dialog.open;
 const {groups,points,lines,overview}=data;
 const mapOption=$('trip-share-map'),lineOption=$('trip-share-lines');
 const preview=$('trip-share-preview'),status=$('trip-share-status'),save=$('trip-share-save');
 const showPlaces=$('trip-share-places').checked;
 mapOption.disabled=!showPlaces||!points.length;
 const showMap=!mapOption.disabled&&mapOption.checked;
 lineOption.disabled=!showMap||!lines.length;
 const routes=!lineOption.disabled&&lineOption.checked?lines:[];
 const partners=$('trip-share-people').checked?event.partners:[];
 tripSharePreview=null;
 save.disabled=true;
 status.textContent='正在生成预览…';
 preview.setAttribute('aria-busy','true');
 try{
  if(!showMap)clearTripExportMap();
  const view=showMap?prepareTripExportMap(data):null;
  const {drawTripShare,captureTripMap}=await import('./lib/trip-share.js');
  if(!current())return;
  if(view)view.capture??=captureTripMap(view.map,view.tiles,view.credit);
  const mapImage=view?await view.capture:null;
  if(!current())return;
  const {start,end}=tripDates(event);
  const dates=overview?tripDateRange(start,end):groups[0]?.day.label;
  const {dark:deep,muted,soft,accent}=palettes[currentTheme];
  const title=tripPlace(event);
  const canvas=drawTripShare({title,dates,partners,groups,points,lines:routes,overview,showPlaces,showMap,
   palette:{deep,muted,soft,accent},mapImage});
  const selected=overview?start:groups[0]?.day.label||start;
  const filename=tripShareFilename(title,selected,overview?end:selected);
  canvas.setAttribute('role','img');
  canvas.setAttribute('aria-label',title+'行程分享图');
  preview.replaceChildren(canvas);
  preview.hidden=false;
  tripSharePreview={canvas,filename};
  save.disabled=false;
  status.textContent=showMap&&!mapImage?'底图暂不可用，已保留点位。':'';
 }catch{
  if(!current())return;
  clearTripExportMap();
  preview.replaceChildren();
  preview.hidden=true;
  status.textContent='未能生成预览。可调整选项后重试。';
 }finally{
  if(current())preview.setAttribute('aria-busy','false');
 }
}
$('trip-share').onclick=()=>{
 $('trip-share-people').checked=false;
 $('trip-share-lines').checked=tripLinesEnabled;
 $('trip-share-status').textContent='';
 $('trip-share-dialog').showModal();
 updateTripShareControls();
};
$('trip-share-close').onclick=()=>$('trip-share-dialog').close();
$('trip-share-dialog').onclose=()=>{
 if($('trip-share-dialog').open)return;
 ++tripShareRequest;
 tripSharePreview=null;
 clearTripExportMap();
 const preview=$('trip-share-preview');
 preview.replaceChildren();
 preview.hidden=true;
};
for(const id of ['trip-share-places','trip-share-map','trip-share-lines','trip-share-people'])$(id).onchange=updateTripShareControls;
$('trip-share-save').onclick=async()=>{
 const prepared=tripSharePreview;
 if(!prepared)return;
 const button=$('trip-share-save'),status=$('trip-share-status'),dialog=$('trip-share-dialog');
 await saveReportPng(button,status,dialog,prepared.filename,()=>prepared.canvas,
  ()=>prepared===tripSharePreview);
};
let tripOpenRequest=0;
async function openTrips(selected){
 const request=++tripOpenRequest;
 ensureTimeline();
 tripEvents=timelineEvents.filter(isTrip);
 let index=selected?tripEvents.findIndex(event=>event.uid===selected.uid&&+event.start===+selected.start):0;
 if(index<0){
  tripEvents=[selected,...tripEvents];
  index=0;
 }
 const choice=$('trip-choice');
 choice.hidden=!tripEvents.length;
 choice.innerHTML=tripEvents.map((event,i)=>'<option value="'+i+'">'+E(tripSelectLabel(event))+'</option>').join('');
 choice.value=String(index);
 const dialog=$('trip-dialog');
 if(!dialog.open)dialog.showModal();
 $('trips').setAttribute('aria-pressed','true');
 if(!china&&tripEvents.length){
  choice.disabled=true;
  $('trip-share').hidden=true;
  $('trip-status').textContent='正在加载行程地点…';
  try{await loadChina();}catch{}
  if(!dialog.open||request!==tripOpenRequest)return;
 }
 choice.disabled=false;
 renderTrip(tripEvents[index]);
}
$('trips').onclick=()=>openTrips();
$('trip-choice').onchange=()=>renderTrip(tripEvents[Number($('trip-choice').value)]);
$('trip-close').onclick=()=>$('trip-dialog').close();
$('trip-dialog').onclose=()=>{
 if($('trip-dialog').open)return;
 $('trips').setAttribute('aria-pressed','false');
 tripHiddenPlaces.clear();
 tripResize?.disconnect();
 if(tripMap)tripMap.remove();
 tripMap=tripMarkers=tripRoutes=tripLayerControl=tripShareData=tripTileLayer=null;
};
setupTripProvider();
setupDesktopTypography();
setupSplitter();
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
function createMapLayerMenu(className,options,isChecked,onChange,redraw=draw){
 const control=L.DomUtil.create('details','leaflet-control map-layer-control '+className);
 control.hidden=true;
 control.innerHTML='<summary>图层</summary><div>'+options.map(([key,label,group])=>
  '<label><input type="'+(group?'radio':'checkbox')+'" name="'+(group||key)+'"'+
  (group?' value="'+key+'"':'')+'> '+label+'</label>').join('')+'</div>';
 const optionKey=input=>input.type==='radio'?input.value:input.name;
 for(const input of control.querySelectorAll('input'))input.checked=isChecked(optionKey(input));
 control.addEventListener('change',event=>{
  onChange(optionKey(event.target),event.target.checked);
  redraw();
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
  regionLabels.push(L.marker(map.containerPointToLatLng(point),{pane:regionLabelPane,icon,interactive:false,keyboard:false}).addTo(map));
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
   return L.marker([lat,lon],{pane:regionLabelPane,icon}).bindTooltip(E(name),{direction:'right'});
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
 const visits={countries:new Set(),provinces:new Set(),cities:new Set(),cityPoints:new Map(),shanghaiPoints:[],shanghaiUnlocated:0};
 const provinceNames=china.features.map(f=>f.properties.name).filter(Boolean);
 for(const name of names){
  const row=baseCoords.get(normalizePlace(name));
  const position=pos(name);
  const region={country:row?.country,province:row?.province,city:row?.city,...position};
  const province=provinceNames.find(n=>n===region.province||shortRegionName(n)===shortRegionName(region.province));
  const country=normalizePlace(region.country||(province?'中国':''));
  if(country)visits.countries.add(country);
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
 const {start,end,custom}=period;
 const splitTrips=$('split-trip-days').checked;
 const candidates=reviewEvents(start,end,splitTrips);
 const evs=candidates.filter(event=>event.start>=start);
 const rows=[...occurrenceDays(candidates,start,end,splitTrips)];
 const places=occurrenceCounts(rows,row=>row.places,$('merge-same-day').checked);
 const months=Array(12).fill(0);
 for(const {start} of evs)months[start.getMonth()]++;
 const visits=annualVisits(places.keys());
 const shanghaiPoints=shanghaiMapPlaces(cityBoundaries,visits.shanghaiPoints,reviewMapOptions.includeChongming);
 const stats=activityStats(evs,rows,places);
 if(!custom){
  ensureTimeline();
  const earlierPlaces=new Set();
  for(const row of occurrenceDays(timelineEvents,new Date(yearMin,0,1),new Date(+start-1),splitTrips)){
   for(const name of row.places)earlierPlaces.add(name);
  }
  const newPlaces=[...places.keys()].filter(name=>!earlierPlaces.has(name)).length;
  const delta=evs.length-reviewEvents(previousReviewYear(start),previousReviewYear(end)).length;
  stats[0]=['事件',evs.length,'('+(delta>0?'+':'')+delta+')','较上年事件数变化'];
  stats[2]=['地点',places.size,'('+newPlaces+')','新到访地点'];
 }
 return {
  ...period,months,visits,shanghaiPoints,stats,
  monthTitle:start.getFullYear()!==end.getFullYear()?'月度分布（按月份汇总）':'月度分布',
  shanghaiCoverage:shanghaiPoints.length+' 个地点',
  shanghaiNote:visits.shanghaiUnlocated?visits.shanghaiUnlocated+' 个地点缺少精确坐标':'',
  coverage:(visits.countries.size>1?visits.countries.size+' 个国家/地区 · ':'')
   +visits.provinces.size+' 个省份 · '+visits.cities.size+' 个城市',
  top:[...places].sort((a,b)=>b[1]-a[1]).slice(0,5)
 };
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
let annualMapResize;
function renderAnnual(year,custom=$('annual-year-select').value==='range'){
 annualMapResize?.disconnect();
 const overlay=$('annual-review');
 overlay.dataset.year=year;
 const index=annualAvailableYears.indexOf(year);
 $('annual-prev').disabled=index>=annualAvailableYears.length-1;
 $('annual-next').disabled=index<=0;
 $('annual-prev').hidden=$('annual-next').hidden=custom;
 $('annual-range-controls').hidden=!custom;
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
 const bars=report.months.map((v,i)=>'<div class="annual-mbar" title="'+(i+1)+'月 · '+v+' 次"><strong>'+v+'</strong><i style="--month-ratio:'+v/peak+'"></i><span>'+(i+1)+'</span></div>').join('');
 const rows=items=>items.map(([name,total])=>'<div class="annual-row"><span class="annual-name" title="'+E(name)+'">'+E(name)+'</span><b>'+total+'</b></div>').join('')||'<div class="empty">—</div>';
 const palette=colors();
 const toggle=(id,key,label,position='')=>'<label class="annual-map-toggle'+(position?' '+position:'')+'">'
  +'<input id="'+id+'" type="checkbox"'+(reviewMapOptions[key]?' checked':'')+'>'+label+'</label>';
 const emphasizeNumbers=text=>text.split(/(\d+)/).map((part,i)=>i%2?'<strong>'+part+'</strong>':E(part)).join('');
 $('annual-body').innerHTML='<div class="annual-map-head"><h3>全国足迹：<span>'+emphasizeNumbers(report.coverage)+'</span></h3>'
  +'<div class="annual-legend">'+annualLegend.map((label,i)=>'<span><i style="background:'+E([palette.soft,palette.mid,palette.accent][i])+'"></i>'+label+'</span>').join('')
  +'</div></div><div class="annual-map-frame"><canvas id="annual-map" role="img" aria-label="'+E('全国足迹，'+report.coverage)+'"></canvas>'
  +'<div class="annual-national-toggles">'+toggle('annual-include-south-china-sea','includeSouthChinaSea','南海诸岛')
  +toggle('annual-focus-visited','focusVisitedCities','聚焦到访')+'</div></div>'
  +'<div class="annual-map-head"><h3>上海足迹：<span>'+emphasizeNumbers(report.shanghaiCoverage)+'</span></h3><span class="annual-map-credit">'+shanghaiAttribution+'</span></div>'
  +'<div class="annual-map-frame"><canvas id="annual-shanghai-map" role="img" aria-label="'+E('上海足迹，'+report.shanghaiCoverage)+'"></canvas>'
  +'<div id="annual-shanghai-tooltip" class="annual-shanghai-tooltip" role="tooltip" hidden></div>'
  +toggle('annual-include-chongming','includeChongming','崇明区')
  +toggle('annual-inner-ring','innerRing','内环','annual-map-toggle-east')+'</div>'
  +(report.shanghaiNote?'<p class="annual-note">'+E(report.shanghaiNote)+'</p>':'')+'<div class="annual-stats'+(custom?' annual-stats-range':'')+'">'
  +reviewStatCards(report.stats)
  +(custom?'':'<div class="annual-stat annual-expense"><b><button id="annual-metro-edit" type="button">—</button>'
   +'<input id="annual-metro-expense" type="number" min="0" step="0.01" inputmode="decimal" aria-label="地铁费用（元）" hidden></b><span>地铁费用</span></div>')
  +'</div><div class="annual-summary"><section><h3>'+report.monthTitle+'</h3><div class="annual-summary-content annual-months">'+bars+'</div></section>'
  +'<section><h3>'+(highlight?'<i class="annual-top-dot" style="background:'+palette.highlight+'" aria-hidden="true"></i>':'')
  +'常去地点 Top 5</h3><div class="annual-summary-content annual-top-list">'+rows(report.top)+'</div></section></div>';
 const nationalMap=$('annual-map'),shanghaiMap=$('annual-shanghai-map'),tooltip=$('annual-shanghai-tooltip');
 const isCompact=()=>nationalMap.clientWidth>0&&nationalMap.clientWidth<480;
 const labelSize=()=>nationalMap.clientWidth?Math.max(20,Math.min(46,Math.round(11200/nationalMap.clientWidth))):20;
 let compact=isCompact(),nationalFont=labelSize();
 const paintNational=(target,fontSize,colors=palette)=>{
  const {focusVisitedCities,includeSouthChinaSea}=reviewMapOptions;
  drawAnnualMap(target,china,cityBoundaries,report.visits,colors,
   focusVisitedCities||includeSouthChinaSea,focusVisitedCities,{fontSize});
 };
 const renderNational=()=>{
  $('annual-include-south-china-sea').disabled=reviewMapOptions.focusVisitedCities;
  paintNational(nationalMap,nationalFont);
 };
 const paintShanghai=(target,stacked,colors=palette)=>drawShanghaiMap(target,cityBoundaries,shanghaiLandmarks,report.shanghaiPoints,
  {includeChongming:reviewMapOptions.includeChongming,innerRing:reviewMapOptions.innerRing,topPlaces,palette:colors,stacked});
 const renderShanghai=()=>{
  tooltip.hidden=true;
  shanghaiMap.parentElement?.classList.toggle('annual-shanghai-stacked',compact);
  return paintShanghai(shanghaiMap,compact);
 };
 renderNational();
 let markers=renderShanghai();
 if(typeof ResizeObserver==='function'){
  annualMapResize=new ResizeObserver(()=>{
   if(!overlay.open)return;
   const nextLayout=isCompact(),nextFont=labelSize();
   if(nextFont!==nationalFont){nationalFont=nextFont;renderNational();}
   if(nextLayout!==compact){compact=nextLayout;markers=renderShanghai();}
  });
  annualMapResize.observe(nationalMap);
 }
 for(const [id,key] of [['annual-focus-visited','focusVisitedCities'],['annual-include-south-china-sea','includeSouthChinaSea'],['annual-include-chongming','includeChongming'],['annual-inner-ring','innerRing']]){
  const control=$(id);
  control.checked=reviewMapOptions[key];
  control.onchange=()=>{
   if(control.disabled)return;
   reviewMapOptions[key]=control.checked;
   try{localStorage.setItem('atlas-review-map-options',JSON.stringify(reviewMapOptions));}catch{}
   if(key==='includeChongming'){
    renderAnnual(year);
    $(id).focus?.({preventScroll:true});
   }else if(key==='innerRing')markers=renderShanghai();
   else renderNational();
  };
 }
 const showPlaceTooltip=event=>{
  const mapBounds=shanghaiMap.getBoundingClientRect();
  const frame=shanghaiMap.parentElement.getBoundingClientRect();
  const localX=event.clientX-mapBounds.left-shanghaiMap.clientLeft;
  const localY=event.clientY-mapBounds.top-shanghaiMap.clientTop;
  const xScale=shanghaiMap.clientWidth/shanghaiMap.width,yScale=shanghaiMap.clientHeight/shanghaiMap.height;
  const names=new Set(markers.filter(({x,y})=>Math.hypot(x*xScale-localX,y*yScale-localY)<=10).map(p=>p.name));
  tooltip.hidden=!names.size;
  if(!names.size)return;
  tooltip.textContent=[...names].join('\n');
  const x=event.clientX-frame.left,y=event.clientY-frame.top;
  tooltip.style.left=Math.max(6,Math.min(x+8,frame.width-tooltip.offsetWidth-6))+'px';
  const above=y-tooltip.offsetHeight-8;
  tooltip.style.top=Math.max(6,Math.min(above>=6?above:y+8,frame.height-tooltip.offsetHeight-6))+'px';
 };
 shanghaiMap.onpointermove=event=>{if(event.pointerType!=='touch')showPlaceTooltip(event);};
 shanghaiMap.onpointerup=event=>{if(event.pointerType==='touch')showPlaceTooltip(event);};
 shanghaiMap.onpointerleave=event=>{if(event.pointerType!=='touch')tooltip.hidden=true;};
 const amount=custom?null:editMetroExpense(period.filename);
 $('annual-export').disabled=false;
 const exportButton=$('annual-export'),dialog=$('annual-review');
 const exportCurrent=()=>{
  const stats=amount?[...report.stats,['地铁费用',amount()]]:report.stats;
  const paper=palettes[currentTheme];
  return saveReportPng(exportButton,$('annual-status'),dialog,report.filename,()=>{
   const national=!nightMode&&nationalFont===20?nationalMap:document.createElement('canvas');
   const shanghai=nightMode||compact?document.createElement('canvas'):shanghaiMap;
   if(national!==nationalMap)paintNational(national,20,paper);
   if(shanghai!==shanghaiMap)paintShanghai(shanghai,false,paper);
   const image=document.createElement('canvas');
   drawAnnualImage(image,{...report,stats,highlight},national,shanghai,paper);
   return image;
  },()=>exportButton.onclick===exportCurrent);
 };
 exportButton.onclick=exportCurrent;
}
async function encodePng(image){
 const png=await new Promise(resolve=>image.toBlob(resolve,'image/png'));
 if(!png)throw Error('PNG 编码失败');
 return png;
}
function downloadImage(png,filename,dialog){
 const url=URL.createObjectURL(png);
 const link=document.createElement('a');
 link.download=filename+'.png';
 link.href=url;
 // A native modal makes the surrounding page inert.
 dialog.append(link);
 link.click();
 link.remove();
 setTimeout(()=>URL.revokeObjectURL(url),30000);
}
async function saveReportPng(button,status,dialog,filename,getCanvas,isCurrent){
 const current=()=>dialog.open&&isCurrent();
 button.disabled=true;
 status.textContent='正在生成 PNG…';
 try{
  const png=await encodePng(getCanvas());
  if(!current())return;
  downloadImage(png,filename,dialog);
  status.textContent='已生成 PNG 图片';
 }catch{
  if(current())status.textContent='图片导出失败，请重试';
 }finally{
  if(current())button.disabled=false;
 }
}
let annualOpenRequest=0;
async function openAnnualReview(){
 const overlay=$('annual-review');
 if(overlay.open)return;
 const request=++annualOpenRequest;
 const {min,max}=annualYears();
 const year=annualAvailableYears[0]??max;
 $('annual-range-controls').hidden=true;
 $('annual-title').textContent=year+' 年度回顾';
 if(!annualAvailableYears.length)annualAvailableYears=[year];
 renderAnnualYearSelect(year,false);
 $('annual-body').textContent='';
 for(const id of ['annual-prev','annual-next','annual-export','annual-year-select']){
  $(id).disabled=true;
  $(id).hidden=false;
 }
 $('annual-status').textContent='正在加载地图边界…';
 overlay.showModal();
 $('annual').setAttribute('aria-pressed','true');
 try{
  await Promise.all([loadChina(),loadCityBoundaries(),loadShanghaiLandmarks()]);
  if(overlay.open&&request===annualOpenRequest){
   const from=new Date(min,0,1),to=new Date(max,11,31,23,59,59,999);
   const events=reviewEvents(from,to);
   const years=new Set();
   for(const {day} of occurrenceDays(events,from,to,$('split-trip-days').checked))years.add(new Date(day).getUTCFullYear());
   annualAvailableYears=[...years].sort((a,b)=>b-a);
   if(!annualAvailableYears.length)annualAvailableYears=[year];
   $('annual-year-select').disabled=false;
   renderAnnual(annualAvailableYears[0],false);
  }
 }catch{
  if(overlay.open&&request===annualOpenRequest)$('annual-status').textContent='地图边界加载失败，请关闭后重试';
 }
}
$('annual').onclick=openAnnualReview;
$('annual-close').onclick=()=>$('annual-review').close();
$('annual-review').onclose=()=>{
 if($('annual-review').open)return;
 $('annual').setAttribute('aria-pressed','false');
 annualMapResize?.disconnect();
};
$('annual-year-select').onchange=event=>{
 const custom=event.target.value==='range';
 const year=custom?Number($('annual-review').dataset.year):Number(event.target.value);
 if(custom&&!$('annual-range-from').value){
  $('annual-range-from').value=Math.max(annualYears().min,year-1)+'-01-01';
  $('annual-range-to').value=year+'-12-31';
 }
 renderAnnual(year,custom);
};
$('annual-range-from').onchange=$('annual-range-to').onchange=()=>renderAnnual(Number($('annual-review').dataset.year));
for(const [id,step] of [['annual-prev',1],['annual-next',-1]]){
 $(id).onclick=()=>{
  const index=annualAvailableYears.indexOf(Number($('annual-review').dataset.year));
  const year=annualAvailableYears[index+step];
  if(year)renderAnnual(year,false);
 };
}
async function startAtlas(){
 const [config,places,calendar]=await Promise.allSettled([
  readConfigFiles(),readCSV(),fetchCalendar(),
 ]);
 renderBlacklist();
 let calendarReady=false;
 if(calendar.status==='fulfilled'){
  try{load(calendar.value,false,true);calendarReady=true;}catch{}
 }
 if(!calendarReady){
  $('events').innerHTML='<div class="empty" role="status">未能读取日历 <button type="button" data-open-source-settings>打开数据设置</button></div>';
  $('events').querySelector('[data-open-source-settings]')?.addEventListener('click',()=>{
   if(!settingsOpen)settingsDrawer(true);
   document.querySelector('[data-settings-panel="appearance"]')?.click();
  });
  draw();
 }
 const missing=[];
 if(config.status==='rejected')missing.push('配置');
 if(places.status==='rejected')missing.push('地点');
 if(!calendarReady)missing.push('日历');
 if(missing.length)$('status').textContent=missing.join('、')+'读取失败';
 if(!mobileSource||mobileImport)void updateDataTimes();
}
await startAtlas();
(()=>{
 const level=new URLSearchParams(globalThis.location?.search).get('level');
 if(['place','shanghai','domestic','country'].includes(level)){
  $('level').value=level;
  if($('map-body').hidden)setSectionCollapsed('map',false);
  else void loadMainMap();
 }else if(!$('map-body').hidden){
  setTimeout(loadMainMap,0);
 }
})();
(()=>{try{const ay=new URLSearchParams(location.search).get('annual');if(ay)setTimeout(()=>{const b=annualYears(),y=Number(ay)||new Date().getFullYear();openAnnualReview(Math.max(b.min,Math.min(b.max,y)));},500);}catch{}})();
