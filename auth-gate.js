(function(){
 'use strict';
 const sb=window.plSupabase;
 const gate=document.querySelector('#pl-login-gate');
 if(!gate)return;
 const message=gate.querySelector('#pl-login-message');
 const login=gate.querySelector('#pl-login-gate-button');
 const signout=gate.querySelector('#pl-login-gate-switch');
 let revision=0,wasAuthorized=false;
 function show(text,mode){
  gate.hidden=false;document.body.classList.add('pl-locked');
  message.textContent=text;
  login.hidden=mode==='unauthorized'||mode==='loading';
  signout.hidden=mode!=='unauthorized';
 }
 function allow(){
  gate.hidden=true;document.body.classList.remove('pl-locked');
  if(!wasAuthorized){wasAuthorized=true;window.dispatchEvent(new Event('pl:authorized'))}
 }
 async function check(){
  const current=++revision;
  if(!sb){show('Conexão indisponível. Atualize a página para tentar novamente.','loading');return}
  try{
   const {data:{session},error:e}=await sb.auth.getSession();
   if(current!==revision)return;
   if(e)throw e;
   if(!session){
    wasAuthorized=false;
    show('Entre com sua conta Google para acessar clientes, jobs e álbuns do Prédio Legal.','login');
    return;
   }
   const {data:profile,error:pe}=await sb.rpc('pl_meu_perfil');
   if(current!==revision)return;
   if(pe)throw pe;
   if(!profile?.ativo){
    wasAuthorized=false;
    show('Esta conta ainda não tem acesso liberado ao Prédio Legal. Use uma conta autorizada ou solicite acesso ao administrador.','unauthorized');
    return;
   }
   allow();
  }catch(err){
   if(current!==revision)return;
   wasAuthorized=false;
   console.warn('Acesso ao Prédio Legal:',err);
   show('Não foi possível confirmar sua autorização. Verifique a conexão e tente novamente.','error');
  }
 }
 login.addEventListener('click',async()=>{
  if(!sb)return;
  login.disabled=true;login.textContent='Abrindo Google…';
  try{
   const {error}=await sb.auth.signInWithOAuth({
    provider:'google',options:{redirectTo:window.location.origin+window.location.pathname}
   });
   if(error)throw error;
  }catch(err){
   show('Não foi possível iniciar o login: '+(err.message||String(err)),'login');
  }finally{
   login.disabled=false;login.textContent='Entrar com Google';
  }
 });
 signout.addEventListener('click',async()=>{
  signout.disabled=true;
  try{await sb.auth.signOut();wasAuthorized=false;await check()}
  finally{signout.disabled=false}
 });
 sb?.auth.onAuthStateChange((event,session)=>{
  if(event==='SIGNED_OUT'||!session){
   gate.hidden=false;document.body.classList.add('pl-locked');wasAuthorized=false;
  }
  // Delay any Supabase request until the auth callback has completed.
  setTimeout(()=>check().catch(console.error),0);
 });
 window.PLAuthGate={refresh:check};
 check().catch(console.error);
})();
