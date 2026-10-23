(function(){
'use strict';
const root=document.getElementById('pl-finance');
const entry=document.getElementById('pl-open-finance');
if(!root||!entry)return;
const state={jobs:[],parcels:[],view:'overview',filter:'resumo',query:'',selectedJob:null,selectedClient:null,loading:false,scroll:0,jobTab:'parcelas',editingParcel:null,formError:''};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const money=v=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(Number(v||0));
const date=v=>v?new Intl.DateTimeFormat('pt-BR').format(new Date(v+'T12:00:00')):'Sem vencimento';
const competence=v=>v?new Intl.DateTimeFormat('pt-BR',{month:'short',year:'2-digit'}).format(new Date(v+'T12:00:00')).replace('.','').toUpperCase():'A DEFINIR';
const norm=v=>String(v||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
function paid(p){return /pago|recebido|quitado/.test(norm(p?.status))}
function parcelStatus(p){
 if(paid(p))return 'pago';
 if(!p)return 'conferir';
 const due=p.vencimento?new Date(p.vencimento+'T23:59:59'):null,now=new Date(),days=due?Math.ceil((due-now)/86400000):999;
 if(days<0)return 'cobrar';
 if(days<=7)return 'receber';
 if(days<=30)return 'emitir';
 return 'apurar';
}
function jobParcels(id){return state.parcels.filter(p=>p.job_id===id).sort((a,b)=>String(a.vencimento||'').localeCompare(String(b.vencimento||''))||Number(a.numero)-Number(b.numero))}
function nextParcel(job){
 const ps=jobParcels(job.id),open=ps.filter(p=>!paid(p));
 return open[0]||ps[ps.length-1]||null;
}
function jobStatus(job){return parcelStatus(nextParcel(job))}
function label(s){return ({resumo:'Resumo',apurar:'Apurar',emitir:'Emitir',cobrar:'Cobrar',receber:'Receber',conferir:'Conferir',pago:'Pago',todos:'Todos'})[s]||s}
async function load(){
 if(state.loading)return;state.loading=true;renderLoading();
 const sb=window.plSupabase;
 if(!sb){renderError('Conexão com o banco indisponível.');state.loading=false;return}
 const {data:sessionData}=await sb.auth.getSession();
 if(!sessionData?.session){renderAccess();state.loading=false;return}
 const [{data:jobs,error:je},{data:profile,error:pe}]=await Promise.all([
  sb.rpc('pl_meus_jobs'),
  sb.from('perfis_acesso').select('pode_ver_financeiro,ativo').eq('usuario_id',sessionData.session.user.id).maybeSingle()
 ]);
 if(je||pe||!profile?.ativo||!profile?.pode_ver_financeiro){
  renderAccess(profile?.ativo?'Seu perfil ainda não tem acesso ao financeiro.':'Entre com um perfil autorizado para ver o financeiro.');
  state.loading=false;return;
 }
 state.jobs=Array.isArray(jobs)?jobs:[];
 const ids=state.jobs.map(j=>j.id).filter(Boolean);
 if(ids.length){
  const {data,error}=await sb.from('job_parcelas').select('id,job_id,numero,total_parcelas,valor,vencimento,status,observacoes,competencia').in('job_id',ids).order('vencimento',{ascending:true});
  if(error){renderError('Não foi possível carregar as parcelas.');console.error(error);state.loading=false;return}
  state.parcels=data||[];
 }
 state.loading=false;render();
}
function show(){
 state.view='overview';window.PLSwitchTo?.('finance');load();
}
function renderShell(inner,back){
 root.innerHTML='<button class="pl-finance-back" id="pl-finance-back">'+(back?'‹ Voltar':'‹ Voltar a Mais')+'</button><div class="pl-finance-head"><div><div class="pl-type">ADMINISTRATIVO</div><h1>Financeiro</h1><p>Providências, notas e recebimentos dos trabalhos.</p></div></div>'+inner;
 document.getElementById('pl-finance-back').onclick=()=>{
  if(state.view==='overview')window.PLSwitchTo?.('more');
  else{state.view='overview';state.selectedJob=null;state.selectedClient=null;render();requestAnimationFrame(()=>window.scrollTo(0,state.scroll||0))}
 };
}
function renderLoading(){renderShell('<div class="pl-finance-loader">Carregando financeiro…</div>',false)}
function renderError(msg){renderShell('<p class="pl-error">'+esc(msg)+'</p>',false)}
function renderAccess(msg){
 renderShell('<div class="pl-finance-detail-card"><h2>Acesso financeiro</h2><p class="pl-finance-meta">'+esc(msg||'Faça login com um perfil autorizado para acessar estes dados.')+'</p><button class="pl-card" type="button" id="pl-finance-login">Abrir minha conta ›</button></div>',false);
 document.getElementById('pl-finance-login').onclick=()=>window.PLSwitchTo?.('access');
}
function filteredJobs(){
 const q=norm(state.query);
 return state.jobs.filter(j=>{
  const s=jobStatus(j);
  const statusOK=state.filter==='todos'||state.filter==='resumo'?s!=='pago':s===state.filter;
  return statusOK&&(!q||norm([j.cliente,j.titulo,j.empreendimento,j.descricao_servico_nf].join(' ')).includes(q));
 }).sort((a,b)=>{
  const priority={cobrar:0,emitir:1,receber:2,apurar:3,conferir:4,pago:5};
  return priority[jobStatus(a)]-priority[jobStatus(b)]||String(nextParcel(a)?.vencimento||'9999').localeCompare(String(nextParcel(b)?.vencimento||'9999'));
 });
}
function stats(){
 const open=state.parcels.filter(p=>!paid(p));
 return {open:open.reduce((s,p)=>s+Number(p.valor||0),0),overdue:open.filter(p=>parcelStatus(p)==='cobrar').length,next:open.filter(p=>['emitir','receber'].includes(parcelStatus(p))).length};
}
function row(j){
 const p=nextParcel(j),s=jobStatus(j),isPaid=s==='pago';
 const enterprise=j.empreendimento||j.titulo||'Local não informado';
 const job=j.empreendimento?(j.titulo||'Job sem título'):'Job sem empreendimento cadastrado';
 return '<button class="pl-finance-row'+(isPaid?' is-paid':'')+'" data-fin-job="'+esc(j.id)+'"><span><span class="pl-finance-client">'+esc(j.cliente||'Cliente não informado')+'</span><span class="pl-finance-job">'+esc(enterprise)+'</span><span class="pl-finance-meta">'+esc(job)+(p?' · vence '+date(p.vencimento):' · conferir condições')+'</span></span><span class="pl-finance-action"><span class="pl-finance-value">'+money(p?.valor||j.valor_acordado)+'</span><span class="pl-finance-status" data-status="'+s+'">'+(s==='cobrar'?'⚠ ':'')+label(s)+'</span></span><span>›</span></button>';
}
function groupedRows(items){
 const groups=new Map();
 for(const j of items){const name=String(j.cliente||'Cliente não informado').trim();const key=norm(name);if(!groups.has(key))groups.set(key,{name,jobs:[]});groups.get(key).jobs.push(j)}
 return [...groups.values()].map(g=>'<section class="pl-finance-client-group"><div class="pl-finance-group-title"><span>'+esc(g.name)+'</span><small>'+g.jobs.length+' '+(g.jobs.length===1?'Job':'Jobs')+'</small></div>'+g.jobs.map(row).join('')+'</section>').join('');
}
function renderOverview(){
 const st=stats(),items=filteredJobs();
 renderShell('<label class="pl-finance-search">⌕<input id="pl-finance-query" value="'+esc(state.query)+'" placeholder="Buscar cliente, job, prédio ou nota"></label><div class="pl-finance-tabs" role="tablist">'+['resumo','apurar','emitir','cobrar','receber','todos'].map(f=>'<button class="pl-finance-tab'+(state.filter===f?' is-active':'')+'" data-fin-filter="'+f+'">'+label(f)+'</button>').join('')+'</div><div class="pl-finance-summary"><div class="pl-finance-stat"><b>'+money(st.open)+'</b><small>A receber</small></div><div class="pl-finance-stat"><b>'+st.overdue+'</b><small>Para cobrar</small></div><div class="pl-finance-stat"><b>'+st.next+'</b><small>Próximos</small></div></div><div class="pl-finance-list">'+(items.length?groupedRows(items):'<div class="pl-finance-empty">Nenhum trabalho neste filtro.</div>')+'</div>',false);
 document.getElementById('pl-finance-query').oninput=e=>{state.query=e.target.value;renderOverview()};
 root.querySelectorAll('[data-fin-filter]').forEach(b=>b.onclick=()=>{state.filter=b.dataset.finFilter;renderOverview()});
 root.querySelectorAll('[data-fin-job]').forEach(b=>b.onclick=()=>{state.scroll=window.scrollY;state.selectedJob=state.jobs.find(j=>j.id===b.dataset.finJob);state.view='job';state.jobTab='parcelas';state.editingParcel=null;render()});
}
function installmentForm(p){
 const edit=!!p;
 return '<form id="pl-finance-form" class="pl-finance-edit"><h3>'+(edit?'Editar parcela':'Nova parcela')+'</h3><div class="pl-finance-fields"><label>Número da parcela<input name="numero" type="number" min="1" step="1" required value="'+esc(p?.numero||jobParcels(state.selectedJob.id).length+1)+'"></label><label>Total de parcelas<input name="total_parcelas" type="number" min="1" step="1" required value="'+esc(p?.total_parcelas||1)+'"></label><label>Valor (R$)<input name="valor" type="number" min="0" step="0.01" required value="'+esc(p?.valor??'')+'"></label><label>Vencimento<input name="vencimento" type="date" required value="'+esc(p?.vencimento||'')+'"></label><label>Situação<select name="status"><option value="pendente"'+(paid(p)?'':' selected')+'>Pendente</option><option value="pago"'+(paid(p)?' selected':'')+'>Pago</option></select></label></div><label>Condição original da parcela<input name="descricao_contratual" maxlength="240" placeholder="Ex.: entrega do parecer" value="'+esc(p?.descricao_contratual||'')+'"></label><label>Observações financeiras<textarea name="observacoes" rows="3" placeholder="Informações desta parcela">'+esc(p?.observacoes||'')+'</textarea></label><div class="pl-finance-form-actions"><button type="submit">Salvar parcela</button><button type="button" id="pl-finance-cancel">Cancelar</button></div><p class="pl-finance-form-message" id="pl-finance-form-message" role="status">'+esc(state.formError)+'</p></form>';
}
async function saveInstallment(e){
 e.preventDefault();
 const form=e.currentTarget,fd=new FormData(form),button=form.querySelector('[type="submit"]');
 const number=Number(fd.get('numero')),count=Number(fd.get('total_parcelas')),value=Number(fd.get('valor'));
 if(!Number.isInteger(number)||number<1||!Number.isInteger(count)||count<1||number>count||!Number.isFinite(value)||value<0){document.getElementById('pl-finance-form-message').textContent='Confira número, total e valor da parcela.';return}
 const payload={job_id:state.selectedJob.id,numero:number,total_parcelas:count,valor:value,vencimento:String(fd.get('vencimento')),status:String(fd.get('status')),observacoes:String(fd.get('observacoes')||''),descricao_contratual:String(fd.get('descricao_contratual')||'').trim()};
 button.disabled=true;button.textContent='Salvando…';
 const sb=window.plSupabase;
 const result=state.editingParcel?await sb.from('job_parcelas').update(payload).eq('id',state.editingParcel).select('id').single():await sb.from('job_parcelas').insert(payload).select('id').single();
 if(result.error){button.disabled=false;button.textContent='Salvar parcela';document.getElementById('pl-finance-form-message').textContent='Não foi possível salvar: '+result.error.message;return}
 state.editingParcel=null;state.formError='';
 const {data,error}=await sb.from('job_parcelas').select('id,job_id,numero,total_parcelas,valor,vencimento,status,observacoes,competencia,descricao_contratual').in('job_id',state.jobs.map(j=>j.id).filter(Boolean)).order('vencimento',{ascending:true});
 if(error){document.getElementById('pl-finance-form-message').textContent='Parcela gravada, mas não foi possível atualizar a lista.';return}
 state.parcels=data||[];renderJob();
}
function renderJob(){
 const j=state.selectedJob;if(!j){state.view='overview';renderOverview();return}
 const ps=jobParcels(j.id),open=ps.filter(p=>!paid(p)),total=ps.reduce((sum,p)=>sum+Number(p.valor||0),0),remaining=open.reduce((sum,p)=>sum+Number(p.valor||0),0);
 const isNotes=state.jobTab==='observacoes';
 const rows=ps.length?ps.map(p=>{const st=parcelStatus(p);return '<div class="pl-installment'+(st==='pago'?' is-paid':'')+'"><div><strong>'+(p.competencia?new Intl.DateTimeFormat('pt-BR',{month:'long',year:'numeric'}).format(new Date(p.competencia+'T12:00:00')):(p.total_parcelas>1?'Parcela '+esc(p.numero)+'/'+esc(p.total_parcelas):'Pagamento único'))+'</strong><div class="pl-finance-meta">'+competence(p.vencimento)+'</div></div><div class="nf">Informar NF</div><div><span class="pl-finance-status" data-status="'+st+'">'+label(st)+'</span><div class="pl-finance-meta">'+date(p.vencimento)+'</div></div><strong>'+money(p.valor)+'</strong>'+(p.descricao_contratual?'<div class="pl-installment-note"><strong>Condição:</strong> '+esc(p.descricao_contratual)+'</div>':'')+(p.observacoes?'<div class="pl-installment-note">'+esc(p.observacoes)+'</div>':'')+'<button class="pl-finance-edit-link" data-fin-edit="'+esc(p.id)+'" type="button">Editar parcela / observações</button></div>'}).join(''):'<div class="pl-finance-empty">Este job ainda não possui parcelas cadastradas.</div>';
 const noteRows=ps.length?ps.map(p=>'<div class="pl-finance-note-row"><strong>Parcela '+esc(p.numero)+' — '+date(p.vencimento)+'</strong><p>'+esc(p.observacoes||'Sem observações.')+'</p><button class="pl-finance-edit-link" data-fin-edit="'+esc(p.id)+'" type="button">Editar observações</button></div>').join(''):'<p class="pl-finance-empty">Cadastre uma parcela para incluir observações.</p>';
 const showForm=state.editingParcel!==null;
 const editing=state.editingParcel==='new'?null:ps.find(p=>String(p.id)===String(state.editingParcel));
 renderShell('<div class="pl-finance-detail-card"><button class="pl-finance-client-link" id="pl-fin-client">'+esc(j.cliente||'Cliente não informado')+' ›</button><h2>'+esc(j.titulo||'Job sem título')+'</h2><div class="pl-finance-meta">'+esc(j.empreendimento||'Sem empreendimento')+'</div><div class="pl-finance-total">'+money(remaining)+' <span class="pl-finance-meta">a receber</span></div><div class="pl-finance-meta">Total previsto: '+money(total||j.valor_acordado)+'</div></div><div class="pl-finance-tabs"><button type="button" class="pl-finance-tab'+(!isNotes?' is-active':'')+'" data-fin-tab="parcelas">Parcelas e competências</button><button type="button" class="pl-finance-tab'+(isNotes?' is-active':'')+'" data-fin-tab="observacoes">Observações</button></div><button class="pl-finance-add" id="pl-finance-add" type="button">+ Cadastrar parcela</button>'+(showForm?installmentForm(editing):'')+'<div>'+(isNotes?noteRows:rows)+'</div>',true);
 document.getElementById('pl-fin-client').onclick=()=>{state.selectedClient=j.cliente;state.view='client';render()};
 root.querySelectorAll('[data-fin-tab]').forEach(b=>b.onclick=()=>{state.jobTab=b.dataset.finTab;state.editingParcel=null;renderJob()});
 document.getElementById('pl-finance-add').onclick=()=>{state.editingParcel='new';state.formError='';renderJob()};
 root.querySelectorAll('[data-fin-edit]').forEach(b=>b.onclick=()=>{state.editingParcel=b.dataset.finEdit;state.formError='';renderJob()});
 if(showForm){document.getElementById('pl-finance-form').onsubmit=saveInstallment;document.getElementById('pl-finance-cancel').onclick=()=>{state.editingParcel=null;renderJob()}}
}
function renderClient(){
 const name=state.selectedClient||'Cliente',jobs=state.jobs.filter(j=>j.cliente===state.selectedClient);
 const parcelIds=new Set(jobs.map(j=>j.id)),ps=state.parcels.filter(p=>parcelIds.has(p.job_id)),open=ps.filter(p=>!paid(p)).reduce((s,p)=>s+Number(p.valor||0),0);
 renderShell('<div class="pl-finance-detail-card"><div class="pl-type">CLIENTE</div><h2>'+esc(name)+'</h2><div class="pl-finance-total">'+money(open)+' <span class="pl-finance-meta">em aberto</span></div><div class="pl-finance-meta">'+jobs.length+' trabalho'+(jobs.length===1?'':'s')+'</div></div><div class="pl-finance-list">'+jobs.map(row).join('')+'</div>',true);
 root.querySelectorAll('[data-fin-job]').forEach(b=>b.onclick=()=>{state.selectedJob=state.jobs.find(j=>j.id===b.dataset.finJob);state.view='job';render()});
}
function render(){if(state.view==='job')renderJob();else if(state.view==='client')renderClient();else renderOverview()}
entry.addEventListener('click',show);
window.PLFinance={show,load};
})();
