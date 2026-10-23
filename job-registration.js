(function(){
const $=s=>document.querySelector(s), E=s=>String(s||'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
async function show(){
 const sb=window.plSupabase;const host=$('#pl-jobs-overview');if(!sb||!host)return;
 const {data:{user}}=await sb.auth.getUser();if(!user)return;
 const {data:profile}=await sb.from('perfis_acesso').select('papel,ativo').eq('usuario_id',user.id).maybeSingle();
 if(!profile?.ativo||profile.papel!=='administrador')return alert('Somente administradores podem cadastrar Jobs.');
 const [c,e,a]=await Promise.all([sb.from('clientes').select('id,nome').order('nome'),sb.from('empreendimentos').select('id,nome').order('nome'),sb.from('tipos_atividade').select('id,nome').eq('ativo',true).order('nome')]);
 if(c.error||e.error||a.error)return alert('Não foi possível consultar os cadastros.');
 host.hidden=true;
 const panel=document.createElement('section');panel.className='pl-job-new-panel container';host.after(panel);
 const options=(rows)=>rows.map(x=>'<option value="'+E(x.id)+'">'+E(x.nome)+'</option>').join('');
 panel.innerHTML='<button id="jn-back" type="button">‹ Voltar aos Jobs</button><h2>Cadastrar Job</h2><form id="jn-form"><label>Cliente<select name="cliente"><option value="">Selecione</option>'+options(c.data)+'</select></label><label>Ou novo cliente<input name="novo_cliente" placeholder="Nome do cliente"></label><label>Empreendimento<select name="emp"><option value="">Selecione</option>'+options(e.data)+'</select></label><label>Ou novo empreendimento<input name="novo_emp" placeholder="Nome do empreendimento"></label><label>Endereço do novo empreendimento<input name="endereco"></label><label>CNPJ do novo empreendimento<input name="cnpj" inputmode="numeric"></label><label>Nome do Job<input name="titulo" required></label><label>Categoria<select name="categoria"><option value="">Não informada</option>'+options(a.data)+'</select></label><h3>Condições comerciais — opcionais</h3><label>Valor fechado (R$)<input name="valor" type="number" min="0" step=".01"></label><label>Quantidade de parcelas<input name="numero" type="number" min="1" max="120" step="1"></label><label>Primeiro vencimento<input name="vencimento" type="date"></label><label>Observações iniciais<textarea name="obs" rows="3"></textarea></label><button type="submit">Salvar Job</button><p id="jn-feedback" role="status"></p></form>';
 const close=()=>{panel.remove();host.hidden=false;window.PLJobsOverview?.show()};
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
 const valor=d.valor===''?null:Number(d.valor),num=d.numero===''?0:Number(d.numero);
 if(num&&(!valor||!d.vencimento))throw Error('Informe valor e primeiro vencimento para criar parcelas.');
 const r=await sb.from('jobs').insert({titulo:d.titulo.trim(),cliente_principal_id:client,empreendimento_id:emp,tipo_atividade_id:d.categoria||null,valor_acordado:valor,observacoes_comerciais:d.obs||null}).select('id').single();
 if(r.error)throw r.error;
 if(num){const cents=Math.round(valor*100),base=Math.floor(cents/num),rows=Array.from({length:num},(_,i)=>{const parts=d.vencimento.split('-').map(Number);const dt=new Date(Date.UTC(parts[0],parts[1]-1+i,Math.min(parts[2],new Date(Date.UTC(parts[0],parts[1]+i,0)).getUTCDate())));return {job_id:r.data.id,numero:i+1,total_parcelas:num,valor:(base+(i===num-1?cents-base*num:0))/100,vencimento:dt.toISOString().slice(0,10),status:'pendente'}});const p=await sb.from('job_parcelas').insert(rows);if(p.error)throw Error('Job criado, mas parcelas não foram salvas: '+p.error.message)}
 msg.textContent='Job cadastrado. Atualize a lista para visualizá-lo.';setTimeout(()=>{close();window.dispatchEvent(new Event('pl:authorized'))},700);
 }catch(error){msg.textContent=error.message||'Não foi possível salvar';btn.disabled=false}
 };
}
window.PLJobRegistration={show};
})();