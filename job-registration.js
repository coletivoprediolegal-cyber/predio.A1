(function(){
const $=s=>document.querySelector(s), E=s=>String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function show(){
 const sb=window.plSupabase;const host=$('#pl-jobs-overview');if(!sb||!host)return;
 const {data:{user}}=await sb.auth.getUser();if(!user)return;
 const {data:profile}=await sb.from('perfis_acesso').select('papel,ativo').eq('usuario_id',user.id).maybeSingle();
 if(!profile?.ativo||profile.papel!=='administrador')return alert('Somente administradores podem cadastrar Jobs.');
 const [c,e,a]=await Promise.all([sb.from('clientes').select('id,nome').order('nome'),sb.from('empreendimentos').select('id,nome').order('nome'),sb.from('tipos_atividade').select('id,nome').eq('ativo',true).order('nome')]);
 if(c.error||e.error||a.error)return alert('Não foi possível consultar os cadastros.');
 const oldContent=host.innerHTML;
 const panel=document.createElement('section');panel.className='pl-job-new-panel';host.replaceChildren(panel);
 const options=(rows)=>rows.map(x=>'<option value="'+E(x.id)+'">'+E(x.nome)+'</option>').join('');
 panel.innerHTML='<button id="jn-back" type="button">‹ Voltar aos Jobs</button><h2>Cadastrar Job</h2><form id="jn-form"><label>Cliente<select name="cliente"><option value="">Selecione</option>'+options(c.data)+'</select></label><label>Ou novo cliente<input name="novo_cliente" placeholder="Nome do cliente"></label><label>Empreendimento<select name="emp"><option value="">Selecione</option>'+options(e.data)+'</select></label><label>Ou novo empreendimento<input name="novo_emp" placeholder="Nome do empreendimento"></label><label>Endereço do novo empreendimento<input name="endereco"></label><label>CNPJ do novo empreendimento<input name="cnpj" inputmode="numeric"></label><label>Nome do Job<input name="titulo" required></label><label>Categoria<select name="categoria"><option value="">Não informada</option>'+options(a.data)+'</select></label><h3>Condições comerciais — opcionais</h3><label>Valor fechado (R$)<input name="valor" type="number" min="0" step=".01"></label><label>Tipo de cobrança<select name="modalidade" id="jn-modalidade"><option value="parcelado">Parcelado</option><option value="unico">Pagamento único</option><option value="recorrente">Recorrente mensal</option></select></label><div id="jn-standard"><label>Quantidade de parcelas<select name="numero" id="jn-numero"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option><option value="7">7</option><option value="8">8</option><option value="9">9</option><option value="10">10</option><option value="11">11</option><option value="12">12</option><option value="custom">Personalizado</option></select></label><label id="jn-custom-wrap" hidden>Quantidade personalizada<input name="num_custom" type="number" min="13" max="120"></label></div><div id="jn-recurring" hidden><label>Mensalidade (R$)<input name="mensalidade" type="number" min="0" step=".01"></label><label>Dia de vencimento<select name="dia"><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option><option value="5">5</option><option value="6">6</option><option value="7">7</option><option value="8">8</option><option value="9">9</option><option value="10">10</option><option value="11">11</option><option value="12">12</option><option value="13">13</option><option value="14">14</option><option value="15">15</option><option value="16">16</option><option value="17">17</option><option value="18">18</option><option value="19">19</option><option value="20">20</option><option value="21">21</option><option value="22">22</option><option value="23">23</option><option value="24">24</option><option value="25">25</option><option value="26">26</option><option value="27">27</option><option value="28">28</option><option value="29">29</option><option value="30">30</option><option value="31">31</option></select></label><label>Início da cobrança<input name="inicio" type="date"></label><p>Uma competência será criada no dia 1º de cada mês, sem prazo final.</p></div><label>Primeiro vencimento<input name="vencimento" type="date"></label><label>Observações iniciais<textarea name="obs" rows="3"></textarea></label><button type="submit">Salvar Job</button><p id="jn-feedback" role="status"></p></form>';
 const mod=$('#jn-modalidade'),std=$('#jn-standard'),rec=$('#jn-recurring'),numSel=$('#jn-numero'),custom=$('#jn-custom-wrap');
 const updateMode=()=>{std.hidden=mod.value==='recorrente';rec.hidden=mod.value!=='recorrente';numSel.value=mod.value==='unico'?'1':numSel.value;custom.hidden=numSel.value!=='custom'};mod.onchange=updateMode;numSel.onchange=updateMode;updateMode();
 const close=()=>{host.innerHTML=oldContent;window.PLJobsOverview?.show()};
 $('#jn-back').onclick=close;
 $('#jn-form').onsubmit=async ev=>{
 ev.preventDefault();const f=ev.currentTarget,d=Object.fromEntries(new FormData(f)),msg=$('#jn-feedback');msg.textContent='Salvando…';
 const btn=f.querySelector('[type=submit]');btn.disabled=true;
 try {
 let client=d.cliente,emp=d.emp;
 if(d.novo_cliente.trim()){const r=await sb.from('clientes').insert({nome:d.novo_cliente.trim()}).select('id').single();if(r.error)throw r.error;client=r.data.id}
 if(d.novo_emp.trim()){
 let pj=null;const cnpj=d.cnpj.replace(/\D/g,'');
 if(cnpj&&cnpj.length!==14)throw Error('CNPJ deve ter 14 dígitos.');
 if(cnpj){const r=await sb.from('pessoas_juridicas').insert({cnpj,razao_social:d.novo_emp.trim()}).select('id').single();if(r.error)throw r.error;pj=r.data.id}
 const r=await sb.from('empreendimentos').insert({nome:d.novo_emp.trim(),endereco:d.endereco||null,pessoa_juridica_id:pj}).select('id').single();if(r.error)throw r.error;emp=r.data.id;
 }
 if(!client||!emp)throw Error('Selecione ou cadastre cliente e empreendimento.');
 const recurring=d.modalidade==='recorrente';const valor=d.valor===''?null:Number(d.valor),num=recurring?0:(d.modalidade==='unico'?1:Number(d.numero==='custom'?d.num_custom:d.numero));
 if(recurring&&(!d.mensalidade||!d.inicio||!d.dia))throw Error('Informe mensalidade, primeiro mês e dia de vencimento.');
 if(num&&(!valor||!d.vencimento))throw Error('Informe valor e primeiro vencimento para criar parcelas.');
 const r=await sb.from('jobs').insert({titulo:d.titulo.trim(),cliente_principal_id:client,empreendimento_id:emp,tipo_atividade_id:d.categoria||null,valor_acordado:valor,observacoes_comerciais:d.obs||null,modalidade_cobranca:d.modalidade,valor_mensal:recurring?Number(d.mensalidade):null,dia_vencimento_recorrente:recurring?Number(d.dia):null,inicio_recorrencia:recurring?d.inicio:null,recorrencia_ativa:recurring}).select('id').single();
 if(r.error)throw r.error;
 if(num){const cents=Math.round(valor*100),base=Math.floor(cents/num),rows=Array.from({length:num},(_,i)=>{const parts=d.vencimento.split('-').map(Number);const dt=new Date(Date.UTC(parts[0],parts[1]-1+i,Math.min(parts[2],new Date(Date.UTC(parts[0],parts[1]+i,0)).getUTCDate())));return {job_id:r.data.id,numero:i+1,total_parcelas:num,valor:(base+(i===num-1?cents-base*num:0))/100,vencimento:dt.toISOString().slice(0,10),status:'pendente'}});const p=await sb.from('job_parcelas').insert(rows);if(p.error)throw Error('Job criado, mas parcelas não foram salvas: '+p.error.message)}
 msg.textContent='Job cadastrado. Atualize a lista para visualizá-lo.';setTimeout(()=>{close();window.dispatchEvent(new Event('pl:authorized'))},700);
 }catch(error){msg.textContent=error.message||'Não foi possível salvar';btn.disabled=false}
 };
}
window.PLJobRegistration={show};
})();