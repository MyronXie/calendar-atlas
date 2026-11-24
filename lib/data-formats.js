export function parseCSV(s,required=['location','lat','lon']){s=s.replace(/^\uFEFF/,'');let rows=[],row=[],v='',q=false;for(let i=0;i<s.length;i++){const c=s[i];if(c==='"'){if(q&&s[i+1]==='"'){v+='"';i++;}else q=!q;}else if(c===','&&!q){row.push(v);v='';}else if(c==='\n'&&!q){row.push(v.replace(/\r$/,''));rows.push(row);row=[];v='';}else v+=c;}if(q)throw Error('CSV 引号不完整');if(v||row.length){row.push(v.replace(/\r$/,''));rows.push(row);}const headers=rows.shift()?.map(x=>x.trim())||[];if(!required.every(k=>headers.includes(k)))throw Error('CSV 缺少必要列');return {headers,places:rows.filter(r=>r.some(Boolean)).map(r=>Object.fromEntries(headers.map((k,i)=>[k,r[i]||''])))};}
export function stringifyCSV({headers,places}){const esc=v=>{const s=String(v??'');return /[",\r\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s;};return '\uFEFF'+[headers,...places.map(p=>headers.map(h=>p[h]??''))].map(r=>r.map(esc).join(',')).join('\r\n')+'\r\n';}

export function normalizeBlacklist(rows){
 if(!Array.isArray(rows)||rows.length>5000)throw Error('黑名单格式无效');
 return rows.map(row=>{
  if(!row||!['event','place'].includes(row.type)||!['contains','exact','uid'].includes(row.match_type)||
     row.type==='place'&&row.match_type==='uid')throw Error('黑名单规则类型无效');
  if(typeof row.value!=='string'||!row.value.trim()||row.value.length>2000||
     row.reason!==undefined&&(typeof row.reason!=='string'||row.reason.length>4000))throw Error('黑名单规则内容无效');
  return {
   type:row.type,enabled:['0','false','no'].includes(String(row.enabled).toLowerCase())?'0':'1',
   match_type:row.match_type,value:row.value.trim(),reason:row.reason||''
  };
 });
}

function normalizePhotoExclusions(rows){
 if(rows===undefined||rows===null)return [];
 if(!Array.isArray(rows)||rows.length>2000)throw Error('照片排除区域格式无效');
 return rows.map(row=>{
  const {name,latMin,latMax,lonMin,lonMax}=row??{};
  if(![latMin,latMax,lonMin,lonMax].every(Number.isFinite)||
     latMin<-90||latMin>=latMax||latMax>90||
     lonMin<-180||lonMin>=lonMax||lonMax>180)throw Error('照片排除区域经纬度无效');
  const out={latMin,latMax,lonMin,lonMax};
  if(name!==undefined)out.name=String(name);
  return out;
 });
}

// 支持两种结构：
//  v2（分组）：{ version:2, filters:{blacklist}, photos:{exclusions} }
//  v1（扁平）：{ blacklist, photoExclusions }。旧文件的图标映射会被忽略。
export function parseAtlasConfig(text){
 const raw=JSON.parse(text.replace(/^\uFEFF/,''));
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('配置格式无效');
 const grouped=raw.version!==undefined||raw.filters!==undefined||raw.photos!==undefined;
 const rows=grouped?raw.filters?.blacklist:raw.blacklist;
 const photoExclusions=grouped?raw.photos?.exclusions:raw.photoExclusions;
 if(rows===undefined&&photoExclusions===undefined&&!Object.hasOwn(raw,'emojis'))throw Error('配置缺少黑名单或照片排除区域');
 const blacklist=normalizeBlacklist(rows??[]);
 return {blacklist,photoExclusions:normalizePhotoExclusions(photoExclusions),eventRules:blacklist.filter(r=>r.type==='event'),placeRules:blacklist.filter(r=>r.type==='place')};
}
