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
   dirty=false;render();
   if(demo)error({message:'Prévia demonstrativa: imagens ilustrativas. A ordem e os destaques acompanham o álbum.'});
  }catch(e){
   if(generation!==revision)return;
   release();dialog.innerHTML='<button id="rf-close">Fechar</button><p class="rf-message"></p>';
   dialog.querySelector('button').onclick=close;error(e)
  }finally{busy=false}
 }
 async function close(){if(busy)return;if(!(await discard()))return;dialog.hidden=true;release();state=null;dirty=false;document.querySelector('#rf-print')?.remove();opener?.focus()}
 function options(selected){return core.layouts.map(n=>'<option value="'+n+'" '+(n===selected?'selected':'')+'>'+n+' fotos por página</option>').join('')}
 function render(){
  dialog.innerHTML='<button id="rf-close">‹ Voltar ao álbum</button><h1>Criar relatório fotográfico</h1><p>Fonte: '+escape(state.album.titulo)+'. As legendas abaixo pertencem apenas ao relatório.</p><label>Título<input type="text" id="rf-title" maxlength="160" value="'+escape(state.titulo)+'"></label><label>Descrição<textarea id="rf-description" maxlength="500">'+escape(state.descricao)+'</textarea></label><div class="rf-toolbar"><label>Fotos por página <select id="rf-layout">'+options(state.layout)+'</select></label><button id="rf-all">Selecionar todas</button><button id="rf-none">Desmarcar todas</button><button id="rf-save">Salvar relatório</button><button id="rf-pdf">Exportar PDF</button><button id="rf-load">Abrir relatório salvo</button></div><p class="rf-message" role="status"></p><div class="rf-workspace"><div id="rf-items"></div><div class="rf-preview" aria-label="Prévia A4"></div></div>';
  dialog.querySelector('#rf-close').onclick=close;
  for(const [id,key] of [['rf-title','titulo'],['rf-description','descricao']])dialog.querySelector('#'+id).oninput=e=>{state[key]=e.target.value;dirty=true;preview()};
  dialog.querySelector('#rf-layout').onchange=e=>{state.layout=Number(e.target.value);dirty=true;preview()};
  dialog.querySelector('#rf-all').onclick=()=>selectAll(true);dialog.querySelector('#rf-none').onclick=()=>selectAll(false);
  dialog.querySelector('#rf-save').onclick=save;dialog.querySelector('#rf-pdf').onclick=exportPDF;dialog.querySelector('#rf-load').onclick=load;
  rows();preview();
 }
 function selectAll(value){state.items.forEach(i=>i.incluir=value);dirty=true;rows();preview()}
 function rows(){
  dialog.querySelector('#rf-items').innerHTML=state.items.map((i,index)=>'<article class="rf-row" data-index="'+index+'"><img src="'+escape(i.url)+'" alt="Foto '+escape(i.numero)+'"><div><label><input type="checkbox" data-field="incluir" '+(i.incluir?'checked':'')+'> Foto '+escape(i.numero)+'</label><div>'+escape([i.source.destaque?'Destaque':'',i.source.nivel_anomalia?'Anomalia '+i.source.nivel_anomalia:''].filter(Boolean).join(' · '))+'</div><label>Legenda do relatório<textarea maxlength="1000" data-field="legenda">'+escape(i.legenda)+'</textarea></label><div class="rf-toolbar"><button data-move="-1" aria-label="Mover foto para cima" '+(!index?'disabled':'')+'>↑</button><button data-move="1" aria-label="Mover foto para baixo" '+(index===state.items.length-1?'disabled':'')+'>↓</button></div></div></article>').join('');
  dialog.querySelectorAll('.rf-row').forEach(row=>{
   const index=Number(row.dataset.index);
   row.querySelectorAll('[data-field]').forEach(el=>el.addEventListener(el.tagName==='TEXTAREA'?'input':'change',()=>{const key=el.dataset.field;state.items[index][key]=key==='incluir'?el.checked:el.value;dirty=true;preview()}));
   row.querySelectorAll('[data-move]').forEach(el=>el.onclick=()=>{const next=index+Number(el.dataset.move);[state.items[index],state.items[next]]=[state.items[next],state.items[index]];dirty=true;rows();preview()});
  });
 }
 function sheets(){
  const pages=core.paginate(state.items,state.layout);
  return pages.map((p,ix)=>{
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
     '<span class="rf-number">'+escape(String(i.numero).padStart(2,'0'))+'</span>'+
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
 function preview(){dialog.querySelector('.rf-preview').innerHTML=sheets()||'<p>Selecione ao menos uma fotografia.</p>'}
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
  state.items=items.map(i=>({...originals.get(i.fotografia_id),...i,incluir:!!i.incluir&&originals.get(i.fotografia_id).incluir,fotos_por_pagina_override:null})).concat([...originals.values()].filter(i=>!included.has(i.fotografia_id)).map(i=>({...i,incluir:false,fotos_por_pagina_override:null})));state.id=report.id;state.titulo=report.titulo;state.descricao=report.descricao||'';state.layout=core.layouts.includes(report.fotos_por_pagina)?report.fotos_por_pagina:12;dirty=false;render();
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
   print.innerHTML=sheets();document.body.append(print);
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
    const write=(el,color,fontWeight=400,align='left')=>{
     if(!el||!el.textContent.trim())return;
     const p=pos(el),st=getComputedStyle(el),font=Math.max(8,parseFloat(st.fontSize)*sy);
     ctx.save();ctx.fillStyle=color;ctx.font=fontWeight+' '+font+'px Arial';ctx.textBaseline='top';
     ctx.textAlign=align;const x=align==='right'?p.x+p.w:p.x;
     const words=el.textContent.trim().split(/\s+/);
     const lines=[];let line='';
     for(const word of words){
      const test=line?line+' '+word:word;
      if(ctx.measureText(test).width<=p.w||!line){line=test}
      else{lines.push(line);line=word}
     }
     if(line)lines.push(line);
     const lh=Math.max(font*1.18,parseFloat(st.lineHeight||0)*sy||0);
     for(let i=0;i<Math.min(lines.length,Math.floor((p.h+1)/lh)||1);i++){
      let text=lines[i];
      while(ctx.measureText(text).width>p.w&&text.length>2)text=text.slice(0,-2)+'…';
      ctx.fillText(text,x,p.y+i*lh);
     }
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
     if(frame){ctx.strokeStyle='#bd9c65';ctx.lineWidth=Math.max(2,1.8*sx);rounded(p.x,p.y,p.w,p.h,4*sx);ctx.stroke()}
     const number=cell.querySelector('.rf-number');
     if(number){
      const n=pos(number);ctx.fillStyle='#20314e';rounded(n.x,n.y,n.w,n.h,4*sx);ctx.fill();
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
     if(caption?.textContent.trim())write(caption,'#26354b');
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
