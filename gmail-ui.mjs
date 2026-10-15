const origin='https://j-freaz.github.io';
export function renderGmailPanel({enabled,owner,demo}){
 return `<section class="panel"><h2>Boîte commerciale Gmail</h2><p>commercial.nanaye@gmail.com</p><p class="note">Vos comptes CRM restent personnels. La connexion autorise l’envoi et la lecture de la boîte commerciale. Aucun message n’est envoyé pendant la connexion.</p><p id="gmail-status" role="status">${demo?'Connexion indisponible en démonstration.':enabled?'Vérification de la connexion…':'Raccordement en préparation.'}</p><p id="gmail-open"></p><button id="gmail-connect" ${demo||!enabled||!owner?'disabled':''}>Autoriser la boîte commerciale dans Google</button><p class="note muted">${owner?'Choisissez uniquement commercial.nanaye@gmail.com dans Google.':'La connexion de la boîte est réservée à l’administrateur Nanayé.'} Le suivi des réponses et l’envoi depuis le CRM seront activés après leur recette.</p></section>`;
}
export function bindGmailPanel({store,enabled,demo,owner}){
 const button=document.querySelector('#gmail-connect'),label=document.querySelector('#gmail-status');if(!button||!enabled||demo)return;
 const alive=()=>button.isConnected;
 store.gmail('status').then(s=>{if(!alive())return;label.textContent=s.connected?'Boîte autorisée : '+s.email:s.configured?'Boîte non connectée.':'Configuration serveur à terminer.';button.disabled=!owner||!s.configured;}).catch(err=>{if(alive()){label.textContent=err.message;button.disabled=true;}});
 button.onclick=async()=>{
  button.disabled=true;
  const popup=window.open('about:blank','nanaye-gmail','popup,width=650,height=750');
  let listener,timeout,channel,completed=false; const openLink=document.querySelector('#gmail-open');
  const cleanup=()=>{if(listener)window.removeEventListener('message',listener);clearTimeout(timeout);channel?.close();if(openLink)openLink.replaceChildren();if(alive())button.disabled=false;};
  try{
   const start=await store.gmail('start');
   if(!alive()){popup?.close();cleanup();return;}
   const target=new URL(start.url);if(target.origin!=='https://accounts.google.com')throw Error('Adresse Google invalide.');
   const complete=async data=>{
    if(completed||data?.type!=='nanaye-gmail-oauth'||data.state!==start.state)return;completed=true;
    cleanup();button.disabled=true;popup?.close();
    if(data.error){label.textContent='Autorisation annulée.';button.disabled=false;return;}
    try{const result=await store.gmail('finish',{code:data.code,state:start.state});if(alive())label.textContent='Boîte autorisée : '+result.email+'. Aucun message envoyé.';}catch(err){if(alive())label.textContent=err.message;}finally{if(alive())button.disabled=false;}
   };
   listener=event=>{if(event.origin===origin&&event.source===popup)complete(event.data);};
   window.addEventListener('message',listener);
   channel=new BroadcastChannel('nanaye-gmail-'+start.state);channel.onmessage=event=>complete(event.data);
   if(openLink){const link=document.createElement('a');link.href=start.url;link.target='_blank';link.rel='noopener';link.textContent='Ouvrir Google pour autoriser la boîte commerciale';openLink.append(link);}
   timeout=setTimeout(()=>{cleanup();if(alive())label.textContent='Connexion expirée. Relancez-la si nécessaire.';},600000);
   if(popup)popup.location.href=start.url;label.textContent='Terminez l’autorisation dans la fenêtre Google.';
  }catch(err){popup?.close();cleanup();if(alive())label.textContent=err.message;}
 };
}
