(function(){
let albumId=null,sections=[],active='all',selected=new Set(),mode=false,dragging=false,reorder=false,dragId=null;
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function rpc(name,args){const {data,error}=await window.plSupabase.rpc(name,args);if(error)throw error;return data}
async function load(){const host=$('#pl-album-content'),grid=$('#pl-photo-grid');if(!host||!grid)return;albumId=host.dataset.albumId;if(!albumId)return;sections=await rpc('pl_demo_album_sections',{p_album_id:albumId});active='all';selected.clear();mode=false;render(); }
async function act(action,payload){try{await rpc('pl_demo_album_organize',{p_album_id:albumId,p_action:action,p_payload:payload});sections=await rpc('pl_demo_album_sections',{p_album_id:albumId});render()}catch(e){alert('Não foi possível salvar: '+e.message)}}
function cards(){return [...$('#pl-photo-grid').querySelectorAll('.pl-photo-card')]}
function photos(){return cards().map(c=>({el:c,id:c.querySelector('[data-preview]')?.dataset.preview})).filter(x=>x.id)}
async function sectionsMap(){return await rpc('pl_demo_album_section_members',{p_album_id:albumId})}
let mapping=[];
async function render(){const grid=$('#pl-photo-grid');if(!grid)return;
try{mapping=await sectionsMap()}catch(e){console.warn('Organização indisponível:',e);return}
const map=new Map(mapping.map(x=>[x.fotografia_id,x]));const previous=$('#pl-section-controls');previous?.remove();
const panel=document.createElement('div');panel.id='pl-section-controls';panel.innerHTML='<div class="pl-sections">'+[{id:'all',nome:'Todas'},{id:'none',nome:'Sem seção'},...sections].map(s=>'<button data-section="'+esc(s.id)+'" class="'+(active===s.id?'current':'')+'">'+esc(s.nome)+'</button>').join('')+'<button id="pl-section-add">＋ Nova seção</button></div><div class="pl-bulk"><button id="pl-bulk-mode">'+(mode?'Cancelar seleção':'Selecionar fotos')+'</button><button id="pl-order-mode">'+(reorder?'Concluir organização':'Reorganizar fotos')+'</button>'+(selected.size?'<strong>'+selected.size+' selecionadas</strong><select id="pl-bulk-move"><option value="">Mover para…</option><option value="none">Sem seção</option>'+sections.map(s=>'<option value="'+esc(s.id)+'">'+esc(s.nome)+'</option>').join('')+'</select>':'')+(active!=='all'&&active!=='none'?'<button id="pl-section-rename">Renomear</button><button id="pl-section-remove">Excluir seção</button>':'')+'</div>';
grid.before(panel);
panel.querySelectorAll('[data-section]').forEach(b=>b.onclick=()=>{active=b.dataset.section;selected.clear();mode=false;render()});
$('#pl-section-add').onclick=()=>{const nome=prompt('Nome da seção');if(nome?.trim())act('create',{nome:nome.trim()})};
$('#pl-bulk-mode').onclick=()=>{mode=!mode;reorder=false;selected.clear();render()};$('#pl-order-mode').onclick=()=>{reorder=!reorder;mode=false;selected.clear();render()};
$('#pl-bulk-move')?.addEventListener('change',async e=>{if(e.target.value){await act('move',{ids:[...selected],secao_id:e.target.value==='none'?null:e.target.value});selected.clear();mode=false;render()}});
$('#pl-section-rename')?.addEventListener('click',()=>{const s=sections.find(x=>x.id===active),nome=prompt('Nome da seção',s?.nome);if(nome?.trim())act('rename',{id:active,nome:nome.trim()})});
$('#pl-section-remove')?.addEventListener('click',()=>{if(confirm('Excluir a seção? As fotografias voltarão para Sem seção.')){const id=active;active='none';act('delete',{id})}});

for(const {el,id} of photos()){
  const info=map.get(id);
  el.hidden=active!=='all'&&(active==='none'?!!info?.secao_id:info?.secao_id!==active);
  el.classList.toggle('pl-selected',selected.has(id));
  el.classList.toggle('pl-organizing',mode||reorder);
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
      e.preventDefault();
      const add=!selected.has(id);
      paint(id,add);
      gesture={kind:'select',pointerId:e.pointerId,x:e.clientX,y:e.clientY,add};
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
  if(g.kind==='select'){
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