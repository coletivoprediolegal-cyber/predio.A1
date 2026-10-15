(function(){
'use strict';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const titlecase={planejado:'Planejado',em_andamento:'Em andamento',concluido:'Concluído',suspenso:'Suspenso'};
const state={area:null,tab:'apartamento',tower:null,unit:null,subject:null,filter:'todos',detail:null,form:false,search:''};
let root=null,job=null,workspace={locais:[],mini_jobs:[],albuns:[]},allAlbums=[],busy=false,errorText='',isAdmin=false;
const sb=()=>window.plSupabase;
const mini=()=>workspace.mini_jobs||[];
const locais=()=>workspace.locais||[];
const selectedUnit=()=>locais().find(l=>l.id===state.unit);
const sorted=(a,b)=>String(a).localeCompare(String(b),'pt-BR',{numeric:true});
const type=l=>String(l.tipo||'').toLowerCase();
const towers=()=>locais().filter(l=>type(l).includes('torre')||type(l).includes('bloco')&&!l.numero).sort((a,b)=>sorted(a.bloco,b.bloco));
const units=tower=>locais().filter(l=>l.local_pai_id===tower&&l.numero).sort((a,b)=>sorted(a.numero,b.numero));
const labelLocal=id=>{const l=locais().find(x=>x.id===id);return l?(l.numero?'Apto '+l.numero+' · Torre '+l.bloco:l.nome):'Sem unidade definida'};
const currentItems=()=>mini().filter(m=>m.area===state.area&&(state.area!=='privativa'||state.tab==='assunto'?(state.subject?m.assunto===state.subject:true):(state.unit?m.local_id===state.unit:state.tower?units(state.tower).some(l=>l.id===m.local_id):true))&&(state.filter==='todos'||m.status===state.filter));
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
 if(state.detail)nodes.push(['Mini-job','detail']);
 return '<div class="cw-crumb">'+nodes.map((n,i)=>i===nodes.length-1?'<span>'+esc(n[0])+'</span>':'<button data-crumb="'+esc(n[1])+'">'+esc(n[0])+'</button><span aria-hidden="true">›</span>').join('')+'</div>';
}
function itemRow(m){
 const amount=workspace.albuns.filter(a=>a.mini_job_id===m.id).length;
 return '<button class="cw-mini" data-detail="'+esc(m.id)+'"><div class="cw-mini-main"><div class="cw-mini-eyebrow">'+esc(m.assunto)+(m.demonstracao?' · EXEMPLO':'')+'</div><strong>'+esc(m.titulo)+'</strong><small>'+esc(m.area==='privativa'?labelLocal(m.local_id):'Área comum')+(amount?' · '+amount+' álbum(ns)':'')+'</small></div><span class="cw-status cw-'+esc(m.status)+'">'+esc(titlecase[m.status]||m.status)+'</span><span class="cw-chevron">›</span></button>';
}
function filterBar(){
 return '<div class="cw-filters" aria-label="Filtrar por andamento">'+[['todos','Todos'],['em_andamento','Em andamento'],['planejado','Planejados'],['concluido','Concluídos'],['suspenso','Suspensos']].map(p=>'<button data-filter="'+p[0]+'" class="'+(state.filter===p[0]?'selected':'')+'">'+p[1]+'</button>').join('')+'</div>';
}
function form(){
 const options=state.area==='privativa'&&(!state.unit)
  ?'<label>Unidade<select name="local_id" required><option value="">Selecione o apartamento</option>'+locais().filter(l=>l.numero).sort((a,b)=>sorted(a.bloco+a.numero,b.bloco+b.numero)).map(l=>'<option value="'+esc(l.id)+'">Torre '+esc(l.bloco)+' · Apto '+esc(l.numero)+'</option>').join('')+'</select></label>'
  :'';
 const suggested=state.area==='comum'?['Fachadas','Pintura e padronização','Playground','Instalações','Manutenção predial']:['Obras privativas','Vistorias de unidades','Manifestações patológicas','Consultas técnicas'];
 return '<form id="cw-form" class="cw-form"><div class="cw-form-title">Novo mini-job</div><label>Título<input name="titulo" maxlength="180" required placeholder="Ex.: Verificação da reforma" autocomplete="off"></label><label>Assunto<input name="assunto" list="cw-subjects" maxlength="120" required value="'+esc(state.subject|| (state.area==='privativa'?'Obras privativas':''))+'" placeholder="Ex.: Obras privativas"><datalist id="cw-subjects">'+[...new Set([...suggested,...subjects()])].map(s=>'<option value="'+esc(s)+'"></option>').join('')+'</datalist></label>'+options+'<label>Status<select name="status"><option value="em_andamento">Em andamento</option><option value="planejado">Planejado</option><option value="concluido">Concluído</option><option value="suspenso">Suspenso</option></select></label><label>Observações<textarea name="descricao" rows="2" placeholder="Opcional"></textarea></label><div class="cw-form-actions"><button type="button" data-action="cancel-form">Cancelar</button><button type="submit" '+(busy?'disabled':'')+'>Salvar mini-job</button></div></form>';
}
function addButton(){
 return isAdmin?'<button class="cw-add" data-action="add">＋ Novo mini-job</button>':'';
}
function list(items,showAdd=true){
 return (showAdd?'<div class="cw-list-actions"><span>'+items.length+' mini-job(s)</span>'+addButton()+'</div>':'')+(items.length?'<div class="cw-mini-list">'+items.map(itemRow).join('')+'</div>':'<p class="cw-empty">Nenhum mini-job nesta seleção.</p>')+(state.form?form():'');
}
function unitView(){
 const u=selectedUnit();if(!u){state.unit=null;return '<p class="cw-empty">Unidade não encontrada.</p>'}
 return '<div class="cw-subheading"><div><h2>'+esc(labelLocal(u.id))+'</h2><p>'+esc(u.tipo_unidade||'Unidade privativa')+'</p></div></div>'+filterBar()+list(currentItems());
}
function towerView(){
 const t=towers().find(x=>x.id===state.tower);if(!t)return '<p class="cw-empty">Torre não encontrada.</p>';
 const q=state.search.toLocaleLowerCase('pt-BR');
 const rows=units(t.id).filter(u=>(u.numero||'').toLowerCase().includes(q));
 return '<div class="cw-subheading"><h2>Torre '+esc(t.bloco)+'</h2><span>'+units(t.id).length+' apartamentos</span></div><input class="cw-quick-search" id="cw-unit-search" aria-label="Buscar apartamento" placeholder="Buscar apartamento..." value="'+esc(state.search)+'"><div class="cw-unit-grid">'+rows.map(u=>'<button data-unit="'+esc(u.id)+'"><strong>'+esc(u.numero)+'</strong><small>'+mini().filter(m=>m.local_id===u.id).length+' mini-job(s)</small></button>').join('')+'</div>';
}
function privativa(){
 const tabs='<div class="cw-tabs" role="tablist" aria-label="Forma de consulta"><button role="tab" aria-selected="'+(state.tab==='apartamento')+'" data-tab="apartamento">Por apartamento</button><button role="tab" aria-selected="'+(state.tab==='assunto')+'" data-tab="assunto">Por assunto</button></div>';
 if(state.tab==='apartamento'){
  if(state.unit)return tabs+unitView();
  if(state.tower)return tabs+towerView();
  const filtered=mini().filter(m=>m.area==='privativa');
  return tabs+'<h2 class="cw-section-label">Selecione a torre</h2><div class="cw-towers">'+towers().map(t=>{
   const count=filtered.filter(m=>units(t.id).some(u=>u.id===m.local_id)).length;
   return '<button data-tower="'+esc(t.id)+'"><strong>'+esc(t.bloco||t.nome)+'</strong><small>'+units(t.id).length+' aptos · '+count+' mini-jobs</small></button>';
  }).join('')+'</div><p class="cw-hint">Selecione a torre e depois o apartamento para consultar todas as intervenções da unidade.</p>';
 }
 return tabs+'<h2 class="cw-section-label">Consultar por assunto</h2><div class="cw-topics"><button data-subject="" class="'+(!state.subject?'selected':'')+'">Todos os assuntos</button>'+subjects().map(x=>'<button data-subject="'+esc(x)+'" class="'+(state.subject===x?'selected':'')+'">'+esc(x)+'</button>').join('')+'</div>'+filterBar()+list(currentItems());
}
function common(){
 return '<h2 class="cw-section-label">Áreas comuns · assuntos</h2><div class="cw-topics"><button data-subject="" class="'+(!state.subject?'selected':'')+'">Todos</button>'+subjects().map(x=>'<button data-subject="'+esc(x)+'" class="'+(state.subject===x?'selected':'')+'">'+esc(x)+'</button>').join('')+'</div>'+filterBar()+list(currentItems());
}
function overview(){
 const active=mini().filter(m=>m.status==='em_andamento'&&!m.demonstracao).length;
 const examples=mini().filter(m=>m.demonstracao).length;
 return '<div class="cw-overview"><p class="cw-info">Um único job mensal, organizado em assuntos e locais. Consulte os mesmos mini-jobs por apartamento ou por tema, sem duplicar registros.</p><div class="cw-choices"><button data-area="comum"><span class="cw-choice-icon">⌂</span><strong>Áreas comuns</strong><small>Fachadas, manutenção, playground e outros assuntos</small><span class="cw-arrow">›</span></button><button data-area="privativa"><span class="cw-choice-icon">▦</span><strong>Áreas privativas</strong><small>Torres, apartamentos e obras privativas</small><span class="cw-arrow">›</span></button></div><p class="cw-hint">'+active+' mini-job(s) reais em andamento'+(examples?' · '+examples+' registros ilustrativos identificados como EXEMPLO':'')+'</p></div>';
}
function detail(){
 const m=mini().find(x=>x.id===state.detail);if(!m)return '<p class="cw-empty">Mini-job não encontrado.</p>';
 const links=workspace.albuns.filter(a=>a.mini_job_id===m.id);
 const options=allAlbums.filter(a=>!links.some(v=>v.id===a.id));
 const statusControl=isAdmin?'<label class="cw-detail-status">Andamento<select id="cw-status" '+(busy?'disabled':'')+'>'+Object.entries(titlecase).map(([k,v])=>'<option value="'+k+'" '+(m.status===k?'selected':'')+'>'+v+'</option>').join('')+'</select></label>':'<span class="cw-status cw-'+esc(m.status)+'">'+esc(titlecase[m.status]||m.status)+'</span>';
 const notes='<label class="cw-detail-notes">Observações<textarea id="cw-notes" rows="4" '+(!isAdmin?'readonly':'')+'>'+esc(m.descricao||'')+'</textarea></label>';
 const save=isAdmin?'<button class="cw-save" data-action="save-notes" '+(busy?'disabled':'')+'>Salvar observações</button>':'';
 const albumRows=links.length?links.map(a=>'<div class="cw-album-link"><button data-album="'+esc(a.id)+'">'+esc(a.titulo)+' <span>›</span></button>'+(isAdmin?'<button aria-label="Desvincular álbum" data-unlink="'+esc(a.id)+'">×</button>':'')+'</div>').join(''):'<p class="cw-empty">Nenhum álbum vinculado ainda.</p>';
 const albumActions=isAdmin?'<div class="cw-album-actions"><button data-action="new-album">＋ Criar álbum</button>'+(options.length?'<select id="cw-album-pick"><option value="">Vincular álbum existente...</option>'+options.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.titulo)+'</option>').join('')+'</select>':'')+'</div>':'';
 return '<div class="cw-detail"><div class="cw-mini-eyebrow">'+esc(m.assunto)+(m.demonstracao?' · EXEMPLO':'')+'</div><h2>'+esc(m.titulo)+'</h2><div class="cw-detail-meta">'+esc(m.area==='privativa'?labelLocal(m.local_id):'Áreas comuns')+'</div>'+statusControl+notes+save+'<h3>Álbuns vinculados</h3>'+albumRows+albumActions+'</div>';
}
function render(){
 if(!root)return;
 const heading='<div class="cw-jobhead"><div class="cw-kicker">'+esc(job.cliente||'Condomínio')+' / JOB</div><h1>'+esc(job.titulo)+'</h1><p>Consultoria e monitoramento predial mensal</p></div>';
 root.innerHTML='<div class="cw-app">'+heading+breadcrumb()+(errorText?'<p class="cw-error" role="alert">'+esc(errorText)+'</p>':'')+(state.detail?detail():!state.area?overview():state.area==='comum'?common():privativa())+'</div>';
 bind();
}
async function reload(){
 const {data,error}=await sb().rpc('pl_condo_workspace_data',{p_job_id:job.id});
 if(error||!data?.job_id)throw new Error(error?.message||'Job não autorizado ou estrutura indisponível.');
 workspace=data;
 const result=await sb().from('albuns').select('id,titulo,assunto,data_vistoria').eq('job_principal_id',job.id).order('criado_em',{ascending:false});
 allAlbums=result.error?[]:result.data||[];
 render();
}
async function guarded(fn){
 if(busy)return false;
 busy=true;errorText='';try{await fn();await reload();return true}catch(e){errorText=e.message||'Não foi possível concluir a alteração';render();return false}finally{busy=false}
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
 root.querySelectorAll('[data-unit]').forEach(b=>b.onclick=()=>{state.unit=b.dataset.unit;state.filter='todos';render()});
 root.querySelectorAll('[data-subject]').forEach(b=>b.onclick=()=>{state.subject=b.dataset.subject||null;state.form=false;render()});
 root.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter;render()});
 root.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>{state.detail=b.dataset.detail;state.form=false;render()});
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
 root.querySelector('#cw-status')?.addEventListener('change',e=>guarded(async()=>{
  const {error}=await sb().from('mini_jobs').update({status:e.target.value,atualizado_em:new Date().toISOString()}).eq('id',state.detail).eq('job_id',job.id);if(error)throw error;
 }));
 root.querySelector('[data-action="save-notes"]')?.addEventListener('click',()=>guarded(async()=>{
  const {error}=await sb().from('mini_jobs').update({descricao:root.querySelector('#cw-notes').value,atualizado_em:new Date().toISOString()}).eq('id',state.detail).eq('job_id',job.id);if(error)throw error;
 }));
 root.querySelector('[data-action="new-album"]')?.addEventListener('click',()=>{
  if(!window.PLAlbumImport?.create){errorText='Criador de álbuns indisponível.';render();return}
  window.PLAlbumImport.create(job.id,async albumId=>{
   const linked=await guarded(async()=>{
    const {error}=await sb().from('mini_job_albuns').insert({mini_job_id:state.detail,album_id:albumId});if(error)throw error;
   });
   if(linked)document.dispatchEvent(new CustomEvent('pl:open-album',{detail:{id:albumId}}));
  });
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
  node.innerHTML='<p class="pl-empty">Carregando áreas, torres e mini-jobs…</p>';
  try{const profile=await sb().rpc('pl_meu_perfil');isAdmin=!profile.error&&profile.data?.ativo&&profile.data?.papel==='administrador';await reload()}catch(e){node.innerHTML='<p class="pl-error">Não foi possível abrir o monitoramento: '+esc(e.message)+'</p>'}
 }
};
})();