const origin='https://j-freaz.github.io';
export function renderGmailPanel({enabled,owner,demo}){
 return `<section class="panel"><h2>Boîte commerciale Gmail</h2><p>commercial.nanaye@gmail.com</p><p class="note">Vos comptes CRM restent personnels. La connexion autorise l’envoi et la lecture de la boîte commerciale. Aucun message n’est envoyé pendant la connexion.</p><p id="gmail-status" role="status">${demo?'Connexion indisponible en démonstration.':enabled?'Vérification de la connexion…':'Raccordement en préparation.'}</p><button id="gmail-connect" ${demo||!enabled||!owner?'disabled':''}>Autoriser la boîte commerciale dans Google</button><p class="note muted">${owner?'Choisissez uniquement commercial.nanaye@gmail.com dans Google.':'La connexion de la boîte est réservée à l’administrateur Nanayé.'} Le suivi des réponses et l’envoi depuis le CRM seront activés après leur recette.</p></section>`;
}
export function bindGmailPanel({store,enabled,demo,owner}){
 const button=document.querySelector('#gmail-connect'),label=document.querySelector('#gmail-status');if(!button||!enabled||demo)return;
 const alive=()=>button.isConnected;
 store.gmail('status').then(s=>{if(!alive())return;label.textContent=s.connected?'Boîte autorisée : '+s.email:s.configured?'Boîte non connectée.':'Configuration serveur à terminer.';button.disabled=!owner||!s.configured;}).catch(err=>{if(alive()){label.textContent=err.message;button.disabled=true;}});
 button.onclick=async()=>{
  button.disabled=true;
  const popup=window.open('about:blank','nanaye-gmail','popup,width=650,height=750');
  if(!popup){label.textContent='Autorisez les fenêtres de connexion pour ce site.';button.disabled=false;return;}
  let listener,timeout;
  const cleanup=()=>{if(listener)window.removeEventListener('message',listener);clearTimeout(timeout);if(alive())button.disabled=false;};
  try{
   const start=await store.gmail('start');
   if(!alive()){popup.close();cleanup();return;}
   const target=new URL(start.url);if(target.origin!=='https://accounts.google.com')throw Error('Adresse Google invalide.');
   listener=async event=>{
    if(event.origin!==origin||event.source!==popup||event.data?.type!=='nanaye-gmail-oauth'||event.data.state!==start.state)return;
    cleanup();button.disabled=true;popup.close();
    if(event.data.error){label.textContent='Autorisation annulée.';button.disabled=false;return;}
    try{const result=await store.gmail('finish',{code:event.data.code,state:start.state});if(alive())label.textContent='Boîte autorisée : '+result.email+'. Aucun message envoyé.';}catch(err){if(alive())label.textContent=err.message;}finally{if(alive())button.disabled=false;}
   };
   window.addEventListener('message',listener);
   timeout=setTimeout(()=>{cleanup();if(alive())label.textContent='Connexion expirée. Relancez-la si nécessaire.';},600000);
   popup.location.href=start.url;label.textContent='Terminez l’autorisation dans la fenêtre Google.';
  }catch(err){popup.close();cleanup();if(alive())label.textContent=err.message;}
 };
}
