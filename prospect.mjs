// Shared, deterministic extraction and drafting. Website text is data, never instructions.
export function publicURL(value){
 const u=new URL(value);
 if(!['https:','http:'].includes(u.protocol)||u.username||u.password||u.port||u.hostname.length>253||!u.hostname.includes('.')||! /^[a-z0-9.-]+$/i.test(u.hostname)||/^[\d.]+$/.test(u.hostname)||/\.(localhost|local|internal|test|invalid)$/i.test(u.hostname))throw Error('Adresse publique HTTP(S) requise.');
 u.hash='';return u;
}
export function publicIPv4(ip){const p=ip.split('.').map(Number);if(p.length!==4||p.some(n=>!Number.isInteger(n)||n<0||n>255))return false;const [a,b,c]=p;return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===2))||(a===198&&(b===18||b===19||b===51&&c===100))||(a===203&&b===0&&c===113));}
const entities={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' ',eacute:'é',egrave:'è',ecirc:'ê',agrave:'à',acirc:'â',ocirc:'ô',icirc:'î',ucirc:'û',ccedil:'ç',rsquo:'’',lsquo:'‘',ndash:'–',mdash:'—'};
export const cleanText=s=>s.replace(/<[^>]*>/g,' ').replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi,(m,k)=>{if(k[0]!=='#')return entities[k.toLowerCase()]||' ';const n=k[1].toLowerCase()==='x'?parseInt(k.slice(2),16):Number(k.slice(1));return n>0&&n<=0x10ffff?String.fromCodePoint(n):' ';}).replace(/\s+/g,' ').trim();
export function extractPage(html,url){
 const safe=html.replace(/<!--[\s\S]*?-->/g,' ').replace(/<(script|style|noscript|svg|nav|footer|form|header)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ');
 const title=cleanText((safe.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||'').slice(0,180);
 const blocks=[...safe.matchAll(/<(h[1-3]|p|li)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)].map(m=>cleanText(m[2])).filter(t=>t.length>=30&&t.length<=650&&!/cookie|confidentialit|javascript|tous droits|newsletter|mentions l.gales/i.test(t));
 const links=[...html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>{try{return {url:new URL(m[1].replaceAll('&amp;','&'),url).href,text:cleanText(m[2]).slice(0,180)};}catch{return null;}}).filter(Boolean);
 return {url,title,blocks:[...new Set(blocks)].slice(0,100),links};
}
export function robotsAllowed(body,url){
 const groups=[];let group=null,inRules=false;
 for(const raw of body.split(/\r?\n/)){const line=raw.split('#')[0].trim();const i=line.indexOf(':');if(i<0)continue;const key=line.slice(0,i).toLowerCase(),val=line.slice(i+1).trim();if(key==='user-agent'){if(!group||inRules){group={agents:[],rules:[]};groups.push(group);inRules=false;}group.agents.push(val.toLowerCase());}else if(group&&['allow','disallow'].includes(key)){inRules=true;if(val)group.rules.push({allow:key==='allow',path:val});}}
 const specific=groups.filter(g=>g.agents.some(a=>a==='nanayecrm'));const selected=specific.length?specific:groups.filter(g=>g.agents.includes('*'));const target=new URL(url).pathname+new URL(url).search;
 const matches=selected.flatMap(g=>g.rules).filter(r=>{const pattern=r.path.slice(0,1000).replace(/[.+?^${}()|[\]\\]/g,'\\$&').replace(/\*/g,'.*').replace(/\\\$$/,'$');return new RegExp('^'+pattern).test(target);}).sort((a,b)=>b.path.length-a.path.length||Number(b.allow)-Number(a.allow));return !matches.length||matches[0].allow;
}
const themes=[['evjf',/\bevjf\b|enterrement de vie de jeune fille/i],['wellness',/\byoga\b|\bspa\b|bien[ -]être|retraite/i],['wedding',/mariage|mariés|wedding/i],['family',/famille|familial|enfants/i],['travel',/séjour|voyage|vacances/i],['pool',/piscine|baignade|plage/i]];
export function observations(pages){const found=[];for(const p of pages){let best=null;for(const text of p.blocks){const match=themes.find(([,re])=>re.test(text));if(match&&(!best||text.length<best.text.length))best={text,theme:match[0]};}if(best){const words=best.text.split(/\s+/);found.push({url:p.url,title:p.title,theme:best.theme,excerpt:words.slice(0,24).join(' ')+(words.length>24?'…':'')});}}return found.slice(0,3);}
export function candidateLinks(page,origin){return page.links.filter(l=>{try{const u=publicURL(l.url);return u.origin===origin&&!u.search&&!/\.(pdf|jpg|png|zip|mp4)$/i.test(u.pathname)&&!/login|connexion|panier|cart|privacy|mentions|cgv/i.test(u.pathname);}catch{return false;}}).map(l=>({...l,score:/evjf|groupe|yoga|spa|bien.etre|mariage|sejour|séjour|activit|offre|famille|piscine/i.test(l.text+' '+l.url)?2:/propos|about|contact/i.test(l.text+' '+l.url)?1:0})).filter(l=>l.score).sort((a,b)=>b.score-a.score).map(l=>l.url);}
export function composeDraft({brand,contact,sender,offer,evidence=[]}){
 const fact=evidence[0];const angles={evjf:'une proposition pour vos groupes EVJF',wellness:'une proposition pour vos séjours ou activités de bien-être',wedding:'une proposition autour de vos prestations mariage',family:'une proposition destinée aux familles',travel:'une proposition pour vos séjours',pool:'une proposition autour des moments de baignade'};
 const observation=fact?`Sur votre site, j’ai relevé ce passage : « ${fact.excerpt} ».\n\n`:'';
 return {subject:`${brand} × ${contact} — proposition de partenariat`,body:`Bonjour,\n\n${observation}Je vous contacte au sujet de ${brand}. ${offer.trim()}\n\n${fact?`Seriez-vous la bonne personne pour voir si ${angles[fact.theme]||'un partenariat'} pourrait être pertinente pour votre clientèle ?`:'Seriez-vous la bonne personne pour échanger sur un éventuel partenariat ?'}\n\nJe peux vous transmettre une présentation pour en discuter.\n\n${sender}\n${brand}\n\nSi cette proposition ne vous concerne pas, dites-le-moi et je ne vous relancerai pas.`};
}
