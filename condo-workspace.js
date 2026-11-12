(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const titlecase={planejado:'Planejado',em_andamento:'Em andamento',concluido:'Concluído',suspenso:'Suspenso'};
const state={area:null,tab:'apartamento',tower:null,unit:null,subject:null,filter:'todos',detail:null,form:false,search:'',unitFilter:'todos'};
let root=null,job=null,workspace={locais:[],mini_jobs:[],albuns:[]},allAlbums=[],pendingByUnit={},vistoriaByMini={},busy=false,errorText='',isAdmin=false;
const sb=()=>window.plSupabase;
const mini=()=>workspace.mini_jobs||[];
const locais=()=>workspace.locais||[];
const selectedUnit=()=>locais().find(l=>l.id===state.unit);
const sorted=(a,b)=>String(a).localeCompare(String(b),'pt-BR',{numeric:true});
const type=l=>String(l.tipo||'').toLowerCase();
const towers=()=>locais().filter(l=>type(l).includes('torre')||type(l).includes('bloco')&&!l.numero).sort((a,b)=>sorted(a.bloco,b.bloco));
const units=tower=>locais().filter(l=>l.local_pai_id===tower&&l.numero).sort((a,b)=>sorted(a.numero,b.numero));
const labelLocal=id=>{const l=locais().find(x=>x.id===id);return l?(l.numero?'Apto '+l.numero+' · Torre '+l.bloco:l.nome):'Sem unidade definida'};
const currentItems=()=>mini().filter(m=>m.area===state.area&&(state.area!=='privativa'||state.tab==='assunto'?(state.subject?shortSubjectLabel(m)===state.subject:true):(state.unit?m.local_id===state.unit:state.tower?units(state.tower).some(l=>l.id===m.local_id):true))&&(state.filter==='todos'||m.status===state.filter));
const pinFirst=items=>[...items].sort((a,b)=>Number(!!b.fixado)-Number(!!a.fixado));
const subjects=()=>[...new Set(mini().filter(m=>m.area===state.area).map(m=>m.assunto))].sort(sorted);
function breadcrumb(){
 const nodes=[['Monitoramento','overview']];
 if(state.area)nodes.push([state.area==='comum'?'Áreas comuns':'Áreas privativas','area']);
 if(state.area==='privativa'&&state.tab==='apartamento'&&state.tower){
  const tower=towers().find(x=>x.id===state.tower);
  nodes.push(['Torre '+(tower?.bloco||''),'tower']);
 }
 if(state.unit)nodes.push([labelLocal(state.unit),'unit']);
 if(state.subject)nodes.push([state.subject,'subject']);
 if(state.detail)nodes.push(['Assunto','detail']);
 return '<div class="cw-crumb">'+nodes.map((n,i)=>i===nodes.length-1?'<span>'+esc(n[0])+'</span>':'<button data-crumb="'+esc(n[1])+'">'+esc(n[0])+'</button><span aria-hidden="true">›</span>').join('')+'</div>';
}
function itemRow(m){
 const amount=workspace.albuns.filter(a=>a.mini_job_id===m.id).length;
 return '<button class="cw-mini" data-detail="'+esc(m.id)+'"><div class="cw-mini-main"><div class="cw-mini-eyebrow">'+(m.fixado?'📌 ':'')+(vistoriaByMini[m.id]?'☑ ':'')+esc(m.assunto)+(m.demonstracao?' · EXEMPLO':'')+'</div><strong>'+esc(m.titulo)+'</strong><small>'+esc(m.area==='privativa'?labelLocal(m.local_id):'Área comum')+(amount?' · '+amount+' álbum(ns)':'')+'</small></div><span class="cw-status cw-'+esc(m.status)+'">'+esc(titlecase[m.status]||m.status)+'</span><span class="cw-chevron">›</span></button>';
}
function shortSubjectLabel(m){
 const t=String(m.titulo||''),a=String(m.assunto||'');
 const v=(t+' '+a).toLocaleLowerCase('pt-BR');
 if(/ar[- ]condicionado|climatiza/.test(v))return 'AC';
 if(/esgoto/.test(t.toLowerCase()))return 'Esgoto';
 if(/registro hidráulico/.test(v))return 'Registro';
 if(/vazament|gotejamento/.test(t.toLowerCase()))return 'Vazamento';
 if(/infiltra/.test(t.toLowerCase()))return 'Infiltração';
 if(/armadura|laje|estrutura/.test(t.toLowerCase()))return 'Estrutura';
 if(/fachada|reparo externo|pintura externa/.test(t.toLowerCase()))return 'Fachada';
 if(/reforma|contrapiso|autorização de serviços|obra/.test(t.toLowerCase()))return 'Reforma';
 if(/perícia|processo judicial/.test(v))return 'Perícia';
 if(/manutenção/.test(v))return 'Manutenção';
 return (a||t).trim().split(/\s+/).slice(0,2).join(' ').slice(0,22)||'Assunto';
}
function groupedSubjects(){return [...new Set(mini().filter(m=>m.area===state.area).map(shortSubjectLabel))].sort(sorted)}
function topicButtons(){return groupedSubjects().map(x=>'<button data-subject="'+esc(x)+'" class="'+(state.subject===x?'selected':'')+'">'+esc(x)+'</button>').join('')}
function subjectStrip(){
 const items=groupedSubjects().map(label=>({label,records:mini().filter(m=>m.area===state.area&&shortSubjectLabel(m)===label)}));
 if(!items.length)return '';
 return '<section class="cw-subject-strip" aria-label="Acesso rápido aos assuntos"><div class="cw-subject-strip-head"><h2>Assuntos</h2><button type="button" data-subject-search-toggle aria-label="Buscar assunto">⌕ Buscar</button></div><input class="cw-subject-search" data-subject-search type="search" placeholder="Localizar assunto…" aria-label="Localizar assunto" hidden><div class="cw-subject-rail" role="group" aria-label="Assuntos; deslize lateralmente">'+
 '<button class="cw-subject-pill cw-subject-all" type="button" data-subject-all>Todos</button>'+items.map(g=>'<button type="button" class="cw-subject-pill" data-subject="'+esc(g.label)+'" data-subject-title="'+esc(g.label.toLocaleLowerCase('pt-BR'))+'">'+esc(g.label)+' ('+g.records.length+')'+(g.records.some(m=>m.status==='em_andamento')?'<span class="cw-subject-dot" aria-label="Em andamento"></span>':'')+'</button>').join('')+'</div></section>';
}
function filterBar(){
 return '<div class="cw-filters" aria-label="Filtrar por andamento">'+[['todos','Todos'],['em_andamento','Em andamento'],['planejado','Planejados'],['concluido','Concluídos'],['suspenso','Suspensos']].map(p=>'<button data-filter="'+p[0]+'" class="'+(state.filter===p[0]?'selected':'')+'">'+p[1]+'</button>').join('')+'</div>';
}
function form(){
 const options=state.area==='privativa'&&(!state.unit)
  ?'<label>Unidade<select name="local_id" required><option value="">Selecione o apartamento</option>'+locais().filter(l=>l.numero).sort((a,b)=>sorted(a.bloco+a.numero,b.bloco+b.numero)).map(l=>'<option value="'+esc(l.id)+'">Torre '+esc(l.bloco)+' · Apto '+esc(l.numero)+'</option>').join('')+'</select></label>'
  :'';
 const suggested=state.area==='comum'?['Fachadas','Pintura e padronização','Playground','Instalações','Manutenção predial']:['Obras privativas','Vistorias de unidades','Manifestações patológicas','Consultas técnicas'];
 return '<form id="cw-form" class="cw-form"><div class="cw-form-title">Novo assunto</div><label>Título<input name="titulo" maxlength="180" required placeholder="Ex.: Verificação da reforma" autocomplete="off"></label><label>Tópico<input name="assunto" list="cw-subjects" maxlength="120" required value="'+esc(state.subject|| (state.area==='privativa'?'Obras privativas':''))+'" placeholder="Ex.: Obras privativas"><datalist id="cw-subjects">'+[...new Set([...suggested,...subjects()])].map(s=>'<option value="'+esc(s)+'"></option>').join('')+'</datalist></label>'+options+'<label>Status<select name="status"><option value="em_andamento">Em andamento</option><option value="planejado">Planejado</option><option value="concluido">Concluído</option><option value="suspenso">Suspenso</option></select></label><label>Observações<textarea name="descricao" rows="2" placeholder="Opcional"></textarea></label><div class="cw-form-actions"><button type="button" data-action="cancel-form">Cancelar</button><button type="submit" '+(busy?'disabled':'')+'>Salvar assunto</button></div></form>';
}
function addButton(){
 return isAdmin?'<button class="cw-add" data-action="add">＋ Novo assunto</button>':'';
}
function list(items,showAdd=true){
 return (showAdd?'<div class="cw-list-actions"><span>'+items.length+' assunto(s)</span>'+addButton()+'</div>':'')+(items.length?'<div class="cw-mini-list">'+pinFirst(items).map(itemRow).join('')+'</div>':'<p class="cw-empty">Nenhum assunto nesta seleção.</p>')+(state.form?form():'');
}

function documentPanel(local,subject){
 if(!local)return '';
 return '<details class="cw-albums-fold" open><summary>Documentos da unidade</summary><div class="cw-albums-body" data-doc-panel data-local="'+esc(local)+'" data-subject-id="'+esc(subject||'')+'"><p>Carregando documentos…</p></div></details>';
}
async function mountDocuments(){
 const panel=root.querySelector('[data-doc-panel]');if(!panel)return;
 const local=panel.dataset.local,subject=panel.dataset.subjectId,jobId=job.id;
 const db=sb(),bucket=db.storage.from('predio-legal-documentos');
 try{
  const result=await db.from('documentos_unidades').select('*,documentos_unidades_vinculos(id,mini_job_id,feed_id)').eq('local_id',local).order('criado_em',{ascending:false});
  if(result.error)throw result.error;
  const docs=result.data||[], subjectsForUnit=mini().filter(m=>m.local_id===local&&!m.demonstracao);
  const visible=subject?docs.filter(d=>d.documentos_unidades_vinculos.some(v=>v.mini_job_id===subject)):docs;
  let feed=[];
  if(subject&&isAdmin){const f=await db.from('job_feed').select('id,conteudo,criado_em').eq('mini_job_id',subject).order('criado_em',{ascending:false});if(!f.error)feed=f.data||[];}
  if(!panel.isConnected)return;
  const subjectOptions=subjectsForUnit.map(m=>'<option value="'+esc(m.id)+'" '+(m.id===subject?'selected':'')+'>'+esc(m.titulo)+'</option>').join('');
  const feedOptions=feed.map(f=>'<option value="'+esc(f.id)+'">'+esc(new Date(f.criado_em).toLocaleDateString('pt-BR')+' · '+String(f.conteudo||'').slice(0,90))+'</option>').join('');
  panel.innerHTML=(visible.length?visible.map(d=>'<div class="cw-album-link"><button type="button" data-doc-open="'+esc(d.id)+'">'+esc(d.nome)+' <small>· '+esc(new Date(d.criado_em).toLocaleDateString('pt-BR'))+' · '+esc(d.visibilidade)+'</small></button></div>').join(''):'<p class="cw-empty">Nenhum documento vinculado.</p>')+(isAdmin?'<form class="cw-form" data-doc-upload><label>Arquivo<input type="file" name="arquivo" required></label><label>Visibilidade<select name="visibilidade"><option value="interno">Interno</option><option value="geral">Compartilhado com usuários autorizados</option></select></label><label>Assunto<select name="assunto"><option value="">Somente apartamento</option>'+subjectOptions+'</select></label>'+(subject&&feedOptions?'<label>Registro do histórico (opcional)<select name="feed"><option value="">Sem registro específico</option>'+feedOptions+'</select></label>':'')+'<button type="submit" class="cw-save">Anexar documento</button></form>'+(docs.length&&subject?'<form class="cw-form" data-doc-link><label>Vincular arquivo existente<select name="documento" required><option value="">Selecione</option>'+docs.map(d=>'<option value="'+esc(d.id)+'">'+esc(d.nome)+'</option>').join('')+'</select></label>'+(feedOptions?'<label>Registro do histórico<select name="feed"><option value="">Somente assunto</option>'+feedOptions+'</select></label>':'')+'<button type="submit" class="cw-save">Vincular</button></form>':''):'')+'<p data-doc-status role="status"></p>';
  const status=panel.querySelector('[data-doc-status]');
  const fail=e=>{status.textContent=e.message||String(e)};
  panel.querySelectorAll('[data-doc-open]').forEach(b=>b.onclick=async()=>{try{const d=docs.find(x=>x.id===b.dataset.docOpen);if(d.origem_email_id){const q=await db.rpc('pl_documento_importado_base64',{p_documento_id:d.id});if(q.error||!q.data)throw q.error||new Error('Arquivo indisponível');const bytes=Uint8Array.from(atob(q.data.replace(/\s/g,'')),c=>c.charCodeAt(0));const url=URL.createObjectURL(new Blob([bytes],{type:d.mime||'application/octet-stream'}));const a=document.createElement('a');a.href=url;a.download=d.nome;a.click();setTimeout(()=>URL.revokeObjectURL(url),30000);return;}const a=await bucket.createSignedUrl(d.caminho,120,{download:d.nome});if(a.error)throw a.error;const link=document.createElement('a');link.href=a.data.signedUrl;link.rel='noopener';link.target='_blank';link.click();}catch(e){fail(e)}});
  const linkDoc=async(id,m,f)=>{if(!m)return;const x=await db.from('documentos_unidades_vinculos').insert({documento_id:id,mini_job_id:m,feed_id:f||null});if(x.error&&x.error.code!=='23505')throw x.error;};
  panel.querySelector('[data-doc-upload]')?.addEventListener('submit',async e=>{
   e.preventDefault();const form=e.target,button=form.querySelector('button');button.disabled=true;status.textContent='Enviando…';
   const f=new FormData(form),file=f.get('arquivo'),id=crypto.randomUUID(),path=local+'/'+id+'/'+file.name.replace(/[\\/]/g,'_');
   let saved=false,uploaded=false;
   try{if(file.size>52428800)throw new Error('Limite de 50 MB por arquivo.');
    const row=await db.from('documentos_unidades').insert({id,local_id:local,job_id:jobId,nome:file.name,caminho:path,mime:file.type,tamanho:file.size,visibilidade:f.get('visibilidade')});if(row.error)throw row.error;saved=true;
    const up=await bucket.upload(path,file,{upsert:false});if(up.error)throw up.error;uploaded=true;
    await linkDoc(id,f.get('assunto'),f.get('assunto')===subject?f.get('feed'):null);await mountDocuments();
   }catch(err){if(saved&&!uploaded)await db.from('documentos_unidades').delete().eq('id',id);fail(err);button.disabled=false;}
  });
  panel.querySelector('[data-doc-link]')?.addEventListener('submit',async e=>{e.preventDefault();const f=new FormData(e.target),button=e.target.querySelector('button');button.disabled=true;try{await linkDoc(f.get('documento'),subject,f.get('feed'));await mountDocuments();}catch(err){fail(err);button.disabled=false;}});
 }catch(e){if(panel.isConnected)panel.innerHTML='<p class="cw-error">'+esc(e.message||String(e))+'</p>';}
}

function unitAlbumPanel(u){
 const items=mini().filter(m=>m.local_id===u.id&&m.area==='privativa'&&!m.demonstracao);
 const links=(workspace.albuns||[]).filter(a=>items.some(m=>m.id===a.mini_job_id));
 const actions=isAdmin?'<div class="cw-album-actions"><button type="button" data-action="unit-new-album">＋ Criar álbum</button></div><div data-unit-album-form hidden><form class="cw-form" id="cw-unit-album-form"><label>Vincular ao assunto do apartamento<select name="mini_job_id" required><option value="">Selecione o assunto</option>'+items.map(m=>'<option value="'+esc(m.id)+'">'+esc(m.titulo)+' · '+esc(m.assunto)+'</option>').join('')+'</select></label><div class="cw-form-actions"><button type="button" data-action="unit-album-cancel">Cancelar</button><button type="submit">Continuar</button></div></form></div>':'';
 const rows=links.map(a=>{const m=items.find(x=>x.id===a.mini_job_id);return '<div class="cw-album-link"><button type="button" data-album="'+esc(a.id)+'">'+esc(a.titulo)+' <small> · '+esc(m?.titulo||'')+'</small><span>›</span></button><button type="button" aria-label="Abrir assunto" title="Abrir assunto" data-detail="'+esc(a.mini_job_id)+'">↗</button></div>'}).join('');
 return '<section aria-label="Álbuns do apartamento" class="cw-albums-fold"><h2 class="cw-section-label">Álbuns do apartamento</h2>'+actions+(rows||'<p class="cw-empty">Nenhum álbum vinculado aos assuntos deste apartamento.</p>')+'</section>';
}
function unitView(){
 const u=selectedUnit();if(!u){state.unit=null;return '<p class="cw-empty">Unidade não encontrada.</p>'}
 return '<div class="cw-subheading"><div><h2>'+esc(labelLocal(u.id))+'</h2><p>'+esc(u.tipo_unidade||'Unidade privativa')+'</p>'+unitSignals(u)+'</div>'+(isAdmin?'<details style="position:relative;align-self:start"><summary aria-label="Opções do apartamento" title="Opções do apartamento" style="cursor:pointer;padding:8px 12px;list-style:none;font-size:20px">⋯</summary><div style="padding:8px;border:1px solid #ddd;border-radius:8px"><button type="button" data-toggle-obra="'+esc(u.id)+'">'+(u.obra_ativa?'✓ Concluir obra':'＋ Iniciar obra')+'</button></div></details>':'')+'</div>'+unitAlbumPanel(u)+filterBar()+list(currentItems())+documentPanel(u.id,null);
}
function unitSignals(u){
 const n=pendingByUnit[u.id]||0;
 return '<small style="display:block;color:'+(n?'#b42318':'#667085')+'">'+(n?'⚠ '+n+' pendência(s)':'Sem pendências')+'</small>'+(u.obra_ativa?'<small style="display:block;color:#a66a00">🚧 Obra em andamento</small>':'');
}
function towerView(){
 const t=towers().find(x=>x.id===state.tower);if(!t)return '<p class="cw-empty">Torre não encontrada.</p>';
 const q=state.search.toLocaleLowerCase('pt-BR');
 const rows=units(t.id).filter(u=>(u.numero||'').toLowerCase().includes(q)).filter(u=>state.unitFilter==='obras'?u.obra_ativa:state.unitFilter==='pendencias'?(pendingByUnit[u.id]||0)>0:true).sort((a,b)=>Number((pendingByUnit[b.id]||0)>0)-Number((pendingByUnit[a.id]||0)>0)||Number(b.obra_ativa)-Number(a.obra_ativa)||sorted(a.numero,b.numero));
 return '<div class="cw-subheading"><h2>Torre '+esc(t.bloco)+'</h2><span>'+units(t.id).length+' apartamentos</span></div><input class="cw-quick-search" id="cw-unit-search" aria-label="Buscar apartamento" placeholder="Buscar apartamento..." value="'+esc(state.search)+'"><div style="display:flex;gap:6px;flex-wrap:wrap;margin:10px 0">'+[['todos','Todos'],['obras','Obras em andamento'],['pendencias','Com pendências']].map(x=>'<button type="button" data-unit-filter="'+x[0]+'" aria-pressed="'+(state.unitFilter===x[0])+'">'+x[1]+'</button>').join('')+'</div><div class="cw-unit-grid">'+rows.map(u=>'<div style="border:2px solid '+(u.obra_ativa?'#e4a32b':'transparent')+';border-radius:12px;padding:3px"><button data-unit="'+esc(u.id)+'"><strong>'+esc(u.numero)+'</strong>'+unitSignals(u)+'</button></div>').join('')+'</div>';
}
function privativa(){
 const tabs='<div class="cw-tabs" role="tablist" aria-label="Forma de consulta"><button role="tab" aria-selected="'+(state.tab==='apartamento')+'" data-tab="apartamento">Por apartamento</button><button role="tab" aria-selected="'+(state.tab==='assunto')+'" data-tab="assunto">Por tópico</button></div>';
 if(state.tab==='apartamento'){
  if(state.unit)return tabs+unitView();
  if(state.tower)return tabs+towerView();
  const filtered=mini().filter(m=>m.area==='privativa');
  return tabs+'<h2 class="cw-section-label">Selecione a torre</h2><div class="cw-towers">'+towers().map(t=>{
   const count=filtered.filter(m=>units(t.id).some(u=>u.id===m.local_id)).length;
   return '<button data-tower="'+esc(t.id)+'"><strong>'+esc(t.bloco||t.nome)+'</strong><small>'+units(t.id).length+' aptos · '+count+' assuntos</small></button>';
  }).join('')+'</div><p class="cw-hint">Selecione a torre e depois o apartamento para consultar todas as intervenções da unidade.</p>';
 }
 return tabs+'<h2 class="cw-section-label">Consultar por tópico</h2><div class="cw-topics"><button data-subject="" class="'+(!state.subject?'selected':'')+'">Todos os tópicos</button>'+topicButtons()+'</div>'+filterBar()+list(currentItems());
}
function common(){
 return '<h2 class="cw-section-label">Áreas comuns · tópicos</h2><div class="cw-topics"><button data-subject="" class="'+(!state.subject?'selected':'')+'">Todos</button>'+topicButtons()+'</div>'+filterBar()+list(currentItems());
}
function overview(){
 const active=mini().filter(m=>m.status==='em_andamento'&&!m.demonstracao).length;
 const examples=mini().filter(m=>m.demonstracao).length;
 return '<div class="cw-overview"><p class="cw-info">Um único Job mensal, organizado em assuntos e locais. Consulte os mesmos assuntos por apartamento ou por tópico, sem duplicar registros.</p><div class="cw-choices"><button data-area="comum"><span class="cw-choice-icon">⌂</span><strong>Áreas comuns</strong><small>Fachadas, manutenção, playground e outros assuntos</small><span class="cw-arrow">›</span></button><button data-area="privativa"><span class="cw-choice-icon">▦</span><strong>Áreas privativas</strong><small>Torres, apartamentos e obras privativas</small><span class="cw-arrow">›</span></button></div><p class="cw-hint">'+active+' assunto(s) reais em andamento'+(examples?' · '+examples+' registros ilustrativos identificados como EXEMPLO':'')+'</p></div>';
}
function detail(){
 const m=mini().find(x=>x.id===state.detail);if(!m)return '<p class="cw-empty">Mini-job não encontrado.</p>';
 const links=workspace.albuns.filter(a=>a.mini_job_id===m.id);
 const options=allAlbums.filter(a=>!links.some(v=>v.id===a.id));
 const statusControl=isAdmin?'<label class="cw-detail-status">Andamento<select id="cw-status" '+(busy?'disabled':'')+'>'+Object.entries(titlecase).map(([k,v])=>'<option value="'+k+'" '+(m.status===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>':'<span class="cw-status cw-'+esc(m.status)+'">'+esc(titlecase[m.status]||m.status)+'</span>';
 const pinControl=isAdmin?'<button type="button" data-action="toggle-pin" aria-pressed="'+!!m.fixado+'" aria-label="'+(m.fixado?'Desafixar assunto':'Fixar assunto')+'" title="'+(m.fixado?'Desafixar assunto':'Fixar assunto')+'" style="margin:8px 0;padding:7px 12px;border:1px solid currentColor;border-radius:8px;cursor:pointer">'+(m.fixado?'📌':'📍')+'</button>':(m.fixado?'<span aria-label="Assunto fixado">📌 Fixado</span>':'');
 const notes='<div class="cw-description-min"><span class="cw-description-label">Descrição</span><p class="cw-description-text">'+esc(m.descricao||'Sem descrição inicial.')+'</p>'+(isAdmin?'<button type="button" class="cw-edit-desc" data-action="edit-notes" aria-label="Editar descrição">✎ Editar</button><div class="cw-description-edit" hidden><textarea id="cw-notes" rows="3">'+esc(m.descricao||'')+'</textarea><button class="cw-save" data-action="save-notes" '+(busy?'disabled':'')+'>Salvar</button><button type="button" data-action="cancel-notes">Cancelar</button></div>':'')+'</div>';
 const save='';
 const albumRows=links.length?links.map(a=>'<div class="cw-album-link"><button data-album="'+esc(a.id)+'">'+esc(a.titulo)+' <span>›</span></button>'+(isAdmin?'<button aria-label="Desvincular álbum" data-unlink="'+esc(a.id)+'">×</button>':'')+'</div>').join(''):'<p class="cw-empty">Nenhum álbum vinculado ainda.</p>';
 const albumActions=isAdmin?'<div class="cw-album-actions"><button data-action="new-album">＋ Criar álbum</button>'+(options.length?'<select id="cw-album-pick"><option value="">Vincular álbum existente...</option>'+options.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.titulo)+'</option>').join('')+'</select>':'')+'</div>':'';
 return '<div class="cw-detail"><div class="cw-mini-eyebrow">'+esc(m.assunto)+(m.demonstracao?' · EXEMPLO':'')+'</div><h2>'+esc(m.titulo)+'</h2><div class="cw-detail-meta">'+esc(m.area==='privativa'?labelLocal(m.local_id):'Áreas comuns')+'</div>'+statusControl+pinControl+notes+save+albumActions+'<details class="cw-albums-fold"'+(links.length?' open':'')+'><summary>Álbuns vinculados'+(links.length?' ('+links.length+')':'')+'</summary><div class="cw-albums-body">'+albumRows+'</div></details><section id="cw-mini-history" data-mini="'+esc(m.id)+'"></section>'+documentPanel(m.local_id,m.id)+'</div>';
}
function render(){
 if(!root)return;
 const heading=state.detail?'<div class="cw-jobhead cw-jobhead-small"><div class="cw-kicker">'+esc(job.cliente||'Condomínio')+' · '+esc(job.titulo)+'</div></div>':'<div class="cw-jobhead"><div class="cw-kicker">'+esc(job.cliente||'Condomínio')+' / JOB</div><h1>'+esc(job.titulo)+'</h1></div>';
 root.innerHTML='<div class="cw-app">'+heading+breadcrumb()+(errorText?'<p class="cw-error" role="alert">'+esc(errorText)+'</p>':'')+(state.detail?detail():!state.area?overview():subjectStrip()+(state.area==='comum'?common():privativa()))+'</div>';
 bind();
 mountDocuments();
 if(state.detail&&window.PLMiniHistory)window.PLMiniHistory.mount(root,job.id,state.detail,isAdmin).catch(e=>console.warn('Histórico do assunto',e));
}
async function reload(){
 const {data,error}=await sb().rpc('pl_condo_workspace_data',{p_job_id:job.id});
 if(error||!data?.job_id)throw new Error(error?.message||'Job não autorizado ou estrutura indisponível.');
 workspace=data;
 const pins=await sb().from('mini_jobs').select('id,fixado').eq('job_id',job.id);
 if(pins.error)console.warn('Estado de assuntos fixados indisponível',pins.error);
 else {const byId=new Map((pins.data||[]).map(x=>[x.id,!!x.fixado]));for(const m of workspace.mini_jobs||[])m.fixado=byId.get(m.id)||false;}
 pendingByUnit={};vistoriaByMini={};
 const ids=(workspace.mini_jobs||[]).filter(m=>m.local_id&&!m.demonstracao).map(m=>m.id);
 if(ids.length){const p=await sb().from('job_feed').select('mini_job_id,demanda_vistoria').eq('tipo','pendencia').eq('resolvido',false).in('mini_job_id',ids);if(!p.error)for(const row of p.data||[]){const m=workspace.mini_jobs.find(x=>x.id===row.mini_job_id);if(m){pendingByUnit[m.local_id]=(pendingByUnit[m.local_id]||0)+1;if(row.demanda_vistoria)vistoriaByMini[m.id]=true;}}else console.warn('Pendências indisponíveis',p.error);}
 const result=await sb().from('albuns').select('id,titulo,assunto,data_vistoria').eq('job_principal_id',job.id).order('criado_em',{ascending:false});
 allAlbums=result.error?[]:result.data||[];
 render();
}
async function guarded(fn){
 if(busy)return false;
 busy=true;errorText='';try{await fn();await reload();return true}catch(e){errorText=e.message||'Não foi possível concluir a alteração';render();return false}finally{busy=false}
}
function createAlbumForSubject(miniId){
 const m=mini().find(x=>x.id===miniId);if(!m){errorText='Selecione um assunto antes de criar o álbum.';render();return}
 if(!window.PLAlbumImport?.create){errorText='Criador de álbuns indisponível.';render();return}
 const jobId=job.id;
 window.PLAlbumImport.create(jobId,async albumId=>{
  const linked=await guarded(async()=>{
   const {error}=await sb().from('mini_job_albuns').insert({mini_job_id:miniId,album_id:albumId});if(error)throw new Error('Álbum criado, mas não vinculado ao assunto: '+error.message+'. Use Vincular álbum existente para concluir.');
  });
  if(linked)document.dispatchEvent(new CustomEvent('pl:open-album',{detail:{id:albumId}}));
 });
}
function bind(){
 root.querySelectorAll('[data-crumb]').forEach(b=>b.onclick=()=>{
  const target=b.dataset.crumb;state.detail=null;state.form=false;state.search='';
  if(target==='overview'){state.area=null;state.tower=null;state.unit=null;state.subject=null}
  if(target==='area'){state.tower=null;state.unit=null;state.subject=null}
  if(target==='tower'){state.unit=null}
  render();
 });
 root.querySelectorAll('[data-area]').forEach(b=>b.onclick=()=>{state.area=b.dataset.area;state.tab='apartamento';state.tower=null;state.unit=null;state.subject=null;state.filter='todos';state.form=false;render()});
 root.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{state.tab=b.dataset.tab;state.tower=null;state.unit=null;state.subject=null;state.filter='todos';state.form=false;render()});
 root.querySelectorAll('[data-tower]').forEach(b=>b.onclick=()=>{state.tower=b.dataset.tower;state.search='';render()});
 root.querySelectorAll('[data-unit-filter]').forEach(b=>b.onclick=()=>{state.unitFilter=b.dataset.unitFilter;render()});
 root.querySelectorAll('[data-toggle-obra]').forEach(b=>b.onclick=()=>guarded(async()=>{
  const u=locais().find(x=>x.id===b.dataset.toggleObra);if(!u)throw new Error('Apartamento não encontrado');
  const {data,error}=await sb().from('locais').update({obra_ativa:!u.obra_ativa}).eq('id',u.id).select('id');
  if(error)throw error;
  if(!data||!data.length)throw new Error('A atualização não foi autorizada ou não encontrou o apartamento');
 }));
 root.querySelectorAll('[data-unit]').forEach(b=>b.onclick=()=>{state.unit=b.dataset.unit;state.filter='todos';render()});
 root.querySelectorAll('[data-subject]').forEach(b=>b.onclick=()=>{state.subject=b.dataset.subject||null;state.form=false;render()});
 root.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter;render()});
 root.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>{state.detail=b.dataset.detail;state.form=false;render()});
 const searchToggle=root.querySelector('[data-subject-search-toggle]');
 const searchField=root.querySelector('[data-subject-search]');
 if(searchToggle&&searchField){
  searchToggle.onclick=()=>{searchField.hidden=!searchField.hidden;if(!searchField.hidden)searchField.focus();else{searchField.value='';searchField.dispatchEvent(new Event('input'))}};
  searchField.oninput=()=>{const q=searchField.value.trim().toLocaleLowerCase('pt-BR');root.querySelectorAll('.cw-subject-rail [data-subject-title]').forEach(b=>{b.hidden=!b.dataset.subjectTitle.includes(q)});};
 }
 root.querySelector('[data-subject-all]')?.addEventListener('click',()=>{state.subject=null;state.filter='todos';render()});

 root.querySelector('[data-action="add"]')?.addEventListener('click',()=>{state.form=!state.form;render();root.querySelector('[name="titulo"]')?.focus()});
 root.querySelector('[data-action="cancel-form"]')?.addEventListener('click',()=>{state.form=false;render()});
 root.querySelector('#cw-unit-search')?.addEventListener('input',e=>{state.search=e.target.value;const start=e.target.selectionStart;render();const inp=root.querySelector('#cw-unit-search');inp?.focus();inp?.setSelectionRange(start,start)});
 root.querySelector('#cw-form')?.addEventListener('submit',e=>{
  e.preventDefault();const f=new FormData(e.target);
  const loc=state.area==='privativa'?(state.unit||f.get('local_id')):null;
  if(state.area==='privativa'&&!loc){errorText='Selecione uma unidade antes de salvar.';render();return}
  guarded(async()=>{
   const {error}=await sb().from('mini_jobs').insert({job_id:job.id,area:state.area,local_id:loc||null,assunto:String(f.get('assunto')).trim(),titulo:String(f.get('titulo')).trim(),descricao:String(f.get('descricao')).trim(),status:String(f.get('status')),demonstracao:false});
   if(error)throw error;state.form=false;
  });
 });
 root.querySelector('[data-action="toggle-pin"]')?.addEventListener('click',()=>guarded(async()=>{
  const m=mini().find(x=>x.id===state.detail);if(!m)return;
  const {error}=await sb().from('mini_jobs').update({fixado:!m.fixado,atualizado_em:new Date().toISOString()}).eq('id',m.id).eq('job_id',job.id);
  if(error)throw error;
 }));
 root.querySelector('#cw-status')?.addEventListener('change',e=>guarded(async()=>{
  const {error}=await sb().from('mini_jobs').update({status:e.target.value,atualizado_em:new Date().toISOString()}).eq('id',state.detail).eq('job_id',job.id);if(error)throw error;
 }));
 root.querySelector('[data-action="edit-notes"]')?.addEventListener('click',()=>{root.querySelector('.cw-description-edit').hidden=false;root.querySelector('[data-action="edit-notes"]').hidden=true;});
 root.querySelector('[data-action="cancel-notes"]')?.addEventListener('click',()=>{root.querySelector('.cw-description-edit').hidden=true;root.querySelector('[data-action="edit-notes"]').hidden=false;});
 root.querySelector('[data-action="save-notes"]')?.addEventListener('click',()=>guarded(async()=>{
  const {error}=await sb().from('mini_jobs').update({descricao:root.querySelector('#cw-notes').value,atualizado_em:new Date().toISOString()}).eq('id',state.detail).eq('job_id',job.id);if(error)throw error;
 }));
 root.querySelector('[data-action="new-album"]')?.addEventListener('click',()=>createAlbumForSubject(state.detail));
 root.querySelector('[data-action="unit-new-album"]')?.addEventListener('click',()=>{
  const items=mini().filter(m=>m.local_id===state.unit&&m.area==='privativa'&&!m.demonstracao);
  if(!items.length){state.form=true;render();root.querySelector('#cw-form [name="titulo"]')?.focus();return}
  if(items.length===1){createAlbumForSubject(items[0].id);return}
  const panel=root.querySelector('[data-unit-album-form]');if(panel){panel.hidden=false;panel.querySelector('select')?.focus()}
 });
 root.querySelector('[data-action="unit-album-cancel"]')?.addEventListener('click',()=>{const panel=root.querySelector('[data-unit-album-form]');if(panel)panel.hidden=true});
 root.querySelector('#cw-unit-album-form')?.addEventListener('submit',e=>{
  e.preventDefault();const id=String(new FormData(e.currentTarget).get('mini_job_id')||'');
  if(!mini().some(m=>m.id===id&&m.local_id===state.unit&&m.area==='privativa'&&!m.demonstracao)){errorText='Selecione um assunto deste apartamento.';render();return}
  createAlbumForSubject(id);
 });
 root.querySelector('#cw-album-pick')?.addEventListener('change',e=>{
  const id=e.target.value;if(!id)return;
  guarded(async()=>{const {error}=await sb().from('mini_job_albuns').insert({mini_job_id:state.detail,album_id:id});if(error)throw error});
 });
 root.querySelectorAll('[data-unlink]').forEach(b=>b.onclick=()=>guarded(async()=>{
  const {error}=await sb().from('mini_job_albuns').delete().eq('mini_job_id',state.detail).eq('album_id',b.dataset.unlink);if(error)throw error;
 }));
 root.querySelectorAll('[data-album]').forEach(b=>b.onclick=()=>document.dispatchEvent(new CustomEvent('pl:open-album',{detail:{id:b.dataset.album}})));
}
window.PLCondoWorkspace={
 async mount(node,currentJob){
  root=node;job=currentJob;errorText='';isAdmin=false;Object.assign(state,{area:null,tab:'apartamento',tower:null,unit:null,subject:null,filter:'todos',detail:null,form:false,search:''});
  node.innerHTML='<p class="pl-empty">Carregando áreas, torres e assuntos…</p>';
  try{const profile=await sb().rpc('pl_meu_perfil');isAdmin=!profile.error&&profile.data?.ativo&&profile.data?.papel==='administrador';await reload()}catch(e){node.innerHTML='<p class="pl-error">Não foi possível abrir o monitoramento: '+esc(e.message)+'</p>'}
 }
};
})();