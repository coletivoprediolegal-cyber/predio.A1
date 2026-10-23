(function(){
'use strict';
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const labels={comentario:'Comentário',decisao:'Decisão confirmada',pendencia:'Pendência'};
const when=v=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v));
let activeJob=null;
async function mount(jobId){
 const host=document.querySelector('#pl-job-content');if(!host||!jobId)return;
 activeJob=jobId;
 let box=host.querySelector('#pl-job-feed');
 if(!box){box=document.createElement('section');box.id='pl-job-feed';box.className='pl-job-feed';host.append(box)}
 box.innerHTML='<h2>Histórico do Job</h2><form id="pl-feed-form"><textarea name="conteudo" rows="2" placeholder="Registrar andamento, decisão ou pendência…" required maxlength="5000"></textarea><div class="pl-feed-controls"><label>Tipo<select name="tipo"><option value="comentario">Comentário</option><option value="decisao">Decisão confirmada</option><option value="pendencia">Pendência</option></select></label><label>Visibilidade<select name="visibilidade"><option value="geral">Geral</option><option value="interno">Interno</option></select></label><label class="pl-feed-due" hidden>Prazo<input name="prazo" type="date"></label><button type="submit">Publicar</button></div><p role="status"></p></form><label>Pesquisar no histórico<input id="pl-feed-search" type="search" placeholder="Palavra-chave ou autor"></label><div id="pl-feed-items">Carregando…</div>';
 const form=box.querySelector('#pl-feed-form');const type=form.elements.tipo;
 type.onchange=()=>{box.querySelector('.pl-feed-due').hidden=type.value!=='pendencia'};
 box.querySelector('#pl-feed-search').oninput=e=>{const q=e.target.value.toLocaleLowerCase('pt-BR');box.querySelectorAll('[data-feed-item]').forEach(el=>{el.hidden=!el.textContent.toLocaleLowerCase('pt-BR').includes(q)})};
 form.onsubmit=async e=>{
 e.preventDefault();if(activeJob!==jobId)return;
 const sb=window.plSupabase,fd=new FormData(form),btn=form.querySelector('button[type=submit]');btn.disabled=true;
 const payload={job_id:jobId,conteudo:String(fd.get('conteudo')||'').trim(),tipo:fd.get('tipo'),visibilidade:fd.get('visibilidade'),prazo:fd.get('tipo')==='pendencia'?(fd.get('prazo')||null):null};
 const {error}=await sb.from('job_feed').insert(payload);
 btn.disabled=false;if(error){form.querySelector('[role=status]').textContent='Erro: '+error.message;return}
 form.reset();box.querySelector('.pl-feed-due').hidden=true;form.querySelector('[role=status]').textContent='Registro adicionado.';await load(jobId,box);
 };
 await load(jobId,box);
}
async function load(id,box){
 const sb=window.plSupabase;
 const {data,error}=await sb.from('job_feed').select('id,autor_id,criado_em,conteudo,tipo,visibilidade,resolvido,prazo').eq('job_id',id).order('criado_em',{ascending:false}).limit(300);
 const list=box.querySelector('#pl-feed-items');if(!list)return;
 if(error){list.textContent='Não foi possível carregar o histórico: '+error.message;return}
 const ids=[...new Set((data||[]).map(x=>x.autor_id))];
 const {data:people}=ids.length?await sb.from('perfis_acesso').select('usuario_id,papel').in('usuario_id',ids):{data:[]};
 const authors=new Map((people||[]).map(p=>[p.usuario_id,p.papel]));
 list.innerHTML=(data||[]).map(x=>'<article data-feed-item><div class="pl-feed-meta"><b>'+escapeHTML(labels[x.tipo]||x.tipo)+'</b> · '+escapeHTML(x.visibilidade)+' · '+escapeHTML(when(x.criado_em))+' · '+escapeHTML(authors.get(x.autor_id)||'Usuário')+' <small>'+escapeHTML(x.autor_id.slice(0,8))+'</small></div><p>'+escapeHTML(x.conteudo)+'</p>'+(x.prazo?'<small>Prazo: '+escapeHTML(x.prazo)+'</small>':'')+'</article>').join('')||'<p>Nenhum registro neste Job.</p>';
}
window.PLJobFeed={mount};
})();