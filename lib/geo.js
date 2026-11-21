// 地理与坐标工具：GCJ02/Baidu 坐标换算、行政区名称缩写、点在多边形内判断。
// 由 organize.js 抽出，供应用、年度回顾与 tools 共用。

export function gcjToWgs(lat,lon){if(lon<72.004||lon>137.8347||lat<.8293||lat>55.8271)return [lat,lon];const pi=Math.PI,x=lon-105,y=lat-35;let dlat=-100+2*x+3*y+.2*y*y+.1*x*y+.2*Math.sqrt(Math.abs(x)),dlon=300+x+2*y+.1*x*x+.1*x*y+.1*Math.sqrt(Math.abs(x));dlat+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;dlat+=(20*Math.sin(y*pi)+40*Math.sin(y/3*pi))*2/3;dlat+=(160*Math.sin(y/12*pi)+320*Math.sin(y*pi/30))*2/3;dlon+=(20*Math.sin(6*x*pi)+20*Math.sin(2*x*pi))*2/3;dlon+=(20*Math.sin(x*pi)+40*Math.sin(x/3*pi))*2/3;dlon+=(150*Math.sin(x/12*pi)+300*Math.sin(x/30*pi))*2/3;const rad=lat/180*pi,s=Math.sin(rad),m=1-.00669342162296594323*s*s,sqrt=Math.sqrt(m);dlat=dlat*180/((6378245*(1-.00669342162296594323))/(m*sqrt)*pi);dlon=dlon*180/(6378245/sqrt*Math.cos(rad)*pi);return [lat-dlat,lon-dlon];}

export function shortRegionName(name){let s=String(name||'').trim();s=s.replace(/(特别行政区|自治区|自治州|自治县|新区|林区|矿区|地区|省|市|区|县|州|盟)$/,'');const ETH=['维吾尔','柯尔克孜族','乌孜别克族','俄罗斯族','鄂温克族','鄂伦春族','达斡尔族','土家族','蒙古族','朝鲜族','哈尼族','傈僳族','拉祜族','景颇族','仡佬族','布朗族','撒拉族','毛南族','塔吉克族','阿昌族','普米族','独龙族','基诺族','门巴族','珞巴族','赫哲族','保安族','裕固族','塔塔尔族','锡伯族','纳西族','布依族','傣族','侗族','瑶族','白族','苗族','彝族','藏族','壮族','回族','满族','黎族','畲族','佤族','水族','东乡族','土族','羌族','怒族','京族'];let changed=true;while(changed){changed=false;for(const e of ETH){if(s.endsWith(e)&&s.length>e.length){s=s.slice(0,-e.length);changed=true;break;}}}return s||String(name||'').trim();}
export function geometryPolygons(geometry){
 if(geometry?.type==='Polygon')return [geometry.coordinates];
 return geometry?.type==='MultiPolygon'?geometry.coordinates:[];
}

const ringBounds=new WeakMap();
function pointInRing(lon,lat,ring){
 let bounds=ringBounds.get(ring);
 if(!bounds){
  let west=Infinity,south=Infinity,east=-Infinity,north=-Infinity;
  for(const [x,y] of ring){
   west=Math.min(west,x);south=Math.min(south,y);
   east=Math.max(east,x);north=Math.max(north,y);
  }
  bounds=[west,south,east,north];
  ringBounds.set(ring,bounds);
 }
 const [west,south,east,north]=bounds;
 if(lon<west||lon>east||lat<south||lat>north)return false;
 let inside=false;
 for(let i=0,j=ring.length-1;i<ring.length;j=i++){
  const [x,y]=ring[i],[previousX,previousY]=ring[j];
  if((y>lat)!==(previousY>lat)&&lon<(previousX-x)*(lat-y)/(previousY-y)+x)inside=!inside;
 }
 return inside;
}

export function containsPoint(polygons,lon,lat){
 return polygons.some(([outer,...holes])=>outer&&pointInRing(lon,lat,outer)&&!holes.some(ring=>pointInRing(lon,lat,ring)));
}
