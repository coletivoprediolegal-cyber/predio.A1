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
 box.innerHTML='<h2>Histórico do Job</h2><div class="pl-feed-views"><button type="button" data-v="recentes">Recentes</button><button type="button" data-v="assuntos">Assuntos</button><button type="button" data-v="pendencias">Pendências</button></div><div id="pl-feed-topics"></div><form id="pl-feed-topic-form"><input name="titulo" placeholder="Novo assunto (ex.: pingadeiras)" required><button type="submit">Criar assunto</button></form><form id="pl-feed-form"><label>Assunto<select name="assunto_id" id="pl-feed-topic-select"><option value="">Sem assunto específico</option></select></label><textarea name="conteudo" rows="2" placeholder="Registrar andamento, decisão ou pendência…" required maxlength="5000"></textarea><div class="pl-feed-controls"><label>Tipo<select name="tipo"><option value="comentario">Comentário</option><option value="decisao">Decisão confirmada</option><option value="pendencia">Pendência</option></select></label><label>Visibilidade<select name="visibilidade"><option value="geral">Geral</option><option value="interno">Interno</option></select></label><label class="pl-feed-due" hidden>Prazo<input name="prazo" type="date"></label><button type="submit">Publicar</button></div><p role="status"></p></form><label>Pesquisar no histórico<input id="pl-feed-search" type="search" placeholder="Palavra-chave ou autor"></label><div id="pl-feed-items">Carregando…</div>';
 const form=box.querySelector('#pl-feed-form'); let currentView='recentes'; box.querySelectorAll('[data-v]').forEach(btn=>btn.onclick=()=>{currentView=btn.dataset.v;box.querySelectorAll('[data-feed-item]').forEach(el=>el.hidden=currentView==='pendencias'&&el.dataset.tipo!=='pendencia');box.querySelector('#pl-feed-topics').hidden=currentView==='recentes'});const topicForm=box.querySelector('#pl-feed-topic-form');topicForm.onsubmit=async e=>{e.preventDefault();const title=topicForm.elements.titulo.value.trim();if(!title)return;const {error}=await window.plSupabase.from('job_assuntos').insert({job_id:jobId,titulo:title});if(error){alert(error.message);return}topicForm.reset();await loadTopics(jobId,box)};await loadTopics(jobId,box);const type=form.elements.tipo;
 type.onchange=()=>{box.querySelector('.pl-feed-due').hidden=type.value!=='pendencia'};
 box.querySelector('#pl-feed-search').oninput=e=>{const q=e.target.value.toLocaleLowerCase('pt-BR');box.querySelectorAll('[data-feed-item]').forEach(el=>{el.hidden=!el.textContent.toLocaleLowerCase('pt-BR').includes(q)})};
 form.onsubmit=async e=>{
 e.preventDefault();if(activeJob!==jobId)return;
 const sb=window.plSupabase,fd=new FormData(form),btn=form.querySelector('button[type=submit]');btn.disabled=true;
 const payload={job_id:jobId,conteudo:String(fd.get('conteudo')||'').trim(),tipo:fd.get('tipo'),visibilidade:fd.get('visibilidade'),assunto_id:fd.get('assunto_id')||null,prazo:fd.get('tipo')==='pendencia'?(fd.get('prazo')||null):null};
 const {error}=await sb.from('job_feed').insert(payload);
 btn.disabled=false;if(error){form.querySelector('[role=status]').textContent='Erro: '+error.message;return}
 form.reset();box.querySelector('.pl-feed-due').hidden=true;form.querySelector('[role=status]').textContent='Registro adicionado.';await load(jobId,box);
 };
 await load(jobId,box);
}
async function loadTopics(id,box){const {data}=await window.plSupabase.from('job_assuntos').select('id,titulo').eq('job_id',id).order('titulo');const select=box.querySelector('#pl-feed-topic-select'),list=box.querySelector('#pl-feed-topics');if(!select||!list)return;select.innerHTML='<option value="">Sem assunto específico</option>'+(data||[]).map(x=>'<option value="'+escapeHTML(x.id)+'">'+escapeHTML(x.titulo)+'</option>').join('');list.innerHTML=(data||[]).map(x=>'<div>📌 '+escapeHTML(x.titulo)+'</div>').join('')||'<p>Nenhum assunto cadastrado.</p>';list.hidden=true;}
async function load(id,box){
 const sb=window.plSupabase;
 const {data,error}=await sb.from('job_feed').select('id,autor_id,criado_em,conteudo,tipo,visibilidade,resolvido,prazo,assunto_id').eq('job_id',id).order('criado_em',{ascending:false}).limit(300);
 const list=box.querySelector('#pl-feed-items');if(!list)return;
 if(error){list.textContent='Não foi possível carregar o histórico: '+error.message;return}
 const ids=[...new Set((data||[]).map(x=>x.autor_id))];
 const {data:people}=ids.length?await sb.from('perfis_acesso').select('usuario_id,papel').in('usuario_id',ids):{data:[]};
 const authors=new Map((people||[]).map(p=>[p.usuario_id,p.papel]));
 list.innerHTML=(data||[]).map(x=>'<article data-feed-item data-tipo="'+escapeHTML(x.tipo)+'"><div class="pl-feed-meta"><b>'+escapeHTML(labels[x.tipo]||x.tipo)+'</b> · '+escapeHTML(x.visibilidade)+' · '+escapeHTML(when(x.criado_em))+' · '+escapeHTML(authors.get(x.autor_id)||'Usuário')+' <small>'+escapeHTML(x.autor_id.slice(0,8))+'</small></div><p>'+escapeHTML(x.conteudo)+'</p>'+(x.prazo?'<small>Prazo: '+escapeHTML(x.prazo)+'</small>':'')+'</article>').join('')||'<p>Nenhum registro neste Job.</p>';
}
function attach(jobId){
 const host=document.querySelector('#pl-job-content');if(!host)return;
 let timer;
 const observer=new MutationObserver(()=>{
  clearTimeout(timer);
  timer=setTimeout(()=>{
   if(!host.querySelector('#pl-job-feed')&&!host.querySelector('.pl-empty')&&host.children.length){observer.disconnect();mount(jobId)}
  },120);
 });
 observer.observe(host,{childList:true});
 setTimeout(()=>{if(!host.querySelector('#pl-job-feed')&&!host.querySelector('.pl-empty')&&host.children.length){observer.disconnect();mount(jobId)}},400);
}
window.PLJobFeed={mount,attach};
})();