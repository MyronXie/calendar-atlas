export const placeTypes={food:'餐饮',fun:'娱乐',art:'文化',shop:'购物',out:'户外',sport:'运动',trans:'交通',stay:'住宿',edu:'学习与工作',home:'个人地点',other:'其他'};
export const splitLabels=s=>String(s||'').split(/[;；]/).map(s=>s.trim()).filter(Boolean);
export const placeKeys=p=>[p.location,...splitLabels(p.aliases)];
export function regionFromAddress(address,cityData=[],provinceData=[],fallback={}){
 const text=String(address||'').normalize('NFKC').trim();if(!text)return {};
 const foreign=[['日本',/日本|\bJapan\b/i],['韩国',/韩国|韓國|\bKorea\b/i],['新加坡',/新加坡|\bSingapore\b/i],['英国',/英国|英國|\bUnited Kingdom\b/i],['美国',/美国|美國|\bUnited States\b/i],['法国',/法国|法國|\bFrance\b/i]];
 const country=foreign.find(([,rx])=>rx.test(text));if(country){const result=fallback.country===country[0]?{...fallback}:{country:country[0]};if(country[0]==='新加坡')result.city='新加坡';if(country[0]==='日本'){const p=text.match(/東京都|大阪府|京都府|北海道|[一-龥]{2,3}県/);if(p)result.province=p[0];const city=text.match(/[一-龥]{2,6}市/);if(city)result.city=city[0];}return result;}
 const clean=text.replace(/^(?:中华人民共和国|中国)/,'').trim();
 const provinces=provinceData.map(p=>typeof p==='string'?p:p.name).filter(Boolean);
 const province=provinces.find(name=>{const short=name.replace(/省$|市$|(?:壮族|回族|维吾尔)?自治区$|特别行政区$/g,'');return clean.startsWith(name)||clean.startsWith(short);});
 const candidates=cityData.filter(c=>(!province||c.province===province)&&(/市$|自治州$|地区$|盟$/.test(c.name)?clean.includes(c.name):clean.startsWith(c.name)));
 const cities=[...new Map(candidates.map(c=>[c.province+'|'+c.name,c])).values()];
 const city=cities.length===1?cities[0]:null;
 if(province||city){const p=province||city.province;const result={country:'中国',province:p};if(['北京市','上海市','天津市','重庆市'].includes(p))result.city=p;else if(city)result.city=city.name;else if(fallback.province===p&&fallback.city)result.city=fallback.city;return result;}
 return {...fallback};
}
export function placeIndex(rows,normalize){const index=new Map();for(const p of rows)index.set(normalize(p.location),p);const ambiguous=new Set();for(const p of rows)for(const name of splitLabels(p.aliases)){const key=normalize(name);if(index.has(key)&&index.get(key)!==p){ambiguous.add(key);continue;}if(!ambiguous.has(key))index.set(key,p);}for(const key of ambiguous)if(!rows.some(p=>normalize(p.location)===key))index.delete(key);return index;}
