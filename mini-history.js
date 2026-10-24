(function(){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=x=>new Date(x).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
let sequence=0;
async function mount(root,jobId,miniId,canWrite){
 const node=root.querySelector('#cw-mini-history');
 if(!node)return;
 const token=++sequence, sb=window.plSupabase;
 let page=0,filter='todos',query='',busy=false,allDone=false;
 node.innerHTML='<h3>Histórico do assunto</h3><p class="cw-history-explain">Atualizações e decisões deste assunto, vinculadas ao Job principal.</p>'+
 '<input type="search" class="cw-history-search" aria-label="Pesquisar no histórico" placeholder="Buscar em todo o histórico…">'+
 '<div class="cw-history-toolbar">'+[['todos','Todos'],['pendencia','Pendências'],['decisao','Decisões'],['comentario','Atualizações']].map(([v,n])=>'<button type="button" data-history-filter="'+v+'" aria-pressed="'+String(v==='todos')+'">'+n+'</button>').join('')+'</div>'+
 '<div class="cw-history-list" aria-live="polite"></div><button type="button" class="cw-history-more" hidden>Carregar mais</button>'+
 (canWrite?'<form id="cw-history-form"><label>Nova atualização<textarea name="conteudo" rows="3" required maxlength="5000" placeholder="Ex.: Em reunião, definida a cor da fachada…"></textarea></label><div class="cw-history-controls"><label>Tipo<select name="tipo"><option value="comentario">Atualização</option><option value="decisao">Decisão confirmada</option><option value="pendencia">Pendência</option></select></label><label>Visibilidade<select name="visibilidade"><option value="geral" selected>Geral</option><option value="interno">Interno</option></select></label></div><button class="cw-save" type="submit">Registrar atualização</button><p role="status"></p></form>':'');
 const list=node.querySelector('.cw-history-list'),more=node.querySelector('.cw-history-more');
 async function fetchPage(reset=false){
  if(busy||token!==sequence)return;
  if(reset){page=0;allDone=false;list.innerHTML='';}
  if(allDone)return;
  busy=true;more.disabled=true;more.hidden=true;
  let req=sb.from('job_feed').select('id,conteudo,criado_em,autor_id,tipo,visibilidade,resolvido,prazo').eq('job_id',jobId).eq('mini_job_id',miniId);
  if(filter!=='todos')req=req.eq('tipo',filter);
  if(query)req=req.ilike('conteudo','%'+query.replace(/[%_]/g,'\\$&')+'%');
  const {data,error}=await req.order('criado_em',{ascending:false}).order('id',{ascending:false}).range(page*20,page*20+19);
  busy=false;
  if(token!==sequence||!node.isConnected||node.dataset.mini!==miniId)return;
  if(error){list.insertAdjacentHTML('beforeend','<p class="cw-error">'+esc(error.message)+'</p>');more.hidden=false;more.disabled=false;return;}
  if(!data?.length&&page===0)list.innerHTML='<p class="cw-empty">Nenhum registro encontrado neste filtro.</p>';
  if(data?.length){list.insertAdjacentHTML('beforeend',data.map(x=>'<article class="cw-history-entry"><small>'+esc(date(x.criado_em))+' · '+esc(x.tipo==='decisao'?'Decisão confirmada':x.tipo==='pendencia'?'Pendência':'Atualização')+' · '+esc(x.visibilidade==='interno'?'Interno':'Geral')+' · '+esc(x.autor_id?.slice(0,8)||'Autor não identificado')+'</small><p>'+esc(x.conteudo)+'</p>'+(x.prazo?'<small>Prazo: '+esc(x.prazo)+'</small>':'')+'</article>').join(''));page++;}
  allDone=(data||[]).length<20;
  more.hidden=allDone;more.disabled=false;
 }
 more.onclick=()=>fetchPage();
 node.querySelectorAll('[data-history-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.historyFilter;node.querySelectorAll('[data-history-filter]').forEach(t=>t.setAttribute('aria-pressed',String(t===b)));fetchPage(true);});
 let searchVersion=0;
 node.querySelector('.cw-history-search').oninput=e=>{
  const version=++searchVersion,next=e.target.value.trim();
  // A busca é executada no servidor, nunca apenas nos 20 registros visíveis.
  Promise.resolve().then(()=>{if(version!==searchVersion)return;query=next;busy=false;fetchPage(true)});
 };
 const f=node.querySelector('#cw-history-form');
 if(f)f.onsubmit=async e=>{
  e.preventDefault();const submit=f.querySelector('[type=submit]'),status=f.querySelector('[role=status]');submit.disabled=true;
  const payload={job_id:jobId,mini_job_id:miniId,conteudo:f.elements.conteudo.value.trim(),tipo:f.elements.tipo.value,visibilidade:f.elements.visibilidade.value};
  const {error}=await sb.from('job_feed').insert(payload);submit.disabled=false;
  if(error){status.textContent='Não foi possível salvar: '+error.message;return;}
  await mount(root,jobId,miniId,canWrite);
 };
 await fetchPage();
}
window.PLMiniHistory={mount};
})();