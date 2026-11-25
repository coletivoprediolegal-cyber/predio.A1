(function(root){
 'use strict';
 const layouts=[2,4,6,9,12,16,36];
 function paginate(items,defaultLayout,breakOnSection=true){
  const size=Number(defaultLayout);
  if(!layouts.includes(size))throw new Error('Layout inválido');
  const visible=(items||[]).filter(item=>item&&item.incluir);
  const pages=[];
  let page=null,previousSection=null;
  for(const item of visible){
   const section=item.secao_id?String(item.secao_id):'name:'+String(item.secao_nome||'').trim();
   if(!page||page.items.length===size||(breakOnSection&&section!==previousSection)){
    page={size,items:[]};
    pages.push(page);
   }
   page.items.push(item);
   previousSection=section;
  }
  return pages;
 }
 root.PLReportCore={layouts,paginate};
 if(typeof module!=='undefined')module.exports=root.PLReportCore;
})(typeof window==='undefined'?globalThis:window);
