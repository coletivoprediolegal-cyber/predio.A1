(function(root){
 'use strict';
 const layouts=[2,4,6,9,12,16,36];
 function paginate(items,defaultLayout){
  const size=Number(defaultLayout);
  if(!layouts.includes(size))throw new Error('Layout inválido');
  const visible=(items||[]).filter(item=>item&&item.incluir);
  const pages=[];
  for(let i=0;i<visible.length;i+=size){
   pages.push({size,items:visible.slice(i,i+size)});
  }
  return pages;
 }
 root.PLReportCore={layouts,paginate};
 if(typeof module!=='undefined')module.exports=root.PLReportCore;
})(typeof window==='undefined'?globalThis:window);
