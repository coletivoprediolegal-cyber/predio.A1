(function(){
 'use strict';
 const sb=window.plSupabase;
 if(!sb)return;
 const bucket=sb.storage.from('predio-legal-fotos');
 const transparent='data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';
 let observer=null,albumVersion=0,active=0;
 const queue=[],queued=new Set();
 async function original(photo){
  if(photo.url)return photo.url;
  const {data,error}=await bucket.createSignedUrl(photo.arquivo_caminho,3600);
  if(error||!data?.signedUrl)throw error||new Error('Foto indisponível');
  photo.url=data.signedUrl;
  return photo.url;
 }
 async function makeJpeg(blob){
  const bitmap=await createImageBitmap(blob);
  try{
   const scale=Math.min(1,480/Math.max(bitmap.width,bitmap.height));
   const canvas=document.createElement('canvas');
   canvas.width=Math.max(1,Math.round(bitmap.width*scale));
   canvas.height=Math.max(1,Math.round(bitmap.height*scale));
   canvas.getContext('2d').drawImage(bitmap,0,0,canvas.width,canvas.height);
   return await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('Falha ao reduzir imagem')),'image/jpeg',0.72));
  }finally{bitmap.close()}
 }
 async function fill(item){
  const {photo,img,albumId,version}=item;
  if(version!==albumVersion||!img.isConnected)return;
  try{
   const url=await original(photo);
   if(version!==albumVersion||!img.isConnected)return;
   const response=await fetch(url);
   if(!response.ok)throw new Error('Foto original indisponível');
   const blob=await makeJpeg(await response.blob());
   if(version!==albumVersion||!img.isConnected)return;
   const path=albumId+'/thumbs/'+photo.id+'.jpg';
   const uploaded=await bucket.upload(path,blob,{contentType:'image/jpeg',cacheControl:'31536000',upsert:false});
   if(uploaded.error && !/already exists|duplicate|409/i.test(uploaded.error.message||''))throw uploaded.error;
   const saved=await sb.rpc('pl_registrar_miniatura',{p_album_id:albumId,p_foto_id:photo.id,p_caminho:path});
   if(saved.error||saved.data!==true)throw saved.error||new Error('Não foi possível registrar a miniatura');
   const signed=await bucket.createSignedUrl(path,3600);
   if(signed.error||!signed.data?.signedUrl)throw signed.error||new Error('Miniatura indisponível');
   photo.thumbUrl=signed.data.signedUrl;
   if(version===albumVersion&&img.isConnected)img.src=photo.thumbUrl;
  }catch(e){
   console.warn('Miniatura indisponível para a foto',photo.id,e);
   if(version===albumVersion&&img.isConnected){
    try{img.src=await original(photo)}catch{}
   }
  }
 }
 function pump(){
  while(active<2&&queue.length){
   const item=queue.shift();
   if(item.version!==albumVersion||!item.img.isConnected)continue;
   active++;
   fill(item).finally(()=>{active--;pump()});
  }
 }
 function mount(photos,albumId,grid){
  albumVersion++;
  queue.length=0;queued.clear();
  observer?.disconnect();
  const version=albumVersion;
  const byId=new Map(photos.map(p=>[String(p.id),p]));
  observer=new IntersectionObserver(entries=>{
   for(const entry of entries){
    if(!entry.isIntersecting)continue;
    observer.unobserve(entry.target);
    const img=entry.target,photo=byId.get(img.dataset.plThumb);
    if(!photo||queued.has(photo.id))continue;
    queued.add(photo.id);
    queue.push({photo,img,albumId,version});
   }
   pump();
  },{rootMargin:'250px'});
  grid.querySelectorAll('img[data-pl-thumb]').forEach(img=>{const photo=byId.get(img.dataset.plThumb);if(photo&&!photo.thumbUrl&&!photo.thumbPending)observer.observe(img)});
 }
 async function prepare(photos,albumId){
  const missing=photos.filter(p=>p.arquivo_caminho);
  if(!missing.length)return;
  missing.forEach(p=>p.thumbPending=true);
  try{
   const {data:paths,error}=await sb.rpc('pl_album_miniaturas',{p_album_id:albumId});
   if(error){console.warn('Miniaturas indisponíveis:',error);return}
   const entries=missing.filter(p=>paths?.[p.id]);
   await Promise.all(Array.from({length:Math.ceil(entries.length/100)},async(_,i)=>{
    const batch=entries.slice(i*100,(i+1)*100);
    const result=await bucket.createSignedUrls(batch.map(p=>paths[p.id]),3600);
    if(result.error){console.warn('Falha ao carregar miniaturas:',result.error);return}
    batch.forEach((p,index)=>p.thumbUrl=result.data?.[index]?.signedUrl||'');
   }));
  }finally{missing.forEach(p=>p.thumbPending=false)}
 }

 let bulkRunning=false;
 async function backfillAll(onProgress){
  if(bulkRunning)return;
  bulkRunning=true;
  let done=0,failed=0,total=0,firstError='';
  try{
   const {data:pending,error}=await sb.rpc('pl_miniaturas_pendentes',{p_limite:500});
   if(error)throw error;
   if(!Array.isArray(pending))throw new Error('Lista de miniaturas indisponível');
   total=pending.length;
   onProgress({done,failed,total,firstError});
   let cursor=0;
   async function worker(){
    while(cursor<total){
     const item=pending[cursor++];
     try{
      const {data:signed,error:signError}=await bucket.createSignedUrl(item.arquivo_caminho,900);
      if(signError||!signed?.signedUrl)throw signError||new Error('Original indisponível');
      const response=await fetch(signed.signedUrl);
      if(!response.ok)throw new Error('Falha ao baixar original');
      const blob=await makeJpeg(await response.blob());
      const path=item.album_id+'/thumbs/'+item.id+'.jpg';
      const uploaded=await bucket.upload(path,blob,{contentType:'image/jpeg',cacheControl:'31536000',upsert:false});
      if(uploaded.error && !/already exists|duplicate|409/i.test(uploaded.error.message||''))throw uploaded.error;
      const saved=await sb.rpc('pl_registrar_miniatura',{p_album_id:item.album_id,p_foto_id:item.id,p_caminho:path});
      if(saved.error||saved.data!==true)throw saved.error||new Error('Registro não concluído');
      done++;
     }catch(e){failed++;if(!firstError)firstError=String(e?.message||e);console.warn('Miniatura antiga:',item.id,e)}
     onProgress({done,failed,total});
    }
   }
   await Promise.all([worker(),worker()]);
   return {done,failed,total,firstError};
  }finally{bulkRunning=false}
 }
 window.PLAlbumThumbs={mount,prepare,original,transparent,backfillAll};
})();
