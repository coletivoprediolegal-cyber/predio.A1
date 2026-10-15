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
  const brow=document.createElement('div');brow.className='pl-home-eyebrow';brow.textContent='';brow.hidden=true;
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
 const search=document.querySelector('.search');
 if(search&&!document.getElementById('pl-mascot-stage')){
  const stage=document.createElement('figure');stage.id='pl-mascot-stage';stage.className='pl-mascot-stage';
  stage.setAttribute('aria-label','Mascote Prédio Legal trabalhando');search.before(stage);
 }
 applyQuote();
}

const sceneFiles=["1000378919","1000378923","1000378924","1000378927","1000378930","1000378937","1000378940","1000378941","1000378947","1000378948","1000378949","1000378954","1000378955","1000378956","1000378957","1000378958","1000378959","1000378960","1000378961","1000378962","1000378963","1000378964"];
const SCENE_PERIOD=THREE_HOURS;
let currentSceneSlot=-1;
function fallbackScene(stage,nowSlot){
 // Reuse photos already displayed by the app until mascot assets are deployed.
 const sources=[...document.querySelectorAll('#jobs-list img,#albums-list img')]
  .map(img=>img.currentSrc||img.src).filter(url=>/^https:\/\//.test(url));
 if(!sources.length){
  stage.classList.add('is-ready');
  stage.replaceChildren();
  return;
 }
 const image=new Image();image.decoding='async';image.alt='Fotografia de trabalho do Prédio Legal';
 image.src=sources[((nowSlot%sources.length)+sources.length)%sources.length];
 image.onload=()=>{if(currentSceneSlot===nowSlot){stage.replaceChildren(image);stage.classList.add('is-ready')}};
}
function updateScene(){
 const stage=document.getElementById('pl-mascot-stage');if(!stage)return;
 const nowSlot=Math.floor(Date.now()/SCENE_PERIOD);
 if(nowSlot===currentSceneSlot&&stage.querySelector('img'))return;
 currentSceneSlot=nowSlot;
 const index=((nowSlot%sceneFiles.length)+sceneFiles.length)%sceneFiles.length;
 const next=new Image();next.decoding='async';next.alt='Mascote Prédio Legal trabalhando';
 next.onload=()=>{if(currentSceneSlot===nowSlot){stage.replaceChildren(next);stage.classList.add('is-ready')}};
 next.onerror=()=>{if(currentSceneSlot===nowSlot)fallbackScene(stage,nowSlot)};
 next.src='assets/mascotes/'+sceneFiles[index]+'.webp';
}

document.addEventListener('DOMContentLoaded',()=>{setup();updateScene()},{once:true});
if(document.readyState!=='loading'){setup();updateScene()}
window.PLHome={refresh:applyQuote,refreshScene:updateScene};
window.addEventListener('pl:home-data-loaded',()=>updateScene());
let prev=slot();
setInterval(()=>{const next=slot();if(next!==prev){prev=next;override=0;applyQuote()}updateScene()},1000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){const next=slot();if(next!==prev){prev=next;override=0}applyQuote()}updateScene()});
})();
