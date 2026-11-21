import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {cityKey,drawAnnualImage,drawAnnualMap,drawShanghaiMap,mapAttribution,shanghaiDistricts,shanghaiMapPlaces,shanghaiMetroLayers} from '../lib/annual-review.js';
import {containsPoint,gcjToWgs} from '../lib/geo.js';
import {palettes} from '../lib/appearance.js';

const loadMap = async name => JSON.parse(await readFile(new URL('../data/' + name + '.json',import.meta.url),'utf8'));
const [provinces,boundaries,landmarks] = await Promise.all(['china','city-boundaries','shanghai-landmarks'].map(loadMap));
assert.ok(containsPoint(landmarks.waterAreas,121.43344,31.25018),'苏州河内的已知点');
assert.ok(!containsPoint(landmarks.waterAreas,121.43344,31.25118),'苏州河旁的陆地点');
const sharedMetro=shanghaiMetroLayers(landmarks).filter(f=>f.shared);
assert.deepEqual(sharedMetro.map(f=>[f.color,f.dashArray]),[['#FFD100',undefined],['#5F259F',[6,6]]]);
assert.deepEqual(sharedMetro[0].lines,sharedMetro[1].lines);
assert.equal(sharedMetro[0].lines.length,1);
const airportLine=landmarks.metro.find(line=>line.ref==='市域机场线');
assert.equal(airportLine.name,'机场联络线');
assert.equal(airportLine.lines.length,1);
assert.ok(airportLine.lines.some(line=>line.some(([lon,lat])=>lon<121.33&&lat>31.19)));
assert.ok(airportLine.lines.some(line=>line.some(([lon])=>lon>121.79)));
const jinshan=shanghaiMetroLayers(landmarks).filter(line=>line.name==='金山铁路');
assert.deepEqual(jinshan.map(line=>[line.color,line.dashArray]),[['#fff',undefined],['#252525',[6,6]]]);
assert.equal(jinshan[0].lines.length,1);
assert.equal(new Set(landmarks.stations.map(station=>station.name)).size,landmarks.stations.length);
assert.deepEqual(landmarks.stations.find(station=>station.name==='上海南站').platforms.map(p=>p.ref),['1','3','15','金山铁路']);
assert.equal(landmarks.stations.filter(station=>station.platforms.some(p=>p.ref==='金山铁路')).length,9);
for(const [name,crossing] of [['南浦大桥','bridge'],['杨浦大桥','bridge'],['军工路隧道','tunnel'],['上中路隧道','tunnel']]){
  const feature=landmarks.features.find(f=>f.name===name);
  assert.equal(feature?.crossing,crossing,name);
  assert.ok(feature.lines.some(line=>line.slice(1).some(([lon,lat],i)=>{
    const [prevLon,prevLat]=line[i];
    return containsPoint(landmarks.waterAreas,(lon+prevLon)/2,(lat+prevLat)/2);
  })),name+' crosses mapped water');
}
const palette = palettes.green;

function recordingCanvas() {
  const canvas = {images:[],texts:[],rects:[],strokes:[],widths:[],fills:[],pathCount:0,getContext:()=>ctx};
  const ctx = {
    beginPath(){}, moveTo(){canvas.pathCount++;}, lineTo(){}, closePath(){}, fill(){canvas.fills.push(this.fillStyle);},
    stroke(){canvas.strokes.push(this.strokeStyle);canvas.widths.push(this.lineWidth);}, strokeText(){},
    strokeRect(){}, arc(){}, rect(){}, setLineDash(){}, clip(){}, save(){}, restore(){},
    fillRect(x,y,width,height){canvas.rects.push({color:this.fillStyle,x,y,width,height});},
    measureText(text){return {width:String(text).length * 12};},
    fillText(text,x,y){canvas.texts.push({text,x,y,font:this.font});},
    drawImage(image,x,y,width,height){canvas.images.push({image,x,y,width,height});},
  };
  return canvas;
}

const nationalMap = recordingCanvas();
const cityNames=['上海市','北京市','天津市'];
drawAnnualMap(nationalMap,provinces,boundaries,{
  provinces:new Set([...cityNames,'湖北省','云南省']),
  cities:new Set([...cityNames.map(name=>cityKey(name,name)),cityKey('湖北省','神农架林区'),cityKey('云南省','西双版纳傣族自治州')]),
  cityPoints:new Map()
},palette);
const nationalNames=nationalMap.texts.map(({text})=>text);
for(const name of ['北京','天津','上海','神农架','西双版纳'])assert.ok(nationalNames.includes(name),name);
assert.ok(!nationalNames.some(name=>/市$|林区$|自治州$/.test(name)));
const nationalWithoutSouthChinaSea=recordingCanvas();
drawAnnualMap(nationalWithoutSouthChinaSea,provinces,boundaries,{
  provinces:new Set([...cityNames,'湖北省','云南省']),
  cities:new Set([...cityNames.map(name=>cityKey(name,name)),cityKey('湖北省','神农架林区'),cityKey('云南省','西双版纳傣族自治州')]),
  cityPoints:new Map()
},palette,false);
assert.ok(nationalWithoutSouthChinaSea.pathCount<nationalMap.pathCount);
const seaVisits={provinces:new Set(),cities:new Set(),cityPoints:new Map([
  ['海南省|西沙',{lon:112.34,lat:16.83}],['广东省|东沙',{lon:116.72,lat:20.7}],
  ['海南省|海口',{lon:110.3,lat:20.01}]
])};
const seaOn=recordingCanvas(),seaOff=recordingCanvas();
drawAnnualMap(seaOn,provinces,boundaries,seaVisits,palette,true);
drawAnnualMap(seaOff,provinces,boundaries,seaVisits,palette,false);
assert.deepEqual(seaOn.texts.map(t=>t.text),['西沙','东沙','海口']);
assert.deepEqual(seaOff.texts.map(t=>t.text),['海口']);
const visits={provinces:new Set(['上海市']),cities:new Set([cityKey('上海市','上海市')]),cityPoints:new Map()};
const crop=recordingCanvas(),full=recordingCanvas();
drawAnnualMap(full,provinces,boundaries,visits,palette,true,false);
drawAnnualMap(crop,provinces,boundaries,visits,palette,true,true);
assert.deepEqual(crop.texts.map(t=>t.text),['上海']);
assert.equal(crop.pathCount,full.pathCount);
assert.ok(crop.fills.includes(palette.soft));
assert.notDeepEqual(crop.texts,full.texts);
const emptyCrop=recordingCanvas(),emptyFull=recordingCanvas();
const emptyVisits={provinces:new Set(),cities:new Set(),cityPoints:new Map()};
drawAnnualMap(emptyCrop,provinces,boundaries,emptyVisits,palette,true,true);
drawAnnualMap(emptyFull,provinces,boundaries,emptyVisits,palette,true,false);
assert.equal(emptyCrop.pathCount,emptyFull.pathCount);
const shanghaiMap = recordingCanvas();
const chongming=shanghaiDistricts(boundaries).find(f=>f.properties.adcode===310151);
const [lon,lat]=chongming.properties.center;
const [wgsLat,wgsLon]=gcjToWgs(lat,lon);
const places = [
  {name:'中心点位',lon:121.475,lat:31.229},
  {name:'外围点位',lon:121.210,lat:31.389},
  {name:'崇明点位',lon:wgsLon,lat:wgsLat},
  {name:'环外点位',lon:121.375,lat:31.229},
];
const dots = drawShanghaiMap(shanghaiMap,boundaries,landmarks,places);
assert.equal(dots.filter(p=>p.name==='中心点位').length,2);
assert.equal(dots.filter(p=>p.name==='外围点位').length,1);
assert.ok(dots.every(({x,y})=>x>0&&x<shanghaiMap.width&&y>0&&y<shanghaiMap.height));
const stackedShanghai=recordingCanvas();
const stackedDots=drawShanghaiMap(stackedShanghai,boundaries,landmarks,places,{stacked:true});
assert.ok(stackedShanghai.height>stackedShanghai.width);
const stackedCenter=stackedDots.filter(p=>p.name==='中心点位');
assert.equal(stackedCenter.length,2);
assert.ok(stackedCenter[0].y<stackedShanghai.height/2&&stackedCenter[1].y>stackedShanghai.height/2);
assert.ok(stackedShanghai.texts.some(({font})=>font.includes('23px')));
assert.ok(shanghaiMap.rects.some(r=>r.color===palette.canvas));
assert.ok(shanghaiMap.fills.includes(palette.soft));
assert.ok(shanghaiMap.fills.includes('#a7bdcc'));
const shanghaiNames=shanghaiMap.texts.map(({text})=>text);
for(const name of ['崇明','静安','浦东'])assert.ok(shanghaiNames.includes(name),name);
for(const hidden of ['全市','中心城区','黄浦江','苏州河','南北高架','延安高架','世纪大道'])assert.ok(!shanghaiNames.includes(hidden),hidden);
assert.ok(!shanghaiNames.some(name=>name.endsWith('区')&&name!=='中心城区'));
assert.ok(shanghaiMap.strokes.includes('#a1a1a1'));
assert.equal(landmarks.metro.length,22);
for(const {color,lines,sharedLines} of landmarks.metro){
  assert.match(color,/^#[0-9a-f]{6}$/i);
  assert.ok(lines.length||sharedLines.length);
  assert.ok(shanghaiMap.strokes.includes(color),color);
}
assert.ok(shanghaiMap.fills.includes(palette.accent));
assert.ok(shanghaiMap.strokes.some((color,i)=>color===landmarks.metro[0].color&&shanghaiMap.widths[i]===2));
const mainlandPlaces=shanghaiMapPlaces(boundaries,places,false);
assert.ok(!mainlandPlaces.some(p=>p.name==='崇明点位'));
const shanghaiWithoutChongming=recordingCanvas();
drawShanghaiMap(shanghaiWithoutChongming,boundaries,landmarks,mainlandPlaces,{includeChongming:false});
assert.ok(!shanghaiWithoutChongming.texts.some(t=>t.text==='崇明'));
const shanghaiInnerRing=recordingCanvas();
const innerDots=drawShanghaiMap(shanghaiInnerRing,boundaries,landmarks,places,{
  innerRing:true,topPlaces:new Set(['中心点位']),palette:palettes.purple,
});
assert.equal(dots.filter(p=>p.name==='环外点位').length,2);
assert.equal(innerDots.filter(p=>p.name==='环外点位').length,1);
assert.equal(innerDots.filter(p=>p.name==='中心点位').length,2);
assert.ok(shanghaiInnerRing.fills.includes(palettes.purple.highlight));
assert.ok(shanghaiInnerRing.fills.includes(palettes.purple.accent));
assert.ok(!shanghaiInnerRing.texts.some(t=>t.text==='中心点位'));

const poster = recordingCanvas();
const report = {
  heading:'跨年统计', dates:'2025年12月1日 – 2026年2月1日',
  coverage:'1 个省份 · 1 个城市', shanghaiCoverage:'已标注2个地点',monthTitle:'月度分布（按月份汇总）',
  months:[2,...Array(11).fill(0)],
  stats:[['事件',2],['记录天数',2],['到访地点',2],['同伴',1]],
  top:[['中心点位',1],['外围点位',1]],
  highlight:true,
};
drawAnnualImage(poster,report,nationalMap,shanghaiMap,palette);
assert.deepEqual(poster.images.map(entry=>entry.image),[nationalMap,shanghaiMap]);
const stats = poster.rects.filter(r=>r.color===palette.soft&&r.height===80);
assert.equal(stats.length,4);
assert.equal(new Set(stats.map(r=>r.y)).size,1);
const nationalHeading=poster.texts.find(t=>t.text==='全国足迹：');
const coverage=poster.texts.find(t=>t.y===nationalHeading.y&&t.text==='1');
const legend=poster.texts.find(t=>t.text==='到访城市');
assert.ok(nationalHeading.x<coverage.x&&coverage.x<legend.x);
assert.ok(nationalHeading.y===coverage.y&&Math.abs(coverage.y-legend.y)<=1);
assert.match(coverage.font,/^700 /);
assert.ok(poster.texts.some(t=>t.text===report.dates));
const shanghaiHeading=poster.texts.find(t=>t.text==='上海足迹：');
const shanghaiCount=poster.texts.find(t=>t.y===shanghaiHeading.y&&t.text==='2');
const credit=poster.texts.find(t=>t.text===mapAttribution);
assert.ok(shanghaiHeading.x<shanghaiCount.x&&shanghaiCount.x<credit.x);
assert.equal(shanghaiHeading.y,credit.y);
assert.equal(shanghaiCount.y,credit.y);
assert.match(shanghaiCount.font,/^700 /);
assert.ok(poster.fills.includes(palette.highlight));
const chart=poster.texts.find(t=>t.text===report.monthTitle), top=poster.texts.find(t=>t.text==='常去地点 Top 5');
assert.equal(chart.y,top.y);
assert.ok(chart.x<top.x);
assert.match(poster.texts.find(t=>t.text==='中心点位').font,/^600 /);
for (const removed of ['常同行同伴','地点类型','国家/地区','最长连续天数','周末事件','指定事件范围总结','到访地点/新地点','地铁费用（元）','(-1)','(1)']) {
  assert.ok(!poster.texts.some(t=>t.text===removed));
}
assert.ok(poster.texts.every(t=>t.y<poster.height-20),'The final ranking rows must fit in the exported image');
