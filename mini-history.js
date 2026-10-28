(function(){
'use strict';
const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const date=x=>new Date(x).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'2-digit'});
let sequence=0;
async function mount(root,jobId,miniId,canWrite){
 const node=root.querySelector('#cw-mini-history');
 if(!node)return;
 const token=++sequence, sb=window.plSupabase;
 let page=0,filter='pendencia',query='',busy=false,allDone=false,requestVersion=0,expanded=false;let selectedPhotos=[];
 node.innerHTML='<h3>Histórico do assunto</h3><p class="cw-history-explain">Atualizações e decisões deste assunto, vinculadas ao Job principal.</p>'+
 '<div class="cw-search-compact"><button type="button" class="cw-search-toggle" aria-label="Abrir busca no histórico" aria-expanded="false">⌕</button><input type="search" class="cw-history-search" aria-label="Pesquisar no histórico" placeholder="Buscar no histórico…" hidden></div>'+
 '<div class="cw-history-toolbar">'+[['todos','Todos'],['pendencia','Pendências'],['decisao','Decisões'],['comentario','Atualizações']].map(([v,n])=>'<button type="button" data-history-filter="'+v+'" aria-pressed="'+String(v==='pendencia')+'">'+n+'</button>').join('')+'</div>'+
 '<div class="cw-history-list" aria-live="polite"></div><button type="button" class="cw-history-more" hidden>Mostrar mais</button>'+
 (canWrite?'<form id="cw-history-form"><label>Nova atualização<textarea name="conteudo" rows="3" required maxlength="5000" placeholder="Ex.: Em reunião, definida a cor da fachada…"></textarea></label><div class="cw-history-controls"><label>Tipo<select name="tipo"><option value="comentario">Atualização</option><option value="decisao">Decisão confirmada</option><option value="pendencia">Pendência</option></select></label><label>Visibilidade<select name="visibilidade"><option value="geral" selected>Geral</option><option value="interno">Interno</option></select></label></div><button class="cw-save" type="submit">Registrar atualização</button><p role="status"></p></form>':'');
 const list=node.querySelector('.cw-history-list'),more=node.querySelector('.cw-history-more');const toggle=node.querySelector('.cw-search-toggle'),search=node.querySelector('.cw-history-search');toggle.onclick=()=>{search.hidden=!search.hidden;toggle.setAttribute('aria-expanded',String(!search.hidden));if(!search.hidden)search.focus();else{search.value='';search.dispatchEvent(new Event('input'))}};
 async function fetchPage(reset=false){
  if(token!==sequence||(busy&&!reset))return;
  if(reset){requestVersion++;page=0;allDone=false;busy=false;list.innerHTML='';}
  if(allDone)return;
  busy=true;const thisRequest=requestVersion;more.disabled=true;more.hidden=true;
  let req=sb.from('job_feed').select('id,conteudo,criado_em,autor_id,tipo,visibilidade,resolvido,prazo').eq('job_id',jobId).eq('mini_job_id',miniId);
  if(filter!=='todos')req=req.eq('tipo',filter);if(filter==='pendencia')req=req.eq('resolvido',false);
  if(query)req=req.ilike('conteudo','%'+query.replace(/[%_]/g,'\\$&')+'%');
  const {data,error}=await req.order('criado_em',{ascending:false}).order('id',{ascending:false}).range(page*(expanded?20:4),page*(expanded?20:4)+(expanded?20:4)-1);
  busy=false;
  if(token!==sequence||thisRequest!==requestVersion||!node.isConnected||node.dataset.mini!==miniId)return;
  if(error){list.insertAdjacentHTML('beforeend','<p class="cw-error">'+esc(error.message)+'</p>');more.hidden=false;more.disabled=false;return;}
  if(!data?.length&&page===0)list.innerHTML='<p class="cw-empty">Nenhum registro encontrado neste filtro.</p>';
  if(data?.length){const ids=data.map(x=>x.id);const {data:links,error:linkError}=await sb.from('job_feed_fotografias').select('feed_id,fotografia_id').in('feed_id',ids);const byFeed=new Map();if(!linkError)for(const l of links||[]){const a=byFeed.get(l.feed_id)||[];a.push(l.fotografia_id);byFeed.set(l.feed_id,a);}list.insertAdjacentHTML('beforeend',data.map(x=>'<article class="cw-history-entry"><small>'+esc(date(x.criado_em))+' · '+esc(x.tipo==='decisao'?'Decisão confirmada':x.tipo==='pendencia'?'Pendência':'Atualização')+(x.visibilidade==='interno'?' · Interno':'')+'</small><p>'+esc(x.conteudo)+'</p>'+(byFeed.get(x.id)?.length?'<button type="button" class="cw-linked" data-photos="'+esc(byFeed.get(x.id).join(','))+'" style="font-size:12px;display:block;margin:5px 0">📎 '+byFeed.get(x.id).length+' foto(s)</button>':'')+(x.prazo?'<small>Prazo: '+esc(x.prazo)+'</small>':'')+'</article>').join(''));page++;}
  allDone=(data||[]).length<(expanded?20:4);
  more.hidden=allDone;more.disabled=false;
 }
 list.addEventListener('click',async e=>{const b=e.target.closest('.cw-linked');if(!b)return;const ids=b.dataset.photos.split(',');let panel=b.nextElementSibling;if(panel?.classList.contains('cw-linked-panel')){panel.remove();return;}panel=document.createElement('div');panel.className='cw-linked-panel';panel.textContent='Carregando fotos…';b.after(panel);const {data,error}=await sb.from('fotografias').select('id,nome_original,arquivo_caminho').in('id',ids);if(error){panel.textContent=error.message;return;}panel.textContent='';for(const p of data||[]){const btn=document.createElement('button');btn.type='button';btn.textContent='📷 '+(p.nome_original||'Abrir fotografia');btn.style.cssText='display:block;font-size:12px;margin:6px 0';btn.onclick=async()=>{const {data:sign,error:err}=await sb.storage.from('predio-legal-fotos').createSignedUrl(p.arquivo_caminho,120);if(err||!sign?.signedUrl){alert('Não foi possível abrir a foto.');return;}window.open(sign.signedUrl,'_blank','noopener');};panel.append(btn);}});more.onclick=()=>{if(!expanded&&page===1){expanded=true;page=0;fetchPage(true)}else fetchPage()};
 node.querySelectorAll('[data-history-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.historyFilter;expanded=false;node.querySelectorAll('[data-history-filter]').forEach(t=>t.setAttribute('aria-pressed',String(t===b)));fetchPage(true);});
 let searchVersion=0;
 node.querySelector('.cw-history-search').oninput=e=>{
  const version=++searchVersion,next=e.target.value.trim();
  // A busca é executada no servidor, nunca apenas nos 20 registros visíveis.
  Promise.resolve().then(()=>{if(version!==searchVersion)return;query=next;expanded=false;fetchPage(true)});
 };
 const f=node.querySelector('#cw-history-form');
 if(f){const attach=f.querySelector('.cw-attach-photos'),picker=f.querySelector('.cw-photo-picker'),count=f.querySelector('.cw-photo-count');if(attach&&picker&&count)attach.onclick=async()=>{picker.hidden=!picker.hidden;if(picker.hidden)return;picker.textContent='Carregando álbuns…';const {data:albums,error}=await sb.from('albuns').select('id,titulo').eq('job_principal_id',jobId);const {data:shared}=await sb.from('album_jobs').select('album_id').eq('job_id',jobId);const {data:other}=shared?.length?await sb.from('albuns').select('id,titulo').in('id',shared.map(x=>x.album_id)):{data:[]};if(error){picker.textContent=error.message;return;}const unique=[...new Map([...(albums||[]),...(other||[])].map(x=>[x.id,x])).values()];picker.innerHTML='<select aria-label="Selecionar álbum"><option value="">Selecione o álbum</option>'+unique.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.titulo)+'</option>').join('')+'</select><div class="cw-photo-choices"></div>';picker.querySelector('select').onchange=async ev=>{const box=picker.querySelector('.cw-photo-choices');box.textContent='Carregando…';const id=ev.target.value;if(!id){box.textContent='';return;}const {data:photos,error:pe}=await sb.from('album_fotografias').select('fotografia_id,fotografias(nome_original)').eq('album_id',id).limit(500);if(pe){box.textContent=pe.message;return;}box.innerHTML=(photos||[]).map(p=>'<label style="display:block;font-size:12px;padding:5px"><input type="checkbox" data-id="'+esc(p.fotografia_id)+'" '+(selectedPhotos.includes(p.fotografia_id)?'checked':'')+'> 📷 '+esc(p.fotografias?.nome_original||p.fotografia_id)+'</label>').join('')||'Álbum sem fotos';box.querySelectorAll('[data-id]').forEach(c=>c.onchange=()=>{selectedPhotos=c.checked?[...new Set([...selectedPhotos,c.dataset.id])]:selectedPhotos.filter(id=>id!==c.dataset.id);count.textContent=selectedPhotos.length?selectedPhotos.length+' foto(s) selecionada(s)':'';});};};}if(f)f.onsubmit=async e=>{
  e.preventDefault();e.stopPropagation();const submit=f.querySelector('[type=submit]'),status=f.querySelector('[role=status]');submit.disabled=true;status.textContent='Salvando…';
  const payload={job_id:jobId,mini_job_id:miniId,conteudo:f.elements.conteudo.value.trim(),tipo:f.elements.tipo.value,visibilidade:f.elements.visibilidade.value};
  const {data:created,error}=await sb.from('job_feed').insert(payload).select('id').single();if(!error&&selectedPhotos.length){const {error:linkError}=await sb.from('job_feed_fotografias').insert(selectedPhotos.map(fotografia_id=>({feed_id:created.id,fotografia_id})));if(linkError){submit.disabled=false;status.textContent='Comentário salvo, mas falhou o vínculo das fotos: '+linkError.message;return;}}submit.disabled=false;
  if(error){status.textContent='Não foi possível salvar: '+error.message;return;}
  await mount(root,jobId,miniId,canWrite);
 };
 await fetchPage();
}
window.PLMiniHistory={mount};
})();