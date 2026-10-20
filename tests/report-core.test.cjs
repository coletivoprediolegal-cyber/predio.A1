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
const sections=[
 ...Array.from({length:8},(_,id)=>({id,incluir:true,secao_id:'terreo',secao_nome:'Térreo'})),
 {id:8,incluir:false,secao_id:'terreo'},
 ...Array.from({length:15},(_,id)=>({id:id+9,incluir:true,secao_id:'subsolo',secao_nome:'1º subsolo'})),
 ...Array.from({length:2},(_,id)=>({id:id+24,incluir:true,secao_id:'cobertura',secao_nome:'Cobertura'}))
];
const original=JSON.stringify(sections);
const pages=paginate(sections,12);
assert.deepEqual(pages.map(page=>page.items.length),[8,12,3,2]);
assert.deepEqual(pages.map(page=>page.items[0].secao_nome),['Térreo','1º subsolo','1º subsolo','Cobertura']);
assert.ok(pages.every(page=>page.items.every(item=>item.secao_id===page.items[0].secao_id)));
assert.equal(JSON.stringify(sections),original);
assert.deepEqual(paginate([{id:1,incluir:false},{id:2,incluir:true},{id:3,incluir:true}],4).map(p=>p.items.map(i=>i.id)),[[2,3]]);
assert.deepEqual(paginate([],4),[]);
assert.throws(()=>paginate([],3));
console.log('PASS: layouts, page break by section, selection, order, immutability');
