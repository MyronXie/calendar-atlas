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

export async function captureTripMap(map,layer){
 if(layer.isLoading()){
  await new Promise(resolve=>{
   const finish=()=>{
    clearTimeout(timeout);
    layer.off('load remove',finish);
    resolve();
   };
   const timeout=setTimeout(finish,6500);
   layer.once('load remove',finish);
  });
 }
 const {x,y}=map.getSize(),side=Math.min(x,y);
 if(!side||!layer.getContainer())return null;
 const offsetX=(x-side)/2,offsetY=(y-side)/2;
 const frame=map.getContainer().getBoundingClientRect();
 const scaleX=frame.width/x,scaleY=frame.height/y;
 if(!scaleX||!scaleY)return null;
 const image=document.createElement('canvas');
 image.width=image.height=side;
 const ctx=image.getContext('2d',{willReadFrequently:true});
 try{
  for(const tile of layer.getContainer().querySelectorAll('.leaflet-tile-loaded')){
   if(!tile.complete||!tile.naturalWidth)continue;
   const rect=tile.getBoundingClientRect();
   const left=Math.round((rect.left-frame.left)/scaleX-offsetX);
   const top=Math.round((rect.top-frame.top)/scaleY-offsetY);
   const right=Math.round((rect.right-frame.left)/scaleX-offsetX);
   const bottom=Math.round((rect.bottom-frame.top)/scaleY-offsetY);
   if(left>=side||right<=0||top>=side||bottom<=0)continue;
   ctx.drawImage(tile,left,top,right-left,bottom-top);
  }
  const pixels=ctx.getImageData(0,0,side,side).data;
  let filled=0;
  for(let i=3;i<pixels.length;i+=4)if(pixels[i])filled++;
  if(filled<side*side*.98)return null;
 }catch{return null;}
 const projected=new Map();
 return {
  image,
  project(coord){
   const key=coord.join(',');
   if(!projected.has(key)){
    const point=map.latLngToContainerPoint(coord);
    projected.set(key,[(point.x-offsetX)*contentWidth/side,(point.y-offsetY)*contentWidth/side]);
   }
   return projected.get(key);
  },
 };
}

function drawRouteMap(ctx,{points,lines,overview,mapImage},palette,top){
 const height=contentWidth,margin=58;
 const latitudes=points.map(point=>point.coord[0]);
 const longitudes=points.map(point=>point.coord[1]);
 const south=Math.min(...latitudes),north=Math.max(...latitudes);
 const west=Math.min(...longitudes),east=Math.max(...longitudes);
 const latitude=(south+north)/2,longitude=(west+east)/2;
 const lonFactor=Math.max(.01,Math.cos(latitude*Math.PI/180));
 const scale=Math.min((contentWidth-margin*2)/Math.max((east-west)*lonFactor,.003),
  (height-margin*2)/Math.max(north-south,.003));
 const project=coord=>{
  if(mapImage){
   const [x,y]=mapImage.project(coord);
   return [padding+x,top+y];
  }
  const [lat,lon]=coord;
  return [width/2+(lon-longitude)*lonFactor*scale,top+height/2-(lat-latitude)*scale];
 };
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
 if(mapImage)ctx.drawImage(mapImage.image,padding,top,contentWidth,height);
 ctx.lineWidth=4;
 ctx.lineJoin='round';
 if(lines.length)ctx.setLineDash([8,6]);
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
 if(mapImage){
  const credit='© OpenStreetMap · openstreetmap.org/copyright';
  ctx.font=font(16,500);
  ctx.textAlign='right';
  ctx.fillStyle='#fffffff2';
  ctx.fillRect(padding+contentWidth-ctx.measureText(credit).width-24,top+height-32,contentWidth,32);
  ctx.fillStyle=palette.deep;
  ctx.fillText(credit,padding+contentWidth-12,top+height-16);
 }
 ctx.restore();
}

export function drawTripShare({title,dates,partners,groups,points,lines,overview,showPlaces,showMap,palette,mapImage}){
 const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');
 const items=[];
 let y=padding;
 const label=(text,size,color,{weight=400,indent=0,maxLines=Infinity,step=size+10,maxWidth=contentWidth-indent}={})=>{
  ctx.font=font(size,weight);
  const rows=wrap(ctx,text,maxWidth);
  const visible=rows.slice(0,maxLines);
  if(rows.length>maxLines)visible[visible.length-1]+='…';
  for(const row of visible){
   items.push({row,size,color,weight,indent,y,maxWidth});
   y+=step;
  }
 };
 label('日历足迹  /  旅游行程',22,palette.muted,{weight:600});
 y+=12;
 label(title,50,palette.deep,{weight:700,maxLines:2});
 label(dates||'',23,palette.muted);
 if(partners.length)label('同伴：'+partners.join('、'),23,palette.muted,{maxLines:3});
 const mapTop=showMap&&points.length?y+16:null;
 if(mapTop!==null)y=mapTop+contentWidth;
 y+=18;
 let shown=0;
 for(const {label:date,color,locations} of groups){
  if(y>3560)break;
  shown++;
  label(date,25,color,{weight:700});
  if(!locations.length||!showPlaces){
   label(locations.length?locations.length+' 个地点':'暂无地点记录',22,palette.muted,{indent:16});
  }else{
   const stops=locations.map((location,i)=>(i+1)+'.  '+location.name+(location.located?'':'（未定位）'));
   const gap=20,indent=12;
   ctx.font=font(22);
   const threeWidth=(contentWidth-indent-gap*2)/3;
   const short=stops.filter(stop=>ctx.measureText(stop).width<=threeWidth).length;
   const columns=Math.min(stops.length,short>=stops.length*.8?3:2);
   const columnWidth=(contentWidth-indent-gap*(columns-1))/columns;
   for(let i=0;i<stops.length;i+=columns){
    if(y>3650){
     label('另有 '+(stops.length-i)+' 个地点',22,palette.muted,{indent});
     break;
    }
    const startY=y;
    let endY=y;
    for(const [column,stop] of stops.slice(i,i+columns).entries()){
     y=startY;
     label(stop,22,palette.deep,{indent:indent+column*(columnWidth+gap),maxWidth:columnWidth,maxLines:3,step:30});
     endY=Math.max(y,endY);
    }
    y=endY;
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
 if(mapTop!==null)drawRouteMap(ctx,{points,lines,overview,mapImage},palette,mapTop);
 ctx.textBaseline='top';
 for(const {row,size,color,weight,indent,y,maxWidth} of items){
  ctx.font=font(size,weight);
  ctx.fillStyle=color;
  ctx.fillText(row,padding+indent,y,maxWidth);
 }
 return canvas;
}
