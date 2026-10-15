(function(){
 'use strict';
 const sb=window.plSupabase;
 if(!sb)return;
 const html=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const box=document.createElement('div');
 box.id='pl-import-overlay';
 box.hidden=true;
 box.innerHTML='<div class="pl-import-shade"></div><section class="pl-import-panel" role="dialog" aria-modal="true" aria-label="Álbuns e fotografias"><button class="pl-import-close" type="button" aria-label="Fechar">×</button><div class="pl-import-content"></div></section>';
 document.body.append(box);
 const content=box.querySelector('.pl-import-content');
 let processing=false,abort=false,afterImport=null,selectedAlbum=null;
 function show(){box.hidden=false;document.body.style.overflow='hidden'}
 function close(){if(processing){abort=true;return}box.hidden=true;document.body.style.overflow='';content.replaceChildren()}
 box.querySelector('.pl-import-close').onclick=close;
 box.querySelector('.pl-import-shade').onclick=close;
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!box.hidden&&!processing)close()});
 async function admin(){
  const {data:{session},error:e}=await sb.auth.getSession();
  if(e||!session)throw new Error('Faça login com Google para criar álbuns profissionais.');
  const {data:profile,error}=await sb.rpc('pl_meu_perfil');
  if(error||!profile?.ativo||profile.papel!=='administrador')throw new Error('A criação e importação de álbuns está habilitada apenas para administradores autorizados.');
 }
 function formatDate(date){const d=date||new Date();return new Date(d).toLocaleDateString('pt-BR')}
 async function create(jobId,onCreated){
  try{await admin()}catch(e){alert(e.message);return}
  show();
  const today=new Date();
  const date=new Date(today.getTime()-today.getTimezoneOffset()*60000).toISOString().slice(0,10);
  content.innerHTML='<div class="pl-import-eyebrow">PRÉDIO LEGAL · ÁLBUM</div><h2>Novo álbum fotográfico</h2><p class="pl-import-description">O álbum ficará vinculado ao job e terá a mesma organização utilizada pelo relatório fotográfico.</p>'+
   '<form id="pl-new-album-form"><label>Nome do álbum<input name="titulo" autocomplete="off" maxlength="150" required minlength="3" placeholder="Ex.: Fachadas e revestimentos"></label>'+
   '<label>Data de referência<input name="data" type="date" required value="'+date+'"></label>'+
   '<label>Assunto <small>opcional</small><input name="assunto" autocomplete="off" maxlength="300" placeholder="Ex.: Vistoria inicial"></label>'+
   '<div class="pl-import-actions"><button type="button" class="pl-import-secondary" id="pl-new-album-cancel">Cancelar</button><button class="pl-import-primary" type="submit">Criar álbum</button></div>'+
   '<p class="pl-import-status" role="status"></p></form>';
  content.querySelector('#pl-new-album-cancel').onclick=close;
  content.querySelector('#pl-new-album-form').onsubmit=async event=>{
   event.preventDefault();if(processing)return;
   const form=event.currentTarget,button=form.querySelector('[type=submit]'),status=form.querySelector('.pl-import-status');
   const titulo=form.elements.titulo.value.trim(),data=form.elements.data.value,assunto=form.elements.assunto.value.trim();
   if(titulo.length<3||!data)return;
   processing=true;button.disabled=true;status.textContent='Criando álbum…';
   try{
    const {data:id,error}=await sb.rpc('pl_album_criar_profissional',{p_job_id:jobId,p_titulo:titulo,p_data:data,p_assunto:assunto});
    if(error||!id)throw error||new Error('Não foi possível criar o álbum.');
    processing=false;close();
    if(typeof onCreated==='function')await onCreated(id);
   }catch(e){status.textContent=e.message||'Não foi possível criar o álbum.';processing=false;button.disabled=false}
  };
  content.querySelector('input[name=titulo]').focus();
 }
 function mimeType(file){
  const ext=(file.name.split('.').pop()||'').toLowerCase();
  if(['jpg','jpeg'].includes(ext))return{extension:ext,mime:'image/jpeg'};
  if(ext==='png')return{extension:ext,mime:'image/png'};
  if(ext==='webp')return{extension:ext,mime:'image/webp'};
  if(ext==='heic')return{extension:ext,mime:'image/heic'};
  if(ext==='heif')return{extension:ext,mime:'image/heif'};
  return null;
 }
 async function pickPhotos(albumId,onImported){
  try{await admin()}catch(e){alert(e.message);return}
  const input=document.createElement('input');
  input.type='file';input.accept='image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif';
  input.multiple=true;
  input.style.cssText='position:fixed;left:-10000px;top:0';
  document.body.append(input);
  input.onchange=()=>{
   const files=Array.from(input.files||[]);
   input.remove();
   if(!files.length)return;
   selectedAlbum=albumId;afterImport=onImported;
   uploadFiles(files).catch(e=>{console.error('Importação:',e);alert('Erro na importação: '+e.message)});
  };
  input.click();
 }
 async function uploadFiles(files){
  if(processing)return;
  show();processing=true;abort=false;
  let saved=0,failed=0;
  const maxMB=50;
  content.innerHTML='<div class="pl-import-eyebrow">FOTOGRAFIAS</div><h2>Importando fotografias</h2>'+
   '<p class="pl-import-description">Os arquivos originais serão armazenados no Supabase e vinculados ao álbum, mantendo a resolução disponível no arquivo selecionado.</p>'+
   '<div class="pl-import-count"><strong id="pl-import-finished">0</strong> de <strong>'+files.length+'</strong> fotografias</div>'+
   '<progress max="'+files.length+'" value="0" id="pl-import-progress"></progress>'+
   '<p id="pl-import-current" class="pl-import-current">Iniciando…</p>'+
   '<div class="pl-import-actions"><button type="button" class="pl-import-secondary" id="pl-import-abort">Parar após esta foto</button></div>'+
   '<p class="pl-import-status" id="pl-import-errors" role="status"></p>';
  content.querySelector('#pl-import-abort').onclick=()=>{abort=true;content.querySelector('#pl-import-abort').disabled=true;content.querySelector('#pl-import-abort').textContent='Parando…'};
  for(let index=0;index<files.length;index++){
   if(abort)break;
   const file=files[index],spec=mimeType(file);
   const current=content.querySelector('#pl-import-current');
   if(current)current.textContent='Foto '+(index+1)+' · '+file.name;
   if(!spec||file.size<1||file.size>maxMB*1024*1024){failed++;content.querySelector('#pl-import-errors').textContent='Alguns arquivos não são suportados ou excedem 50 MB.'}
   else{
    const name=selectedAlbum+'/'+crypto.randomUUID()+'.'+spec.extension;
    try{
     const upload=await sb.storage.from('predio-legal-fotos').upload(name,file,{contentType:spec.mime,cacheControl:'3600',upsert:false});
     if(upload.error)throw upload.error;
     const record=await sb.rpc('pl_album_foto_registrar',{p_album_id:selectedAlbum,p_caminho:name,p_nome:file.name,
      p_mime:spec.mime,p_bytes:file.size,p_largura:null,p_altura:null});
     if(record.error||!record.data)throw record.error||new Error('Não foi possível registrar a fotografia');
     saved++;
    }catch(e){
     failed++;console.warn('Não foi possível importar',file.name,e);
     content.querySelector('#pl-import-errors').textContent='Houve '+failed+' falha(s) de importação; os demais arquivos continuarão.';
    }
   }
   content.querySelector('#pl-import-progress').value=index+1;
   content.querySelector('#pl-import-finished').textContent=String(index+1);
  }
  processing=false;
  const imported=content.querySelector('#pl-import-current');
  if(imported)imported.textContent=saved+' foto(s) importadas · '+failed+' falha(s)'+(abort?' · Importação interrompida':'');
  const actions=content.querySelector('.pl-import-actions');
  if(actions)actions.innerHTML='<button class="pl-import-primary" type="button" id="pl-import-done">Voltar ao álbum</button>';
  if(typeof afterImport==='function'){
   try{await afterImport(saved)}catch(e){console.warn('Galeria não atualizada:',e)}
  }
  content.querySelector('#pl-import-done').onclick=close;
 }
 window.PLAlbumImport={create,pickPhotos};
})();
