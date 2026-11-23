import {eventParts} from './filters.js';
import {splitLabels} from './place-categories.js';

const categories=[
 ['餐饮',/吃吃吃|聚餐|约饭|吃饭|晚饭|午饭|散伙饭|漂亮饭|餐饮/,/餐饮/],
 ['购物',/逛街|购物|买衣服/,/购物|商场/],
 ['电影',/看电影|观影|电影(?:[《「『]|首映|节|$)|(?:^|[^\p{L}])IMAX(?:$|[^\p{L}])/iu,/影院|影城|电影|cinema|\bcgv\b/i],
 ['音乐剧',/音乐剧|\bmusical\b/i,/音乐剧/],
 ['话剧',/话剧/,/话剧/],
 ['桌游',/桌游|board[ -]?games?/i,/桌游|board[ -]?games?/i],
 ['打麻将',/麻将/,/麻将/],
 ['剧本杀',/剧本杀|谋杀之谜/,/剧本杀/],
 ['密室逃脱',/密室|escape[ -]?room/i,/密室|escape[ -]?room/i],
 ['KTV',/KTV|卡拉OK/i,/KTV|卡拉OK/i],
 ['现场音乐',/演唱会|音乐会|音乐节|live[ -]?house/i,/演唱会|音乐会|音乐节|live[ -]?house/i],
 ['展会',/漫展|游戏展|动漫展|博览会|\bweplay\b/i,/会展中心|博览中心|动漫展/],
 ['参观博物馆',/博物[馆院]|参观纪念馆/,/博物[馆院]|纪念馆|陈列馆/],
 ['美术展览',/美术展|艺术展|美术馆|画展/,/美术馆|美术展|画廊|艺术展/],
 ['散步',/散步|压马路/,null],
 ['徒步',/徒步|登山/,/徒步|登山/],
 ['骑行',/骑行/,null],
 ['游泳',/游泳/,/游泳|泳池/],
 ['羽毛球',/羽毛球/,/羽毛球/],
 ['攀岩',/攀岩|抱石/,/攀岩|抱石/],
 ['滑雪',/滑雪/,/滑雪/],
 ['滑冰',/滑冰/,/滑冰|冰场/],
 ['健身',/健身|\bfitness\b/i,/健身|fitness|\bgym\b/i],
 ['篮球',/篮球/,/篮球/],
 ['足球',/足球/,/足球/],
 ['乒乓球',/乒乓球/,/乒乓球/],
 ['保龄球',/保龄球/,/保龄球/],
 ['卡丁车',/卡丁车/,/卡丁车/],
 ['电竞',/电竞/,/电竞/],
];
const coarseTypes={food:'餐饮',shop:'购物',out:'户外',sport:'运动'};
const text=value=>String(value??'').normalize('NFKC').trim();
const exact=value=>text(value).toLowerCase();

function matching(values,patternIndex){
 return categories.filter(category=>values.some(value=>category[patternIndex]?.test(value))).map(([label])=>label);
}

function unique(values){
 return [...new Map(values.filter(Boolean).map(value=>[exact(value),value])).values()];
}

function explicitName(value){
 const matches=matching([value],1);
 return categories.find(([label])=>exact(label)===exact(value))?.[0]??(matches.length===1?matches[0]:value);
}

function placeActivity(name,row){
 const labels=splitLabels(row?.labels).map(text);
 const labelMatches=matching(labels,2);
 const placeName=text(row?.location||name);
 const nameMatches=matching([placeName],2);
 const fine=(labelMatches.length?labelMatches:nameMatches)
  .filter(label=>label!=='电影'||!/博物[馆院]|环球影城|主题乐园/.test(placeName));
 const broad=/演出场馆|剧场|剧院/.test([placeName,...labels].join(' '))
  ?'现场演出':Object.hasOwn(coarseTypes,row?.type)?coarseTypes[row.type]:null;
 return {fine,broad,name:row?.location||name,source:labelMatches.length?'地点标签':'地点名称'};
}

export function classifyActivity(event,lookupPlace){
 const explicit=unique([...String(event.note??'').matchAll(/^[ \t]*活动[ \t]*[:：][ \t]*([^\r\n]+)$/gm)]
  .map(match=>text(match[1])).filter(Boolean).map(explicitName));
 if(explicit.length)return explicit.length===1?{label:explicit[0],source:'备注标注'}:null;
 const title=text(eventParts(event.title).name);
 if(/逛吃|取消|停课/.test(title))return null;
 const titleHits=matching([title],1);
 if(titleHits.length)return titleHits.length===1?{label:titleHits[0],source:'事件标题'}:null;

 const evidence=event.places.map(name=>placeActivity(name,lookupPlace(name)));
 const fine=unique(evidence.flatMap(item=>item.fine));
 // 餐饮、购物场所不能盖过同一事件有明确用途的场馆。
 const specific=fine.filter(label=>!['餐饮','购物'].includes(label));
 const activity=specific.length?specific:fine;
 if(activity.length){
  if(activity.length!==1)return null;
  const item=evidence.find(entry=>entry.fine.includes(activity[0]));
  return {label:activity[0],source:item.source,place:item.name};
 }
 const broad=unique(evidence.map(item=>item.broad));
 if(broad.length!==1)return null;
 return {label:broad[0],source:'地点类型',place:evidence.find(item=>item.broad===broad[0]).name};
}
