const osmCredit='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
export const basemaps={
 qh360:{
  label:'360',url:'https://map4.qhimg.com/sotile/ver12/2/{z}/?x={x}&y={-y}',gcj02:true,
  options:{minNativeZoom:3,attribution:'© 360 地图'}
 },
 amap:{
  label:'高德',url:'https://webrd0{s}.is.autonavi.com/appmaptile?x={x}&y={y}&z={z}&size=1&scale=1&style=8',gcj02:true,
  options:{subdomains:'1234',minNativeZoom:3,attribution:'© 高德地图'}
 },
 osm:{
  label:'OpenStreetMap',url:'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  options:{attribution:osmCredit}
 },
 opentopo:{
  label:'OpenTopoMap 地形',url:'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
  options:{subdomains:'abc',maxNativeZoom:16,attribution:osmCredit+' · SRTM · <a href="https://opentopomap.org/">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC BY-SA</a>)'}
 }
};

export const tileOrigins=[...new Set(Object.values(basemaps).flatMap(({url,options})=>
 url.includes('{s}')?[...options.subdomains].map(subdomain=>new URL(url.replace('{s}',subdomain)).origin):[new URL(url).origin]))];
