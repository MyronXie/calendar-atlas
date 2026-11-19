export function periodCounts(events,monthly,min,max){const rows=Array.from({length:max-min+1},(_,i)=>({index:min+i,total:0,matched:0}));for(const e of events){const d=e.start;const i=monthly?d.getFullYear()*12+d.getMonth():d.getFullYear();if(rows[i-min])rows[i-min].total++;}return rows;}
export function addMatches(rows,events,monthly,min){for(const e of events){const d=e.start;const i=monthly?d.getFullYear()*12+d.getMonth():d.getFullYear();if(rows[i-min])rows[i-min].matched++;}return rows;}
export function boostedRatio(ratio){const r=Math.max(0,Math.min(1,ratio));return Math.min(Math.pow(r,.8),r+.10);}
export function barHeights(total,matched,peak){const height=total?Math.max(7,total/Math.max(1,peak)*82):0;const ratio=total?Math.min(1,matched/total):0;const shown=boostedRatio(ratio);return {total:height,matched:ratio?Math.min(height,Math.max(Math.min(3,height*(ratio+.10)),height*shown)):0};}

export function matchedLabelPlacement({total,matched}){
 if(!matched||total-matched>=15)return 'above';
 return matched>=14?'inside':'raised-total';
}

export function brushLabelLayout(width,left,right,startWidth,endWidth){
 const gap=12,spacing=5;
 const limit=(x,size)=>Math.max(0,Math.min(x,width-size));
 const start=limit(left>=startWidth+gap?left-startWidth-gap:left+gap,startWidth);
 const end=limit(right+gap+endWidth<=width?right+gap:right-endWidth-gap,endWidth);
 return {start,end,split:start<end+endWidth+spacing&&end<start+startWidth+spacing};
}
