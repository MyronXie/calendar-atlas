export function partitionCityBoundaries({features}){
 const index=[];
 const provinces=new Map();
 for(const feature of features){
  const {adcode,name,province,center}=feature.properties;
  const code=String(adcode).slice(0,2);
  if(!provinces.has(code))provinces.set(code,{type:'FeatureCollection',features:[]});
  provinces.get(code).features.push(feature);
  if(center)index.push({name,province,center});
 }
 return {index,provinces};
}
