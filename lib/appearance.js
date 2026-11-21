const themeColors={
 green:{name:'苔绿',accent:'#4d7147',soft:'#e9f1e4',mid:'#a7bea0',dark:'#223c28',canvas:'#f3f6f0',highlight:'#d16b3f'},
 blue:{name:'雾蓝',accent:'#3d6e9a',soft:'#e8f0f8',mid:'#9fb8ce',dark:'#18334b',canvas:'#f2f5f8',highlight:'#d4773b'},
 purple:{name:'紫藤',accent:'#79568f',soft:'#f0e9f5',mid:'#bca5ca',dark:'#382443',canvas:'#f7f3f9',highlight:'#279993'},
 amber:{name:'琥珀',accent:'#976820',soft:'#f8eed9',mid:'#cfb278',dark:'#493319',canvas:'#faf6ee',highlight:'#3d7faf'},
 slate:{name:'岩灰',accent:'#586775',soft:'#eaf0f3',mid:'#a8b5bf',dark:'#26343e',canvas:'#f3f5f6',highlight:'#cf7544'},
 cherry:{name:'樱桃',accent:'#ba285f',soft:'#fde7ef',mid:'#f598b5',dark:'#521631',canvas:'#fff6fa',highlight:'#008c7a'},
 tangerine:{name:'橘汽',accent:'#b14410',soft:'#fdebdc',mid:'#ffad65',dark:'#55250f',canvas:'#fff7ef',highlight:'#4d58dc'},
 lime:{name:'青柠',accent:'#00715c',soft:'#e8f8d7',mid:'#8ada79',dark:'#173816',canvas:'#f5fcef',highlight:'#b92075'},
};
function mix(color,target,targetShare){
 const channels=value=>value.slice(1).match(/../g).map(part=>parseInt(part,16));
 const other=channels(target);
 return '#'+channels(color).map((channel,i)=>
  Math.round(channel*(1-targetShare)+other[i]*targetShare).toString(16).padStart(2,'0'),
 ).join('');
}
export const palettes=Object.fromEntries(Object.entries(themeColors).map(([key,theme])=>[key,{
 ...theme,muted:mix(theme.dark,'#ffffff',.25),line:mix(theme.mid,'#ffffff',.58),
}]));
export const nightPalettes=Object.fromEntries(Object.entries(themeColors).map(([key,theme])=>{
 const canvas='#0d100f',surface='#161b18';
 return [key,{
  name:theme.name,canvas,surface,dark:'#edf2ee',muted:'#bec9c0',
  accent:mix(theme.accent,'#ffffff',.38),highlight:mix(theme.highlight,'#ffffff',.30),
  soft:mix(surface,theme.accent,.21),mid:mix(surface,theme.mid,.45),line:mix(surface,theme.mid,.28),
 }];
}));
export function resolveTheme(value){return Object.hasOwn(palettes,value)?value:'green';}
export function highlightLabelColor({highlight,dark}){
 const luminance=color=>color.slice(1).match(/../g).reduce((sum,part,i)=>{
  const channel=parseInt(part,16)/255;
  const linear=channel<=.04045?channel/12.92:((channel+.055)/1.055)**2.4;
  return sum+linear*[.2126,.7152,.0722][i];
 },0);
 const bg=luminance(highlight),foreground=luminance(dark);
 if((Math.max(bg,foreground)+.05)/(Math.min(bg,foreground)+.05)>=4.5)return dark;
 return bg>.179?'#000':'#fff';
}
export function coordinateLabel(p){if(!p||p.lat===''||p.lon===''||!Number.isFinite(+p.lat)||!Number.isFinite(+p.lon))return '';return Math.abs(+p.lat).toFixed(3)+'°'+(+p.lat<0?'S':'N')+','+Math.abs(+p.lon).toFixed(3)+'°'+(+p.lon<0?'W':'E');}
