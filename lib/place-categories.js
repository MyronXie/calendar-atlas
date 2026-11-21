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

// 确定性的地点分类：名称优先、地址兜底，供 `tools/place-classify.mjs` / `place-merge.mjs` 使用。
function typeMatch(text, type) {
 switch (type) {
  case 'food': return /餐|饭店|火锅|烧烤|烤肉|烤鱼|烧鸟|面馆|拉面|米粉|饺|寿司|料理|咖啡|茶饮|奶茶|酒馆|酒吧|小吃|甜品|烘焙|蛋糕|比萨|披萨|汉堡|炸鸡|食堂|食府|海鲜|粥|包子|饼|冒菜|麻辣|串|冰淇淋|雪糕|饮品|快餐|自助|糁|牛肉|咖喱|CoCo|面(?!包)|菜馆|小馆|湘菜|湖南菜|川菜|粤菜|本帮菜|徽菜|卤|烧腊|餐饮/.test(text);
  case 'trans': return /机场|火车站|高铁站|汽车站|客运站|码头|港口|渡口|地铁站|公交站|车站/.test(text);
  case 'stay': return /酒店|宾馆|民宿|客栈|度假村|旅馆|青年旅舍/.test(text);
  case 'sport': return /羽毛球|网球|游泳|健身|体育馆|体育场|运动场|运动馆|操场|球场|跑道|攀岩|滑雪|篮球|足球/.test(text);
  case 'fun': return /KTV|ktv|影城|影院|电影|桌游|密室|剧本|游戏|电玩|乐园|欢乐谷|迪士尼|音乐节|演唱会|Livehouse|livehouse/.test(text);
  case 'art': return /博物馆|美术馆|展览|艺术|剧场|剧院|音乐厅|图书馆|书店|文化馆|纪念馆|画廊/.test(text);
  case 'shop': return /购物中心|商场|商城|百货|超市|便利店|市场|集市|专卖店|旗舰店|名创优品|Miniso|屈臣氏|优衣库|奥特莱斯|广场/.test(text);
  case 'out': return /公园|景区|景点|观景|风景|山$|湖$|海滩|沙滩|海岛|温泉|湿地|瀑布|峡谷|森林|植物园|动物园|古镇|街区|步道|绿道|岛$|湾$|寺$|庙$|塔$|文化广场/.test(text);
  case 'edu': return /大学(?!路|街|巷)|学院(?!路)|学校|校区|教学楼|实验楼|实验中心|创新中心|学生中心|共享空间|会议厅|礼堂|办公楼|行政楼|后勤楼|医院|卫生院|食堂|宿舍/.test(text);
  case 'home': return /家$|住宅|小区|新村|宿舍|寝室/.test(text);
 }
 return false;
}
const NAME_ORDER = ['out', 'trans', 'food', 'fun', 'sport', 'art', 'stay', 'shop', 'edu', 'home'];
const ADDR_ORDER = ['trans', 'out', 'stay', 'art', 'shop', 'food', 'sport', 'fun', 'edu', 'home'];
export function inferPlaceType(name = '', address = '') {
 const n = String(name || ''), a = String(address || '');
 for (const t of NAME_ORDER) if (typeMatch(n, t)) return t;
 for (const t of ADDR_ORDER) if (typeMatch(a, t)) return t;
 return 'other';
}
const LABEL_RULES = [
 [/火锅/, '火锅'], [/烧烤|烤鱼|烤肉|烧鸟/, '烧烤烤肉'], [/咖啡/, '咖啡'], [/茶饮|奶茶/, '茶饮'], [/面馆|拉面|米粉|面$/, '面食'],
 [/海鲜/, '海鲜'], [/小吃/, '小吃'], [/甜品|蛋糕|烘焙/, '甜品烘焙'], [/寿司|料理/, '日料'], [/汉堡|炸鸡|比萨|披萨/, '快餐'], [/餐厅|食府|饭店|菜馆|餐饮/, '正餐'], [/湘菜|湖南菜/, '湘菜'],
 [/食堂/, '食堂'], [/酒吧|酒馆/, '酒吧'], [/购物中心|商场|商城|百货/, '商场'], [/超市/, '超市'], [/市场|集市/, '市场'],
 [/博物馆/, '博物馆'], [/美术馆/, '美术馆'], [/图书馆/, '图书馆'], [/书店/, '书店'], [/剧场|剧院|音乐厅/, '剧场'],
 [/公园/, '公园'], [/景区|景点|观景/, '景区'], [/温泉/, '温泉'], [/古镇/, '古镇'], [/山$/, '山'], [/湖$/, '湖'], [/海滩|沙滩|岛$/, '海岛'],
 [/KTV|ktv/, 'KTV'], [/影城|影院|电影/, '影院'], [/桌游/, '桌游'], [/密室/, '密室'], [/剧本/, '剧本杀'], [/游戏|电玩/, '电玩'],
 [/机场/, '机场'], [/火车站|高铁站|车站/, '车站'], [/码头|港口|渡口/, '码头'], [/酒店|宾馆|民宿|客栈|度假村/, '住宿'],
 [/大学(?!路|街|巷)|学院(?!路)|校区/, '校园'], [/医院|卫生院/, '医院'], [/体育馆|体育场|球场|操场/, '运动场馆'],
];
export function inferPlaceLabels(name = '', address = '') {
 const collect = text => { const out = []; for (const [rx, label] of LABEL_RULES) if (rx.test(text) && !out.includes(label)) out.push(label); return out; };
 let out = collect(String(name || ''));
 if (!out.length) out = collect(String(address || ''));
 return out.slice(0, 3);
}

