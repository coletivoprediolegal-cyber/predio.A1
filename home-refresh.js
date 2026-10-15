(function(){
'use strict';
// Frases autorais, sem atribuições fictícias. Rotação a cada 3 horas.
const phrases=[
'As boas ideias encontram lugar nos detalhes.',
'Uma nova perspectiva muda tudo.',
'Construir também é saber observar.',
'O essencial se revela com atenção.',
'Cada projeto começa com um olhar.',
'Grandes transformações pedem pequenos começos.',
'O tempo amadurece as melhores soluções.',
'Existe beleza no trabalho bem pensado.',
'Faça espaço para novas possibilidades.',
'Clareza também é uma forma de elegância.',
'O olhar atento descobre novos caminhos.',
'Um detalhe pode transformar o conjunto.',
'As melhores respostas começam com boas perguntas.',
'Organização dá liberdade para criar.',
'Todo avanço tem seu próprio ritmo.',
'Ideias ganham forma quando saem do papel.',
'O simples pode ser extraordinário.',
'Boa arquitetura começa pela escuta.',
'Todo dia oferece uma nova perspectiva.',
'Uma pausa ajuda a enxergar o conjunto.',
'Precisão e sensibilidade caminham juntas.',
'O próximo passo começa no presente.',
'Os melhores resultados não precisam de pressa.',
'Ter método abre caminho para a criatividade.',
'Há sempre algo novo a descobrir.',
'A atenção torna visível o que importa.',
'Menos ruído, mais significado.',
'O cotidiano também merece beleza.',
'Um bom trabalho deixa marcas discretas.',
'A curiosidade é o início da descoberta.',
'Cada escolha desenha um caminho.',
'Criar é imaginar possibilidades concretas.',
'Uma ideia ganha força quando é cuidada.',
'O conhecimento cresce com cada experiência.',
'Pensar bem é construir melhor.',
'Nos detalhes, a essência do todo.',
'O espaço certo transforma a experiência.',
'Um novo dia, uma nova possibilidade.',
'O equilíbrio faz parte de um bom projeto.',
'A beleza está também na solução.',
'Construir o futuro começa com atenção ao presente.',
'Uma boa ideia merece tempo para florescer.',
'Entre observar e compreender existe um universo.',
'O que é bem pensado permanece.',
'Toda descoberta começa com um olhar diferente.',
'Os melhores caminhos unem técnica e intuição.',
'A leveza também pode ser uma escolha.',
'Grandes histórias começam de maneira simples.'
];
const THREE_HOURS=3*60*60*1000;
let override=0;
const slot=()=>Math.floor(Date.now()/THREE_HOURS);
function hash(n){let v=(n*2654435761)>>>0;v^=v>>>16;v=Math.imul(v,2246822507)>>>0;return (v^(v>>>13))>>>0}
function applyQuote(){
 const el=document.getElementById('hero-text');
 if(!el)return;
 const index=hash(slot()+override)%phrases.length;
 el.textContent=phrases[index];
}
function cycle(){override++;applyQuote()}
function setup(){
 const intro=document.querySelector('.intro');
 if(intro&&!intro.classList.contains('pl-home-intro')){
  intro.classList.add('pl-home-intro');
  const label=document.createElement('div');label.className='pl-home-quote-wrap';
  const brow=document.createElement('div');brow.className='pl-home-eyebrow';brow.textContent='Um pensamento para hoje';
  const quote=document.getElementById('hero-text');
  quote.classList.add('pl-home-quote');
  const button=document.createElement('button');
  button.type='button';button.className='pl-home-quote-refresh';
  button.setAttribute('aria-label','Mostrar outra frase');
  button.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 11a8 8 0 0 0-14-5L4 8"/><path d="M4 3v5h5"/><path d="M4 13a8 8 0 0 0 14 5l2-2"/><path d="M20 21v-5h-5"/></svg> Outra frase';
  button.addEventListener('click',cycle);
  label.append(brow,quote,button);
  intro.prepend(label);
 }
 const profile=document.querySelector('header .profile');
 if(profile&&!profile.classList.contains('pl-profile-seal')){
  profile.classList.add('pl-profile-seal');
  profile.setAttribute('aria-label','Minha conta');
  profile.setAttribute('title','Minha conta');
  profile.innerHTML='<span aria-hidden="true">PL</span>';
 }
 const jobSection=document.getElementById('jobs-list')?.closest('section.section');
 if(jobSection){
  jobSection.classList.add('pl-home-work-section');
  const heading=jobSection.querySelector('.section-title h2');
  if(heading)heading.textContent='Em foco';
  const link=jobSection.querySelector('.section-title .view');
  if(link){link.textContent='Ver trabalhos ›';link.classList.add('pl-home-all-jobs')}
  if(!jobSection.querySelector('.pl-home-work-description')){
   const desc=document.createElement('p');desc.className='pl-home-work-description';desc.textContent='Seus trabalhos ao alcance de um toque.';
   jobSection.querySelector('.section-title')?.after(desc);
  }
 }
 document.getElementById('albums-list')?.closest('section.section')?.classList.add('pl-home-albums-section');
 applyQuote();
}
document.addEventListener('DOMContentLoaded',setup,{once:true});
if(document.readyState!=='loading')setup();
window.PLHome={refresh:applyQuote};
let prev=slot();
setInterval(()=>{const next=slot();if(next!==prev){prev=next;override=0;applyQuote()}},60000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){const next=slot();if(next!==prev){prev=next;override=0}applyQuote()}});
})();
