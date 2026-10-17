(function(){
'use strict';
const sample=[
['EZTEC · Roma 1',85000,'ativo','#344f6c'],['R Yazbek · Tumiaru 120',60000,'inativo','#bf8888'],['São Francisco Gardens',50000,'ativo','#a7c1a4'],['Incorpy · Mundi Resort',40000,'ativo','#e7b77e'],['Dimensão',30000,'andamento','#bcb0c4'],['Patri 47',28000,'andamento','#dbc09a'],['Condomínio Maxhaus',24000,'ativo','#dbaaa4'],['Lua Nova',22000,'andamento','#dfbba6'],['DIFUSORA',18000,'espera','#a9c4de'],['Chácara dos Pássaros',16000,'andamento','#dbc5a6'],['Vila Adriana',15000,'espera','#a6c5df'],['Place Vendôme',12000,'ativo','#a8c49e'],['Ana Elisa',9000,'ativo','#e5b7b1'],['Unacorp',8000,'ativo','#aec9a4'],['Casa 24',6000,'concluido','#c9c9c9']
].map((a,i)=>({id:'demo-'+i,title:a[0],value:a[1],status:a[2],color:a[3],demo:true}));
const labels={ativo:'Ativo',andamento:'Em andamento',espera:'Em espera',concluido:'Concluído',inativo:'Inativo'};
const dots={ativo:'#62945e',andamento:'#e78020',espera:'#47729a',concluido:'#999',inativo:'#c18b8c'};
const el=document.getElementById('pl-jobs-overview');if(!el)return;
let filter='todos',mode='bolhas',items=sample,selected=null;
const money=n=>n==null?'Valor não informado':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(n);
const escape=s=>String(s||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function normStatus(s){const v=String(s||'').toLowerCase();if(/conclu|finaliz|entreg/.test(v))return 'concluido';if(/inativ|cancel|arquiv/.test(v))return 'inativo';if(/espera|paus|suspens/.test(v))return 'espera';if(/andament|execu/.test(v))return 'andamento';return 'ativo'}
function realJobs(rows){return rows.map((j,i)=>({id:j.id,title:j.titulo||j.nome||'Job',value:Number.isFinite(Number(j.valor_contrato??j.valor_total))?Number(j.valor_contrato??j.valor_total):null,status:normStatus(j.status||j.situacao),color:['#a7c1a4','#a9c4de','#dbc09a','#dbaaa4','#bcb0c4'][i%5],demo:false,client:j.cliente||'',enterprise:j.empreendimento||''}))}
function size(v){return v==null?92:Math.round(82+125*Math.sqrt(Math.max(0,v)/Math.max(85000,...items.map(i=>i.value||0))))}
function position(nodes,width){const gap=10;let y=8,row=[],rowW=0,rowH=0;const result=[];function flush(){if(!row.length)return;let x=Math.max(0,(width-rowW+gap)/2);row.forEach(n=>{result.push({...n,x,y:y+(rowH-n.d)/2});x+=n.d+gap});y+=rowH+gap;row=[];rowW=0;rowH=0}nodes.forEach(n=>{if(row.length&&rowW+n.d+gap>width)flush();row.push(n);rowW+=n.d+gap;rowH=Math.max(rowH,n.d)});flush();return {nodes:result,height:y+16}}
function render(){
 const visible=items.filter(j=>filter==='todos'||j.status===filter);
 el.innerHTML='<div class="pl-bubble-head"><h1>Jobs</h1><button type="button" class="pl-bubble-mode" aria-label="Alternar grade e bolhas">'+(mode==='bolhas'?'☷':'◯')+'</button></div><div class="pl-bubble-filters">'+[['todos','Todos'],['ativo','Ativos'],['andamento','Em andamento'],['espera','Em espera'],['concluido','Concluídos'],['inativo','Inativos']].map(([k,v])=>'<button data-filter="'+k+'" class="'+(filter===k?'selected':'')+'">'+v+'</button>').join('')+'</div>'+(items===sample?'<p class="pl-bubble-demo">Visualização demonstrativa · valores ilustrativos, não são contratos reais</p>':'<p class="pl-bubble-demo">Jobs autorizados · valores sem cadastro aparecem com tamanho padrão</p>')+'<div class="pl-bubble-canvas" id="pl-bubble-canvas"></div><div class="pl-bubble-legend">'+Object.keys(labels).map(k=>'<span><i style="background:'+dots[k]+'"></i>'+labels[k]+'</span>').join('')+'</div><div class="pl-bubble-detail" id="pl-bubble-detail" hidden></div>';
 el.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render()});
 el.querySelector('.pl-bubble-mode').onclick=()=>{mode=mode==='bolhas'?'grade':'bolhas';render()};
 const canvas=el.querySelector('#pl-bubble-canvas');
 if(!visible.length){canvas.innerHTML='<p class="pl-empty">Nenhum job nesta situação.</p>';return}
 if(mode==='grade'){canvas.classList.add('grid-mode');canvas.innerHTML=visible.map((j,i)=>bubble(j,i,true)).join('');}
 else{const w=Math.max(270,Math.floor(canvas.clientWidth||window.innerWidth-38));const arranged=position(visible.map(j=>({...j,d:size(j.value)})).sort((a,b)=>b.d-a.d),w);canvas.style.height=arranged.height+'px';canvas.innerHTML=arranged.nodes.map((j,i)=>'<button class="pl-job-bubble '+(j.status==='ativo'?'is-active':'')+'" data-job="'+escape(j.id)+'" style="--bubble:'+j.color+';--delay:-'+(i%7)+'s;width:'+j.d+'px;height:'+j.d+'px;left:'+j.x+'px;top:'+j.y+'px"><strong>'+escape(j.title)+'</strong><small>'+money(j.value)+'</small></button>').join('')}
 canvas.querySelectorAll('[data-job]').forEach(b=>b.onclick=()=>{const j=visible.find(x=>String(x.id)===b.dataset.job);if(!j)return;const detail=el.querySelector('#pl-bubble-detail');detail.hidden=false;detail.innerHTML='<button class="pl-bubble-close" aria-label="Fechar">×</button><strong>'+escape(j.title)+'</strong><p>'+escape(j.client||j.enterprise||'')+'</p><p>'+labels[j.status]+' · '+money(j.value)+'</p>'+(j.demo?'<small>Dados ilustrativos</small>':'<button class="pl-bubble-open">Abrir pasta do job ›</button>');detail.querySelector('.pl-bubble-close').onclick=()=>detail.hidden=true;const open=detail.querySelector('.pl-bubble-open');if(open)open.onclick=()=>window.PLJobsOverview?.openJob?.(j.id);detail.scrollIntoView({block:'nearest',behavior:'smooth'})});
}
function bubble(j,i){return '<button class="pl-job-bubble pl-grid-bubble" data-job="'+escape(j.id)+'" style="--bubble:'+j.color+'"><strong>'+escape(j.title)+'</strong><small>'+money(j.value)+'</small></button>'}
let resizeTimer;window.addEventListener('resize',()=>{if(el.offsetParent===null)return;clearTimeout(resizeTimer);resizeTimer=setTimeout(render,180)});
window.PLJobsOverview={show(){render()},setJobs(rows){if(Array.isArray(rows)&&rows.length){items=realJobs(rows);render()}},openJob:null};
render();
})();