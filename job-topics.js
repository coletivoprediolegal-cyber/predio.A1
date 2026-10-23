(function(){
'use strict';
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
let jobId=null, serial=0;
async function render(id){
 const host=document.querySelector('#pl-job-content');const sb=window.plSupabase;
 if(!host||!sb||!id)return;
 jobId=id;const token=++serial;
 let panel=host.querySelector('#pl-topic-manager');
 if(!panel){panel=document.createElement('section');panel.id='pl-topic-manager';panel.className='pl-topic-manager';host.append(panel)}
 panel.innerHTML='<h2>Assuntos e Tópicos</h2><div class="pl-topic-actions"><form id="pl-new-subject"><input name="titulo" placeholder="Nome do assunto" required maxlength="180"><button>Criar assunto</button></form><form id="pl-new-topic"><input name="titulo" placeholder="Nome do tópico" required maxlength="180"><select name="assunto_id"><option value="">Direto no Job (sem assunto)</option></select><button>Criar tópico</button></form></div><p class="pl-topic-message" role="status"></p><div id="pl-topic-list">Carregando…</div>';
 async function refresh(){
 const [a,t]=await Promise.all([sb.from('job_assuntos').select('id,titulo').eq('job_id',id).order('titulo'),sb.from('job_topicos').select('id,titulo,descricao,status,assunto_id,criado_em').eq('job_id',id).order('criado_em',{ascending:false})]);
 if(token!==serial)return;
 const msg=panel.querySelector('[role=status]');if(a.error||t.error){msg.textContent='Erro ao carregar: '+(a.error||t.error).message;return}
 const assuntos=a.data||[],topicos=t.data||[],select=panel.querySelector('select[name=assunto_id]');
 select.innerHTML='<option value="">Direto no Job (sem assunto)</option>'+assuntos.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.titulo)+'</option>').join('');
 const groups=[{id:null,titulo:'Tópicos sem assunto'},...assuntos];
 panel.querySelector('#pl-topic-list').innerHTML=groups.map(g=>{const ts=topicos.filter(x=>x.assunto_id===g.id);return '<section class="pl-topic-group"><h3>'+esc(g.titulo)+'</h3>'+(ts.map(x=>'<details class="pl-topic"><summary>'+esc(x.titulo)+' <small>· '+esc(x.status)+'</small></summary><label>Descrição<textarea data-description="'+esc(x.id)+'" rows="3">'+esc(x.descricao||'')+'</textarea></label><label>Status<select data-status="'+esc(x.id)+'">'+['aberto','em_andamento','concluido'].map(s=>'<option value="'+s+'" '+(x.status===s?'selected':'')+'>'+({aberto:'Aberto',em_andamento:'Em andamento',concluido:'Concluído'}[s])+'</option>').join('')+'</select></label><label>Assunto<select data-move="'+esc(x.id)+'"><option value="">Sem assunto</option>'+assuntos.map(a=>'<option value="'+esc(a.id)+'" '+(a.id===x.assunto_id?'selected':'')+'>'+esc(a.titulo)+'</option>').join('')+'</select></label><button type="button" data-save="'+esc(x.id)+'">Salvar alterações</button></details>').join('')||'<p class="pl-topic-empty">Nenhum tópico.</p>')+'</section>'}).join('');
 panel.querySelectorAll('[data-save]').forEach(b=>b.onclick=async()=>{const key=b.dataset.save;const payload={descricao:panel.querySelector('[data-description="'+key+'"]').value,status:panel.querySelector('[data-status="'+key+'"]').value,assunto_id:panel.querySelector('[data-move="'+key+'"]').value||null,atualizado_em:new Date().toISOString()};const {error}=await sb.from('job_topicos').update(payload).eq('id',key).eq('job_id',id);msg.textContent=error?error.message:'Tópico atualizado.';if(!error)await refresh()});
 }
 panel.querySelector('#pl-new-subject').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,title=form.elements.titulo.value.trim();if(!title)return;const {error}=await sb.from('job_assuntos').insert({job_id:id,titulo:title});panel.querySelector('[role=status]').textContent=error?error.message:'Assunto criado.';if(!error){form.reset();await refresh()}};
 panel.querySelector('#pl-new-topic').onsubmit=async e=>{e.preventDefault();const form=e.currentTarget,title=form.elements.titulo.value.trim();if(!title)return;const {error}=await sb.from('job_topicos').insert({job_id:id,titulo:title,assunto_id:form.elements.assunto_id.value||null});panel.querySelector('[role=status]').textContent=error?error.message:'Tópico criado.';if(!error){form.reset();await refresh()}};
 await refresh();
}
const old=window.PLJobFeed;
if(old){const mount=old.mount;old.mount=async function(id){await mount(id);await render(id)};const attach=old.attach;old.attach=function(id){attach(id);let n=0;const timer=setInterval(()=>{if(document.querySelector('#pl-job-feed')){clearInterval(timer);render(id)}if(++n>30)clearInterval(timer)},200)}}
window.PLTopicManager={render};
})();