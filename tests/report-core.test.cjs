const assert=require('node:assert/strict');
const {paginate,layouts}=require('../report-core.js');
for(const size of layouts){
 const items=Array.from({length:size*2+1},(_,id)=>({id,incluir:true}));
 const original=JSON.stringify(items);
 const pages=paginate(items,size);
 assert.deepEqual(pages.map(p=>p.items.length),[size,size,1]);
 assert.deepEqual(pages.flatMap(p=>p.items.map(i=>i.id)),items.map(i=>i.id));
 assert.equal(JSON.stringify(items),original);
}
assert.deepEqual(paginate([{id:1,incluir:false},{id:2,incluir:true,fotos_por_pagina_override:1},{id:3,incluir:true},{id:4,incluir:true,fotos_por_pagina_override:16}],4).map(p=>[p.size,p.items.map(i=>i.id)]),[[1,[2]],[4,[3]],[16,[4]]]);
assert.deepEqual(paginate([],4),[]);
assert.throws(()=>paginate([],3));
console.log('PASS: all layouts, mixed pages, selection, ordering, source immutability');
