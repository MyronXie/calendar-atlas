const width=960,padding=56,contentWidth=width-padding*2;
const font=(size,weight=400)=>weight+' '+size+'px system-ui, sans-serif';

function wrap(ctx,value,maxWidth){
 const rows=[];
 let row='';
 for(const character of value){
  if(row&&ctx.measureText(row+character).width>maxWidth){
   rows.push(row.trimEnd());
   row=character.trimStart();
  }else row+=character;
 }
 if(row)rows.push(row);
 return rows;
}

function drawRouteMap(ctx,{points,lines,overview},palette,top){
 const height=355,margin=46;
 const latitudes=points.map(point=>point.coord[0]);
 const longitudes=points.map(point=>point.coord[1]);
 const south=Math.min(...latitudes),north=Math.max(...latitudes);
 const west=Math.min(...longitudes),east=Math.max(...longitudes);
 const latitude=(south+north)/2,longitude=(west+east)/2;
 const lonFactor=Math.max(.01,Math.cos(latitude*Math.PI/180));
 const scale=Math.min((contentWidth-margin*2)/Math.max((east-west)*lonFactor,.003),
  (height-margin*2)/Math.max(north-south,.003));
 const project=([lat,lon])=>[width/2+(lon-longitude)*lonFactor*scale,top+height/2-(lat-latitude)*scale];
 const badgesByCoordinate=new Map(points.map(({coord,badges})=>{
  const [x,y]=project(coord);
  const columns=Math.min(8,badges.size),rows=Math.ceil(badges.size/columns);
  const startX=Math.max(padding+16,Math.min(x-(columns-1)*14,padding+contentWidth-16-(columns-1)*28));
  const startY=Math.max(top+16,Math.min(y-(rows-1)*14,top+height-16-(rows-1)*28));
  const marks=new Map([...badges].map(([number,color],i)=>[number,{
   color,x:startX+(i%columns)*28,y:startY+Math.floor(i/columns)*28,
  }]));
  return [coord.join(','),marks];
 }));

 ctx.save();
 ctx.beginPath();
 ctx.roundRect(padding,top,contentWidth,height,20);
 ctx.clip();
 ctx.fillStyle=palette.soft;
 ctx.fillRect(padding,top,contentWidth,height);
 ctx.strokeStyle=palette.line;
 ctx.lineWidth=1;
 ctx.beginPath();
 for(let x=padding+40;x<padding+contentWidth;x+=40){ctx.moveTo(x,top);ctx.lineTo(x,top+height);}
 for(let y=top+40;y<top+height;y+=40){ctx.moveTo(padding,y);ctx.lineTo(padding+contentWidth,y);}
 ctx.stroke();
 ctx.lineWidth=4;
 ctx.lineJoin='round';
 ctx.setLineDash([8,6]);
 for(const {route,color,number} of lines){
  ctx.strokeStyle=color;
  ctx.beginPath();
  route.forEach((coord,i)=>{
   const mark=overview?badgesByCoordinate.get(coord.join(','))?.get(number):null;
   const [x,y]=mark?[mark.x,mark.y]:project(coord);
   if(i)ctx.lineTo(x,y);
   else ctx.moveTo(x,y);
  });
  ctx.stroke();
 }
 ctx.setLineDash([]);
 ctx.textAlign='center';
 ctx.textBaseline='middle';
 ctx.font=font(15,700);
 for(const marks of badgesByCoordinate.values()){
  for(const [number,{x,y,color}] of marks){
   ctx.beginPath();
   ctx.arc(x,y,13,0,2*Math.PI);
   ctx.fillStyle=color;
   ctx.fill();
   ctx.strokeStyle='#fff';
   ctx.lineWidth=2;
   ctx.stroke();
   ctx.fillStyle='#fff';
   ctx.fillText(number,x,y,22);
  }
 }
 ctx.restore();
 return top+height;
}

export function drawTripShare({title,dates,partners,groups,points,lines,overview,showPlaces,palette}){
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
 const items=[];
 let y=padding;
 const label=(text,size,color,{weight=400,indent=0,maxLines=Infinity,step=size+10}={})=>{
  ctx.font=font(size,weight);
  const rows=wrap(ctx,text,contentWidth-indent);
  const visible=rows.slice(0,maxLines);
  if(rows.length>maxLines)visible[visible.length-1]+='…';
  for(const row of visible){
   items.push({row,size,color,weight,indent,y});
   y+=step;
  }
 };
 label('日历足迹  /  旅游行程',22,palette.muted,{weight:600});
 y+=12;
 label(title,50,palette.deep,{weight:700,maxLines:2});
 label(dates||'',23,palette.muted);
 if(partners.length)label('同伴：'+partners.join('、'),23,palette.muted,{maxLines:3});
 const mapTop=showPlaces&&points.length?y+16:null;
 if(mapTop!==null){
  y=mapTop+370;
  label('点位示意 · '+(overview?'编号为行程第几天':'编号为当天到访顺序')+(lines.length?' · 虚线为地点顺序':''),19,palette.muted);
 }
 y+=18;
 let shown=0;
 for(const {label:date,color,locations} of groups){
  if(y>3560)break;
  shown++;
  label(date,25,color,{weight:700});
  if(!locations.length||!showPlaces){
   label(locations.length?locations.length+' 个地点':'暂无地点记录',22,palette.muted,{indent:16});
  }else{
   for(const [i,location] of locations.entries()){
    if(y>3650){
     label('另有 '+(locations.length-i)+' 个地点',22,palette.muted,{indent:16});
     break;
    }
    label((i+1)+'.  '+location.name+(location.located?'':'（未定位）'),22,palette.deep,{indent:16,maxLines:3});
   }
  }
  y+=14;
 }
 if(shown<groups.length)label('另有 '+(groups.length-shown)+' 个日期分组，可按天导出。',22,palette.muted);

 canvas.width=width;
 canvas.height=y+padding-12;
 ctx.fillStyle='#fff';
 ctx.fillRect(0,0,width,canvas.height);
 ctx.fillStyle=palette.accent;
 ctx.fillRect(0,0,width,10);
 if(mapTop!==null)drawRouteMap(ctx,{points,lines,overview},palette,mapTop);
 ctx.textBaseline='top';
 for(const {row,size,color,weight,indent,y} of items){
  ctx.font=font(size,weight);
  ctx.fillStyle=color;
  ctx.fillText(row,padding+indent,y,contentWidth-indent);
 }
 return canvas;
}
