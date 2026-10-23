(function(){
'use strict';
const sb=()=>window.plSupabase;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
let context=null,admin=false,checking=false,scheduled=false;
async function checkAdmin(){
 if(checking)return;checking=true;
 try{const c=sb();if(!c)return;const {data:{user}}=await c.auth.getUser();if(!user)return;
 const {data,error}=await c.from('perfis_acesso').select('papel,ativo').eq('usuario_id',user.id).maybeSingle();
 admin=!error&&data?.ativo&&data.papel==='administrador';}
 catch(e){console.warn('Edição indisponível',e)}
 finally{checking=false;sync()}
}
function set(type,id){context={type,id};sync()}
function sync(){
 if(!admin||!context)return;
 const root=document.querySelector(({client:'#pl-detail',enterprise:'#pl-enterprise',job:'#pl-job'})[context.type]);
 if(!root||!root.classList.contains('visible'))return;
 const head=root.querySelector('.pl-jobhead');
 if(!head||head.querySelector('.pl-admin-edit'))return;
 const wrap=document.createElement('span');wrap.className='pl-admin-edit';
 const b=document.createElement('button');b.type='button';b.textContent='⋮';b.setAttribute('aria-label','Opções de edição do cadastro');b.title='Opções';b.className='pl-admin-edit-trigger';
 const menu=document.createElement('div');menu.className='pl-admin-edit-menu';menu.hidden=true;
 const edit=document.createElement('button');edit.type='button';edit.textContent='Editar cadastro';edit.onclick=()=>{menu.hidden=true;openEditor(context.type,context.id)};
 menu.append(edit);b.onclick=()=>menu.hidden=!menu.hidden;wrap.append(b,menu);head.append(wrap);
}
async function openEditor(type,id){
 const client=sb();if(!client)return;
 let table={client:'clientes',enterprise:'empreendimentos',job:'jobs'}[type];if(!table)return;
 let record=null;
 if(type==='enterprise'){
 const {data,error}=await client.from(table).select('id,nome,endereco,observacoes').eq('nome',id).limit(2);
 if(error||data?.length!==1)return alert('Não foi possível identificar um empreendimento único para edição.');
 record=data[0];
 }else{
 const cols=type==='client'?'id,nome,observacoes':'id,titulo,valor_acordado,observacoes_comerciais';
 const {data,error}=await client.from(table).select(cols).eq('id',id).maybeSingle();
 if(error||!data)return alert('Cadastro não encontrado ou sem acesso de edição.');
 record=data;
 }
 const overlay=document.createElement('div');overlay.className='pl-admin-edit-overlay';
 const title={client:'Cliente',enterprise:'Empreendimento',job:'Job'}[type];
 const fields=type==='client'?
 '<label>Nome do cliente<input name="nome" required value="'+esc(record.nome)+'"></label><label>Observações<textarea name="observacoes">'+esc(record.observacoes)+'</textarea></label>':
 type==='enterprise'?
 '<label>Nome do empreendimento<input name="nome" required value="'+esc(record.nome)+'"></label><label>Endereço<input name="endereco" value="'+esc(record.endereco)+'"></label><label>Observações<textarea name="observacoes">'+esc(record.observacoes)+'</textarea></label>':
 '<label>Nome do Job<input name="titulo" required value="'+esc(record.titulo)+'"></label><label>Valor contratado (R$)<input name="valor_acordado" type="number" step="0.01" min="0" value="'+esc(record.valor_acordado)+'"></label><label>Observações iniciais<textarea name="observacoes_comerciais">'+esc(record.observacoes_comerciais)+'</textarea></label>';
 overlay.innerHTML='<div class="pl-admin-edit-dialog" role="dialog" aria-modal="true" aria-label="Editar '+title+'"><h2>Editar '+title+'</h2><form>'+fields+'<div class="pl-admin-edit-actions"><button type="button" data-cancel>Cancelar</button><button type="submit">Salvar alterações</button></div><p role="status"></p></form></div>';
 document.body.append(overlay);overlay.querySelector('[data-cancel]').onclick=()=>overlay.remove();
 const form=overlay.querySelector('form');
 form.onsubmit=async e=>{
 e.preventDefault();const payload=Object.fromEntries(new FormData(form));
 if(type==='job')payload.valor_acordado=payload.valor_acordado===''?null:Number(payload.valor_acordado);
 const save=form.querySelector('[type="submit"]');save.disabled=true;
 const {error}=await client.from(table).update(payload).eq('id',record.id).select('id').single();
 if(error){form.querySelector('[role="status"]').textContent='Erro ao salvar: '+error.message;save.disabled=false;return}
 form.querySelector('[role="status"]').textContent='Alterações salvas. Atualizando cadastro…';
 setTimeout(()=>location.reload(),450);
 };
}
new MutationObserver(()=>{if(scheduled)return;scheduled=true;queueMicrotask(()=>{scheduled=false;sync()})}).observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['class']});
window.PLRecordEditor={set};
document.addEventListener('DOMContentLoaded',checkAdmin);
window.addEventListener('pl:authorized',checkAdmin);
})();