import {config} from './config.mjs?v=20261116-1';
import {requestEmailCode,verifyEmailCode,emailAuthErrorMessage,normalizeLoginEmail,validLoginEmail,validEmailOtp,emailOtpLength} from './auth.mjs?v=20261116-1';

export function emailLoginMarkup({enabled=config.emailOtpEnabled,otpLength=emailOtpLength()}={}){
 if(!enabled)return '';
 const length=emailOtpLength(otpLength);
 return `<div class="line"></div><section aria-label="Connexion par e-mail" id="email-login">
 <h3>Connexion par e-mail</h3><p class="note muted">Pour les personnes disposant déjà d’un accès au CRM.</p>
 <form id="email-login-address-form"><label for="email-login-address">Adresse e-mail</label>
 <input id="email-login-address" name="email" type="email" autocomplete="email" autocapitalize="none" spellcheck="false" maxlength="254" required>
 <button id="email-login-request" type="submit">Recevoir un code de connexion</button></form>
 <form id="email-login-code-form" hidden><label for="email-login-code">Code reçu par e-mail</label>
 <input id="email-login-code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{${length}}" minlength="${length}" maxlength="${length}" aria-describedby="email-login-status" required>
 <button class="primary" id="email-login-verify" type="submit">Se connecter</button>
 <button id="email-login-resend" type="button">Renvoyer un code</button>
 <button id="email-login-change" type="button">Changer d’adresse</button></form>
 <p class="note" id="email-login-status" role="status" aria-live="polite"></p>
 <p class="error" id="email-login-error" role="alert"></p></section>`;
}

// Returns cleanup: call it when leaving the login screen, including for demo/Google.
export function bindEmailLogin({root=globalThis.document,enabled=config.emailOtpEnabled,onAuthenticated,requestCode=requestEmailCode,verifyCode=verifyEmailCode,otpLength=emailOtpLength(),now=()=>Date.now(),setTimer=(fn,ms)=>setTimeout(fn,ms),clearTimer=id=>clearTimeout(id)}={}){
 if(!enabled)return ()=>{};
 const nodes={};
 for(const key of ['address-form','address','request','code-form','code','verify','resend','change','status','error']){
  nodes[key]=root?.querySelector(`#email-login-${key}`);
  if(!nodes[key])throw Error('Le formulaire de connexion par e-mail est incomplet.');
 }
 if(typeof onAuthenticated!=='function')throw Error('La reprise de session doit être fournie.');
 let disposed=false,busy=false,challengeEmail='',authenticated=false,completed=false,nextRequestAt=0,nextVerifyAt=0,timer=null;
 const length=emailOtpLength(otpLength);
 const secondsUntil=timestamp=>Math.max(0,Math.ceil((timestamp-now())/1000));
 const active=()=>!disposed;
 function draw(){
  if(!active())return;
  if(timer!==null){clearTimer(timer);timer=null;}
  const requestWait=secondsUntil(nextRequestAt),verifyWait=secondsUntil(nextVerifyAt);
  nodes.address.disabled=busy||!!challengeEmail||authenticated;
  nodes.request.disabled=busy||!!challengeEmail||authenticated||requestWait>0;
  nodes.request.textContent=requestWait?`Réessayer dans ${requestWait} s`:'Recevoir un code de connexion';
  nodes['code-form'].hidden=!challengeEmail;
  nodes.code.disabled=busy||authenticated||verifyWait>0;
  nodes.verify.disabled=busy||completed||verifyWait>0;
  nodes.verify.textContent=authenticated?'Ouvrir mon espace':verifyWait?`Réessayer dans ${verifyWait} s`:'Se connecter';
  nodes.resend.disabled=busy||authenticated||requestWait>0;
  nodes.resend.textContent=requestWait?`Renvoyer dans ${requestWait} s`:'Renvoyer un code';
  nodes.change.disabled=busy||authenticated;
  if(requestWait||verifyWait)timer=setTimer(draw,1000);
 }
 function showError(error,phase){nodes.error.textContent=emailAuthErrorMessage(error,phase);}
 function rateLimit(error){if(error?.code==='ATELIER_RATE_LIMITED'){nextRequestAt=now()+60000;nextVerifyAt=now()+60000;}}
 async function sendCode(event){
  event?.preventDefault();
  if(!active()||busy||authenticated||secondsUntil(nextRequestAt))return;
  const email=challengeEmail||normalizeLoginEmail(nodes.address.value);
  nodes.error.textContent='';
  if(!validLoginEmail(email)){showError({code:'ATELIER_INVALID_EMAIL'});nodes.address.focus();return;}
  busy=true;nodes.code.value='';nodes.status.textContent='Demande du code en cours…';draw();
  try{
   await requestCode(email);
   if(!active())return;
   challengeEmail=email;nodes.address.value=email;nextRequestAt=now()+60000;
   nodes.status.textContent='Si cette adresse dispose d’un accès, un code vous sera envoyé. Consultez aussi les courriers indésirables.';
  }catch(error){
   if(!active())return;
   rateLimit(error);nodes.status.textContent='';showError(error,'request');
  }finally{if(active()){busy=false;draw();if(challengeEmail)nodes.code.focus();}}
 }
 async function finishLogin(){
  try{
   await onAuthenticated();
   if(active()){completed=true;nodes.status.textContent='Connexion effectuée.';}
  }catch{
   if(active()){
    nodes.status.textContent='Votre connexion est confirmée.';
    nodes.error.textContent='Votre espace n’a pas pu être ouvert. Réessayez avec « Ouvrir mon espace » ou contactez votre administrateur.';
   }
  }
 }
 async function verify(event){
  event?.preventDefault();
  if(!active()||busy||completed||!challengeEmail||secondsUntil(nextVerifyAt))return;
  nodes.error.textContent='';
  if(!authenticated&&!validEmailOtp(nodes.code.value,length)){showError({code:'ATELIER_INVALID_CODE'},'verify');nodes.code.focus();return;}
  busy=true;nodes.status.textContent='Connexion en cours…';draw();
  try{
   if(!authenticated){
    const result=await verifyCode(challengeEmail,nodes.code.value.trim());
    if(!active())return;
    if(!result?.user?.id){showError({code:'ATELIER_SESSION_MISSING'},'verify');nodes.status.textContent='';return;}
    authenticated=true;nodes.code.value='';
   }
   await finishLogin();
  }catch(error){
   if(!active())return;
   rateLimit(error);nodes.status.textContent='';showError(error,'verify');
  }finally{if(active()){nodes.code.value='';busy=false;draw();}}
 }
 function changeEmail(){
  if(!active()||busy||authenticated)return;
  challengeEmail='';nodes.code.value='';nodes.status.textContent='';nodes.error.textContent='';draw();nodes.address.focus();
 }
 nodes['address-form'].onsubmit=sendCode;
 nodes['code-form'].onsubmit=verify;
 nodes.resend.onclick=sendCode;
 nodes.change.onclick=changeEmail;
 draw();
 return ()=>{
  if(disposed)return;
  disposed=true;if(timer!==null)clearTimer(timer);timer=null;
  nodes['address-form'].onsubmit=null;nodes['code-form'].onsubmit=null;nodes.resend.onclick=null;nodes.change.onclick=null;
  nodes.code.value='';nodes.address.value='';challengeEmail='';
 };
}
