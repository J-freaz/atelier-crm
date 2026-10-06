import {escapeHTML as e,labels} from './domain.mjs';
const nanayeId='db60e148-afb6-4870-9c8e-1c9330706f22';
export function brochureFor(brand){return [nanayeId,'demo-nanaye'].includes(brand.id)?{title:'Plaquette EVJF · Nanayé',url:'https://j-freaz.github.io/nanaye-evjf-presentation/',pdf:'https://j-freaz.github.io/nanaye-evjf-presentation/brochure-nanaye-evjf.pdf?v=2'}:null;}
export function contactContext(record,records,events){
 const related=records.filter(r=>r.brand_id===record.brand_id&&r.related_id===record.id);
 const ids=new Set([record.id,...related.map(r=>r.id)]);
 return {related,events:events.filter(x=>x.brand_id===record.brand_id&&ids.has(x.record_id)).sort((a,b)=>b.created_at.localeCompare(a.created_at))};
}
export function renderContactContext(record,records,events,member){
 const context=contactContext(record,records,events);
 return `<section class="scan-panel"><h3>Suivi de ce contact</h3><p class="note muted">Dossiers liés et modifications enregistrées. La messagerie n’est pas encore connectée : les e-mails envoyés et les réponses ne remontent pas automatiquement.</p><h4>Actions, opportunités et commandes liées</h4>${context.related.map(r=>`<p><strong>${e(labels[r.kind]||r.kind)} · ${e(r.name)}</strong><br><span class="note">${r.archived?'Archivé · ':''}${e(r.status)} · ${e(member(r.owner_id))}${r.due_date?' · '+e(r.due_date):''}</span></p>`).join('')||'<p class="note muted">Aucun dossier lié. Dans une action, une opportunité ou une commande, sélectionnez ce dossier dans « Contact lié ».</p>'}<details><summary>Historique du dossier (${context.events.length})</summary>${context.events.slice(0,50).map(x=>`<p class="note"><strong>${e(x.action)} · ${e(member(x.actor_id))}</strong><br>${e(x.record_name||record.name)} · ${e(new Date(x.created_at).toLocaleString('fr-FR'))}</p>`).join('')||'<p class="note muted">Aucune modification enregistrée.</p>'}${context.events.length>50?'<p class="note">Les 50 modifications les plus récentes sont affichées.</p>':''}</details></section>`;
}
