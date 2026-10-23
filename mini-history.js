(function(){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=x=>new Date(x).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'});
let sequence=0;
async function mount(root,jobId,miniId,canWrite){
 const node=root.querySelector('#cw-mini-history');
 if(!node)return;
 const token=++sequence;
 node.innerHTML='<h3>Histórico do assunto</h3><p class="cw-empty">Carregando atualizações…</p>';
 const sb=window.plSupabase;
 const {data,error}=await sb.from('job_feed').select('id,conteudo,criado_em,autor_id,tipo,visibilidade,resolvido,prazo').eq('job_id',jobId).eq('mini_job_id',miniId).order('criado_em',{ascending:true}).limit(500);
 if(token!==sequence||!node.isConnected||node.dataset.mini!==miniId)return;
 const items=error?'<p class="cw-error">'+esc(error.message)+'</p>':(data?.length?data.map(x=>'<article class="cw-history-entry"><small>'+esc(date(x.criado_em))+' · '+esc(x.tipo==='decisao'?'Decisão confirmada':x.tipo==='pendencia'?'Pendência': 'Atualização')+' · '+esc(x.visibilidade==='interno'?'Interno':'Geral')+' · '+esc(x.autor_id?.slice(0,8)||'Autor não identificado')+'</small><p>'+esc(x.conteudo)+'</p>'+(x.prazo?'<small>Prazo: '+esc(x.prazo)+'</small>':'')+'</article>').join(''):'<p class="cw-empty">Nenhuma atualização registrada. As observações acima continuam preservadas.</p>');
 const form=canWrite?'<form id="cw-history-form"><label>Nova atualização<textarea name="conteudo" rows="3" required maxlength="5000" placeholder="Ex.: Em reunião, definida a cor da fachada…"></textarea></label><div class="cw-history-controls"><label>Tipo<select name="tipo"><option value="comentario">Atualização</option><option value="decisao">Decisão confirmada</option><option value="pendencia">Pendência</option></select></label><label>Visibilidade<select name="visibilidade"><option value="geral" selected>Geral</option><option value="interno">Interno</option></select></label></div><button class="cw-save" type="submit">Registrar atualização</button><p role="status"></p></form>':'';
 node.innerHTML='<h3>Histórico do assunto</h3><p class="cw-history-explain">Registros cronológicos deste mini-job, vinculados ao histórico do Job principal.</p><div class="cw-history-list">'+items+'</div>'+form;
 const f=node.querySelector('#cw-history-form');
 if(f)f.onsubmit=async e=>{
  e.preventDefault();
  const submit=f.querySelector('[type=submit]'),status=f.querySelector('[role=status]');submit.disabled=true;
  const payload={job_id:jobId,mini_job_id:miniId,conteudo:f.elements.conteudo.value.trim(),tipo:f.elements.tipo.value,visibilidade:f.elements.visibilidade.value};
  const {error}=await sb.from('job_feed').insert(payload);
  submit.disabled=false;
  if(error){status.textContent='Não foi possível salvar: '+error.message;return;}
  await mount(root,jobId,miniId,canWrite);
 };
}
window.PLMiniHistory={mount};
})();