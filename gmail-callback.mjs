// No tokens or personal data are stored here. The opener must check origin,
// event.source and the one-time state before sending this code to its server.
const params=new URLSearchParams(location.search);
const code=params.get('code'),state=params.get('state'),error=params.get('error');
history.replaceState(null,'',location.pathname);
const output=document.querySelector('#result');
if(!window.opener||!state||(!code&&!error)){
 output.textContent='Cette connexion doit être démarrée depuis le CRM. Revenez à votre espace pour réessayer.';
}else{
 window.opener.postMessage({type:'nanaye-gmail-oauth',code,state,error:error?'Autorisation Google refusée.':null},'https://j-freaz.github.io');
 output.textContent='Réponse Google transmise au CRM. Vérifiez le résultat dans votre fenêtre principale avant de fermer celle-ci.';
}
