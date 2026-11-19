import assert from 'node:assert/strict';
import {coordinateLabel,resolveTheme,palettes} from '../appearance.js';

assert.equal(coordinateLabel({lat:31.114,lon:131.224}),'31.114°N,131.224°E');
assert.equal(coordinateLabel({lat:-31.114,lon:-131.224}),'31.114°S,131.224°W');
assert.equal(coordinateLabel({lat:'',lon:''}),'');
assert.equal(coordinateLabel(null),'');
assert.equal(resolveTheme('invalid'),'green');
assert.equal(Object.keys(palettes).length,8);
assert.equal(palettes.green.muted,'#596d5e');
assert.equal(palettes.green.line,'#dae4d7');
const luminance=color=>color.slice(1).match(/../g).map(part=>parseInt(part,16)/255)
 .map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4)
 .reduce((sum,value,i)=>sum+value*[.2126,.7152,.0722][i],0);
for(const [key,palette] of Object.entries(palettes)){
 assert.equal(resolveTheme(key),key);
 for(const tone of ['accent','soft','mid','dark','canvas','highlight','muted','line'])assert.match(palette[tone],/^#[0-9a-f]{6}$/);
 for(const background of ['#ffffff',palette.canvas,palette.soft]){
  assert.ok((luminance(background)+.05)/(luminance(palette.muted)+.05)>=4.5,palette.name+'正文对比度');
 }
}
console.log('Coordinate formatting and palette defaults: passed');
