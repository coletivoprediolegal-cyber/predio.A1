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
const illustrativeValues=[85000,12000,48000,23000,65000,9000,35000,16000,55000,7000];
function realJobs(rows){return rows.map((j,i)=>{const raw=j.valor_contrato??j.valor_total;const actual=raw!==null&&raw!==undefined&&raw!==''&&Number.isFinite(Number(raw))?Number(raw):null;return {id:j.id,title:j.titulo||j.nome||'Job',value:actual,displayValue:actual??illustrativeValues[i%illustrativeValues.length],status:normStatus(j.status||j.situacao),color:['#a7c1a4','#a9c4de','#dbc09a','#dbaaa4','#bcb0c4'][i%5],demo:false,client:j.cliente||'',enterprise:j.empreendimento||''}})}
function size(v){const maximum=Math.max(85000,...items.map(i=>i.displayValue??i.value??0));return Math.round(62+106*Math.sqrt(Math.max(0,v||0)/maximum))}
function position(nodes,width){
 // Deterministic circle packing: place each bubble in the closest free pocket.
 // Circles never overlap, and no item crosses the container's edges.
 const gap=3,pad=2,placed=[];
 const ordered=nodes.map((n,i)=>({...n,order:i})).sort((a,b)=>b.d-a.d);
 for(const node of ordered){
  const radius=node.d/2,lo=pad+radius,hi=width-pad-radius;
  if(hi<lo){node.d=Math.max(48,width-2*pad);node.x=pad;node.y=pad+placed.reduce((m,p)=>Math.max(m,p.y+p.d),0);placed.push(node);continue}
  const maxBottom=placed.reduce((m,p)=>Math.max(m,p.y+p.d),0);
  let best=null;
  // Candidate locations at tangencies plus a fine lattice, scored for compactness.
  const candidates=[];
  if(!placed.length)candidates.push([width/2,radius+pad]);
  for(const p of placed){
   const R=(p.d+node.d)/2+gap,px=p.x+p.d/2,py=p.y+p.d/2;
   for(let k=0;k<48;k++){const theta=2*Math.PI*k/48;candidates.push([px+R*Math.cos(theta),py+R*Math.sin(theta)])}
  }
  for(let y=pad+radius;y<=maxBottom+radius+gap+24;y+=8){
   for(let x=lo;x<=hi;x+=8)candidates.push([x,y]);
  }
  for(const [cx,cy] of candidates){
   if(cx<lo-0.01||cx>hi+0.01||cy<radius+pad)continue;
   if(placed.some(p=>Math.hypot(cx-(p.x+p.d/2),cy-(p.y+p.d/2))<(node.d+p.d)/2+gap-0.2))continue;
   const bottom=Math.max(maxBottom,cy+radius);
   const score=bottom*2.3+cy*.7+Math.abs(cx-width/2)*.11;
   if(!best||score<best.score)best={cx,cy,score};
  }
  if(!best)best={cx:width/2,cy:maxBottom+gap+radius};
  node.x=Math.round(best.cx-radius);node.y=Math.round(best.cy-radius);placed.push(node);
 }
 const height=Math.ceil(placed.reduce((m,p)=>Math.max(m,p.y+p.d),0)+pad+8);
 return {nodes:placed,height};
}
function render(){
 const visible=items.filter(j=>filter==='todos'||j.status===filter);
 el.innerHTML='<div class="pl-bubble-head"><h1>Jobs</h1><button type="button" class="pl-bubble-mode" aria-label="Alternar grade e bolhas">'+(mode==='bolhas'?'☷':'◯')+'</button></div><div class="pl-bubble-filters">'+[['todos','Todos'],['ativo','Ativos'],['andamento','Em andamento'],['espera','Em espera'],['concluido','Concluídos'],['inativo','Inativos']].map(([k,v])=>'<button data-filter="'+k+'" class="'+(filter===k?'selected':'')+'">'+v+'</button>').join('')+'</div>'+(items===sample?'<p class="pl-bubble-demo">Visualização demonstrativa · valores ilustrativos, não são contratos reais</p>':'<p class="pl-bubble-demo">Jobs autorizados · tamanhos ilustrativos onde não há valor cadastrado</p>')+'<div class="pl-bubble-canvas" id="pl-bubble-canvas"></div><div class="pl-bubble-legend">'+Object.keys(labels).map(k=>'<span><i style="background:'+dots[k]+'"></i>'+labels[k]+'</span>').join('')+'</div><div class="pl-bubble-detail" id="pl-bubble-detail" hidden></div>';
 el.querySelectorAll('[data-filter]').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;render()});
 el.querySelector('.pl-bubble-mode').onclick=()=>{mode=mode==='bolhas'?'grade':'bolhas';render()};
 const canvas=el.querySelector('#pl-bubble-canvas');
 if(!visible.length){canvas.innerHTML='<p class="pl-empty">Nenhum job nesta situação.</p>';return}
 if(mode==='grade'){canvas.classList.add('grid-mode');canvas.innerHTML=visible.map((j,i)=>bubble(j,i,true)).join('');}
 else{const w=Math.max(270,Math.floor(canvas.clientWidth||window.innerWidth-38));const arranged=position(visible.map(j=>({...j,d:size(j.displayValue??j.value)})).sort((a,b)=>b.d-a.d),w);const available=Math.max(330,window.innerHeight-canvas.getBoundingClientRect().top-110);const scale=Math.min(1,Math.max(.58,available/arranged.height));canvas.style.height=Math.ceil(arranged.height*scale)+'px';canvas.innerHTML=arranged.nodes.map((j,i)=>'<button class="pl-job-bubble '+(j.status==='ativo'?'is-active ':'')+(j.status==='inativo'?'is-inactive':'')+'" data-job="'+escape(j.id)+'" style="--bubble:'+j.color+';--delay:-'+(i%7)+'s;width:'+(j.d*scale)+'px;height:'+(j.d*scale)+'px;left:'+(j.x*scale+(w-w*scale)/2)+'px;top:'+(j.y*scale)+'px"><strong>'+escape(j.title)+'</strong></button>').join('')}
 canvas.querySelectorAll('[data-job]').forEach(b=>b.onclick=()=>{const j=visible.find(x=>String(x.id)===b.dataset.job);if(!j)return;const detail=el.querySelector('#pl-bubble-detail');detail.hidden=false;detail.innerHTML='<button class="pl-bubble-close" aria-label="Fechar">×</button><strong>'+escape(j.title)+'</strong><p>'+escape(j.client||j.enterprise||'')+'</p><p>'+labels[j.status]+' · '+money(j.value)+'</p>'+(j.demo?'<small>Dados ilustrativos</small>':'<button class="pl-bubble-open">Abrir pasta do job ›</button>');detail.querySelector('.pl-bubble-close').onclick=()=>detail.hidden=true;const open=detail.querySelector('.pl-bubble-open');if(open)open.onclick=()=>window.PLJobsOverview?.openJob?.(j.id);detail.scrollIntoView({block:'nearest',behavior:'smooth'})});
}
function bubble(j,i){return '<button class="pl-job-bubble pl-grid-bubble '+(j.status==='inativo'?'is-inactive':'')+'" data-job="'+escape(j.id)+'" style="--bubble:'+j.color+'"><strong>'+escape(j.title)+'</strong><small>'+money(j.value)+'</small></button>'}
let resizeTimer;window.addEventListener('resize',()=>{if(el.offsetParent===null)return;clearTimeout(resizeTimer);resizeTimer=setTimeout(render,180)});
window.PLJobsOverview={show(){render()},setJobs(rows){if(Array.isArray(rows)&&rows.length){items=realJobs(rows);render()}},openJob:null};
render();
})();