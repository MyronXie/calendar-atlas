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

export function parseAtlasConfig(text){
 const {blacklist:rows,emojis}=JSON.parse(text.replace(/^\uFEFF/,''));
 if(!emojis||typeof emojis!=='object'||Array.isArray(emojis))throw Error('缺少有效的 emoji 映射');
 const blacklist=normalizeBlacklist(rows);
 return {blacklist,emojis,eventRules:blacklist.filter(r=>r.type==='event'),placeRules:blacklist.filter(r=>r.type==='place')};
}

export function parseMobilePlaces(name,text){
 if(name==='place.csv')return {...parseCSV(text),file:name,version:'mobile'};
 const data=JSON.parse(text.replace(/^\uFEFF/,''));
 if(!Array.isArray(data.places)||!data.places.every(p=>p&&typeof p.location==='string'))throw Error('旧版地点 JSON 格式无效');
 return {...data,file:name,version:'mobile'};
}
