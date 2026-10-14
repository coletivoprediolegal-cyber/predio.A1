(function(root){
 'use strict';
 const layouts=[1,2,4,6,9,12,16];
 function paginate(items,defaultLayout){
  if(!layouts.includes(defaultLayout))throw new Error('Layout inválido');
  const pages=[];let page=null;
  for(const item of items.filter(x=>x.incluir)){
   const size=item.fotos_por_pagina_override||defaultLayout;
   if(!layouts.includes(size))throw new Error('Layout inválido');
   if(!page||page.size!==size||page.items.length===size){page={size,items:[]};pages.push(page)}
   page.items.push(item);
  }
  return pages;
 }
 root.PLReportCore={layouts,paginate};
 if(typeof module!=='undefined')module.exports=root.PLReportCore;
})(typeof window==='undefined'?globalThis:window);
