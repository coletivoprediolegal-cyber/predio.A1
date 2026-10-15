(function(){
 'use strict';
 const sb=window.plSupabase,core=window.PLReportCore;
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dialog=document.createElement('section');dialog.className='rf-dialog';dialog.hidden=true;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','Relatório fotográfico');document.body.append(dialog);
 let state=null,dirty=false,busy=false,opener=null,revision=0;
 let albumChanged=false;
 const urls=new Set();
 function release(){urls.forEach(u=>URL.revokeObjectURL(u));urls.clear()}
 function error(e){const box=dialog.querySelector('.rf-message');if(box)box.textContent=e.message||String(e)}
 let pendingDiscard=null;
 async function discard(){
  if(!dirty)return true;if(pendingDiscard)return pendingDiscard;
  pendingDiscard=new Promise(resolve=>{
   const box=document.createElement('div');box.className='rf-confirm';box.setAttribute('role','alertdialog');box.setAttribute('aria-label','Alterações não salvas');
   const text=document.createElement('p');text.textContent='Há alterações não salvas neste relatório.';box.append(text);
   for(const [label,value] of [['Continuar editando',false],['Descartar alterações',true]]){const button=document.createElement('button');button.textContent=label;button.onclick=()=>{box.remove();pendingDiscard=null;resolve(value)};box.append(button)}
   dialog.prepend(box);box.querySelector('button').focus();
  });return pendingDiscard;
 }
 async function check(result){const {data,error:e}=await result;if(e)throw e;return data}
 async function sourceURL(f){
  const u=f.metadados?.demo===true||f.metadados?.demo==='true'?f.metadados?.referencia_url:null;
  if(u&&/^https:\/\/images\.unsplash\.com\/photo-/.test(u))return u;
  if(f.arquivo_caminho){const blob=await check(sb.storage.from('predio-legal-fotos').download(f.arquivo_caminho));const u=URL.createObjectURL(blob);urls.add(u);return u}
  throw new Error('Fotografia original indisponível: '+(f.nome_original||f.id));
 }
 async function start(albumId){
  if(busy)return;
  if(!(await discard()))return;
  const generation=++revision;
  albumChanged=false;
  opener=document.activeElement;dialog.hidden=false;
  dialog.innerHTML='<p>Preparando relatório a partir da organização do álbum…</p>';
  busy=true;release();
  try{
   let album,links,sections=[],demo=false,empreendimento='';
   const demoData=await sb.rpc('pl_demo_album_photos',{p_album_id:albumId});
   if(!demoData.error&&demoData.data?.titulo){
    demo=true;
    const d=demoData.data;
    album={id:albumId,titulo:d.titulo,assunto:d.assunto||'',data_vistoria:d.data};
    const members=await sb.rpc('pl_demo_album_sections',{p_album_id:albumId});
    if(!members.error&&Array.isArray(members.data))sections=members.data;
    links=(d.fotos||[]).map(f=>({ordem:f.numero,secao_id:f.secao_id,fotografias:{
      id:f.id,metadados:{demo:true,referencia_url:f.url},nome_original:f.nome,
      destaque:f.destaque,nivel_anomalia:f.anomalia,observacao_tecnica:f.observacao,
      oculta_relatorio:f.oculta,excluida_em:f.excluida?'excluida':null
    }}));
    try{
     const directory=await check(sb.rpc('pl_demo_client_directory'));
     for(const client of directory||[]){
      if((client.jobs||[]).some(j=>(d.fotos||[]).some(f=>(f.jobs||[]).some(fj=>fj.id===j.id)))){const job=(client.jobs||[]).find(j=>(d.fotos||[]).some(f=>(f.jobs||[]).some(fj=>fj.id===j.id)));empreendimento=job?.empreendimento||client.empreendimentos?.[0]?.nome||client.nome;break}
     }
    }catch(e){console.warn('Empreendimento da demonstração indisponível',e)}
   }else{
    const auth=await sb.auth.getSession();
    if(!auth.data?.session)throw new Error('Entre com Google em Minha conta para criar relatórios profissionais.');
    album=await check(sb.from('albuns').select('*').eq('id',albumId).single());
    links=await check(sb.from('album_fotografias').select('ordem,secao_id,fotografias(*)').eq('album_id',albumId).order('ordem'));
    try{sections=await check(sb.from('album_secoes').select('id,nome').eq('album_id',albumId).order('ordem'))}catch(e){sections=[]}
    try{
     const rel=await check(sb.from('album_jobs').select('jobs(titulo,clientes(nome))').eq('album_id',albumId).limit(1));
     empreendimento=rel?.[0]?.jobs?.clientes?.nome||rel?.[0]?.jobs?.titulo||'';
    }catch(e){console.warn('Identificação do empreendimento indisponível',e)}
   }
   if(generation!==revision)return;
   const sectionNames=new Map(sections.map(x=>[x.id,x.nome]));
   state={album,id:null,demo,empreendimento,titulo:'Relatório fotográfico',
    descricao:'',layout:12,items:[]};
   for(const link of links){
    const f=link.fotografias;
    if(!f||f.excluida_em)continue;
    let url;
    try{url=await sourceURL(f)}catch(e){console.warn(e);continue}
    if(generation!==revision){release();return}
    state.items.push({
     fotografia_id:f.id,source:f,url,numero:link.ordem,secao_id:link.secao_id||null,
     secao_nome:sectionNames.get(link.secao_id)||'',
     incluir:!([true,'true'].includes(f.metadados?.oculta_relatorio)||f.oculta_relatorio===true),
     legenda:f.observacao_tecnica||'',
     observacao:f.observacao_tecnica||'',destaque_no_relatorio:!!f.destaque,
     fotos_por_pagina_override:null
    });
   }
   const visibleTotal=state.items.filter(i=>i.incluir).length;
   state.layout=visibleTotal<=2?2:visibleTotal<=4?4:visibleTotal<=6?6:visibleTotal<=9?9:12;
   dirty=false;render();
   if(demo)error({message:'Prévia demonstrativa: imagens ilustrativas. A ordem e os destaques acompanham o álbum.'});
  }catch(e){
   if(generation!==revision)return;
   release();dialog.innerHTML='<button id="rf-close">Fechar</button><p class="rf-message"></p>';
   dialog.querySelector('button').onclick=close;error(e)
  }finally{busy=false}
 }
 async function close(){if(busy)return;if(!(await discard()))return;const changed=albumChanged,albumId=state?.album?.id;dialog.hidden=true;release();state=null;dirty=false;albumChanged=false;document.querySelector('#rf-print')?.remove();if(changed&&albumId)window.dispatchEvent(new CustomEvent('pl:report-album-updated',{detail:{albumId}}));opener?.focus()}
 function options(selected){return core.layouts.map(n=>'<option value="'+n+'" '+(n===selected?'selected':'')+'>'+n+' fotos por página</option>').join('')}
 let previewIndex=0,editFilter='all',editQuery='',editsVisible=30;
 function totalPages(){return core.paginate(state.items,state.layout).length}
 function countIncluded(){return state.items.filter(i=>i.incluir).length}
 function render(){
  previewIndex=0;editFilter='all';editQuery='';editsVisible=30;
  const total=state.items.length,shown=countIncluded();
  const highlights=state.items.filter(i=>i.incluir&&i.destaque_no_relatorio).length;
  const anomalies=state.items.filter(i=>i.incluir&&i.source.nivel_anomalia).length;
  dialog.innerHTML='<div class="rf-editor-head"><button type="button" id="rf-close" class="rf-back">‹ Voltar ao álbum</button>'+
   '<h1>Relatório fotográfico</h1>'+
   '<p class="rf-source">'+escape(state.album.titulo)+' · <span id="rf-photo-count">'+shown+' de '+total+' fotos</span>'+
   '<span class="rf-source-separator">·</span> <span id="rf-mark-count">'+highlights+' destaques · '+anomalies+' anomalias</span></p></div>'+
   '<div class="rf-editor-tools"><label>Fotos por página <select id="rf-layout">'+options(state.layout)+'</select></label>'+
   '<button type="button" id="rf-pdf" class="rf-primary">Exportar PDF</button></div>'+
   '<p class="rf-message" role="status" aria-live="polite"></p>'+
   '<section class="rf-preview-area" aria-label="Prévia do relatório"><div class="rf-preview-top">'+
   '<strong>Prévia A4</strong><div class="rf-page-tools"><button id="rf-page-prev" type="button" aria-label="Página anterior">‹</button>'+
   '<span id="rf-preview-count"></span><button id="rf-page-next" type="button" aria-label="Próxima página">›</button></div></div>'+
   '<div class="rf-preview" aria-label="Prévia da página selecionada"></div></section>'+
   '<details class="rf-advanced" id="rf-advanced"><summary>Ajustes opcionais <span>Fotos e observações</span></summary>'+
   '<div class="rf-advanced-inner"><p>Arraste a miniatura ou ⠿ para ordenar · ★ Destaque · ⚠ Anomalia (cinza → amarelo → vermelho → cinza).</p>'+
   (!state.demo?'<div class="rf-save-settings"><label>Nome do relatório<input type="text" id="rf-title" maxlength="160" value="'+escape(state.titulo)+'"></label>'+
   '<div class="rf-advanced-save"><button id="rf-save" type="button">Salvar relatório</button><button id="rf-load" type="button">Abrir relatório salvo</button></div></div>':'')+
   '<div class="rf-edit-tools"><label>Exibir <select id="rf-edit-filter"><option value="all">Todas as fotos</option><option value="highlight">Destaques</option>'+
   '<option value="anomaly">Anomalias</option><option value="note">Com observação</option><option value="hidden">Ocultas</option></select></label>'+
   '<label>Buscar foto <input id="rf-photo-search" type="search" placeholder="Número ou texto"></label></div>'+
   '<div id="rf-items" class="rf-items"></div>'+
   '<button id="rf-more" type="button" hidden>Mostrar mais fotos</button></div></details>';
  dialog.querySelector('#rf-close').onclick=close;
  dialog.querySelector('#rf-layout').onchange=e=>{state.layout=Number(e.target.value);previewIndex=0;dirty=true;preview()};
  dialog.querySelector('#rf-pdf').onclick=exportPDF;
  dialog.querySelector('#rf-page-prev').onclick=()=>{previewIndex=Math.max(0,previewIndex-1);preview()};
  dialog.querySelector('#rf-page-next').onclick=()=>{previewIndex=Math.min(totalPages()-1,previewIndex+1);preview()};
  dialog.querySelector('#rf-advanced').addEventListener('toggle',e=>{if(e.target.open)rows()});
  dialog.querySelector('#rf-edit-filter').onchange=e=>{editFilter=e.target.value;editsVisible=30;rows()};
  dialog.querySelector('#rf-photo-search').oninput=e=>{editQuery=e.target.value.trim().toLowerCase();editsVisible=30;rows()};
  dialog.querySelector('#rf-more').onclick=()=>{appendMoreRows()};
  if(!state.demo){
   dialog.querySelector('#rf-title').oninput=e=>{state.titulo=e.target.value;dirty=true};
   dialog.querySelector('#rf-save').onclick=save;
   dialog.querySelector('#rf-load').onclick=load;
  }
  preview();
 }
 function updateCounts(){
  const el=dialog.querySelector('#rf-photo-count');
  if(el)el.textContent=countIncluded()+' de '+state.items.length+' fotos';
  const marks=dialog.querySelector('#rf-mark-count');
  if(marks)marks.textContent=
   state.items.filter(i=>i.incluir&&i.destaque_no_relatorio).length+' destaques · '+
   state.items.filter(i=>i.incluir&&i.source.nivel_anomalia).length+' anomalias';
 }
 function filteredItems(){
  return state.items.map((item,index)=>({item,index})).filter(({item})=>{
   if(editFilter==='highlight'&&!item.destaque_no_relatorio)return false;
   if(editFilter==='anomaly'&&!item.source.nivel_anomalia)return false;
   if(editFilter==='note'&&!item.legenda?.trim())return false;
   if(editFilter==='hidden'&&item.incluir)return false;
   return !editQuery||String(item.numero).includes(editQuery)||(item.legenda||'').toLowerCase().includes(editQuery);
  });
 }
 let reportWritePending=false,photoDrag=null,scrollFrame=0;
 function nextAnomaly(current){return current==='amarela'?'vermelha':current==='vermelha'?null:'amarela'}
 function anomalyLabel(level){
  return level==='amarela'?'Anomalia amarela; tocar para vermelha':
         level==='vermelha'?'Anomalia vermelha; tocar para remover':'Sem anomalia; tocar para marcar';
 }
 async function editAlbumPhoto(item,action){
  if(reportWritePending)return;
  const original=action==='anomalia'?item.source.nivel_anomalia:!!item.destaque_no_relatorio;
  const value=action==='anomalia'?nextAnomaly(original):!original;
  reportWritePending=true;
  if(action==='anomalia')item.source.nivel_anomalia=value;
  else{item.destaque_no_relatorio=value;item.source.destaque=value}
  try{
   preview();rows();
   const payload=action==='anomalia'?{id:item.fotografia_id,nivel:value}:{id:item.fotografia_id,destaque:value};
   const result=await sb.rpc('pl_report_album_edit',{p_album_id:state.album.id,p_action:action,p_payload:payload});
   if(result.error||!result.data?.ok)throw result.error||new Error('Não foi possível confirmar a alteração');
   albumChanged=true;
   error({message:''});
  }catch(e){
   if(action==='anomalia')item.source.nivel_anomalia=original;
   else{item.destaque_no_relatorio=original;item.source.destaque=original}
   error({message:'Não foi possível salvar a classificação: '+(e.message||e)});
  }finally{reportWritePending=false;preview();rows()}
 }
 function filteredRows(){
  const visible=filteredItems();
  return {visible,shown:visible.slice(0,editsVisible)};
 }
 function rowMarkup(item,i){
  const notes=!!item.legenda?.trim(),highlight=!!item.destaque_no_relatorio;
  const anomaly=item.source.nivel_anomalia||null;
  const anomalyCls=anomaly==='vermelha'?'rf-anomaly-red':anomaly==='amarela'?'rf-anomaly-yellow':'';
  const info=notes?'▤ Nota':'';
  return '<article class="rf-row" data-index="'+i+'" data-photo-id="'+escape(item.fotografia_id)+'">'+
   '<img src="'+escape(item.url)+'" loading="lazy" alt="">'+
   '<div class="rf-row-body"><div class="rf-row-line">'+
    '<button type="button" class="rf-drag-handle" data-drag-handle title="Segure e arraste para mover a foto" aria-label="Arrastar foto '+escape(item.numero)+'">⠿</button>'+
    '<label class="rf-inclusion"><input type="checkbox" data-field="incluir" '+(item.incluir?'checked':'')+'> Foto '+escape(String(item.numero).padStart(2,'0'))+'</label>'+
    '<span class="rf-row-tags">'+info+'</span>'+
    '<button type="button" class="rf-mark rf-highlight-mark'+(highlight?' is-marked':'')+'" data-album-action="destaque"'+
    ' title="'+(highlight?'Retirar destaque':'Marcar como destaque')+'" aria-label="'+(highlight?'Retirar destaque':'Marcar como destaque')+'" aria-pressed="'+highlight+'">★</button>'+
    '<button type="button" class="rf-mark rf-anomaly-mark '+anomalyCls+'" data-album-action="anomalia"'+
    ' title="'+anomalyLabel(anomaly)+'" aria-label="'+anomalyLabel(anomaly)+'">'+
    '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 3.5 22 20.5H2L12 3.5Z" fill="currentColor"/><path d="M12 9v5.5" stroke="#fff" stroke-width="2.1" stroke-linecap="round"/><circle cx="12" cy="17.6" r="1.2" fill="#fff"/></svg></button>'+
    '<button type="button" data-edit-toggle aria-expanded="false">Editar</button></div>'+
    '<div class="rf-row-details" hidden><label>Observação desta foto<textarea maxlength="1000" data-field="legenda">'+escape(item.legenda)+'</textarea></label>'+
    '</div></div></article>';
 }
 function bindRow(row){
  const index=Number(row.dataset.index);
  row.querySelector('[data-edit-toggle]').onclick=e=>{
   const details=row.querySelector('.rf-row-details');
   details.hidden=!details.hidden;
   e.currentTarget.setAttribute('aria-expanded',String(!details.hidden));
   e.currentTarget.textContent=details.hidden?'Editar':'Fechar';
  };
  row.querySelector('[data-field="incluir"]').onchange=e=>{
   state.items[index].incluir=e.target.checked;
   dirty=true;preview();
   if(editFilter==='hidden')rows();
  };
  row.querySelector('[data-field="legenda"]').onchange=e=>{
   state.items[index].legenda=e.target.value;
   dirty=true;preview();
  };
  row.querySelectorAll('[data-album-action]').forEach(button=>button.onclick=()=>editAlbumPhoto(state.items[index],button.dataset.albumAction));
  row.querySelector('[data-drag-handle]').addEventListener('pointerdown',startReportDrag);
  row.querySelector('img').draggable=false;
  row.querySelector('img').addEventListener('pointerdown',startReportDrag);
 }
 function rows(){
  const target=dialog.querySelector('#rf-items');
  if(!target||!dialog.querySelector('#rf-advanced')?.open||photoDrag)return;
  const {visible,shown}=filteredRows();
  target.innerHTML=shown.map(({item,index})=>rowMarkup(item,index)).join('')||
   '<p class="rf-empty-filter">Nenhuma foto encontrada.</p>';
  target.querySelectorAll('.rf-row').forEach(bindRow);
  const more=dialog.querySelector('#rf-more');
  if(more){
   more.hidden=visible.length<=editsVisible;
   more.textContent='Mostrar mais fotos ('+Math.max(0,visible.length-editsVisible)+' restantes)';
  }
 }
 function appendMoreRows(){
  const target=dialog.querySelector('#rf-items');
  if(!target)return;
  const {visible}=filteredRows();
  const start=editsVisible;
  const end=Math.min(start+30,visible.length);
  if(end<=start)return;
  const wrapper=document.createElement('div');
  wrapper.innerHTML=visible.slice(start,end).map(({item,index})=>rowMarkup(item,index)).join('');
  while(wrapper.firstElementChild){
   const row=wrapper.firstElementChild;
   target.appendChild(row);
   bindRow(row);
  }
  editsVisible=end;
  const more=dialog.querySelector('#rf-more');
  if(more){more.hidden=end>=visible.length;more.textContent='Mostrar mais fotos ('+(visible.length-end)+' restantes)'}
 }
 function startReportDrag(e){
  if(e.button!==0&&e.pointerType==='mouse'||photoDrag||reportWritePending)return;
  const row=e.currentTarget.closest('.rf-row');
  if(!row)return;
  e.preventDefault();
  const g={
   pointerId:e.pointerId,row,handle:e.currentTarget,startX:e.clientX,startY:e.clientY,
   x:e.clientX,y:e.clientY,active:false,changed:false,ghost:null,timer:null
  };
  photoDrag=g;
  try{g.handle.setPointerCapture(e.pointerId)}catch(err){}
  g.timer=setTimeout(()=>{if(photoDrag===g)activateReportDrag(g)},125);
 }
 function activateReportDrag(g){
  if(g.active||!g.row.isConnected)return;
  g.active=true;
  const rect=g.row.getBoundingClientRect();
  const ghost=g.row.cloneNode(true);
  ghost.classList.add('rf-row-ghost');
  ghost.removeAttribute('data-index');ghost.removeAttribute('data-photo-id');
  ghost.style.left=rect.left+'px';ghost.style.top=rect.top+'px';ghost.style.width=rect.width+'px';
  ghost.style.height=rect.height+'px';ghost.style.transform='translate3d(0,0,0)';
  g.rect=rect;g.ghost=ghost;document.body.append(ghost);
  g.row.classList.add('rf-row-drag-source');
  if(navigator.vibrate)try{navigator.vibrate(12)}catch(err){}
  autoScrollReport();
 }
 function autoScrollReport(){
  if(scrollFrame)cancelAnimationFrame(scrollFrame);
  function step(){
   const g=photoDrag;
   if(!g||!g.active){scrollFrame=0;return}
   const edge=95,windowHeight=window.innerHeight;
   let velocity=0;
   if(g.y<edge)velocity=-Math.min(22,(edge-g.y)/3);
   else if(g.y>windowHeight-edge)velocity=Math.min(22,(g.y-(windowHeight-edge))/3);
   if(velocity)dialog.scrollTop+=velocity;
   const target=document.elementFromPoint(Math.max(0,Math.min(window.innerWidth-1,g.x)),Math.max(0,Math.min(window.innerHeight-1,g.y)))?.closest('.rf-row');
   if(target&&target!==g.row&&target.parentElement===g.row.parentElement){
    const rect=target.getBoundingClientRect();
    if(g.y>=rect.top+rect.height/2)target.after(g.row);
    else target.before(g.row);
    g.changed=true;
   }
   // When reaching the bottom, reveal another batch while keeping the dragged node.
   const list=dialog.querySelector('#rf-items');
   const last=list?.lastElementChild;
   if(last?.classList.contains('rf-row')&&editsVisible<filteredItems().length&&last.getBoundingClientRect().bottom<windowHeight+90){
    appendMoreRows();
   }
   scrollFrame=requestAnimationFrame(step);
  }
  scrollFrame=requestAnimationFrame(step);
 }
 function moveReportGhost(g,x,y){
  if(!g.ghost)return;
  g.ghost.style.transform='translate3d('+(x-g.startX)+'px,'+(y-g.startY)+'px,0)';
 }
 function onReportDragMove(e){
  const g=photoDrag;
  if(!g||g.pointerId!==e.pointerId)return;
  g.x=e.clientX;g.y=e.clientY;
  if(!g.active){
   if(Math.hypot(e.clientX-g.startX,e.clientY-g.startY)>5){
    clearTimeout(g.timer);activateReportDrag(g)
   }
  }
  if(g.active){e.preventDefault();moveReportGhost(g,g.x,g.y)}
 }
 async function commitReportDrag(e,cancel=false){
  const g=photoDrag;
  if(!g||g.pointerId!==e.pointerId)return;
  photoDrag=null;clearTimeout(g.timer);
  if(scrollFrame){cancelAnimationFrame(scrollFrame);scrollFrame=0}
  g.ghost?.remove();g.row.classList.remove('rf-row-drag-source');
  try{g.handle.releasePointerCapture(e.pointerId)}catch(err){}
  if(!g.active||cancel||!g.changed){rows();return}
  const list=dialog.querySelector('#rf-items');
  const indices=[...list.querySelectorAll('.rf-row')].map(row=>Number(row.dataset.index));
  const sorted=[...indices].sort((a,b)=>a-b);
  if(new Set(indices).size!==indices.length){rows();return}
  const original=state.items.slice();
  sorted.forEach((slot,n)=>{state.items[slot]=original[indices[n]]});
  const oldNumbers=[...original].map(item=>item.numero);
  reportWritePending=true;
  try{
   preview();rows();
   const result=await sb.rpc('pl_report_album_edit',{
    p_album_id:state.album.id,p_action:'reorder',
    p_payload:{ids:state.items.map(item=>item.fotografia_id)}
   });
   if(result.error||!result.data?.ok)throw result.error||new Error('Falha ao gravar a ordem');
   // Maintain the album's position-based numbering, including gaps from deleted photos.
   const positions=oldNumbers.slice().sort((a,b)=>Number(a)-Number(b));
   state.items.forEach((item,idx)=>{item.numero=positions[idx]});
   if(state.id)dirty=true;
   albumChanged=true;
   error({message:''});
  }catch(err){
   state.items=original;
   error({message:'A ordem anterior foi restaurada: '+(err.message||err)});
  }finally{reportWritePending=false;rows();preview()}
 }
 document.addEventListener('pointermove',onReportDragMove,{passive:false});
 document.addEventListener('pointerup',e=>{commitReportDrag(e).catch(console.error)});
 document.addEventListener('pointercancel',e=>{commitReportDrag(e,true).catch(console.error)});
 function sheets(previewOnly=false){
  const pages=core.paginate(state.items,state.layout);
  return pages.map((p,ix)=>{
   if(previewOnly&&ix!==previewIndex)return '';
   const columns=p.size===36?6:p.size===16?4:p.size>=9?3:p.size>=4?2:1;
   const rows=Math.ceil(p.size/columns);
   const name=state.empreendimento||state.album.titulo||'';
   const ref=state.album.data_vistoria?new Date(state.album.data_vistoria+'T12:00:00').toLocaleDateString('pt-BR'):'';
   const cells=p.items.map(i=>{
    const anomaly=i.source.nivel_anomalia;
    const note=(i.legenda||'').trim();
    const featured=i.destaque_no_relatorio;
    const cls='rf-cell'+(featured?' rf-featured':'');
    const anomalyClass=anomaly==='vermelha'?' rf-alert-red':' rf-alert-yellow';
    return '<figure class="'+cls+'" data-photo-number="'+escape(i.numero)+'"><div class="rf-photo"><img src="'+escape(i.url)+'" alt="Fotografia '+escape(i.numero)+'">'+
     '<span class="rf-number">'+(featured?'★ ':'')+escape(String(i.numero).padStart(2,'0'))+'</span>'+
     (anomaly?'<span class="rf-alert'+anomalyClass+'" aria-label="Anomalia" title="Anomalia">!</span>':'')+
     (featured?'<span class="rf-feature-mark" title="Destaque">★</span>':'')+
     '</div>'+(p.size===36?'':'<figcaption class="rf-caption">'+(note?escape(note):'')+'</figcaption>')+'</figure>';
   }).join('');
   const sectionNames=[...new Set(p.items.map(i=>i.secao_nome).filter(Boolean))];
   const section=sectionNames.length===1?sectionNames[0]:'';
   return '<section class="rf-sheet rf-layout-'+p.size+'" data-layout="'+p.size+'"><img class="rf-lauda" src="assets/lauda-relatorio.jpg" alt="Lauda institucional Prédio Legal">'+
    '<div class="rf-content"><div class="rf-report-head"><div class="rf-report-title">RELATÓRIO FOTOGRÁFICO</div>'+
    '<div class="rf-report-enterprise">'+escape(name)+'</div>'+
    '<div class="rf-report-date">'+(ref?'Data de referência: '+escape(ref):'')+'</div></div>'+
    '<div class="rf-section">'+(p.size===36?'':escape(section))+'</div>'+
    '<div class="rf-cells" style="--rf-columns:'+columns+';--rf-rows:'+rows+'">'+cells+'</div>'+
    '<div class="rf-page-number">'+(ix+1)+' / '+pages.length+'</div></div></section>';
  }).join('');
 }
 function reportHeader(){
  const name=state.empreendimento||state.album.titulo||'';
  const ref=state.album.data_vistoria?new Date(state.album.data_vistoria+'T12:00:00').toLocaleDateString('pt-BR'):'';
  return '<div class="rf-report-head"><div class="rf-report-title">RELATÓRIO FOTOGRÁFICO</div>'+
    '<div class="rf-report-enterprise">'+escape(name)+'</div>'+
    '<div class="rf-report-date">'+(ref?'Data de referência: '+escape(ref):'')+'</div></div>';
 }
 function notesSheet(){
  return '<section class="rf-sheet rf-appendix" data-layout="notes"><img class="rf-lauda" src="assets/lauda-relatorio.jpg" alt="Lauda institucional Prédio Legal">'+
   '<div class="rf-content">'+reportHeader()+
   '<div class="rf-section">OBSERVAÇÕES COMPLEMENTARES</div>'+
   '<div class="rf-appendix-list"></div><div class="rf-page-number"></div></div></section>';
 }
 function prepareSheets(target,previewOnly=false){
  target.innerHTML=sheets(previewOnly)||'<p class="rf-empty-preview">Nenhuma fotografia incluída no relatório.</p>';
  const overflow=[];
  for(const cap of target.querySelectorAll('.rf-caption')){
   const original=cap.textContent.trim();
   if(!original)continue;
   const minimum=7.2;
   let pt=parseFloat(getComputedStyle(cap).fontSize)*72/96;
   while((cap.scrollHeight>cap.clientHeight+1||cap.scrollWidth>cap.clientWidth+1)&&pt>minimum){
    pt=Math.max(minimum,pt-.35);
    cap.style.fontSize=pt.toFixed(2)+'pt';
   }
   if(cap.scrollHeight>cap.clientHeight+1||cap.scrollWidth>cap.clientWidth+1){
    const number=cap.closest('.rf-cell').dataset.photoNumber;
    overflow.push({number,body:original});
    cap.textContent='Obs. completa ao final';
    cap.style.fontSize=minimum+'pt';
   }
  }
  if(overflow.length&&!previewOnly){
   let page=null,list=null;
   for(const note of overflow){
    if(!page){page=document.createElement('div');page.innerHTML=notesSheet();page=page.firstElementChild;target.append(page);list=page.querySelector('.rf-appendix-list')}
    const node=document.createElement('article');
    node.className='rf-appendix-item';
    node.innerHTML='<div class="rf-note-number">Foto '+escape(String(note.number).padStart(2,'0'))+'</div><p class="rf-note-text">'+escape(note.body)+'</p>';
    list.append(node);
    if(list.scrollHeight>list.clientHeight+2){
     node.remove();
     page=document.createElement('div');page.innerHTML=notesSheet();page=page.firstElementChild;target.append(page);list=page.querySelector('.rf-appendix-list');
     list.append(node);
     if(list.scrollHeight>list.clientHeight+2)throw new Error('Uma observação excede uma página. Reduza apenas essa observação.');
    }
   }
  }
  const pages=[...target.querySelectorAll('.rf-sheet')];
  pages.forEach((page,index)=>{page.querySelector('.rf-page-number').textContent=(previewOnly?previewIndex+1:index+1)+' / '+(previewOnly?totalPages():pages.length)});
 }
 function preview(){
  const element=dialog.querySelector('.rf-preview');
  if(!element)return;
  const total=totalPages();previewIndex=Math.min(Math.max(0,previewIndex),Math.max(0,total-1));
  prepareSheets(element,true);updateCounts();
  const count=dialog.querySelector('#rf-preview-count');
  if(count)count.textContent=total?'Página '+(previewIndex+1)+' de '+total:'Sem fotografias';
  const prev=dialog.querySelector('#rf-page-prev'),next=dialog.querySelector('#rf-page-next');
  if(prev)prev.disabled=previewIndex<=0;
  if(next)next.disabled=!total||previewIndex>=total-1;
 }

 async function save(){if(busy)return;busy=true;dialog.querySelector('#rf-save').disabled=true;try{
  if(!state.titulo.trim())throw new Error('Informe um título.');
  if(!state.items.some(i=>i.incluir))throw new Error('Selecione ao menos uma fotografia.');
  const items=state.items.map((i,ordem)=>({fotografia_id:i.fotografia_id,ordem,incluir:i.incluir,legenda:i.legenda,observacao:i.observacao,destaque_no_relatorio:i.destaque_no_relatorio,fotos_por_pagina_override:null}));
  state.id=await check(sb.rpc('pl_salvar_relatorio',{p_id:state.id,p_album_id:state.album.id,p_titulo:state.titulo,p_descricao:state.descricao,p_layout:state.layout,p_items:items}));dirty=false;error({message:'Relatório salvo. O álbum e seus arquivos permanecem intactos.'});
 }catch(e){error(e)}finally{busy=false;const button=dialog.querySelector('#rf-save');if(button)button.disabled=false}}
 async function load(){if(busy)return;if(!(await discard()))return;busy=true;try{
  const reports=await check(sb.from('relatorios_fotograficos').select('id,titulo').eq('album_id',state.album.id).order('atualizado_em',{ascending:false}));
  if(!reports.length)throw new Error('Nenhum relatório salvo para este álbum.');
  dialog.querySelector('.rf-saved-list')?.remove();const list=document.createElement('div');list.className='rf-saved-list';
  const title=document.createElement('p');title.textContent='Escolha um relatório salvo:';list.append(title);
  for(const report of reports){const button=document.createElement('button');button.textContent=report.titulo;button.onclick=()=>openSaved(report.id);list.append(button)}
  dialog.querySelector('.rf-message').after(list);
 }catch(e){error(e)}finally{busy=false}}
 async function openSaved(id){if(busy)return;if(!(await discard()))return;busy=true;try{
  const report=await check(sb.from('relatorios_fotograficos').select('*').eq('id',id).eq('album_id',state.album.id).single());
  const items=await check(sb.from('relatorio_fotografias').select('*').eq('relatorio_id',report.id).order('ordem'));
  const originals=new Map(state.items.map(i=>[i.fotografia_id,i]));
  if(items.some(i=>!originals.has(i.fotografia_id)))throw new Error('Há fotografias removidas ou inacessíveis no álbum. Revise a fonte antes de abrir este relatório.');
  const included=new Set(items.map(i=>i.fotografia_id));
  state.items=items.map(i=>({...originals.get(i.fotografia_id),...i,incluir:!!i.incluir&&originals.get(i.fotografia_id).incluir,destaque_no_relatorio:!!originals.get(i.fotografia_id).source.destaque,fotos_por_pagina_override:null})).concat([...originals.values()].filter(i=>!included.has(i.fotografia_id)).map(i=>({...i,incluir:false,fotos_por_pagina_override:null})));state.id=report.id;state.titulo=report.titulo;state.descricao=report.descricao||'';state.layout=core.layouts.includes(report.fotos_por_pagina)?report.fotos_por_pagina:12;dirty=false;render();
 }catch(e){error(e)}finally{busy=false}}
 async function exportPDF(){
  if(busy)return;
  busy=true;const generation=revision;let print;
  try{
   if(!state.items.some(i=>i.incluir))throw new Error('Nenhuma fotografia disponível para o relatório.');
   error({message:'Gerando PDF A4 sobre a lauda institucional…'});
   dialog.inert=true;
   print=document.createElement('div');
   print.style.cssText='position:fixed;left:-12000px;top:0;width:210mm;pointer-events:none;z-index:-1';
   document.body.append(print);prepareSheets(print);
   for(const img of print.querySelectorAll('img')){
    if(img.src.startsWith('https:'))img.crossOrigin='anonymous';
   }
   await Promise.all([...print.querySelectorAll('img')].map(img=>img.decode()));
   await document.fonts.ready;
   if(generation!==revision)return;
   const pdf=new window.jspdf.jsPDF({unit:'mm',format:'a4',compress:true});
   const pages=[...print.querySelectorAll('.rf-sheet')];
   for(let pageIndex=0;pageIndex<pages.length;pageIndex++){
    const sheet=pages[pageIndex],rect=sheet.getBoundingClientRect();
    const canvas=document.createElement('canvas');
    canvas.width=2480;canvas.height=3508;
    const ctx=canvas.getContext('2d',{alpha:false});
    const sx=canvas.width/rect.width,sy=canvas.height/rect.height;
    const pos=el=>{const r=el.getBoundingClientRect();return {x:(r.x-rect.x)*sx,y:(r.y-rect.y)*sy,w:r.width*sx,h:r.height*sy}};
    const rounded=(x,y,w,h,r=10)=>{
      ctx.beginPath();ctx.roundRect(x,y,w,h,Math.min(r,w/3,h/3));ctx.closePath();
    };
    ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.drawImage(sheet.querySelector('.rf-lauda'),0,0,canvas.width,canvas.height);
    const write=(el,color,fontWeight=400,align='left',complete=false)=>{
     if(!el||!el.textContent.trim())return;
     const p=pos(el),st=getComputedStyle(el),font=Math.max(8,parseFloat(st.fontSize)*sy);
     ctx.save();ctx.fillStyle=color;ctx.font=fontWeight+' '+font+'px Arial';ctx.textBaseline='top';
     ctx.textAlign=align;
     const x=align==='right'?p.x+p.w:p.x;
     const lh=Math.max(font*1.2,parseFloat(st.lineHeight||0)*sy||0);
     const allLines=[];
     for(const paragraph of el.textContent.trim().split(/\n/)){
      let line='';
      for(const word of paragraph.split(/\s+/)){
       if(!word)continue;
       const candidate=line?line+' '+word:word;
       if(ctx.measureText(candidate).width<=p.w){line=candidate;continue}
       if(line){allLines.push(line);line=''}
       let fragment='';
       for(const char of word){
        if(ctx.measureText(fragment+char).width>p.w&&fragment){allLines.push(fragment);fragment=''}
        fragment+=char;
       }
       line=fragment;
      }
      if(line)allLines.push(line);
     }
     const capacity=Math.max(1,Math.floor((p.h+2*sy)/lh));
     if(complete&&allLines.length>capacity){
      ctx.restore();throw new Error('Uma observação ficou grande demais para o espaço disponível. Reduza o texto ou selecione menos fotografias por página.');
     }
     const count=complete?allLines.length:Math.min(allLines.length,capacity);
     for(let i=0;i<count;i++)ctx.fillText(allLines[i],x,p.y+i*lh);
     ctx.restore();
    };
    write(sheet.querySelector('.rf-report-title'),'#182946',700);
    write(sheet.querySelector('.rf-report-enterprise'),'#283750');
    write(sheet.querySelector('.rf-report-date'),'#a4a6aa');
    write(sheet.querySelector('.rf-section'),'#26354b',600);
    write(sheet.querySelector('.rf-page-number'),'#8f939b',400,'right');
    const line=sheet.querySelector('.rf-report-head');
    if(line){const p=pos(line);ctx.fillStyle='#c5ae8b';ctx.fillRect(p.x,p.y+p.h-2*sy,p.w,Math.max(1.5,1.2*sy))}
    for(const cell of sheet.querySelectorAll('.rf-cell')){
     const container=cell.querySelector('.rf-photo'),photo=cell.querySelector('.rf-photo img');
     const p=pos(container);
     const frame=cell.classList.contains('rf-featured');
     const cropScale=Math.max(p.w/photo.naturalWidth,p.h/photo.naturalHeight);
     const srcW=p.w/cropScale,srcH=p.h/cropScale;
     const srcX=(photo.naturalWidth-srcW)/2,srcY=(photo.naturalHeight-srcH)/2;
     ctx.save();rounded(p.x,p.y,p.w,p.h,4*sx);ctx.clip();
     ctx.drawImage(photo,srcX,srcY,srcW,srcH,p.x,p.y,p.w,p.h);ctx.restore();
     if(frame){ctx.strokeStyle='#b77c36';ctx.lineWidth=Math.max(3,3.6*sx);rounded(p.x,p.y,p.w,p.h,4*sx);ctx.stroke()}
     const number=cell.querySelector('.rf-number');
     if(number){
      const n=pos(number);ctx.fillStyle=frame?'#a9702d':'#20314e';rounded(n.x,n.y,n.w,n.h,4*sx);ctx.fill();
      ctx.fillStyle='#fff';ctx.font='600 '+(parseFloat(getComputedStyle(number).fontSize)*sy)+'px Arial';
      ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(number.textContent,n.x+n.w/2,n.y+n.h/2);
     }
     const anomaly=cell.querySelector('.rf-alert');
     if(anomaly){
      const a=pos(anomaly);ctx.fillStyle=anomaly.classList.contains('rf-alert-red')?'#db4145':'#de9b19';
      ctx.strokeStyle='#fff';ctx.lineWidth=2*sx;ctx.beginPath();
      ctx.arc(a.x+a.w/2,a.y+a.h/2,Math.min(a.w,a.h)/2,0,Math.PI*2);
      ctx.fill();ctx.stroke();ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font='bold '+Math.max(15,a.h*.7)+'px Arial';ctx.fillText('!',a.x+a.w/2,a.y+a.h/2);
     }
     const feature=cell.querySelector('.rf-feature-mark');
     if(feature){const a=pos(feature);ctx.fillStyle='#bd9c65';ctx.font='bold '+Math.max(13,a.h*.9)+'px Arial';ctx.textAlign='right';ctx.textBaseline='bottom';ctx.fillText('★',a.x+a.w,a.y+a.h)}
     const caption=cell.querySelector('.rf-caption');
     if(caption?.textContent.trim())write(caption,'#26354b',400,'left',true);
    }
    if(sheet.classList.contains('rf-appendix')){
     write(sheet.querySelector('.rf-appendix .rf-section'),'#26354b',700);
     for(const note of sheet.querySelectorAll('.rf-appendix-item')){
      write(note.querySelector('.rf-note-number'),'#20314e',700,'left',true);
      write(note.querySelector('.rf-note-text'),'#26354b',400,'left',true);
     }
    }
    if(pageIndex)pdf.addPage();
    pdf.addImage(canvas.toDataURL('image/jpeg',.91),'JPEG',0,0,210,297);
    canvas.width=canvas.height=1;
   }
   pdf.save(('Relatorio-fotografico-'+(state.album.titulo||'album')).replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,100)+'.pdf');
   error({message:'PDF A4 exportado com a lauda original e as fotografias do álbum.'});
  }catch(e){console.error(e);error(e)}
  finally{print?.remove();dialog.inert=false;busy=false}
 }
 // The existing album remains the source; this adds only a report action.
 const albumContent=document.querySelector('#pl-album-content');
 new MutationObserver(()=>{if(!albumContent.querySelector('.pl-jobhead')||albumContent.querySelector('#rf-create'))return;const button=document.createElement('button');button.id='rf-create';button.className='pl-new-album';button.textContent='Criar relatório fotográfico';button.onclick=()=>start(albumContent.dataset.albumId);albumContent.querySelector('.pl-jobhead').append(button)}).observe(albumContent,{childList:true});
 window.PLReports={start};
 // Make the existing Álbuns navigation useful for authorized professional albums.
 document.querySelectorAll('[data-action="Álbuns"]').forEach(button=>button.addEventListener('click',async()=>{
  if(busy)return;if(!(await discard()))return;dirty=false;state=null;release();
  opener=button;dialog.hidden=false;dialog.innerHTML='<button id="rf-close">Fechar</button><h1>Álbuns</h1><p class="rf-message">Carregando…</p>';dialog.querySelector('button').onclick=close;
  try{const albums=await check(sb.from('albuns').select('id,titulo,assunto').order('criado_em',{ascending:false}));dialog.querySelector('.rf-message').textContent=albums.length?'Escolha o álbum que será a fonte do relatório.':'Entre com Google em Minha conta para acessar os álbuns autorizados.';for(const a of albums){const b=document.createElement('button');b.className='pl-card';b.textContent=a.titulo+(a.assunto?' · '+a.assunto:'');b.onclick=()=>start(a.id);dialog.append(b)}}catch(e){error(e)}
 }));
 sb.auth.onAuthStateChange((event)=>{if(event==='SIGNED_OUT'){revision++;dirty=false;busy=false;close()}});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.hidden)close()});
 window.addEventListener('beforeunload',e=>{if(dirty){e.preventDefault();e.returnValue=''}});
})();
