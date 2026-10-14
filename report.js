(function(){
 'use strict';
 const sb=window.plSupabase,core=window.PLReportCore;
 const escape=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const dialog=document.createElement('section');dialog.className='rf-dialog';dialog.hidden=true;dialog.setAttribute('role','dialog');dialog.setAttribute('aria-label','Relatório fotográfico');document.body.append(dialog);
 let state=null,dirty=false,busy=false,opener=null,revision=0;
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
  opener=document.activeElement;dialog.hidden=false;dialog.innerHTML='<p>Carregando álbum e fotografias originais…</p>';busy=true;release();
  try{
   const {data:{session}}=await sb.auth.getSession();if(!session)throw new Error('Entre com Google em Minha conta para criar relatórios.');
   const album=await check(sb.from('albuns').select('*').eq('id',albumId).single());
   const links=await check(sb.from('album_fotografias').select('ordem,fotografias(*)').eq('album_id',albumId).order('ordem'));
   if(generation!==revision)return;
   state={album,id:null,titulo:'Relatório fotográfico — '+album.titulo,descricao:album.assunto||'',layout:4,items:[]};
   for(const link of links){const f=link.fotografias;if(!f||f.excluida_em)continue;const url=await sourceURL(f);if(generation!==revision){release();return}state.items.push({fotografia_id:f.id,source:f,url,numero:link.ordem,incluir:![true,'true'].includes(f.metadados?.oculta_relatorio),legenda:f.legenda_sugerida??f.observacao_tecnica??'',observacao:f.observacao_tecnica||'',destaque_no_relatorio:!!f.destaque,fotos_por_pagina_override:null})}
   dirty=false;render();if(state.items.some(i=>i.source.metadados?.demo))error({message:'Este álbum contém imagens ilustrativas de demonstração.'});
  }catch(e){if(generation!==revision)return;release();dialog.innerHTML='<button id="rf-close">Fechar</button><p class="rf-message"></p>';dialog.querySelector('button').onclick=close;error(e)}finally{busy=false}
 }
 async function close(){if(busy)return;if(!(await discard()))return;dialog.hidden=true;release();state=null;dirty=false;document.querySelector('#rf-print')?.remove();opener?.focus()}
 function options(selected,inherit=false){return (inherit?'<option value="0">Padrão do documento</option>':'')+core.layouts.map(n=>'<option value="'+n+'" '+(n===selected?'selected':'')+'>'+n+' foto'+(n>1?'s':'')+' por página</option>').join('')}
 function render(){
  dialog.innerHTML='<button id="rf-close">‹ Voltar ao álbum</button><h1>Criar relatório fotográfico</h1><p>Fonte: '+escape(state.album.titulo)+'. As legendas abaixo pertencem apenas ao relatório.</p><label>Título<input type="text" id="rf-title" maxlength="160" value="'+escape(state.titulo)+'"></label><label>Descrição<textarea id="rf-description" maxlength="500">'+escape(state.descricao)+'</textarea></label><div class="rf-toolbar"><label>Layout padrão <select id="rf-layout">'+options(state.layout)+'</select></label><button id="rf-all">Selecionar todas</button><button id="rf-none">Desmarcar todas</button><button id="rf-save">Salvar relatório</button><button id="rf-pdf">Exportar PDF</button><button id="rf-load">Abrir relatório salvo</button></div><p class="rf-message" role="status"></p><div class="rf-workspace"><div id="rf-items"></div><div class="rf-preview" aria-label="Prévia A4"></div></div>';
  dialog.querySelector('#rf-close').onclick=close;
  for(const [id,key] of [['rf-title','titulo'],['rf-description','descricao']])dialog.querySelector('#'+id).oninput=e=>{state[key]=e.target.value;dirty=true;preview()};
  dialog.querySelector('#rf-layout').onchange=e=>{state.layout=Number(e.target.value);dirty=true;preview()};
  dialog.querySelector('#rf-all').onclick=()=>selectAll(true);dialog.querySelector('#rf-none').onclick=()=>selectAll(false);
  dialog.querySelector('#rf-save').onclick=save;dialog.querySelector('#rf-pdf').onclick=exportPDF;dialog.querySelector('#rf-load').onclick=load;
  rows();preview();
 }
 function selectAll(value){state.items.forEach(i=>i.incluir=value);dirty=true;rows();preview()}
 function rows(){
  dialog.querySelector('#rf-items').innerHTML=state.items.map((i,index)=>'<article class="rf-row" data-index="'+index+'"><img src="'+escape(i.url)+'" alt="Foto '+escape(i.numero)+'"><div><label><input type="checkbox" data-field="incluir" '+(i.incluir?'checked':'')+'> Foto '+escape(i.numero)+'</label><div>'+escape([i.source.destaque?'Destaque':'',i.source.nivel_anomalia?'Anomalia '+i.source.nivel_anomalia:''].filter(Boolean).join(' · '))+'</div><label>Legenda do relatório<textarea maxlength="1000" data-field="legenda">'+escape(i.legenda)+'</textarea></label><div class="rf-toolbar"><button data-move="-1" aria-label="Mover foto para cima" '+(!index?'disabled':'')+'>↑</button><button data-move="1" aria-label="Mover foto para baixo" '+(index===state.items.length-1?'disabled':'')+'>↓</button><select data-field="fotos_por_pagina_override" aria-label="Layout desta foto">'+options(i.fotos_por_pagina_override,true)+'</select></div><small>Mudar o layout inicia outra página.</small></div></article>').join('');
  dialog.querySelectorAll('.rf-row').forEach(row=>{
   const index=Number(row.dataset.index);
   row.querySelectorAll('[data-field]').forEach(el=>el.addEventListener(el.tagName==='TEXTAREA'?'input':'change',()=>{const key=el.dataset.field;state.items[index][key]=key==='incluir'?el.checked:key==='fotos_por_pagina_override'?Number(el.value)||null:el.value;dirty=true;preview()}));
   row.querySelectorAll('[data-move]').forEach(el=>el.onclick=()=>{const next=index+Number(el.dataset.move);[state.items[index],state.items[next]]=[state.items[next],state.items[index]];dirty=true;rows();preview()});
  });
 }
 function sheets(){const pages=core.paginate(state.items,state.layout);return pages.map((p,ix)=>{
  const columns=p.size===1||p.size===2?1:p.size===4||p.size===6?2:p.size===9?3:4;
  const rows=Math.ceil(p.size/columns);
  return '<section class="rf-sheet"><img class="rf-lauda" src="assets/lauda-relatorio.jpg" alt="Lauda institucional Prédio Legal"><div class="rf-content"><h2 class="rf-heading">'+escape(state.titulo)+'</h2>'+(state.descricao?'<p class="rf-subtitle">'+escape(state.descricao)+'</p>':'')+'<div class="rf-cells" style="grid-template-columns:repeat('+columns+',minmax(0,1fr));grid-template-rows:repeat('+rows+',minmax(0,1fr))">'+p.items.map(i=>'<figure class="rf-cell"><img src="'+escape(i.url)+'" alt="Fotografia '+escape(i.numero)+'"><figcaption>'+escape('Foto '+i.numero+' — '+i.legenda)+(i.source.nivel_anomalia?'<br>'+escape('Anomalia '+i.source.nivel_anomalia):i.source.destaque?'<br>Destaque':'')+'</figcaption></figure>').join('')+'</div><div class="rf-page-number">'+(ix+1)+' / '+pages.length+'</div></div></section>';
 }).join('')}
 function preview(){dialog.querySelector('.rf-preview').innerHTML=sheets()||'<p>Selecione ao menos uma fotografia.</p>'}
 async function save(){if(busy)return;busy=true;dialog.querySelector('#rf-save').disabled=true;try{
  if(!state.titulo.trim())throw new Error('Informe um título.');
  if(!state.items.some(i=>i.incluir))throw new Error('Selecione ao menos uma fotografia.');
  const items=state.items.map((i,ordem)=>({fotografia_id:i.fotografia_id,ordem,incluir:i.incluir,legenda:i.legenda,observacao:i.observacao,destaque_no_relatorio:i.destaque_no_relatorio,fotos_por_pagina_override:i.fotos_por_pagina_override}));
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
  state.items=items.map(i=>({...originals.get(i.fotografia_id),...i})).concat([...originals.values()].filter(i=>!included.has(i.fotografia_id)).map(i=>({...i,incluir:false})));state.id=report.id;state.titulo=report.titulo;state.descricao=report.descricao||'';state.layout=report.fotos_por_pagina;dirty=false;render();
 }catch(e){error(e)}finally{busy=false}}
 async function exportPDF(){if(busy)return;busy=true;const generation=revision;let print;try{
  if(!state.items.some(i=>i.incluir))throw new Error('Selecione ao menos uma fotografia.');
  error({message:'Gerando PDF A4 em 300 dpi…'});
  dialog.inert=true;
  print=document.createElement('div');print.style.cssText='position:fixed;left:-10000px;top:0;pointer-events:none';print.innerHTML=sheets();document.body.append(print);
  for(const img of print.querySelectorAll('img'))img.crossOrigin=img.src.startsWith('https:')?'anonymous':null;
  await Promise.all([...print.querySelectorAll('img')].map(img=>img.decode()));await document.fonts.ready;
  if(generation!==revision)return;
  const pdf=new window.jspdf.jsPDF({unit:'mm',format:'a4',compress:true});
  const pages=[...print.querySelectorAll('.rf-sheet')];
  for(let ix=0;ix<pages.length;ix++){
   const sheet=pages[ix],rect=sheet.getBoundingClientRect();
   if([...sheet.querySelectorAll('.rf-cell img')].some(img=>img.getBoundingClientRect().height<38))throw new Error('Legenda extensa demais para este layout. Reduza o texto ou escolha menos fotos por página.');
   const canvas=document.createElement('canvas');canvas.width=2480;canvas.height=3508;const ctx=canvas.getContext('2d');
   const scale=canvas.width/rect.width;
   ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
   ctx.drawImage(sheet.querySelector('.rf-lauda'),0,0,canvas.width,canvas.height);
   for(const cell of sheet.querySelectorAll('.rf-cell')){
    const r=cell.getBoundingClientRect();ctx.strokeStyle='#d8d5cf';ctx.lineWidth=scale;ctx.strokeRect((r.x-rect.x)*scale,(r.y-rect.y)*scale,r.width*scale,r.height*scale);
    const img=cell.querySelector('img'),ir=img.getBoundingClientRect();const ratio=Math.min(ir.width/img.naturalWidth,ir.height/img.naturalHeight);
    const w=img.naturalWidth*ratio,h=img.naturalHeight*ratio;
    ctx.drawImage(img,(ir.x-rect.x+(ir.width-w)/2)*scale,(ir.y-rect.y+(ir.height-h)/2)*scale,w*scale,h*scale);
   }
   for(const el of sheet.querySelectorAll('.rf-heading,.rf-subtitle,figcaption,.rf-page-number')){
    const style=getComputedStyle(el),r=el.getBoundingClientRect(),font=parseFloat(style.fontSize),line=parseFloat(style.lineHeight)||font*1.25;
    ctx.font=style.fontWeight+' '+font*scale+'px Arial';ctx.fillStyle='#102044';ctx.textBaseline='top';
    const padding=parseFloat(style.paddingTop)||0,maxWidth=r.width*scale;let y=(r.y-rect.y+padding)*scale;
    const lines=[];
    for(const paragraph of el.innerText.split('\n')){
     let current='';for(const word of paragraph.split(/\s+/)){
      if(ctx.measureText(current+(current?' ':'')+word).width<=maxWidth){current+=(current?' ':'')+word;continue}
      if(current){lines.push(current);current=''}
      for(const letter of word){if(ctx.measureText(current+letter).width>maxWidth){lines.push(current);current=''}current+=letter}
     }lines.push(current);
    }
    if(lines.length*line>r.height-padding+3)throw new Error('O texto não cabe na página. Reduza a legenda ou use menos fotos por página.');
    for(const text of lines){const x=style.textAlign==='right'?(r.right-rect.x)*scale-ctx.measureText(text).width:(r.x-rect.x)*scale;ctx.fillText(text,x,y);y+=line*scale}
   }
   if(ix)pdf.addPage();pdf.addImage(canvas.toDataURL('image/jpeg',.98),'JPEG',0,0,210,297);canvas.width=canvas.height=1;
  }
  pdf.save((state.titulo.replace(/[^\p{L}\p{N} _-]/gu,'').slice(0,100)||'relatorio-fotografico')+'.pdf');
  error({message:'PDF exportado em A4, 300 dpi, com a lauda institucional em todas as páginas.'});
 }catch(e){error(e)}finally{print?.remove();dialog.inert=false;busy=false}}
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
