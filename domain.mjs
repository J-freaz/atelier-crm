export const stages = {
 contact: ['Repéré','À qualifier','Qualifié','Partenaire','Client','Ne plus contacter'],
 deal: ['À préparer','Contacté','Échange en cours','Offre transmise','Gagné','Perdu'],
 task: ['À faire','En cours','Terminé'],
 order: ['À confirmer','Acompte attendu','En production','Solde attendu','Expédiée','Livrée','Annulée'],
 product: ['Actif','À valider','Archivé']
};
export const labels = {contact:'Contacts',deal:'Opportunités',task:'Actions',order:'Commandes',product:'Catalogue'};
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function cents(value){const n=String(value).trim().replace(',','.'); if(!/^\d+(\.\d{1,2})?$/.test(n)) throw Error('Montant positif avec deux décimales maximum.'); const amount=Math.round(Number(n)*100); if(!Number.isSafeInteger(amount)||amount>10000000000) throw Error('Montant trop élevé.');return amount;}
export const money=n=>new Intl.NumberFormat('fr-FR',{style:'currency',currency:'EUR'}).format((n||0)/100);
export const day=()=>new Date().toLocaleDateString('sv-SE');
export function validate(r){if(!r.name?.trim()) throw Error('Le nom est obligatoire.');if(!stages[r.kind]?.includes(r.status))throw Error('Statut invalide.');if(r.email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email))throw Error('Adresse e-mail invalide.');if(r.website&&!/^https?:\/\//i.test(r.website))throw Error('Le lien doit commencer par https:// ou http://.');if(!Number.isSafeInteger(r.amount_cents)||r.amount_cents<0)throw Error('Montant invalide.');if(r.paid_cents<0||r.paid_cents>r.amount_cents)throw Error('Le montant encaissé doit être compris entre zéro et le total.');if(r.due_date&&!/^\d{4}-\d{2}-\d{2}$/.test(r.due_date))throw Error('Date invalide.');return r;}
export function visible(rows,brand,user,mine=false){return rows.filter(r=>r.brand_id===brand&&!r.archived&&(!mine||r.owner_id===user));}
export function metrics(rows){return {contacts:rows.filter(r=>r.kind==='contact').length,open:rows.filter(r=>r.kind==='deal'&&!['Gagné','Perdu'].includes(r.status)).reduce((s,r)=>s+r.amount_cents,0),late:rows.filter(r=>r.kind==='task'&&r.status!=='Terminé'&&r.due_date&&r.due_date<day()).length,paid:rows.filter(r=>r.kind==='order'&&r.status!=='Annulée').reduce((s,r)=>s+r.paid_cents,0)};}
export function csvCell(value){let s=String(value??'');if(/^[\s]*[=+@\-]/.test(s))s="'"+s;return '"'+s.replaceAll('"','""')+'"';}
export function duplicate(rows,r){return rows.some(x=>!x.archived&&x.kind===r.kind&&x.brand_id===r.brand_id&&(x.name.trim().toLowerCase()===r.name.trim().toLowerCase()||(r.kind==='contact'&&r.email&&x.email?.toLowerCase()===r.email.toLowerCase())));}
