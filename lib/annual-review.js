import {gcjToWgs,shortRegionName,geometryPolygons,containsPoint} from './geo.js';
import {palettes} from './appearance.js';

export const cityKey = (province, city) => province + '|' + city;
export const mapAttribution = '© OpenStreetMap contributors · ODbL';

const projectionY = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 180 / Math.PI;
const polygons = feature => geometryPolygons(feature.geometry);

const project = ([lon,lat]) => [lon,projectionY(lat)];
const wgsPoint = ([lon,lat]) => gcjToWgs(lat,lon).reverse();
const projectPolygons = (shapes,convert=project) => shapes.map(poly=>poly.map(ring=>ring.map(convert)));
const projectedPaths = (feature,convert=project) => projectPolygons(polygons(feature),convert);
const southChinaSeaOutline = feature => feature.properties.adcode==='100000_JD';
const southChinaSeaPoint = (lon,lat) => lat<17.65 || (lon>116.5&&lon<117&&lat>20.5&&lat<21);
const withoutSouthChinaSea = feature => southChinaSeaOutline(feature)?[]:
  polygons(feature).filter(poly=>poly[0].some(([lon,lat])=>!southChinaSeaPoint(lon,lat)));

function mapBounds(shapes) {
  let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity;
  for (const paths of shapes) for (const poly of paths) for (const ring of poly) for (const [x,y] of ring) {
    west = Math.min(west,x);
    east = Math.max(east,x);
    south = Math.min(south,y);
    north = Math.max(north,y);
  }
  return [west,south,east,north];
}

function mapFrame(ctx,[west,south,east,north],{x=0,y=0,width,height,padding=0}) {
  const scale = Math.min((width - 2 * padding) / (east - west), (height - 2 * padding) / (north - south));
  const pixelX = lon => x + width / 2 + (lon - (west + east) / 2) * scale;
  const pixelY = lat => y + height / 2 - (lat - (north + south) / 2) * scale;
  function trace(paths) {
    ctx.beginPath();
    for (const poly of paths) for (const ring of poly) {
      for (let i = 0; i < ring.length; i++) {
        const [x,y] = ring[i];
        const px = pixelX(x), py = pixelY(y);
        if (i === 0) ctx.moveTo(px,py);
        else ctx.lineTo(px,py);
      }
      ctx.closePath();
    }
  }
  function traceLines(lines) {
    ctx.beginPath();
    for (const line of lines) {
      for (let i = 0; i < line.length; i++) {
        const [x,y] = line[i];
        if (i === 0) ctx.moveTo(pixelX(x),pixelY(y));
        else ctx.lineTo(pixelX(x),pixelY(y));
      }
    }
  }
  return {trace,traceLines,point:(lon,lat)=>[pixelX(lon),pixelY(projectionY(lat))]};
}

const mapFont = '"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
const directions = [[0,-1],[1,0],[-1,0],[0,1],[1,-1],[-1,-1],[1,1],[-1,1]];
export function layoutMapLabels(labels,view,{offset=0,maxShift=100}={}) {
  const drawn = [], inset = 6;
  for (const label of labels) {
    const {x,y,w,h}=label;
    const start=label.offset??offset;
    const radii = Array.from({length:Math.floor((maxShift-start)/10)+1},(_,i)=>start+i*10);
    const candidates = radii.flatMap(r=>r===0?[[x,y]]:(label.directions||directions).map(([dx,dy])=>[x+dx*r,y+dy*r]));
    const place = candidates.find(([cx,cy])=>{
      const left=cx-w/2, right=cx+w/2, top=cy-h/2, bottom=cy+h/2;
      return left>=view.x+inset&&right<=view.x+view.width-inset&&top>=view.y+inset&&bottom<=view.y+view.height-inset
        && !drawn.some(r=>left<r.right&&right>r.left&&top<r.bottom&&bottom>r.top);
    });
    if (!place) continue;
    const [cx,cy] = place;
    drawn.push({...label,x:cx,y:cy,left:cx-w/2,right:cx+w/2,top:cy-h/2,bottom:cy+h/2,anchor:[x,y]});
  }
  return drawn;
}
function drawMapLabels(ctx,labels,view,{fontSize,leaders=false,offset=0,maxShift=100,halo='#fff'}) {
  ctx.font = `600 ${fontSize}px ${mapFont}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const drawn=layoutMapLabels(labels.map(label=>({...label,w:ctx.measureText(label.name).width+9,h:fontSize+5})),view,{offset,maxShift});
  if(leaders)for(const {x,y,anchor:[ax,ay],color} of drawn){
    ctx.beginPath();
    ctx.moveTo(ax,ay);
    ctx.lineTo(x,y);
    ctx.strokeStyle=color;
    ctx.lineWidth=1;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ax,ay,2.7,0,2*Math.PI);
    ctx.fillStyle=color;
    ctx.fill();
  }
  for (const {name,x,y,color} of drawn) {
    ctx.lineWidth=3;
    ctx.strokeStyle=halo;
    ctx.strokeText(name,x,y);
    ctx.fillStyle=color;
    ctx.fillText(name,x,y);
  }
}

const nationalPaths=new WeakMap();
function annualPaths(feature,includeSouthChinaSea){
  let cached=nationalPaths.get(feature);
  if(!cached){
    cached={};
    nationalPaths.set(feature,cached);
  }
  return cached[includeSouthChinaSea]??=projectPolygons(includeSouthChinaSea?polygons(feature):withoutSouthChinaSea(feature));
}

export function drawAnnualMap(canvas, provinces, boundaries, visits, palette, includeSouthChinaSea=true, focusVisitedCities=false, {fontSize=20}={}) {
  const width = 1120, height = 810, padding = 24;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const prepared = provinces.features.map(feature => ({
    name: feature.properties.name, center:feature.properties.center||feature.properties.centroid,
    paths:annualPaths(feature,includeSouthChinaSea),
  }));
  const litCities=(boundaries?.features||[]).flatMap(feature=>{
    const {name,province,center,centroid}=feature.properties;
    const key=cityKey(province,name);
    return visits.cities.has(key)?[{
      key,name,center:center||centroid,
      paths:annualPaths(feature,includeSouthChinaSea),
    }]:[];
  });
  const cityPoints=[...visits.cityPoints].filter(([,p])=>includeSouthChinaSea||!southChinaSeaPoint(p.lon,p.lat));
  const municipalityPaths=prepared.filter(({name})=>visits.cities.has(cityKey(name,name))).map(({paths})=>paths);
  const focus=focusVisitedCities?mapBounds([...municipalityPaths,...litCities.map(({paths})=>paths),
    ...cityPoints.map(([,p])=>[[[project([p.lon,p.lat])]]])]):null;
  const hasFocus=Number.isFinite(focus?.[0]);
  const frameBounds=hasFocus?focus:mapBounds(prepared.map(({paths})=>paths));
  if(hasFocus){
    for(const i of [0,1]){
      const extra=Math.max(0,.25-(frameBounds[i+2]-frameBounds[i]))/2;
      frameBounds[i]-=extra;
      frameBounds[i+2]+=extra;
    }
  }
  const {trace,point} = mapFrame(ctx,frameBounds,{width,height,padding});
  const labels = new Map();
  function labelCity(key,name,center){
    if(!center||!includeSouthChinaSea&&southChinaSeaPoint(...center))return;
    const [x,y] = point(...center);
    labels.set(key,{name:shortRegionName(name),x,y,color:palette.dark});
  }
  ctx.fillStyle = palette.canvas;
  ctx.fillRect(0,0,width,height);
  ctx.lineJoin = 'round';
  for (const {name,center,paths} of prepared) {
    if (!name) continue;
    trace(paths);
    const key = cityKey(name,name), visited = visits.cities.has(key);
    ctx.fillStyle = visited ? palette.accent : visits.provinces.has(name) ? palette.mid : palette.soft;
    ctx.fill('evenodd');
    if(visited)labelCity(key,name,center);
  }
  for (const {key,name,center,paths} of litCities) {
    trace(paths);
    ctx.fillStyle = palette.accent;
    ctx.fill('evenodd');
    ctx.strokeStyle = palette.soft;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    labelCity(key,name,center);
  }
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 1.2;
  for (const {paths} of prepared) {
    trace(paths);
    ctx.stroke();
  }
  for (const [key,{lat,lon}] of cityPoints) {
    ctx.beginPath();
    ctx.arc(...point(lon,lat),4,0,2 * Math.PI);
    ctx.fillStyle = palette.accent;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    labelCity(key,key.split('|')[1],[lon,lat]);
  }
  drawMapLabels(ctx,[...labels.values()],{x:0,y:0,width,height},{fontSize,leaders:true,offset:16,maxShift:fontSize>20?306:266,halo:palette.surface});
}

export const shanghaiName = '上海市';
const isChongming = feature => feature.properties.adcode===310151;
export function shanghaiDistricts(boundaries,includeChongming=true){
  return boundaries.features.filter(feature=>feature.properties.province===shanghaiName&&(includeChongming||!isChongming(feature)));
}
const districtPolygons = new WeakMap();
export function shanghaiMapPlaces(boundaries,places,includeChongming=true){
  if(includeChongming)return places;
  const district=boundaries.features.find(isChongming);
  if(!district)return places;
  if(!districtPolygons.has(district)){
    districtPolygons.set(district,projectPolygons(polygons(district),wgsPoint));
  }
  const rings=districtPolygons.get(district);
  return places.filter(({lon,lat})=>!containsPoint(rings,lon,lat));
}
export function shanghaiMetroLayers(landmarks){
  const metro=landmarks.metro||[];
  const layers=metro.flatMap(({name,color,lines,railway})=>railway?[
    {name,color:'#fff',lines,railway},
    {name,color,lines,railway,dashArray:[6,6]},
  ]:[{name,color,lines}]);
  const sharedPaths=new Map();
  for(const line of metro){
    if(!line.sharedLines.length)continue;
    const key=JSON.stringify(line.sharedLines);
    if(!sharedPaths.has(key))sharedPaths.set(key,[]);
    sharedPaths.get(key).push(line);
  }
  for(const routes of sharedPaths.values()){
    const name=routes.map(route=>route.name).join('、')+(routes.length>1?'共线':'');
    // A solid underlay shows through the second color's dashes on Canvas and SVG.
    routes.forEach(({color,sharedLines},i)=>layers.push({
      name,color,lines:sharedLines,shared:true,dashArray:i===0?undefined:[6,6]
    }));
  }
  return layers;
}
export function drawShanghaiMap(canvas, boundaries, landmarks, places, {
  includeChongming=true,innerRing=false,topPlaces=new Set(),palette=palettes.green,stacked=false,
}={}) {
  const panelWidth=552,panelHeight=547,gap=16;
  const width=stacked?panelWidth:panelWidth*2+gap;
  const height=stacked?panelHeight*2+gap:panelHeight;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const districts = shanghaiDistricts(boundaries,includeChongming)
    .map(f=>({
      name:shortRegionName(f.properties.name),
      center:wgsPoint(f.properties.centroid||f.properties.center),
      paths:projectedPaths(f,coordinate=>project(wgsPoint(coordinate))),
    }));
  const water = landmarks.waterAreas.map(rings=>rings.map(ring=>ring.map(project)));
  const lines = landmarks.features.map(feature=>({...feature,lines:feature.lines.map(line=>line.map(project))}));
  const metro=shanghaiMetroLayers(landmarks).map(layer=>({...layer,paths:layer.lines.map(line=>line.map(project))}));
  const main = {x:0,y:0,width:panelWidth,height:panelHeight,padding:16};
  const zoom = {x:stacked?0:panelWidth+gap,y:stacked?panelHeight+gap:0,width:panelWidth,height:panelHeight,padding:0};
  const ring = innerRing ? landmarks.features.find(f=>f.name==='内环高架')?.lines : null;
  const [west,south,east,north] = ring?.length
    ? mapBounds([ring.map(line=>[line])]).map((edge,i)=>edge+(i<2?-.003:.003))
    : [121.325,31.105,121.63,31.347];
  const zoomBounds = [west,projectionY(south),east,projectionY(north)];
  const markers = [];
  const byPriority = list => [...list.filter(p=>!topPlaces.has(p.name)),...list.filter(p=>topPlaces.has(p.name))];
  ctx.fillStyle = palette.surface||'#fff';
  ctx.fillRect(0,0,width,height);
  function base(frame,viewport,detail) {
    ctx.fillStyle = palette.canvas;
    ctx.fillRect(viewport.x,viewport.y,viewport.width,viewport.height);
    ctx.fillStyle = palette.soft;
    ctx.strokeStyle = palette.mid;
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3,3]);
    for (const {paths} of districts) {
      frame.trace(paths);
      ctx.fill('evenodd');
      ctx.stroke();
    }
    ctx.setLineDash([]);
    ctx.fillStyle = '#a7bdcc';
    for(const rings of water){
      frame.trace([rings]);
      ctx.fill('evenodd');
    }
    for (const {name,crossing,lines:segments} of lines) {
      if(!detail&&!crossing&&!['延安高架','外环高速','中环路','内环高架','南北高架'].includes(name))continue;
      frame.traceLines(segments);
      if(crossing!=='tunnel'){
        ctx.strokeStyle='#f7f7f7';
        ctx.lineWidth=detail?4.5:2.9;
        ctx.stroke();
      }
      ctx.strokeStyle='#a1a1a1';
      ctx.lineWidth=detail?2:1.2;
      if(crossing==='tunnel')ctx.setLineDash([4,3]);
      ctx.stroke();
      if(crossing==='tunnel')ctx.setLineDash([]);
    }
    for(const {color,paths,shared,railway,dashArray} of metro){
      ctx.globalAlpha=shared||railway?1:.86;
      ctx.setLineDash(dashArray||[]);
      frame.traceLines(paths);
      ctx.strokeStyle=color;
      ctx.lineWidth=detail?2:2.55;
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.globalAlpha=1;
  }
  function dots(frame,viewport,points,radius) {
    for (const {name,lat,lon} of byPriority(points)) {
      const [x,y] = frame.point(lon,lat);
      if (x < viewport.x || x > viewport.x + viewport.width || y < viewport.y || y > viewport.y + viewport.height) continue;
      const highlighted = topPlaces.has(name);
      ctx.beginPath();
      ctx.arc(x,y,highlighted?radius+1.4:radius,0,2 * Math.PI);
      ctx.fillStyle = highlighted?palette.highlight:palette.accent;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      markers.push({name,x,y});
    }
  }
  const city = mapFrame(ctx,mapBounds(districts.map(({paths})=>paths)),main);
  const center = mapFrame(ctx,zoomBounds,zoom);
  function mapLabel(frame,name,coordinate,color=palette.surface?palette.dark:'#454545') {
    const [x,y]=frame.point(...coordinate);
    return {name,x,y,color};
  }
  ctx.save();
  ctx.beginPath();
  ctx.rect(main.x,main.y,main.width,main.height);
  ctx.clip();
  base(city,main,false);
  const [left,top] = city.point(west,north), [right,bottom] = city.point(east,south);
  ctx.strokeStyle = '#757575';
  ctx.lineWidth = 1.2;
  ctx.setLineDash([5,4]);
  ctx.strokeRect(left,top,right-left,bottom-top);
  ctx.setLineDash([]);
  dots(city,main,places,4.8);
  const outskirts = new Set(['崇明','宝山','嘉定','青浦','松江','金山','奉贤','浦东','闵行']);
  const leftLabels=districts.filter(d=>outskirts.has(d.name)).map(d=>mapLabel(city,d.name,d.center));
  drawMapLabels(ctx,leftLabels,main,{fontSize:stacked?23:21,maxShift:40,halo:palette.surface});
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(zoom.x,zoom.y,zoom.width,zoom.height);
  ctx.clip();
  let detailView=zoom;
  if(innerRing&&ring?.length){
    ctx.fillStyle=palette.surface||'#f1f1f1';
    ctx.fillRect(zoom.x,zoom.y,zoom.width,zoom.height);
    const [lx,ty]=center.point(west,north),[rx,by]=center.point(east,south);
    detailView={x:lx,y:ty,width:rx-lx,height:by-ty};
    ctx.beginPath();
    ctx.rect(detailView.x,detailView.y,detailView.width,detailView.height);
    ctx.clip();
  }
  base(center,zoom,true);
  dots(center,zoom,places.filter(p=>p.lon>=west&&p.lon<=east&&p.lat>=south&&p.lat<=north),5.2);
  const core = new Set(['黄浦','静安','徐汇','长宁','普陀','虹口','杨浦','浦东','闵行']);
  const coreAnchors={'浦东':[121.567,31.223],'闵行':[121.351,31.135],'黄浦':[121.476,31.209]};
  const rightLabels=[];
  for(const d of districts){
    const [lon,lat]=coreAnchors[d.name]||d.center;
    if(core.has(d.name)&&(!innerRing||(lon>=west&&lon<=east&&lat>=south&&lat<=north))){
      rightLabels.push(mapLabel(center,d.name,[lon,lat]));
    }
  }
  drawMapLabels(ctx,rightLabels,detailView,{fontSize:stacked?23:20,maxShift:50,halo:palette.surface});
  ctx.restore();
  return markers;
}

export const annualLegend = ['未记录到访', '到访省份', '到访城市'];

export function drawAnnualImage(canvas, report, nationalMap, shanghaiMap, palette) {
  const width = 1200, margin = 56, inner = width - 2 * margin;
  const nationalHeight = inner * nationalMap.height / nationalMap.width;
  const shanghaiHeight = inner * shanghaiMap.height / shanghaiMap.width;
  const dateOffset=report.dates?34:0, noteOffset=report.shanghaiNote?28:0;
  const font = '"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
  canvas.width = width;
  const ctx = canvas.getContext('2d');
  ctx.font = '700 31px ' + font;
  const headingWidth=ctx.measureText('全国足迹：').width;
  ctx.font = '700 23px ' + font;
  const legendOffset=headingWidth+ctx.measureText(report.coverage).width+12>inner-435?35:0;
  canvas.height = Math.ceil(710 + nationalHeight + shanghaiHeight + dateOffset + noteOffset + legendOffset);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0,0,width,canvas.height);
  function text(value,x,y,size,color = palette.dark,weight = 400) {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillText(value,x,y);
  }
  function textWithBoldNumbers(value,x,y,size) {
    for (const [index,part] of value.split(/(\d+)/).entries()) {
      if(!part)continue;
      text(part,x,y,size,palette.dark,index%2?700:400);
      x+=ctx.measureText(part).width;
    }
  }
  function fit(value,maxWidth) {
    if (ctx.measureText(value).width <= maxWidth) return value;
    const chars = Array.from(value);
    while (chars.length && ctx.measureText(chars.join('') + '…').width > maxWidth) chars.pop();
    return chars.join('') + '…';
  }
  function statsRow(stats,y) {
    const cell = inner / stats.length;
    stats.forEach(([label,value,detail],i) => {
      const x = margin + i * cell;
      ctx.fillStyle = palette.soft;
      ctx.fillRect(x,y,cell - 10,80);
      ctx.font='700 31px '+font;
      text(fit(String(value),cell-30),x + 16,y + 36,31,palette.dark,700);
      if (detail) text(detail,x + 22 + ctx.measureText(value).width,y + 36,20);
      text(label,x + 16,y + 64,20);
    });
  }
  text(report.heading,margin,88,54,palette.dark,700);
  if(report.dates)text(report.dates,margin,130,25);
  const nationalY=153+dateOffset;
  text('全国足迹：',margin,nationalY,31,palette.dark,700);
  textWithBoldNumbers(report.coverage,margin+ctx.measureText('全国足迹：').width,nationalY,23);
  const legendY=nationalY+legendOffset;
  [palette.soft,palette.mid,palette.accent].forEach((color,i) => {
    const x = width - margin - 435 + i * 145;
    ctx.fillStyle = color;
    ctx.fillRect(x,legendY-18,20,20);
    text(annualLegend[i],x + 27,legendY-1,19);
  });
  ctx.drawImage(nationalMap,margin,legendY+24,inner,nationalHeight);
  let y = legendY + 24 + nationalHeight + 54;
  text('上海足迹：',margin,y,31,palette.dark,700);
  textWithBoldNumbers(report.shanghaiCoverage,margin+ctx.measureText('上海足迹：').width,y,23);
  ctx.textAlign = 'right';
  text(mapAttribution,width-margin,y,14,palette.muted);
  ctx.textAlign = 'left';
  ctx.drawImage(shanghaiMap,margin,y+23,inner,shanghaiHeight);
  y += shanghaiHeight + 56;
  if(report.shanghaiNote){text(report.shanghaiNote,margin,y-7,21,palette.muted);y+=noteOffset;}
  statsRow(report.stats,y);
  y += 126;
  text(report.monthTitle,margin,y,30,palette.dark,700);
  const chartWidth = Math.round(inner * .54);
  const rankingX = margin + chartWidth + 32;
  if(report.highlight){
    ctx.beginPath();
    ctx.arc(rankingX+7,y-10,7,0,2*Math.PI);
    ctx.fillStyle=palette.highlight;
    ctx.fill();
  }
  text('常去地点 Top 5',rankingX+(report.highlight?24:0),y,30,palette.dark,700);
  const peak = Math.max(1,...report.months);
  const step = chartWidth / 12;
  const baseline = y + 190;
  report.months.forEach((total,i) => {
    const x = margin + i * step, bar = total / peak * 140;
    ctx.fillStyle = palette.accent;
    ctx.fillRect(x + 6,baseline - bar,step - 12,bar);
    ctx.textAlign = 'center';
    text(total,x + step / 2,baseline - bar - 6,18);
    text((i + 1) + '月',x + step / 2,baseline + 25,18);
    ctx.textAlign = 'left';
  });
  (report.top.length ? report.top : [['—','']]).forEach(([name,total],i) => {
    const lineY = y + 45 + i * 42;
    const weight=i===0&&report.top.length?600:400;
    ctx.font = `${weight} 23px ${font}`;
    const nameWidth=width-margin-rankingX-62;
    text(fit(name,nameWidth),rankingX,lineY,23,palette.dark,weight);
    ctx.textAlign = 'right';
    text(total,width - margin,lineY,23,palette.dark,700);
    ctx.textAlign = 'left';
  });
}
