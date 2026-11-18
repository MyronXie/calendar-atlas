import {gcjToWgs,shortRegionName} from './organize.js';

export const cityKey = (province, city) => province + '|' + city;
export const mapAttribution = '© OpenStreetMap contributors · ODbL';

const projectionY = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 180 / Math.PI;
function polygons(feature) {
  const {type,coordinates} = feature.geometry || {};
  if (type === 'Polygon') return [coordinates];
  return type === 'MultiPolygon' ? coordinates : [];
}

const project = ([lon,lat]) => [lon,projectionY(lat)];
const wgsPoint = ([lon,lat]) => gcjToWgs(lat,lon).reverse();
const projectPolygons = (shapes,convert=project) => shapes.map(poly=>poly.map(ring=>ring.map(convert)));
const projectedPaths = (feature,convert=project) => projectPolygons(polygons(feature),convert);
// The bundled map also encodes the southern dotted outlines as polygons.
const nanshaLatitudeLimit = 12.5;
const withoutNansha = feature => polygons(feature).filter(poly=>poly[0].some(([,lat])=>lat>nanshaLatitudeLimit));

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
function drawMapLabels(ctx,labels,view,{fontSize,leaders=false,offset=0,maxShift=100}) {
  const drawn = [], inset = 6;
  ctx.font = `600 ${fontSize}px ${mapFont}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const {name,x,y,color} of labels) {
    const w = ctx.measureText(name).width+9, h = fontSize+5;
    const radii = Array.from({length:Math.floor((maxShift-offset)/10)+1},(_,i)=>offset+i*10);
    const candidates = radii.flatMap(r=>r===0?[[x,y]]:directions.map(([dx,dy])=>[x+dx*r,y+dy*r]));
    const place = candidates.find(([cx,cy])=>{
      const left=cx-w/2, right=cx+w/2, top=cy-h/2, bottom=cy+h/2;
      return left>=view.x+inset&&right<=view.x+view.width-inset&&top>=view.y+inset&&bottom<=view.y+view.height-inset
        && !drawn.some(r=>left<r.right&&right>r.left&&top<r.bottom&&bottom>r.top);
    });
    if (!place) continue;
    const [cx,cy] = place;
    drawn.push({name,x:cx,y:cy,color,left:cx-w/2,right:cx+w/2,top:cy-h/2,bottom:cy+h/2,anchor:[x,y]});
  }
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
    ctx.strokeStyle='#fff';
    ctx.strokeText(name,x,y);
    ctx.fillStyle=color;
    ctx.fillText(name,x,y);
  }
}

export function drawAnnualMap(canvas, provinces, boundaries, visits, palette, includeNansha=true) {
  const width = 1120, height = 810, padding = 24;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const prepared = provinces.features.map(feature => ({
    name: feature.properties.name, center:feature.properties.center||feature.properties.centroid,
    paths:projectPolygons(includeNansha?polygons(feature):withoutNansha(feature)),
  }));
  const {trace,point} = mapFrame(ctx,mapBounds(prepared.map(({paths})=>paths)),{width,height,padding});
  const labels = new Map();
  function labelCity(key,name,center){
    if(!center||!includeNansha&&center[1]<=nanshaLatitudeLimit)return;
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
  for (const feature of boundaries?.features || []) {
    const {name, province, center, centroid} = feature.properties;
    const key = cityKey(province,name);
    if (!visits.cities.has(key)) continue;
    trace(projectPolygons(includeNansha?polygons(feature):withoutNansha(feature)));
    ctx.fillStyle = palette.accent;
    ctx.fill('evenodd');
    ctx.strokeStyle = palette.soft;
    ctx.lineWidth = 1.1;
    ctx.stroke();
    labelCity(key,name,center||centroid);
  }
  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 1.2;
  for (const {paths} of prepared) {
    trace(paths);
    ctx.stroke();
  }
  for (const [key,{lat,lon}] of visits.cityPoints) {
    if(!includeNansha&&lat<=nanshaLatitudeLimit)continue;
    ctx.beginPath();
    ctx.arc(...point(lon,lat),4,0,2 * Math.PI);
    ctx.fillStyle = palette.accent;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    labelCity(key,key.split('|')[1],[lon,lat]);
  }
  drawMapLabels(ctx,[...labels.values()],{x:0,y:0,width,height},{fontSize:20,leaders:true,offset:16,maxShift:266});
}

export const shanghaiName = '上海市';
export const shanghaiPointColor = '#172033';
export const shanghaiTopPlaceColor = '#b74200';
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
  function inside(lon,lat,ring){
    let hit=false;
    for(let i=0,j=ring.length-1;i<ring.length;j=i++){
      const [x,y]=ring[i],[xx,yy]=ring[j];
      if((y>lat)!==(yy>lat)&&lon<(xx-x)*(lat-y)/(yy-y)+x)hit=!hit;
    }
    return hit;
  }
  return places.filter(({lon,lat})=>!districtPolygons.get(district).some(([outer,...holes])=>
    inside(lon,lat,outer)&&!holes.some(ring=>inside(lon,lat,ring))));
}
export function shanghaiMetroLayers(landmarks){
  const metro=landmarks.metro||[];
  return [
    ...metro.map(({name,color,lines})=>({name,color,lines})),
    ...metro.flatMap(({name,color,sharedLines},index)=>sharedLines.length?
      [{name,color,lines:sharedLines,dashOffset:index%2?6:0}]:[]),
  ];
}
export function drawShanghaiMap(canvas, boundaries, landmarks, places, {
  includeChongming=true,innerRing=false,topPlaces=new Set(),
}={}) {
  const width = 1120, height = 547, panelWidth=552;
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const districts = shanghaiDistricts(boundaries,includeChongming)
    .map(f=>({
      name:shortRegionName(f.properties.name),
      center:wgsPoint(f.properties.centroid||f.properties.center),
      paths:projectedPaths(f,coordinate=>project(wgsPoint(coordinate))),
    }));
  const lines = landmarks.features.map(({kind,name,lines})=>({kind,name,lines:lines.map(line=>line.map(project))}));
  const metro=shanghaiMetroLayers(landmarks).map(layer=>({...layer,paths:layer.lines.map(line=>line.map(project))}));
  const main = {x:0,y:0,width:panelWidth,height,padding:16};
  const zoom = {x:width-panelWidth,y:0,width:panelWidth,height,padding:0};
  const ring = innerRing ? landmarks.features.find(f=>f.name==='内环高架')?.lines : null;
  const [west,south,east,north] = ring?.length
    ? mapBounds([ring.map(line=>[line])]).map((edge,i)=>edge+(i<2?-.003:.003))
    : [121.325,31.105,121.63,31.347];
  const zoomBounds = [west,projectionY(south),east,projectionY(north)];
  const markers = [];
  const byPriority = list => [...list.filter(p=>!topPlaces.has(p.name)),...list.filter(p=>topPlaces.has(p.name))];
  ctx.fillStyle = '#fff';
  ctx.fillRect(0,0,width,height);
  function base(frame,viewport,detail) {
    ctx.fillStyle = '#f1f1f1';
    ctx.fillRect(viewport.x,viewport.y,viewport.width,viewport.height);
    ctx.fillStyle = '#dedede';
    ctx.strokeStyle = '#bababa';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 1.4;
    for (const {paths} of districts) {
      frame.trace(paths);
      ctx.fill('evenodd');
      ctx.stroke();
    }
    for (const {kind,name,lines:segments} of lines) {
      if(!detail&&kind==='road'&&!['延安高架','外环高速','中环路','内环高架','南北高架'].includes(name))continue;
      frame.traceLines(segments);
      if(kind==='road'){
        ctx.strokeStyle='#f7f7f7';
        ctx.lineWidth=detail?4.5:2.9;
        ctx.stroke();
      }
      ctx.strokeStyle=kind==='river'?'#8099a7':'#a1a1a1';
      ctx.lineWidth=kind==='river'?(name==='黄浦江'?(detail?7:4.2):2.7):(detail?2:1.2);
      ctx.stroke();
    }
    ctx.globalAlpha=.86;
    for(const {color,paths,dashOffset} of metro){
      if(dashOffset!==undefined){ctx.setLineDash([6,6]);ctx.lineDashOffset=dashOffset;}
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
      ctx.fillStyle = highlighted?shanghaiTopPlaceColor:shanghaiPointColor;
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2.2;
      ctx.stroke();
      markers.push({name,x,y});
    }
  }
  const city = mapFrame(ctx,mapBounds(districts.map(({paths})=>paths)),main);
  const center = mapFrame(ctx,zoomBounds,zoom);
  function mapLabel(frame,name,coordinate,color='#454545') {
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
  drawMapLabels(ctx,leftLabels,main,{fontSize:21,maxShift:40});
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.rect(zoom.x,zoom.y,zoom.width,zoom.height);
  ctx.clip();
  let detailView=zoom;
  if(innerRing&&ring?.length){
    ctx.fillStyle='#f1f1f1';
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
  drawMapLabels(ctx,rightLabels,detailView,{fontSize:20,maxShift:50});
  ctx.restore();
  return markers;
}

export const annualLegend = ['未记录到访', '到访省份', '到访城市'];

export function drawAnnualImage(canvas, report, nationalMap, shanghaiMap, palette) {
  const width = 1200, margin = 56, inner = width - 2 * margin;
  const nationalHeight = inner * nationalMap.height / nationalMap.width;
  const shanghaiHeight = inner * shanghaiMap.height / shanghaiMap.width;
  const dateOffset=report.dates?34:0, noteOffset=report.shanghaiNote?28:0;
  canvas.width = width;
  canvas.height = Math.ceil(710 + nationalHeight + shanghaiHeight + dateOffset + noteOffset);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0,0,width,canvas.height);
  const font = '"Microsoft YaHei","PingFang SC","Noto Sans CJK SC",sans-serif';
  function text(value,x,y,size,color = palette.dark,weight = 400) {
    ctx.fillStyle = color;
    ctx.font = `${weight} ${size}px ${font}`;
    ctx.fillText(value,x,y);
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
  text(report.coverage,margin+ctx.measureText('全国足迹：').width,nationalY,23);
  [palette.soft,palette.mid,palette.accent].forEach((color,i) => {
    const x = width - margin - 435 + i * 145;
    ctx.fillStyle = color;
    ctx.fillRect(x,nationalY-18,20,20);
    text(annualLegend[i],x + 27,nationalY-1,19);
  });
  ctx.drawImage(nationalMap,margin,nationalY+24,inner,nationalHeight);
  let y = nationalY + 24 + nationalHeight + 54;
  text('上海足迹：',margin,y,31,palette.dark,700);
  text(report.shanghaiCoverage,margin+ctx.measureText('上海足迹：').width,y,23);
  ctx.textAlign = 'right';
  text(mapAttribution,width-margin,y,17,'#555');
  ctx.textAlign = 'left';
  ctx.drawImage(shanghaiMap,margin,y+23,inner,shanghaiHeight);
  y += shanghaiHeight + 56;
  if(report.shanghaiNote){text(report.shanghaiNote,margin,y-7,21,'#555');y+=noteOffset;}
  statsRow(report.stats,y);
  y += 126;
  text(report.monthTitle,margin,y,30,palette.dark,700);
  const chartWidth = Math.round(inner * .54);
  const rankingX = margin + chartWidth + 32;
  if(report.highlight){
    ctx.beginPath();
    ctx.arc(rankingX+7,y-10,7,0,2*Math.PI);
    ctx.fillStyle=shanghaiTopPlaceColor;
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
    ctx.font = '23px ' + font;
    const nameWidth=width-margin-rankingX-62;
    text(fit(name,nameWidth),rankingX,lineY,23);
    ctx.textAlign = 'right';
    text(total,width - margin,lineY,23,palette.dark,700);
    ctx.textAlign = 'left';
  });
}
