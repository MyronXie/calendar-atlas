import fs from 'node:fs/promises';import assert from 'node:assert/strict';import {parseCSV} from '../csv-store.mjs';
class Element{constructor(){this.value='';this.checked=true;this.style={};this.classList={toggle(){},add(){},remove(){}};this.children=[];this.dataset={};this.elements={};this.min=0;this.max=0;}set innerHTML(s){this.html=s;this.queryCache={};}get innerHTML(){return this.html||'';}querySelectorAll(selector){if(!['[data-note]','[data-filter-place]','[data-filter-person]','[data-rank-name]','[data-edit-rank]','[data-rank-eye]','[data-edit]','[data-filter-event]','[data-remove-filter]','[data-rule-toggle]','[data-rule-delete]','[data-rule-edit]','[data-theme-choice]'].includes(selector))return [];this.queryCache||={};if(this.queryCache[selector])return this.queryCache[selector];const attr=selector.slice(1,-1),key=attr.slice(5).replace(/-([a-z])/g,(_,x)=>x.toUpperCase());const decode=x=>x.replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&amp;/g,'&');return this.queryCache[selector]=[...this.innerHTML.matchAll(new RegExp(attr+'="([^"]*)"','g'))].map(m=>{const el=new Element();el.dataset[key]=decode(m[1]);return el;});}querySelector(){return null;}showModal(){this.open=true;}close(){this.open=false;}setAttribute(k,v){this.attributes||={};this.attributes[k]=v;}addEventListener(type,handler){this.listeners||={};this.listeners[type]=handler;}setPointerCapture(){}getBoundingClientRect(){return {width:900,height:490,left:0,top:0};}}
const rankTabs=['places','partners','groups'].map(tab=>{const e=new Element();e.dataset.tab=tab;return e;});const savedStorage=new Map();const mapClicks=[];const icons=[];const els=new Map();const dummy=()=>new Proxy({},{get:(t,p)=>p==='getBounds'?()=>({isValid:()=>true}):()=>dummy()});const mapViews=[],mapFits=[];const testMap=new Proxy(dummy(),{get(target,key){if(key==='setView')return (...args)=>{mapViews.push(args);return testMap;};if(key==='fitBounds')return (...args)=>{mapFits.push(args);return testMap;};if(key==='getSize')return ()=>({x:900,y:550});return target[key];}});globalThis.L={map:()=>testMap,tileLayer:()=>dummy(),control:{scale:()=>dummy()},markerClusterGroup:()=>dummy(),marker:()=>{const m=dummy();return new Proxy(m,{get:(t,p)=>p==='on'?(event,cb)=>{if(event==='click')mapClicks.push(cb);return m;}:m[p]});},divIcon:o=>{icons.push(o.html);return dummy()},heatLayer:()=>dummy(),geoJSON:()=>dummy(),circleMarker:()=>dummy(),featureGroup:()=>dummy()};globalThis.document={getElementById(id){if(!els.has(id))els.set(id,new Element());if(id==='editform'&&!els.get(id).elements.address)for(const key of ['location','address','lat','lon','datum','country','province','city','type','labels','valid'])els.get(id).elements[key]=new Element();return els.get(id);},querySelectorAll(selector){return selector==='[data-panel]'?rankTabs:[];},body:new Element()};globalThis.localStorage={getItem:key=>savedStorage.get(key)||null,setItem(key,value){savedStorage.set(key,value);},removeItem(key){savedStorage.delete(key);}};globalThis.setInterval=()=>0;for(const [id,value] of [['datum','wgs84'],['level','place'],['placestate','all'],['timeunit','year']]){els.set(id,new Element());els.get(id).value=value;}
let mockConfig=null,mockSaveCount=0;globalThis.fetch=async(input,options)=>{if(input==='api/config'){const {readConfig}=await import('../config-store.mjs');mockConfig||=await readConfig(new URL('../user-data/',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'));if(options?.method==='POST'){const body=JSON.parse(options.body);mockConfig={...mockConfig,blacklist:body.blacklist,eventRules:body.blacklist.filter(r=>r.type==='event'),placeRules:body.blacklist.filter(r=>r.type==='place'),version:'mock-'+(++mockSaveCount)};}return {ok:true,json:async()=>structuredClone(mockConfig)};}if(input==='api/places'){const text=await fs.readFile(new URL('../user-data/place.csv',import.meta.url),'utf8');return {ok:true,json:async()=>({...parseCSV(text),version:'test-version',file:'user-data/place.csv'})};}const file=input==='api/calendar'?'C:/Users/Myron/calendar-atlas/user-data/calendar.ics':new URL('../'+input,import.meta.url);const text=await fs.readFile(file,'utf8');return {ok:true,text:async()=>text,json:async()=>JSON.parse(text)};};
await import('../app.js');assert.ok(!els.get('status').textContent,'Application must load');assert.ok(icons.some(h=>h.includes('single-emoji')));assert.ok(!icons.some(h=>h.includes('>1</span>')));assert.ok(els.get('events').innerHTML.includes('<article class="event">'));assert.ok(!els.get('events').innerHTML.includes('<summary>'));const ev=els.get('events');assert.ok(ev.querySelectorAll('[data-note]').length);ev.querySelectorAll('[data-note]')[0].onclick();assert.ok(ev.innerHTML.includes('aria-expanded="true"'));ev.querySelectorAll('[data-note]')[0].onclick();assert.ok(!ev.innerHTML.includes('aria-expanded="true"'));els.get('showplaces').checked=false;els.get('showplaces').onchange();assert.ok(ev.innerHTML.includes('class="eventplaces" hidden'));els.get('showpeople').checked=false;els.get('showpeople').onchange();assert.ok(ev.innerHTML.includes('class="eventpeople" hidden'));els.get('showplaces').checked=true;els.get('showpeople').checked=true;els.get('showplaces').onchange();const place=ev.querySelectorAll('[data-filter-place]')[0];assert.ok(place);place.onclick();assert.ok(els.get('activefilters').innerHTML.includes('地点：'));els.get('unselect').onclick();const person=ev.querySelectorAll('[data-filter-person]')[0];assert.ok(person);person.onclick();assert.ok(els.get('activefilters').innerHTML.includes('人物：'));els.get('unselect').onclick();assert.ok(els.get('activefilters').innerHTML==='');mapClicks[0]();assert.ok(els.get('activefilters').innerHTML.includes('地点：'));els.get('unselect').onclick();const ranked=els.get('ranking').querySelectorAll('[data-rank-name]')[0];assert.ok(ranked);ranked.onclick();assert.ok(els.get('activefilters').innerHTML.includes('地点：'));const matching=ev.querySelectorAll('[data-filter-place]').find(x=>x.dataset.filterPlace===ranked.dataset.rankName);assert.ok(matching);matching.onclick();assert.ok(!els.get('activefilters').innerHTML.includes('地点：'));els.get('search').value='nonexistent-fixture-search-8251';els.get('search').oninput();assert.ok(els.get('activefilters').innerHTML.includes('data-remove-draft'));assert.ok(els.get('events').innerHTML.includes('无事件'));els.get('unselect').onclick();assert.equal(els.get('search').value,'');assert.ok(!els.get('events').innerHTML.includes('data-place='));const addEvent=els.get('events').querySelectorAll('[data-filter-event]')[0];assert.ok(addEvent);addEvent.onclick();assert.ok(els.get('activefilters').innerHTML.includes('事件：'));const person2=els.get('events').querySelectorAll('[data-filter-person]')[0];if(person2){person2.onclick();assert.ok(els.get('activefilters').innerHTML.includes('事件：'));assert.ok(els.get('activefilters').innerHTML.includes('人物：'));}const removeIndex=els.get('activefilters').innerHTML.includes('组别：')?'1':'0';const remove=els.get('activefilters').querySelectorAll('[data-remove-filter]').find(x=>x.dataset.removeFilter===removeIndex);remove.onclick();assert.ok(!els.get('activefilters').innerHTML.includes('事件：'));els.get('unselect').onclick();els.get('searchscope').value='event';els.get('search').value='fixture-search-999';els.get('searchform').onsubmit({preventDefault(){}});assert.ok(els.get('activefilters').innerHTML.includes('事件关键词：'));assert.equal(els.get('search').value,'');els.get('unselect').onclick();assert.ok(els.get('placelist').innerHTML.includes('data-edit='));els.get('yearfrom').value=2020;els.get('yearto').value=2021;els.get('yearfrom').oninput();assert.equal(els.get('from').value,'2020-01-01');assert.equal(els.get('to').value,'2021-12-31');els.get('timeunit').value='month';els.get('timeunit').onchange();els.get('yearfrom').value=2024*12+1;els.get('yearto').value=2024*12+1;els.get('yearfrom').oninput();assert.equal(els.get('from').value,'2024-02-01');assert.equal(els.get('to').value,'2024-02-29');assert.ok(!els.get('yearbars').innerHTML.includes('class="barcount"'));assert.ok(els.get('yearbars').innerHTML.includes('year-dark'));assert.ok(els.get('yearbars').innerHTML.includes('year-light'));assert.equal(els.get('period-start').textContent,'2024-02');assert.equal(els.get('period-end').textContent,'2024-02');assert.equal(els.get('timeline-track').style.minWidth,'0');assert.equal(els.get('timeline-track').style.width,'100%');els.get('yearfrom').value=2025*12+1;els.get('yearto').value=2025*12+1;els.get('yearfrom').oninput();assert.equal(els.get('to').value,'2025-02-28');els.get('timeunit').value='year';els.get('timeunit').onchange();els.get('yearfrom').value=2020;els.get('yearto').value=2021;els.get('yearfrom').oninput();const tr=els.get('brushtrack'),min=+els.get('yearfrom').min,max=+els.get('yearfrom').max;const step=900/(max-min+1);tr.onpointerdown({clientX:100,pointerId:1,target:{id:'brushright'},preventDefault(){}});tr.onpointermove({clientX:100+step});tr.onpointerup();assert.equal(els.get('to').value,'2022-12-31');tr.onpointerdown({clientX:100,pointerId:2,target:{id:'brushselection'},preventDefault(){}});tr.onpointermove({clientX:100+step});tr.onpointerup();assert.equal(els.get('from').value,'2021-01-01');assert.equal(els.get('to').value,'2023-12-31');const html=await fs.readFile(new URL('../index.html',import.meta.url),'utf8');assert.ok(!html.includes('生活的经纬'));assert.ok(!html.includes('YOUR PERSONAL'));assert.ok(html.includes('id="yearbars"'));assert.ok(html.includes('id="brushselection"'));assert.ok(els.get('yearbars').innerHTML.includes('data-period='));els.get('heatmap').checked=true;els.get('heatmap').onchange();assert.ok(!els.get('provider').disabled);els.get('heatmap').checked=false;els.get('level').value='province';els.get('level').onchange();els.get('level').value='city';els.get('level').onchange();els.get('level').value='country';els.get('level').onchange();assert.ok(els.get('provider').disabled);els.get('level').value='place';els.get('level').onchange();assert.ok(!els.get('provider').disabled);assert.ok(html.includes('data-settings-panel="manage"'));assert.ok(!html.includes('id="partner"'));assert.ok(!html.includes('id="region"'));assert.ok(!html.includes('data-panel="pending"'));assert.ok(html.indexOf('id="search"')>html.indexOf('<section class="events">'));assert.ok(html.indexOf('data-settings-panel="filters"')>html.indexOf('data-settings-panel="manage"'));const rulesPanel=els.get('blacklist-rows');const beforeRules=rulesPanel.querySelectorAll('[data-rule-delete]').length;const toggle=rulesPanel.querySelectorAll('[data-rule-toggle]')[0];assert.ok(toggle);toggle.checked=false;await toggle.onchange();assert.ok(rulesPanel.innerHTML.includes('blacklist-row off'));await rulesPanel.querySelectorAll('[data-rule-delete]')[0].onclick();assert.equal(rulesPanel.querySelectorAll('[data-rule-delete]').length,beforeRules-1);const form=els.get('blacklist-form');for(const k of ['type','match_type','value','reason','enabled'])form.elements[k]=new Element();els.get('add-blacklist').onclick();form.elements.value.value='Synthetic blacklist rule';form.elements.enabled.checked=true;await form.onsubmit({preventDefault(){},target:form});assert.equal(rulesPanel.querySelectorAll('[data-rule-delete]').length,beforeRules);assert.ok(!html.includes('未核验'));assert.ok(!html.includes('id="eventrules"'));els.get('collapse-map').onclick();assert.equal(els.get('map-body').hidden,true);els.get('collapse-map').onclick();assert.equal(els.get('map-body').hidden,false);els.get('collapse-timeline').onclick();assert.equal(els.get('timeline-body').hidden,true);els.get('collapse-timeline').onclick();assert.equal(els.get('timeline-body').hidden,false);els.get('collapse-eventlist').onclick();assert.equal(els.get('eventlist-body').hidden,true);els.get('collapse-eventlist').onclick();assert.equal(els.get('eventlist-body').hidden,false);const blue=els.get('theme-options').querySelectorAll('[data-theme-choice]').find(x=>x.dataset.themeChoice==='blue');assert.ok(blue);blue.onclick();assert.equal(document.body.attributes['data-theme'],'blue');assert.ok(!els.get('ranking').innerHTML.includes('已有坐标'));assert.ok(!els.get('placelist').innerHTML.includes('历史记录保留'));assert.ok(!html.includes('id="yearlabel"'));assert.ok(!html.includes('id="view-map"'));assert.ok(!html.includes('id="heat"'));assert.ok(html.includes('id="heatmap"'));assert.ok(html.indexOf('id="provider"')<html.indexOf('id="map-body"'));assert.ok(html.indexOf('id="showplaces"')<html.indexOf('id="eventlist-body"'));els.get('toggle-settings').onclick();assert.equal(els.get('settings-drawer').attributes['aria-hidden'],'false');assert.equal(els.get('settings-backdrop').hidden,false);els.get('close-settings').onclick();assert.equal(els.get('settings-drawer').attributes['aria-hidden'],'true');assert.equal(els.get('settings-backdrop').hidden,true);assert.ok(!els.get('yearbars').innerHTML.includes('bar-matched'));els.get('search').value='fixture-test-nonexistent';els.get('search').oninput();assert.ok(els.get('yearbars').innerHTML.includes('bar-matched'));els.get('unselect').onclick();const values=[...els.get('yearbars').innerHTML.matchAll(/data-total="(\d+)" data-matched="(\d+)"/g)];assert.ok(values.length>0);assert.ok(values.every(m=>+m[2]<=+m[1]));console.log(JSON.stringify({rightSettingsDrawer:'passed',filteredTimeline:'passed',sectionDrawers:'passed',themeSwitch:'passed',compactLists:'passed',blacklistUI:'passed',appRuntime:'passed',yearRange:'passed',monthRange:'passed',leapYear:'passed',compactEvents:'passed',placeManagement:'passed',histogramBrush:'passed',adminLevels:'passed',timeOnlyNotes:'passed',entityFilters:'passed',columnVisibility:'passed',fittedMonthBars:'passed',sharedRankEntityFilters:'passed',keywordSummary:'passed',drawerLayout:'passed',mapCriteria:'passed',multipleCriteria:'passed',searchScopes:'passed'}));

// Verify actual rank buttons in each tab without changing active criteria or frequencies.
els.get('all').onclick();els.get('unselect').onclick();
for(const tab of rankTabs){
 tab.onclick();const pane=els.get('ranking'),before=pane.querySelectorAll('[data-rank-name]').map(e=>e.dataset.rankName);assert(before.length>0);const name=before[0],original=pane.innerHTML;
 const criteria=els.get('activefilters').innerHTML;
 pane.querySelectorAll('[data-rank-eye]')[0].onclick({stopPropagation(){}});
 assert(pane.innerHTML.includes('rank-divider'));assert.equal(pane.querySelectorAll('[data-rank-name]').at(-1).dataset.rankName,name);assert.equal(els.get('activefilters').innerHTML,criteria);
 const getCounts=html=>[...html.matchAll(/data-rank-name="([^"]*)"[\s\S]*?<b>(\d+)<\/b>/g)].map(m=>m[1]+'='+m[2]).sort();
 assert.deepEqual(getCounts(pane.innerHTML),getCounts(original));
 const stored=JSON.parse(savedStorage.get('atlas-rank-hidden-v1'));assert.equal(stored[tab.dataset.tab].length,1);
 pane.querySelectorAll('[data-rank-eye]').find(e=>e.dataset.rankEye===name).onclick({stopPropagation(){}});
 assert.deepEqual(pane.querySelectorAll('[data-rank-name]').map(e=>e.dataset.rankName),before);assert(!pane.innerHTML.includes('rank-divider'));
}
assert(!html.includes('id="editname"'));assert(!html.includes('name="emoji"'));
rankTabs[0].onclick();const gear=els.get('ranking').querySelectorAll('[data-edit-rank]')[0];assert(!gear);
const editor=els.get('editform');assert(!Object.hasOwn(editor.elements,'emoji'));editor.elements.address.value='上海市闵行区测试地址';for(const k of ['country','province','city'])editor.elements[k].value='';
editor.elements.address.listeners.input();assert.equal(editor.elements.country.value,'中国');assert.equal(editor.elements.province.value,'上海市');assert.equal(editor.elements.city.value,'上海市');editor.elements.city.value='自定义城市';editor.elements.city.listeners.input();editor.elements.address.value='江苏省苏州市姑苏区测试地址';editor.elements.address.listeners.input();assert.equal(editor.elements.province.value,'江苏省');assert.equal(editor.elements.city.value,'自定义城市');
console.log('All three rank eye controls, separator, counts, persistence, restoration and single-name editor: passed');

const annualContext=new Proxy({measureText:text=>({width:String(text).length*12})},{get:(ctx,key)=>ctx[key]??(()=>{})});
for(const id of ['annual-map','annual-shanghai-map']){
 document.getElementById(id).getContext=()=>annualContext;
}
document.getElementById('annual-close').focus=()=>{};
await document.getElementById('annual').onclick();
const annualBody=document.getElementById('annual-body').innerHTML;
assert.ok(annualBody.includes('id="annual-shanghai-map"'));
assert.equal((annualBody.match(/class="annual-stat\b/g)||[]).length,5);
assert.match(annualBody,/<small>\(\d+\)<\/small>/);
assert.ok(!/常同行同伴|地点类型|国家\/地区|最长连续天数/.test(annualBody));
assert.ok(annualBody.includes('到访地点/新地点'));
assert.equal((annualBody.match(/class="annual-mbar"[^>]+><strong>\d+<\/strong>/g)||[]).length,12);
assert.ok(annualBody.includes('常去地点 Top 5'));
assert.ok(annualBody.includes('地铁费用（元）'));
assert.ok(annualBody.includes('全国足迹：'));
assert.match(annualBody,/上海足迹：<span>已标注\d+个地点/);
assert.ok(!annualBody.includes('指定事件范围总结'));
assert.ok((annualBody.match(/class="annual-row"/g)||[]).length<=5);
assert.equal(document.getElementById('annual-export').disabled,false);
const annualExpense=document.getElementById('annual-metro-expense');
const editExpense=document.getElementById('annual-metro-edit');
annualExpense.focus=()=>{};
assert.equal(editExpense.textContent,'—');
assert.equal(annualExpense.hidden,true);
editExpense.onclick();
assert.equal(annualExpense.hidden,false);
annualExpense.value='38.50';annualExpense.onblur();
assert.equal(annualExpense.hidden,true);
assert.equal(editExpense.textContent,'38.50');
const annualMode=document.getElementById('annual-mode');
const startRange=document.getElementById('annual-range-from'),endRange=document.getElementById('annual-range-to');

const calendar=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Atlas test//EN'];
for(const [i,stamp] of ['20251230T235900','20251231T000000','20260101T235959','20260102T000000'].entries()){
 calendar.push('BEGIN:VEVENT','UID:range-'+i,'DTSTAMP:20260101T000000Z','DTSTART:'+stamp,'SUMMARY:范围测试','END:VEVENT');
}
calendar.push('END:VCALENDAR');
await document.getElementById('ics').onchange({target:{files:[{text:async()=>calendar.join('\r\n')+'\r\n',lastModified:1}],value:''}});
await document.getElementById('annual').onclick();
assert.equal(editExpense.textContent,'38.50');
annualMode.onclick();
assert.equal(document.getElementById('annual-title').textContent,'跨年统计');
startRange.value='2025-12-31';endRange.value='2026-01-01';endRange.onchange();
const scopedBody=document.getElementById('annual-body').innerHTML;
assert.match(scopedBody,/<b>2<\/b><span>事件<\/span>/);
assert.ok(scopedBody.includes('annual-stats-range'));
assert.ok(!scopedBody.includes('地铁费用')&&!scopedBody.includes('新地点'));
assert.ok(scopedBody.includes('月度分布（按月份汇总）'));
assert.ok(scopedBody.includes('id="annual-map"')&&scopedBody.includes('id="annual-shanghai-map"'));
endRange.value='2025-12-30';endRange.onchange();
assert.ok(document.getElementById('annual-body').innerHTML.includes('结束日期须不早于开始日期'));
assert.equal(document.getElementById('annual-export').disabled,true);
endRange.value='2026-01-01';endRange.onchange();
assert.equal(document.getElementById('annual-export').disabled,false);
annualMode.onclick();
assert.equal(editExpense.textContent,'38.50');

assert.match(html,/<option value="place">地点<\/option><option value="shanghai">上海市<\/option><option value="city">城市<\/option>/);
const metroColors=[];
L.layerGroup=()=>dummy();
L.polyline=(lines,options)=>{if(/^#[\da-f]{6}$/i.test(options.color))metroColors.push(options.color);return dummy();};
const mainShanghaiDistricts=[];
L.geoJSON=(data,options)=>{
 if(options?.coordsToLatLng)mainShanghaiDistricts.push(data.features.map(f=>f.properties.name));
 return dummy();
};
document.getElementById('level').value='shanghai';
const beforeShanghaiFits=mapFits.length;
await document.getElementById('level').onchange();
assert.deepEqual(mapViews.at(-1)?.[0],[31.23,121.47]);
assert.ok(mapFits.length>beforeShanghaiFits);
assert.ok(mainShanghaiDistricts[0].includes('崇明区'));
assert.ok(metroColors.includes('#E4002B')&&metroColors.includes('#97D700'));
assert.ok(document.getElementById('provider').disabled);
const afterShanghaiFits=mapFits.length;
const includeNansha=document.getElementById('annual-include-nansha');
const includeChongming=document.getElementById('annual-include-chongming');
const innerRing=document.getElementById('annual-inner-ring');
includeNansha.checked=false;includeNansha.onchange();
includeChongming.checked=false;includeChongming.onchange();
innerRing.checked=true;innerRing.onchange();
assert.deepEqual(JSON.parse(localStorage.getItem('atlas-review-map-options')),{includeNansha:false,includeChongming:false,innerRing:true});
assert.equal(mapFits.length,afterShanghaiFits);
assert.equal(mainShanghaiDistricts.length,1);
await document.getElementById('annual').onclick();
assert.equal(includeChongming.checked,false);
assert.equal(includeNansha.checked,false);
assert.equal(innerRing.checked,true);
