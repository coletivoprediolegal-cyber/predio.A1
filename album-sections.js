(function(){
let albumId=null,sections=[],active='all',selected=new Set(),mode=false,dragging=false,reorder=false,dragId=null;
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function rpc(name,args){
 const professional=$('#pl-album-content')?.dataset.professional==='true';
 const services={
  pl_demo_album_sections:'pl_album_secoes_profissionais',
  pl_demo_album_section_members:'pl_album_membros_profissionais',
  pl_demo_album_organize:'pl_album_organizar_profissional'
 };
 const {data,error}=await window.plSupabase.rpc(professional?(services[name]||name):name,args);
 if(error)throw error;return data;
}
async function load(){const host=$('#pl-album-content'),grid=$('#pl-photo-grid');if(!host||!grid)return;albumId=host.dataset.albumId;if(!albumId)return;sections=await rpc('pl_demo_album_sections',{p_album_id:albumId});active='all';selected.clear();mode=false;render(); }
async function act(action,payload){try{await rpc('pl_demo_album_organize',{p_album_id:albumId,p_action:action,p_payload:payload});sections=await rpc('pl_demo_album_sections',{p_album_id:albumId});render()}catch(e){alert('Não foi possível salvar: '+e.message)}}
function cards(){return [...$('#pl-photo-grid').querySelectorAll('.pl-photo-card')]}
function photos(){return cards().map(c=>({el:c,id:c.querySelector('[data-preview]')?.dataset.preview})).filter(x=>x.id)}
async function sectionsMap(){return await rpc('pl_demo_album_section_members',{p_album_id:albumId})}
let mapping=[];

let sectionMenu=null;
function closeSectionMenu(){
  if(!sectionMenu)return;
  sectionMenu.trigger?.setAttribute('aria-expanded','false');
  sectionMenu.element.remove();
  sectionMenu=null;
}
function openSectionMenu(trigger,sectionId){
  if(sectionMenu){const already=sectionMenu.trigger===trigger;closeSectionMenu();if(already)return}
  const section=sections.find(x=>x.id===sectionId);
  if(!section)return;
  const el=document.createElement('div');
  el.className='pl-section-popover';
  el.id='pl-section-popover';
  el.setAttribute('role','menu');
  el.setAttribute('aria-label','Opções da seção '+section.nome);
  el.innerHTML='<button type="button" role="menuitem" data-section-command="rename"><span aria-hidden="true">✎</span> Renomear</button>'+
    '<button type="button" role="menuitem" data-section-command="delete"><span aria-hidden="true">♲</span> Excluir seção</button>';
  const rect=trigger.getBoundingClientRect();
  const left=Math.max(10,Math.min(window.innerWidth-202,rect.right-194));
  const top=rect.bottom+112>window.innerHeight?Math.max(10,rect.top-114):rect.bottom+8;
  el.style.left=Math.max(10,left)+'px';
  el.style.top=top+'px';
  el.addEventListener('click',e=>{
    const command=e.target.closest('[data-section-command]')?.dataset.sectionCommand;
    if(!command)return;
    closeSectionMenu();
    if(command==='rename'){
      const nome=prompt('Nome da seção',section.nome);
      if(nome?.trim())act('rename',{id:sectionId,nome:nome.trim()});
    }else if(command==='delete'){
      if(confirm('Excluir a seção? As fotografias voltarão para Sem seção.')){
        active='none';
        act('delete',{id:sectionId});
      }
    }
  });
  document.body.appendChild(el);
  trigger.setAttribute('aria-expanded','true');
  sectionMenu={element:el,trigger};
}
document.addEventListener('pointerdown',event=>{
  if(sectionMenu&&!sectionMenu.element.contains(event.target)&&event.target!==sectionMenu.trigger)closeSectionMenu();
},true);
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeSectionMenu()});
window.addEventListener('resize',closeSectionMenu);

async function render(){const grid=$('#pl-photo-grid');if(!grid)return;
try{mapping=await sectionsMap()}catch(e){console.warn('Organização indisponível:',e);return}
const map=new Map(mapping.map(x=>[x.fotografia_id,x]));const previous=$('#pl-section-controls');previous?.remove();
closeSectionMenu();
const panel=document.createElement('div');
panel.id='pl-section-controls';
const sectionButtons=[{id:'all',nome:'Todas'},{id:'none',nome:'Sem seção'},...sections].map(sec=>{
  const isCurrent=active===sec.id;
  const editable=isCurrent&&sec.id!=='all'&&sec.id!=='none';
  return '<span class="pl-section-item'+(isCurrent?' current':'')+'">'+
    '<button type="button" class="pl-section-tab" data-section="'+esc(sec.id)+'">'+esc(sec.nome)+'</button>'+
    (editable?'<button type="button" class="pl-section-more" aria-label="Opções da seção '+esc(sec.nome)+'" aria-haspopup="menu" aria-expanded="false" title="Renomear ou excluir seção">⋮</button>':'')+
    '</span>';
}).join('');
panel.innerHTML='<div class="pl-sections" aria-label="Seções do álbum">'+sectionButtons+
  '<button type="button" id="pl-section-add">＋ Nova seção</button></div>'+
  '<div class="pl-bulk"><button id="pl-bulk-mode">'+(mode?'Cancelar seleção':'Selecionar fotos')+
  '</button><button id="pl-order-mode">'+(reorder?'Concluir organização':'Reorganizar fotos')+
  '</button>'+(selected.size?'<strong>'+selected.size+' selecionadas</strong><select id="pl-bulk-move"><option value="">Mover para…</option><option value="none">Sem seção</option>'+
  sections.map(sec=>'<option value="'+esc(sec.id)+'">'+esc(sec.nome)+'</option>').join('')+'</select>':'')+'</div>';
grid.before(panel);
panel.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>{active=b.dataset.section;selected.clear();mode=false;render()});
$('#pl-section-add').onclick=()=>{const nome=prompt('Nome da seção');if(nome?.trim())act('create',{nome:nome.trim()})};
$('#pl-bulk-mode').onclick=()=>{mode=!mode;reorder=false;selected.clear();render()};$('#pl-order-mode').onclick=()=>{reorder=!reorder;mode=false;selected.clear();render()};
$('#pl-bulk-move')?.addEventListener('change',async e=>{if(e.target.value){await act('move',{ids:[...selected],secao_id:e.target.value==='none'?null:e.target.value});selected.clear();mode=false;render()}});
panel.querySelector('.pl-section-more')?.addEventListener('click',e=>{e.stopPropagation();openSectionMenu(e.currentTarget,active)});

for(const {el,id} of photos()){
  const info=map.get(id);
  el.hidden=active!=='all'&&(active==='none'?!!info?.secao_id:info?.secao_id!==active);
  el.classList.toggle('pl-selected',selected.has(id));
  el.classList.toggle('pl-organizing',mode||reorder);
  el.classList.toggle('pl-selecting',mode);
  el.classList.toggle('pl-reordering',reorder);
  el.draggable=false;
  const actions=el.querySelector('.pl-photo-actions');
  if(actions)actions.hidden=mode||reorder;
  el.querySelector('.pl-order-buttons')?.remove();
}
bindGestures(grid);
}
let gesture=null;
let savingOrder=false;
function photoOf(el){return el?.closest('.pl-photo-card')?.querySelector('[data-preview]')?.dataset.preview||null}
function photoAt(x,y){
  const node=document.elementFromPoint(Math.max(0,Math.min(innerWidth-1,x)),Math.max(0,Math.min(innerHeight-1,y)));
  const el=node?.closest('.pl-photo-card');
  return el&&!el.hidden&&$('#pl-photo-grid')?.contains(el)?{el,id:photoOf(el)}:null;
}
function paint(id,add){
  if(!id)return;
  if(add)selected.add(id);else selected.delete(id);
  const card=photos().find(x=>x.id===id)?.el;
  card?.classList.toggle('pl-selected',selected.has(id));
}
function dragSelectionTo(g,x,y){
  const distance=Math.hypot(x-g.x,y-g.y);
  const steps=Math.max(1,Math.ceil(distance/12));
  for(let i=1;i<=steps;i++){
    const t=i/steps;
    const target=photoAt(g.x+(x-g.x)*t,g.y+(y-g.y)*t);
    if(target)paint(target.id,g.add);
  }
  g.x=x;g.y=y;
}
function ghostAt(g,x,y){
  if(!g.ghost)return;
  g.ghost.style.transform='translate3d('+(x-g.offsetX)+'px,'+(y-g.offsetY)+'px,0) rotate(1deg)';
}
function startPhotoDrag(g){
  if(g.started||!reorder||!g.el.isConnected)return;
  g.started=true;
  const rect=g.el.getBoundingClientRect();
  g.offsetX=g.startX-rect.left;
  g.offsetY=g.startY-rect.top;
  const clone=g.el.cloneNode(true);
  clone.className='pl-photo-card pl-drag-ghost';
  clone.removeAttribute('hidden');
  clone.removeAttribute('id');
  clone.querySelector('.pl-photo-actions')?.remove();
  clone.querySelector('.pl-order-buttons')?.remove();
  clone.style.width=rect.width+'px';
  clone.style.height=rect.height+'px';
  document.body.appendChild(clone);
  g.ghost=clone;
  g.el.classList.add('pl-drag-source');
  ghostAt(g,g.startX,g.startY);
  if(navigator.vibrate)try{navigator.vibrate(15)}catch(e){}
}
function shiftDraggedPhoto(g,x,y){
  const target=photoAt(x,y);
  if(!target||target.el===g.el||!target.el.parentNode)return;
  const grid=$('#pl-photo-grid');
  if(!grid||!grid.contains(g.el))return;
  const order=photos().map(x=>x.el),from=order.indexOf(g.el),to=order.indexOf(target.el);
  if(from===to)return;
  if(from<to)grid.insertBefore(g.el,target.el.nextSibling);
  else grid.insertBefore(g.el,target.el);
  g.moved=true;
}
function orderAfterDrag(){
  const visible=photos().filter(x=>!x.el.hidden).map(x=>x.id);
  const visibleSet=new Set(visible);
  let i=0;
  return mapping.map(item=>visibleSet.has(item.fotografia_id)?visible[i++]:item.fotografia_id);
}
function endGesture(e,cancelled){
  const g=gesture;
  if(!g||e.pointerId!==g.pointerId)return;
  gesture=null;
  clearTimeout(g.timer);
  if(g.kind==='normal')return;
  if(g.kind==='pending-select'){
    // Só um toque concluído seleciona. Deslizar não altera nenhuma foto.
    if(!cancelled&&Math.hypot(e.clientX-g.startX,e.clientY-g.startY)<10){
      paint(g.id,g.add);
      render().catch(console.error);
    }
    return;
  }
  if(g.kind==='select'){
    if(!cancelled)render().catch(console.error);
    return;
  }
  if(g.kind==='reorder'){
    g.ghost?.remove();
    g.el.classList.remove('pl-drag-source');
    if(cancelled||!g.moved)return;
    const ids=orderAfterDrag();
    if(ids.length!==mapping.length||ids.some((id,i)=>!id||id===undefined)){
      render().catch(console.error);return;
    }
    savingOrder=true;
    rpc('pl_demo_album_organize',{p_album_id:albumId,p_action:'reorder',p_payload:{ids}})
      .then(()=>{mapping=mapping.map((item)=>item);mapping.sort((a,b)=>ids.indexOf(a.fotografia_id)-ids.indexOf(b.fotografia_id));return render()})
      .catch(err=>{alert('Não foi possível salvar a nova ordem: '+err.message);render().catch(console.error)})
      .finally(()=>{savingOrder=false});
  }
}
function bindGestures(grid){
  if(grid.dataset.plGestureReady)return;
  grid.dataset.plGestureReady='1';
  grid.addEventListener('click',e=>{
    const preview=e.target.closest('[data-preview]');
    if(!preview||(mode===false&&reorder===false))return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if(e.detail===0&&mode){
      const id=preview.dataset.preview;
      paint(id,!selected.has(id));
      render().catch(console.error);
    }
  },true);
  grid.addEventListener('pointerdown',e=>{
    const preview=e.target.closest('[data-preview]');
    if(!preview||savingOrder||gesture)return;
    const id=preview.dataset.preview,el=preview.closest('.pl-photo-card');
    if(!id||el?.hidden)return;
    if(mode){
      // Não consumir pointerdown: permitir o scroll vertical nativo do Android.
      // A seleção somente se confirma no pointerup sem deslocamento.
      gesture={kind:'pending-select',pointerId:e.pointerId,id,
        startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,
        pointerType:e.pointerType||'mouse',add:!selected.has(id)};
    }else if(reorder){
      e.preventDefault();
      const g={kind:'reorder',pointerId:e.pointerId,el,id,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,moved:false,started:false,ghost:null,timer:null};
      gesture=g;
      g.timer=setTimeout(()=>{if(gesture===g)startPhotoDrag(g)},170);
    }else if(e.pointerType==='touch'||e.pointerType==='pen'){
      const g={kind:'normal',pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,x:e.clientX,y:e.clientY,timer:null};
      gesture=g;
      g.timer=setTimeout(()=>{
        if(gesture!==g)return;
        mode=true;reorder=false;
        gesture={kind:'select',pointerId:e.pointerId,x:g.x,y:g.y,add:true};
        paint(id,true);
        render().catch(console.error);
      },440);
    }
  },true);
}
document.addEventListener('pointermove',e=>{
  const g=gesture;
  if(!g||g.pointerId!==e.pointerId)return;
  if(g.kind==='normal'){
    if(Math.hypot(e.clientX-g.startX,e.clientY-g.startY)>10){clearTimeout(g.timer);gesture=null}
    return;
  }
  if(g.kind==='pending-select'){
    const dx=e.clientX-g.startX,dy=e.clientY-g.startY;
    const distance=Math.hypot(dx,dy);
    if(distance<9)return;
    const touch=g.pointerType==='touch'||g.pointerType==='pen';
    // Swipe vertical: scroll normalmente, sem selecionar fotografias.
    if(touch&&Math.abs(dy)>=Math.abs(dx)){
      gesture=null;
      return;
    }
    // No touch, preservar seleção por arraste horizontal; no desktop,
    // permitir arrastar em qualquer direção.
    if(!touch||Math.abs(dx)>=14&&Math.abs(dx)>Math.abs(dy)*1.2){
      g.kind='select';
      paint(g.id,g.add);
      e.preventDefault();
      dragSelectionTo(g,e.clientX,e.clientY);
      return;
    }
    if(distance>26)gesture=null;
  }else if(g.kind==='select'){
    e.preventDefault();
    dragSelectionTo(g,e.clientX,e.clientY);
  }else if(g.kind==='reorder'){
    e.preventDefault();
    const distance=Math.hypot(e.clientX-g.startX,e.clientY-g.startY);
    if(!g.started&&distance>6){clearTimeout(g.timer);startPhotoDrag(g)}
    if(g.started){
      ghostAt(g,e.clientX,e.clientY);
      shiftDraggedPhoto(g,e.clientX,e.clientY);
    }
  }
},{passive:false});
document.addEventListener('pointerup',e=>endGesture(e,false));
document.addEventListener('pointercancel',e=>endGesture(e,true));

window.plAlbumOrganizer={mount:load,refresh:()=>render().catch(console.error)};
})();