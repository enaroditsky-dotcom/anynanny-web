'use strict';
// The entrance changes presentation only; all app journeys keep their existing state/actions.
(()=>{
 const experience=document.getElementById('demo-experience');
 const zoom=document.getElementById('scene-zoom');
 const back=document.getElementById('leave-demo');
 const roleLabel=document.getElementById('experience-role');
 const reduced=window.matchMedia('(prefers-reduced-motion: reduce)');
 const screens={parent:{x:129,y:460,w:85,h:177,position:'100%'},sitter:{x:574,y:420,w:86,h:183,position:'0%'}};
 let entering=false,animation=null,revealTimer=null,lastChoice=null,generation=0;
 const syncRole=()=>{roleLabel.textContent=state.role==='parent'?'הצד של ההורים':'הצד של הבייביסיטרית';experience.classList.toggle('is-sitter',state.role==='sitter')};
 const previousReset=reset;
 reset=function(role=state.role){previousReset(role);syncRole()};
 function clearTransition(){clearTimeout(revealTimer);revealTimer=null;if(animation){animation.cancel();animation=null}zoom.replaceChildren();zoom.hidden=true;experience.classList.remove('is-entering');entering=false}
 function closeExperience(){
  generation++;clearTransition();
  // Stop pending demo replies before returning to the illustration.
  reset(state.role);
  if(experience.open)experience.close();
  document.body.classList.remove('demo-open');
  lastChoice?.focus({preventScroll:true});
 }
 async function enter(role,choice){
  if(entering||experience.open||!screens[role])return;
  const token=++generation;entering=true;lastChoice=choice;
  const source=choice.getBoundingClientRect();
  reset(role);syncRole();document.body.classList.add('demo-open');
  experience.classList.add('is-entering');experience.showModal();
  const finish=()=>{if(token!==generation)return;clearTransition();back.focus({preventScroll:true})};
  if(reduced.matches||typeof choice.animate!=='function'){finish();return}
  const screen=screens[role],sourceScale=source.width/768;
  const target=experience.querySelector('.phone').getBoundingClientRect();
  const centerX=(screen.x+screen.w/2)*sourceScale,centerY=(screen.y+screen.h/2)*sourceScale;
  const scale=Math.max(target.width/(screen.w*sourceScale),target.height/(screen.h*sourceScale));
  const dx=target.left+target.width/2-source.left-centerX*scale;
  const dy=target.top+target.height/2-source.top-centerY*scale;
  const art=document.createElement('div');art.className='zoom-art';
  Object.assign(art.style,{left:source.left+'px',top:source.top+'px',width:source.width+'px',height:source.height+'px',backgroundPosition:screen.position+' top'});
  zoom.append(art);zoom.hidden=false;
  animation=art.animate([
   {transform:'translate(0,0) scale(1)',opacity:1,offset:0},
   {transform:`translate(${dx}px,${dy}px) scale(${scale})`,opacity:1,offset:.8},
   {transform:`translate(${dx}px,${dy}px) scale(${scale})`,opacity:0,offset:1}
  ],{duration:1150,easing:'cubic-bezier(.22,.65,.2,1)',fill:'forwards'});
  revealTimer=setTimeout(()=>{if(token===generation)experience.classList.remove('is-entering')},820);
  try{await animation.finished}catch{}finally{finish()}
 }
 document.querySelectorAll('[data-enter]').forEach(choice=>choice.addEventListener('click',()=>enter(choice.dataset.enter,choice)));
 window.startAnyNannyDemo=role=>{if(!screens[role])return;if(experience.open){reset(role);return}return enter(role,document.querySelector(`[data-enter="${role}"]`))};
 back.addEventListener('click',closeExperience);
 experience.addEventListener('cancel',event=>{
  event.preventDefault();
  // A nested app dialog consumes Escape first; closing it must not exit the demo.
  if(experience.dataset.nestedEscape==='true')return;
  closeExperience();
 });
 document.addEventListener('keydown',event=>{
  if(event.key!=='Escape'||!experience.open)return;
  experience.dataset.nestedEscape=String(!!(state.role==='parent'?p.dialog:s.dialog));
  setTimeout(()=>{delete experience.dataset.nestedEscape},0);
 },true);
 window.addEventListener('pagehide',()=>{generation++;clearTransition()});
 syncRole();
 const requestedRole=new URLSearchParams(window.location.search).get('role');
 if(requestedRole==='parent'||requestedRole==='sitter'){
  requestAnimationFrame(()=>window.startAnyNannyDemo(requestedRole));
 }
})();
