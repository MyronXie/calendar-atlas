export function periodCounts(events,monthly,min,max){const rows=Array.from({length:max-min+1},(_,i)=>({index:min+i,total:0,matched:0}));for(const e of events){const d=e.start;const i=monthly?d.getFullYear()*12+d.getMonth():d.getFullYear();if(rows[i-min])rows[i-min].total++;}return rows;}
export function addMatches(rows,events,monthly,min){for(const e of events){const d=e.start;const i=monthly?d.getFullYear()*12+d.getMonth():d.getFullYear();if(rows[i-min])rows[i-min].matched++;}return rows;}
export function boostedRatio(ratio){const r=Math.max(0,Math.min(1,ratio));return Math.min(Math.pow(r,.8),r+.10);}
export function barHeights(total,matched,peak){const height=total?Math.max(7,total/Math.max(1,peak)*82):0;const ratio=total?Math.min(1,matched/total):0;const shown=boostedRatio(ratio);return {total:height,matched:ratio?Math.min(height,Math.max(Math.min(3,height*(ratio+.10)),height*shown)):0};}

export function matchedLabelPlacement({total,matched}){
 if(!matched||total-matched>=15)return 'above';
 return matched>=14?'inside':'raised-total';
}

export function frequencyBuckets(events,matched,unit,from,to){
 const inRange=event=>event.start>=from&&event.start<=to;
 const recorded=events.filter(inRange);
 const startYear=from.getFullYear(),endYear=to.getFullYear();
 const weekdays=['一','二','三','四','五','六','日'];
 const key=date=>unit==='year'?date.getFullYear():unit==='month'?date.getMonth()+1:
  unit==='weekday'?(date.getDay()+6)%7:date.getDate();
 let keys;
 if(unit==='year'){
  keys=endYear-startYear<=100?Array.from({length:endYear-startYear+1},(_,i)=>startYear+i):
   [...new Set([startYear,...recorded.map(event=>key(event.start)),endYear])].sort((a,b)=>a-b);
 }else{
  const length=unit==='month'?12:unit==='weekday'?7:31;
  keys=Array.from({length},(_,i)=>i+(unit==='weekday'?0:1));
 }
 const rows=new Map(keys.map(value=>[value,{label:unit==='weekday'?weekdays[value]:String(value),
  title:unit==='weekday'?'星期'+weekdays[value]:value+({year:'年',month:'月',date:'号'})[unit],total:0,matched:0}]));
 for(const event of recorded)rows.get(key(event.start)).total++;
 for(const event of matched||[])if(inRange(event))rows.get(key(event.start)).matched++;
 return [...rows.values()];
}

export function brushLabelLayout(width,left,right,startWidth,endWidth){
 const gap=12,spacing=5;
 const limit=(x,size)=>Math.max(0,Math.min(x,width-size));
 const start=limit(left>=startWidth+gap?left-startWidth-gap:left+gap,startWidth);
 const end=limit(right+gap+endWidth<=width?right+gap:right-endWidth-gap,endWidth);
 return {start,end,split:start<end+endWidth+spacing&&end<start+startWidth+spacing};
}
