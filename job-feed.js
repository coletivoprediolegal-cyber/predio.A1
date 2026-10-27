(function(){
'use strict';
const escapeHTML=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
const labels={comentario:'Comentário',decisao:'Decisão confirmada',pendencia:'Pendência'};
const when=v=>new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v));
let activeJob=null;
let view='recentes', selectedTopic='', currentTopics=[];let selectedPhotos=[];
function applyFilter(box){const q=(box.querySelector('#pl-feed-search')?.value||'').toLocaleLowerCase('pt-BR');box.querySelectorAll('[data-feed-item]').forEach(el=>{const matchText=el.textContent.toLocaleLowerCase('pt-BR').includes(q);const matchView=view==='recentes'||(view==='pendencias'?el.dataset.tipo==='pendencia'&&el.dataset.resolvido!=='true':selectedTopic&&el.dataset.assunto===selectedTopic);el.hidden=!(matchText&&matchView)});box.querySelectorAll('[data-v]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.v===view)));const topics=box.querySelector('#pl-feed-topics');if(topics)topics.hidden=view!=='assuntos';const hint=box.querySelector('#pl-feed-view-hint');if(hint)hint.textContent=view==='assuntos'?(selectedTopic?'Atualizações do assunto selecionado':'Selecione um assunto acima para visualizar sua linha do tempo.'):(view==='pendencias'?'Pendências abertas':'Todos os registros, do mais recente ao mais antigo');}

async function mount(jobId){
 const host=document.querySelector('#pl-job-content');if(!host||!jobId)return;
 activeJob=jobId;view="recentes";selectedTopic="";currentTopics=[];selectedPhotos=[];
 let box=host.querySelector('#pl-job-feed');
 if(!box){box=document.createElement('section');box.id='pl-job-feed';box.className='pl-job-feed';host.append(box)}
 box.innerHTML='<h2>Histórico do Job</h2><div class="pl-feed-views"><button type="button" data-v="recentes">Recentes</button><button type="button" data-v="assuntos">Assuntos</button><button type="button" data-v="pendencias">Pendências</button></div><div id="pl-feed-topics"></div><form id="pl-feed-topic-form"><input name="titulo" placeholder="Novo assunto (ex.: pingadeiras)" required><button type="submit">Criar assunto</button></form><form id="pl-feed-form"><label>Assunto<select name="assunto_id" id="pl-feed-topic-select"><option value="">Sem assunto específico</option></select></label><textarea name="conteudo" rows="2" placeholder="Registrar andamento, decisão ou pendência…" required maxlength="5000"></textarea><button type="button" id="pl-feed-add-photos">📷 Vincular fotos do álbum</button><div id="pl-feed-photo-selection"></div><div id="pl-feed-photo-picker" hidden></div><div class="pl-feed-controls"><label>Tipo<select name="tipo"><option value="comentario">Comentário</option><option value="decisao">Decisão confirmada</option><option value="pendencia">Pendência</option></select></label><label>Visibilidade<select name="visibilidade"><option value="geral">Geral</option><option value="interno">Interno</option></select></label><label class="pl-feed-due" hidden>Prazo<input name="prazo" type="date"></label><button type="submit">Publicar</button></div><p role="status"></p></form><label>Pesquisar no histórico<input id="pl-feed-search" type="search" placeholder="Palavra-chave ou autor"></label><p id="pl-feed-view-hint" aria-live="polite"></p><div id="pl-feed-items">Carregando…</div>';
 const form=box.querySelector('#pl-feed-form');box.querySelector('#pl-feed-add-photos').onclick=()=>openPhotoPicker(jobId,box);box.querySelectorAll('[data-v]').forEach(btn=>btn.onclick=()=>{view=btn.dataset.v;applyFilter(box)});const topicForm=box.querySelector('#pl-feed-topic-form');topicForm.onsubmit=async e=>{e.preventDefault();const title=topicForm.elements.titulo.value.trim();if(!title)return;const {error}=await window.plSupabase.from('job_assuntos').insert({job_id:jobId,titulo:title});if(error){alert(error.message);return}topicForm.reset();await loadTopics(jobId,box);const newest=currentTopics.find(x=>x.titulo===title);if(newest){selectedTopic=newest.id;view='assuntos';box.querySelector('#pl-feed-topic-select').value=newest.id;applyFilter(box)}};await loadTopics(jobId,box);const type=form.elements.tipo;
 type.onchange=()=>{box.querySelector('.pl-feed-due').hidden=type.value!=='pendencia'};
 box.querySelector('#pl-feed-search').oninput=()=>applyFilter(box);
 form.onsubmit=async e=>{
 e.preventDefault();if(activeJob!==jobId)return;
 const sb=window.plSupabase,fd=new FormData(form),btn=form.querySelector('button[type=submit]');btn.disabled=true;
 const payload={job_id:jobId,conteudo:String(fd.get('conteudo')||'').trim(),tipo:fd.get('tipo'),visibilidade:fd.get('visibilidade'),assunto_id:fd.get('assunto_id')||null,prazo:fd.get('tipo')==='pendencia'?(fd.get('prazo')||null):null};
 const {data:created,error}=await sb.from('job_feed').insert({...payload,autor_id:(await sb.auth.getUser()).data.user?.id}).select('id').single();if(!error&&selectedPhotos.length){const linked=await sb.from('job_feed_fotografias').insert(selectedPhotos.map(fotografia_id=>({feed_id:created.id,fotografia_id})));if(linked.error){form.querySelector('[role=status]').textContent='Registro salvo, mas fotos não vinculadas: '+linked.error.message;btn.disabled=false;return}}
 btn.disabled=false;if(error){form.querySelector('[role=status]').textContent='Erro: '+error.message;return}
 selectedPhotos=[];box.querySelector('#pl-feed-photo-selection').innerHTML='';form.reset();box.querySelector('.pl-feed-due').hidden=true;form.querySelector('[role=status]').textContent='Registro adicionado.';await load(jobId,box);
 };
 await load(jobId,box);
}
async function loadTopics(id,box){const {data,error}=await window.plSupabase.from('job_assuntos').select('id,titulo').eq('job_id',id).order('titulo');const select=box.querySelector('#pl-feed-topic-select'),list=box.querySelector('#pl-feed-topics');if(!select||!list)return;if(error){list.textContent='Erro ao carregar assuntos: '+error.message;return}currentTopics=data||[];select.innerHTML='<option value="">Sem assunto específico</option>'+currentTopics.map(x=>'<option value="'+escapeHTML(x.id)+'">'+escapeHTML(x.titulo)+'</option>').join('');list.innerHTML=currentTopics.map(x=>'<button type="button" class="pl-feed-topic" data-topic-id="'+escapeHTML(x.id)+'" aria-pressed="'+String(selectedTopic===x.id)+'">📌 '+escapeHTML(x.titulo)+'</button>').join('')||'<p>Nenhum assunto cadastrado.</p>';list.querySelectorAll('[data-topic-id]').forEach(btn=>btn.onclick=()=>{selectedTopic=btn.dataset.topicId;view='assuntos';list.querySelectorAll('[data-topic-id]').forEach(b=>b.setAttribute('aria-pressed',String(b===btn)));applyFilter(box)});applyFilter(box)}
async function load(id,box){
 const sb=window.plSupabase;
 const {data,error}=await sb.from('job_feed').select('id,autor_id,criado_em,conteudo,tipo,visibilidade,resolvido,prazo,assunto_id').eq('job_id',id).order('criado_em',{ascending:false}).limit(300);
 const list=box.querySelector('#pl-feed-items');if(!list)return;
 if(error){list.textContent='Não foi possível carregar o histórico: '+error.message;return}
 const feedIds=(data||[]).map(x=>x.id);const {data:links}=feedIds.length?await sb.from('job_feed_fotografias').select('feed_id,fotografia_id,fotografias(id,arquivo_caminho,nome_original)').in('feed_id',feedIds):{data:[]};const photosByFeed=new Map();for(const link of links||[]){if(!photosByFeed.has(link.feed_id))photosByFeed.set(link.feed_id,[]);photosByFeed.get(link.feed_id).push(link)}const ids=[...new Set((data||[]).map(x=>x.autor_id).filter(Boolean))];
 const {data:people}=ids.length?await sb.from('perfis_acesso').select('usuario_id,papel').in('usuario_id',ids):{data:[]};
 const authors=new Map((people||[]).map(p=>[p.usuario_id,p.papel]));
 list.innerHTML=(data||[]).map(x=>'<article data-feed-item data-tipo="'+escapeHTML(x.tipo)+'" data-resolvido="'+String(!!x.resolvido)+'" data-assunto="'+escapeHTML(x.assunto_id||'')+'"><div class="pl-feed-meta"><b>'+escapeHTML(labels[x.tipo]||x.tipo) +'</b> · '+escapeHTML(x.visibilidade)+' · '+escapeHTML(when(x.criado_em))+' · '+escapeHTML(authors.get(x.autor_id)||'Usuário')+' <small>'+escapeHTML((x.autor_id||'').slice(0,8))+'</small></div><p>'+escapeHTML(x.conteudo) +'</p>'+(photosByFeed.get(x.id)?.length?'<details class="pl-feed-linked-photos"><summary style="cursor:pointer;font-size:12px;color:inherit">📎 '+photosByFeed.get(x.id).length+' foto(s) vinculada(s)</summary><div style="padding:8px 0">'+photosByFeed.get(x.id).map(l=>'<div style="font-size:12px;padding:3px 0">📷 '+escapeHTML(l.fotografias?.nome_original||'Fotografia')+'</div>').join('')+'</div></details>':'')+(x.prazo?'<small>Prazo: '+escapeHTML(x.prazo)+'</small>':'')+'</article>').join('')||'<p>Nenhum registro neste Job.</p>';applyFilter(box);
}
async function openPhotoPicker(jobId,box){
 const sb=window.plSupabase,picker=box.querySelector('#pl-feed-photo-picker');picker.hidden=false;picker.textContent='Carregando álbuns…';
 const {data:job,error:je}=await sb.from('jobs').select('empreendimento_id').eq('id',jobId).single();
 if(je||!job){picker.textContent='Não foi possível identificar o empreendimento.';return}
 const {data:albums,error}=await sb.from('albuns').select('id,titulo,nome').eq('empreendimento_id',job.empreendimento_id);
 if(error){picker.textContent='Erro ao carregar álbuns: '+error.message;return}
 picker.innerHTML='<label>Álbum <select id="pl-feed-album"><option value="">Escolha um álbum</option>'+ (albums||[]).map(a=>'<option value="'+escapeHTML(a.id)+'">'+escapeHTML(a.titulo||a.nome||'Álbum')+'</option>').join('')+'</select></label><div id="pl-feed-photo-options"></div><button type="button" id="pl-feed-picker-close">Concluir seleção</button>';
 picker.querySelector('#pl-feed-picker-close').onclick=()=>{picker.hidden=true;box.querySelector('#pl-feed-photo-selection').textContent=selectedPhotos.length+' fotografia(s) selecionada(s)'};
 picker.querySelector('#pl-feed-album').onchange=async e=>{
  const id=e.target.value,options=picker.querySelector('#pl-feed-photo-options');options.textContent='Carregando fotografias…';
  if(!id){options.textContent='';return}
  const {data,error}=await sb.from('album_fotografias').select('fotografia_id,fotografias(nome_original)').eq('album_id',id).limit(500);
  if(error){options.textContent=error.message;return}
  options.innerHTML=(data||[]).map(x=>'<label style="display:inline-flex;gap:5px;padding:8px"><input type="checkbox" data-photo="'+escapeHTML(x.fotografia_id)+'" '+(selectedPhotos.includes(x.fotografia_id)?'checked':'')+'>'+escapeHTML(x.fotografias?.nome_original||x.fotografia_id.slice(0,8))+'</label>').join('')||'Álbum vazio.';
  options.querySelectorAll('[data-photo]').forEach(el=>el.onchange=()=>{selectedPhotos=el.checked?[...new Set([...selectedPhotos,el.dataset.photo])]:selectedPhotos.filter(x=>x!==el.dataset.photo)});
 };
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