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
 async function pickDevicePhotos(albumId,onImported){
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
 
 // A seleção em nuvem é sempre iniciada por gesto do usuário; não acessa a biblioteca inteira.
 let pickerSession=null,pickerAlbum=null,pickerCallback=null,pickerPolling=false,pickerStopped=false;
 async function googleApi(action,details={}){
  const {data:{session}}=await sb.auth.getSession();
  if(!session?.provider_token)throw new Error('Autorize o Google Fotos para selecionar fotografias.');
  const {data:response,error}=await sb.functions.invoke('pl-google-photos',{
   body:{action,googleToken:session.provider_token,...details}
  });
  if(error)throw new Error('Importação indisponível: '+(error.message||'serviço não respondeu'));
  if(response?.error)throw new Error(response.error);
  return response;
 }
 async function googleConsent(){
  sessionStorage.setItem('pl-google-pending-album',pickerAlbum);
  const {error}=await sb.auth.signInWithOAuth({
   provider:'google',options:{
    redirectTo:location.origin+location.pathname,
    scopes:'https://www.googleapis.com/auth/photospicker.mediaitems.readonly',
    queryParams:{prompt:'consent'}
   }
  });
  if(error)throw error;
 }
 function googleMessage(text,warning=false){
  const status=content.querySelector('.pl-import-status');
  if(status){status.textContent=text;status.style.color=warning?'#a33f34':''}
 }
 async function googlePhotos(albumId,onImported){
  try{await admin()}catch(e){alert(e.message);return}
  pickerAlbum=albumId;pickerCallback=onImported||null;pickerPolling=false;pickerStopped=false;show();
  content.innerHTML='<div class="pl-import-eyebrow">FOTOGRAFIAS</div><h2>Google Fotos</h2>'+
   '<p class="pl-import-description">Escolha várias fotografias no seletor oficial do Google. Elas serão copiadas para este álbum do Prédio Legal, sem apagar os originais.</p>'+
   '<p class="pl-import-status" role="status">Abrindo seletor…</p>'+
   '<div class="pl-import-actions"><button class="pl-import-secondary" id="pl-google-consent">Autorizar Google Fotos</button><button class="pl-import-secondary" id="pl-google-cancel">Cancelar</button></div>';
  content.querySelector('#pl-google-cancel').onclick=()=>{pickerPolling=false;close()};
  content.querySelector('#pl-google-consent').onclick=async()=>{try{await googleConsent()}catch(e){googleMessage(e.message,true)}};
  let result;
  try{result=await googleApi('create')}
  catch(e){googleMessage(e.message+' Se ainda não autorizou a seleção, toque em “Autorizar Google Fotos”.',true);return}
  if(!result?.id||!result?.pickerUri){googleMessage('O Google não retornou uma sessão de seleção.',true);return}
  pickerSession=result.id;pickerPolling=true;
  content.innerHTML='<div class="pl-import-eyebrow">FOTOGRAFIAS</div><h2>Selecionar no Google Fotos</h2>'+
   '<p class="pl-import-description">Toque em Abrir Google Fotos, selecione as imagens e conclua a escolha. A seleção pode conter centenas de fotografias.</p>'+
   '<div class="pl-import-actions"><a class="pl-import-primary" id="pl-google-open" href="'+html(result.pickerUri)+'" target="_blank" rel="noopener noreferrer">Abrir Google Fotos ↗</a>'+
   '<button type="button" class="pl-import-secondary" id="pl-google-check">Conferir seleção</button></div>'+
   '<p class="pl-import-status" role="status">Aguardando seleção…</p>';
  content.querySelector('#pl-google-check').onclick=checkGoogle;
  (async()=>{let delay=5000;
   while(pickerPolling&&!box.hidden){
    await new Promise(resolve=>setTimeout(resolve,delay));
    if(!pickerPolling||box.hidden)break;
    if(document.visibilityState==='hidden')continue;
    try{
     const status=await googleApi('status',{sessionId:pickerSession});
     if(status.mediaItemsSet){pickerPolling=false;await finishGooglePick();break}
     delay=Math.max(2000,Math.min(15000,parseFloat(status.pollingConfig?.pollInterval||'5')*1000));
    }catch(e){pickerPolling=false;googleMessage(e.message,true)}
   }
  })();
 }
 async function checkGoogle(){
  try{
   const status=await googleApi('status',{sessionId:pickerSession});
   if(status.mediaItemsSet){pickerPolling=false;await finishGooglePick()}
   else googleMessage('Conclua a seleção no Google Fotos e retorne ao Prédio Legal.');
  }catch(e){googleMessage(e.message,true)}
 }
 async function finishGooglePick(){
  try{
   let items=[],token='';
   do{
    const r=await googleApi('list',{sessionId:pickerSession,...(token?{pageToken:token}:{})});
    items.push(...(r.mediaItems||[]));token=r.nextPageToken||'';
   }while(token);
   const selected=items.filter(item=>item.type==='PHOTO');
   content.innerHTML='<div class="pl-import-eyebrow">FOTOGRAFIAS</div><h2>Importar para o álbum</h2>'+
    '<p class="pl-import-description">'+selected.length+' fotografias selecionadas'+(items.length>selected.length?' · '+(items.length-selected.length)+' vídeos ignorados':'')+'. Os arquivos serão importados um de cada vez, mantendo a resolução disponível.</p>'+
    '<div class="pl-import-actions"><button type="button" class="pl-import-primary" id="pl-google-import" '+(selected.length?'':'disabled')+'>Importar '+selected.length+' fotografias</button>'+
    '<button type="button" class="pl-import-secondary" id="pl-google-back">Cancelar</button></div>'+
    '<progress max="'+selected.length+'" value="0" id="pl-google-progress"></progress><p class="pl-import-status" role="status"></p>';
   content.querySelector('#pl-google-back').onclick=()=>{pickerStopped=true;close()};
   content.querySelector('#pl-google-import').onclick=()=>importGoogleItems(selected);
  }catch(e){googleMessage(e.message,true)}
 }
 async function importGoogleItems(items){
  if(processing)return;processing=true;pickerStopped=false;
  let saved=0,duplicates=0,failed=0,firstError='';
  const btn=content.querySelector('#pl-google-import'),cancel=content.querySelector('#pl-google-back');
  btn.disabled=true;cancel.textContent='Parar após esta foto';cancel.onclick=()=>{pickerStopped=true;cancel.disabled=true};
  for(let i=0;i<items.length&&!pickerStopped;i++){
   googleMessage('Importando '+(i+1)+' de '+items.length+'…');
   try{
    const res=await googleApi('import',{albumId:pickerAlbum,item:items[i]});
    if(res.duplicada)duplicates++;else saved++;
   }catch(e){
    failed++;if(!firstError)firstError=e.message;
    if(/expirad|Autorize|Sessão/.test(e.message||''))break;
   }
   content.querySelector('#pl-google-progress').value=i+1;
  }
  processing=false;
  googleMessage(saved+' importadas · '+duplicates+' já existentes · '+failed+' com falha.'+(firstError?' '+firstError:''),failed>0);
  content.querySelector('.pl-import-actions').innerHTML='<button class="pl-import-primary" id="pl-google-done" type="button">Voltar ao álbum</button>';
  if(typeof pickerCallback==='function'){try{await pickerCallback(saved)}catch(e){console.warn(e)}}
  content.querySelector('#pl-google-done').onclick=close;
  if(pickerSession){googleApi('cleanup',{sessionId:pickerSession}).catch(()=>{});pickerSession=null}
 }
 async function pickPhotos(albumId,onImported){
  try{await admin()}catch(e){alert(e.message);return}
  show();pickerPolling=false;
  content.innerHTML='<div class="pl-import-eyebrow">FOTOGRAFIAS</div><h2>Adicionar fotografias</h2>'+
   '<p class="pl-import-description">Selecione muitas imagens de uma só vez. Não é necessário inseri-las individualmente.</p>'+
   '<div class="pl-import-actions"><button type="button" class="pl-import-primary" id="pl-from-google">Google Fotos</button>'+
   '<button type="button" class="pl-import-secondary" id="pl-from-device">Do dispositivo</button></div>';
  content.querySelector('#pl-from-google').onclick=()=>googlePhotos(albumId,onImported);
  content.querySelector('#pl-from-device').onclick=()=>{close();pickDevicePhotos(albumId,onImported)};
 }
 // Restaurar a seleção iniciada antes do redirecionamento do Google OAuth.
 sb.auth.getSession().then(async({data})=>{
  const pending=sessionStorage.getItem('pl-google-pending-album');
  if(pending&&data.session){
   sessionStorage.removeItem('pl-google-pending-album');
   await googlePhotos(pending,null);
  }
 }).catch(console.warn);

 window.PLAlbumImport={create,pickPhotos,pickGooglePhotos:googlePhotos};
})();
