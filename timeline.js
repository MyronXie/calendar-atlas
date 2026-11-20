export function periodCounts(events,monthly,min,max){const rows=Array.from({length:max-min+1},(_,i)=>({index:min+i,total:0,matched:0}));for(const e of events){const d=e.start;const i=monthly?d.getFullYear()*12+d.getMonth():d.getFullYear();if(rows[i-min])rows[i-min].total++;}return rows;}
export function addMatches(rows,events,monthly,min,field='matched'){for(const e of events){const d=e.start;const i=monthly?d.getFullYear()*12+d.getMonth():d.getFullYear();if(rows[i-min])rows[i-min][field]=(rows[i-min][field]||0)+1;}return rows;}
export function boostedRatio(ratio){const r=Math.max(0,Math.min(1,ratio));return Math.min(Math.pow(r,.8),r+.10);}
export function barHeights(total,matched,peak){const height=total?Math.max(7,total/Math.max(1,peak)*82):0;const ratio=total?Math.min(1,matched/total):0;const shown=boostedRatio(ratio);return {total:height,matched:ratio?Math.min(height,Math.max(Math.min(3,height*(ratio+.10)),height*shown)):0};}

export function matchedLabelPlacement({total,matched}){
 if(!matched||total-matched>=15)return 'above';
 return matched>=14?'inside':'raised-total';
}

export function dateBucket(date,unit){
 return unit==='year'?date.getFullYear():unit==='month'?date.getMonth()+1:
  unit==='weekday'?(date.getDay()+6)%7:unit==='hour'?date.getHours():date.getDate();
}
const weekdays=['一','二','三','四','五','六','日'];
export function dateBucketLabel(value,unit){
 return unit==='weekday'?'周'+weekdays[value]:value+({year:'年',month:'月',date:'日',hour:'时'})[unit];
}

export function frequencyBuckets(events,scoped,matched,unit,from,to){
 const key=date=>dateBucket(date,unit);
 const startYear=from.getFullYear(),endYear=to.getFullYear();
 const years=endYear-startYear<=100?Array.from({length:endYear-startYear+1},(_,i)=>startYear+i):[startYear,endYear];
 const keys=unit==='year'?[...new Set([...years,...events.map(e=>key(e.start))])].sort((a,b)=>a-b):
  Array.from({length:unit==='month'?12:unit==='weekday'?7:unit==='hour'?24:31},(_,i)=>i+(['weekday','hour'].includes(unit)?0:1));
 const rows=new Map(keys.map(value=>{
  const title=dateBucketLabel(value,unit);
  return [value,{value,label:unit==='weekday'?title.slice(-1):String(value),title,total:0,scoped:0,matched:0}];
 }));
 for(const [field,records] of [['total',events],['scoped',scoped],['matched',matched]]){
  for(const event of records||[]){
   if(unit!=='hour'||!event.allDay)rows.get(key(event.start))[field]++;
  }
 }
 return [...rows.values()];
}

export const hourGroups=[
 {label:'清晨',ranges:[[5,8]]},{label:'上午',ranges:[[8,12]]},{label:'中午',ranges:[[12,14]]},
 {label:'下午',ranges:[[14,18]]},{label:'晚上',ranges:[[18,22]]},{label:'深夜',ranges:[[0,5],[22,24]]},
].map(group=>({...group,hours:group.ranges.flatMap(([from,to])=>Array.from({length:to-from},(_,i)=>from+i))}));

const dateUnits=['year','month','weekday','date','hour'];
const namedRuns={
 month:[[1,3,'一季度'],[4,6,'二季度'],[7,9,'三季度'],[10,12,'四季度'],
  [3,5,'春季'],[6,8,'夏季'],[9,11,'秋季']],
 weekday:[[0,4,'工作日'],[5,6,'双休日']],
 date:[[1,10,'上旬'],[11,20,'中旬'],[21,31,'下旬']],
};
function dateRuns(values){
 const runs=[];
 for(const value of [...new Set(values)].sort((a,b)=>a-b)){
  const last=runs.at(-1);
  if(last&&value===last[1]+1)last[1]=value;
  else runs.push([value,value]);
 }
 return runs;
}
function dateRunLabel(unit,from,to){
 if(from===to)return dateBucketLabel(from,unit);
 const named=namedRuns[unit]?.find(([first,last])=>first===from&&last===to);
 if(named)return named[2];
 if(unit==='weekday')return '周'+weekdays[from]+'~'+weekdays[to];
 return from+'~'+dateBucketLabel(to,unit);
}
function hourConditionLabels(values){
 const hours=new Set(values),labels=[];
 for(const group of hourGroups){
  if(!group.hours.every(hour=>hours.has(hour)))continue;
  labels.push([group.ranges.at(-1)[0],group.label]);
  for(const hour of group.hours)hours.delete(hour);
 }
 for(const [from,to] of dateRuns(hours))labels.push([from,dateRunLabel('hour',from,to)]);
 return labels.sort(([a],[b])=>a-b).map(([,label])=>label);
}
export function dateConditionLabels(criteria){
 return dateUnits.flatMap(unit=>{
  const values=criteria.filter(c=>c.scope===unit).map(c=>Number(c.value));
  if(unit==='hour')return hourConditionLabels(values);
  const runs=dateRuns(values);
  const first=runs[0],last=runs.at(-1);
  const wrap=unit==='month'&&runs.length>1&&first[0]===1&&first[1]===2&&last[0]===12;
  const labels=(wrap?runs.slice(1,-1):runs).map(([from,to])=>dateRunLabel(unit,from,to));
  return wrap?[...labels,'冬季']:labels;
 });
}

export function periodRange(first,last,monthly){
 const boundary=(index,end)=>{
  if(!monthly)return String(index).padStart(4,'0')+(end?'-12-31':'-01-01');
  const year=Math.floor(index/12),month=index%12+1;
  const lastDate=new Date(2000,0,1);
  lastDate.setFullYear(year,month,0);
  return String(year).padStart(4,'0')+'-'+String(month).padStart(2,'0')+'-'+(end?lastDate.getDate():'01');
 };
 return [boundary(Math.min(first,last),false),boundary(Math.max(first,last),true)];
}
