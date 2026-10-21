(function(){
 'use strict';
 const sb=window.plSupabase;
 const gate=document.querySelector('#pl-login-gate');
 if(!gate)return;
 const message=gate.querySelector('#pl-login-message');
 const login=gate.querySelector('#pl-login-gate-button');
 const signout=gate.querySelector('#pl-login-gate-switch');
 const emailBox=document.createElement('div');
 emailBox.style.cssText='margin:12px 0;display:grid;gap:8px';
 emailBox.innerHTML='<input type="email" autocomplete="email" placeholder="Seu e-mail" aria-label="E-mail" style="padding:11px;border-radius:8px;border:1px solid #b6aa98"><input type="password" autocomplete="current-password" placeholder="Sua senha" aria-label="Senha" minlength="6" style="padding:11px;border-radius:8px;border:1px solid #b6aa98"><div style="display:flex;gap:8px;flex-wrap:wrap"><button type="button" data-email-login>Entrar com e-mail</button><button type="button" data-email-signup>Criar minha senha</button></div>';
 login.after(emailBox);
 let revision=0,wasAuthorized=false;
 function show(text,mode){
  gate.hidden=false;document.body.classList.add('pl-locked');
  message.textContent=text;
  login.hidden=mode==='unauthorized'||mode==='loading';
  signout.hidden=mode!=='unauthorized';
  emailBox.hidden=mode==='unauthorized'||mode==='loading';
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
   const {error:activationError}=await sb.rpc('pl_ativar_acesso_morador');
   if(activationError)throw activationError;
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
 emailBox.addEventListener('click',async e=>{
  const button=e.target.closest('button');if(!button)return;
  const email=emailBox.querySelector('[type=email]').value.trim().toLowerCase();
  const password=emailBox.querySelector('[type=password]').value;
  if(!email||password.length<6){message.textContent='Informe seu e-mail e uma senha com pelo menos 6 caracteres.';return}
  button.disabled=true;
  try{
   const result=button.hasAttribute('data-email-signup')
    ?await sb.auth.signUp({email,password,options:{emailRedirectTo:window.location.origin+window.location.pathname}})
    :await sb.auth.signInWithPassword({email,password});
   if(result.error)throw result.error;
   if(result.data.session)await check();
   else message.textContent='Confirme o e-mail recebido e depois entre com sua senha. Se o endereço estiver autorizado, o acesso será ativado.';
  }catch(err){message.textContent='Não foi possível entrar ou criar a conta: '+(err.message||String(err))}
  finally{button.disabled=false}
 });
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
