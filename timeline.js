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
  unit==='weekday'?(date.getDay()+6)%7:date.getDate();
}
export function dateBucketLabel(value,unit){
 return unit==='weekday'?'星期'+['一','二','三','四','五','六','日'][value]:value+({year:'年',month:'月',date:'号'})[unit];
}

export function frequencyBuckets(events,scoped,matched,unit,from,to){
 const key=date=>dateBucket(date,unit);
 const startYear=from.getFullYear(),endYear=to.getFullYear();
 const years=endYear-startYear<=100?Array.from({length:endYear-startYear+1},(_,i)=>startYear+i):[startYear,endYear];
 const keys=unit==='year'?[...new Set([...years,...events.map(e=>key(e.start))])].sort((a,b)=>a-b):
  Array.from({length:unit==='month'?12:unit==='weekday'?7:31},(_,i)=>i+(unit==='weekday'?0:1));
 const rows=new Map(keys.map(value=>{
  const title=dateBucketLabel(value,unit);
  return [value,{value,label:unit==='weekday'?title.slice(-1):String(value),title,total:0,scoped:0,matched:0}];
 }));
 for(const [field,records] of [['total',events],['scoped',scoped],['matched',matched]]){
  for(const event of records||[])rows.get(key(event.start))[field]++;
 }
 return [...rows.values()];
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
