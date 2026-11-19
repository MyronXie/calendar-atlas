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
function lighten(color,whiteShare){
 const channels=color.slice(1).match(/../g).map(part=>parseInt(part,16));
 return '#'+channels.map(channel=>Math.round(channel*(1-whiteShare)+255*whiteShare).toString(16).padStart(2,'0')).join('');
}
export const palettes=Object.fromEntries(Object.entries(themeColors).map(([key,theme])=>[key,{
 ...theme,muted:lighten(theme.dark,.25),line:lighten(theme.mid,.58),
}]));
export function resolveTheme(value){return Object.hasOwn(palettes,value)?value:'green';}
export function coordinateLabel(p){if(!p||p.lat===''||p.lon===''||!Number.isFinite(+p.lat)||!Number.isFinite(+p.lon))return '';return Math.abs(+p.lat).toFixed(3)+'°'+(+p.lat<0?'S':'N')+','+Math.abs(+p.lon).toFixed(3)+'°'+(+p.lon<0?'W':'E');}
