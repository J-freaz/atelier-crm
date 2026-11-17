import {isOperiaBrand} from './operia-domain.mjs';

export function renderOperiaResources(brand){
 if(!isOperiaBrand(brand))return '';
 return `<section class="panel operia-resources" aria-labelledby="operia-video-title">
 <div class="panel-head"><div><div class="eyebrow muted">Support commercial</div><h2 id="operia-video-title">Présentation Opéria</h2></div></div>
 <p id="operia-video-origin" class="note muted">Vidéo de Dylan · reçue le 17 novembre 2026</p>
 <video class="operia-presentation-video" controls playsinline preload="none" poster="assets/operia/presentation-dylan-2026-11-17.jpg" aria-labelledby="operia-video-title" aria-describedby="operia-video-origin"><source src="assets/operia/presentation-dylan-2026-11-17.mp4" type="video/mp4">Votre navigateur ne permet pas la lecture de cette vidéo. Utilisez le lien de téléchargement ci-dessous.</video>
 <div class="operia-resource-actions"><a href="assets/operia/presentation-dylan-2026-11-17.mp4" download="presentation-operia-dylan-2026-11-17.mp4">Télécharger la vidéo</a></div>
 </section>`;
}
