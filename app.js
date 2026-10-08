/* Visor del sociograma comunitari CAP Salt 1 i Salt 2 (2026). Sense backend: dades a data/dades.js */
(function(){
'use strict';
const D = window.DADES;
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl = u => /^https?:\/\//i.test(u||'') ? u : null;
const fmt = n => n == null ? 's/d' : n.toLocaleString('ca-ES');
const ESF = {
  'Politicoinstitucional':'#b8b8b8','Salut':'#e8797a','Serveis municipals i socials':'#f5b461','Educació':'#5fa2d1',
  'Tercer sector':'#6cbf63','Comunitat, cultura, esport i gent gran':'#9d98c9',
  'Diversitat cultural, religiosa i de gènere':'#c99a63','Població no organitzada':'#e6d66a'};
const ESF_SOC = {'Politicoinstitucional':'#d0d0d0','Salut':'#f4a6a6','Serveis municipals i socials':'#fdd49e','Educació':'#9ecae1','Tercer sector':'#a1d99b','Comunitat, cultura, esport i gent gran':'#cbc9e2','Diversitat cultural, religiosa i de gènere':'#e6c9a8','Població no organitzada':'#fff7bc'};
const CAPS = [{id:'S01',nom:'CAP Salt 1',lon:2.7925568,lat:41.9744843},{id:'S02',nom:'CAP Salt 2',lon:2.7865003,lat:41.9698869}];
const HIP = "hipòtesi a validar amb l'equip";
const A = D.actors, R = D.relacions;
const byId = Object.fromEntries(A.map(a => [a.id, a]));
const FONT_ACT = "Dataset propi del sociograma (actors.csv), a partir de fonts públiques citades a cada fitxa";
const DATA_ACT = "consulta setembre-octubre 2026";
const isSalut = a => a.esfera === 'Salut' || /salut|farmàc/i.test(a.ambit);
const salutCat = a => /farmàc/i.test(a.nom + a.ambit) ? 'Farmàcies' : /salut mental|addicc/i.test(a.ambit) ? 'Salut mental i addiccions' : a.esfera === 'Salut' ? 'Sistema sanitari i salut pública' : 'Altres esferes amb rol de salut';
const SALUT_COL = {'Sistema sanitari i salut pública':'#c0392b','Salut mental i addiccions':'#8e44ad','Farmàcies':'#16a085','Altres esferes amb rol de salut':'#e59866'};
const verif = a => /^(R|MG)\d/.test(a.id) || (a.esfera.startsWith('Diversitat') && /religi|migra/.test(a.ambit));
const BADGE_V = '<span class="etq verificar">VERIFICAR</span>';
const linkify = t => esc(t).replace(/https?:\/\/[^\s)<;]+[^\s)<;.,]/g, u => `<a href="${u}" target="_blank" rel="noopener">${u.replace(/^https?:\/\/(www\.)?/,'').slice(0,40)}…</a>`);
const distCat = d => d < 500 ? '< 500 m' : d < 1000 ? '500–1.000 m' : '≥ 1.000 m';
const DIST_COL = {'< 500 m':'#1a9850','500–1.000 m':'#fdae61','≥ 1.000 m':'#d73027'};
const zonaCat = a => /^Salt 1/.test(a.cap_proximitat) ? 'Salt 1' : /^Salt 2/.test(a.cap_proximitat) ? 'Salt 2' : 'n/a';
const ZONA_COL = {'Salt 1':'#3f6fb5','Salt 2':'#d17a22','n/a':'#999'};
const IST_BR = [[0,45,'#b2182b','< 45'],[45,60,'#ef8a62','45–60'],[60,75,'#fddbc7','60–75'],[75,90,'#d1e5f0','75–90'],[90,999,'#67a9cf','≥ 90']];
const istCol = v => v == null ? null : IST_BR.find(b => v >= b[0] && v < b[1])[2];

const VISTES = [
 {id:'portada', q:'Què és aquest visor?', tipus:'panell'},
 {id:'actors', q:'On són els actors comunitaris?', tipus:'mapa', sel: a => true, col: a => ESF[a.esfera], filtreEsfera:true},
 {id:'salut', q:'Quins actors de salut hi ha?', tipus:'mapa', sel: isSalut, col: a => SALUT_COL[salutCat(a)]},
 {id:'tercer', q:'Qui fa xarxa al Tercer Sector?', tipus:'mapa', sel: a => a.esfera === 'Tercer sector', col: a => ESF[a.esfera], linies:true},
 {id:'educatiu', q:'Quins són els actors educatius?', tipus:'mapa', sel: a => a.esfera === 'Educació', col: a => a.estat_verificacio === 'a validar' ? '#b03a2e' : ESF[a.esfera]},
 {id:'diversitat', q:'On són els actors de diversitat i culte?', tipus:'mapa', sel: a => a.esfera === 'Diversitat cultural, religiosa i de gènere', col: a => a.ambit.startsWith('religi') ? '#7b5a2e' : ESF[a.esfera]},
 {id:'ist', q:'Quina és la vulnerabilitat de cada secció censal?', tipus:'mapa', sel: a => false},
 {id:'zones', q:'Quina zona cobreix cada CAP?', tipus:'mapa', sel: a => true, col: a => ZONA_COL[zonaCat(a)], hip:true},
 {id:'distancia', q:"Qui queda lluny d'un CAP?", tipus:'mapa', sel: a => true, col: a => DIST_COL[distCat(a.dist_cap_m)]},
 {id:'xarxa', q:'Com es relacionen?', tipus:'xarxa'},
 {id:'validar', q:"Què cal validar amb l'equip?", tipus:'panell'}
];
const V = Object.fromEntries(VISTES.map(v => [v.id, v]));
const MOBIL = matchMedia('(max-width:760px)').matches || (navigator.hardwareConcurrency || 8) <= 4;
const MOVIMENT = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let estat = {v:'portada', esf:new Set(Object.keys(ESF)), fitxa:null, xEsf:'', xNiv:'', xHip:true, xEst:false, d3:true, arcs:false, base:'positron', relleu:false};
let map, mapLlest = false, cy = null, seleccio = [];

/* ---------- calaix ---------- */
$('#llista-vistes').innerHTML = VISTES.map((v,i) => `<li><a href="#v=${v.id}" data-v="${v.id}"><span class="n">${i ? i : '·'}</span>${esc(v.q)}${v.hip ? ' <span class="etq hipotesi">Hipòtesi</span>' : ''}</a></li>`).join('');
$('#obre-calaix').onclick = () => { const t = document.body.classList.toggle('calaix-tancat'); $('#obre-calaix').setAttribute('aria-expanded', !t); if (map) map.resize(); if (cy) cy.resize(); };
if (matchMedia('(max-width:760px)').matches) document.body.classList.add('calaix-tancat');

/* ---------- llegendes (spec comuna HTML + PNG) ---------- */
function llegendaSpec(v){
  const L = {titol:V[v].q, etiq:[['mesura','Mesura']], items:[], font:'', any:'', metode:'', notes:[]};
  const vis = actorsVista(v), geo = vis.filter(a => a.lat != null), noGeo = vis.length - geo.length;
  const nota = () => L.notes.push(`${geo.length} actors amb coordenades; ${noGeo} sense coordenades (no es pinten: no vol dir que no existeixin).`);
  if (['actors','tercer','educatiu','diversitat'].includes(v)) {
    const es = v === 'actors' ? Object.keys(ESF) : [...new Set(vis.map(a => a.esfera))];
    L.items = es.map(e => ({c:ESF[e], t:e}));
    if (v === 'educatiu') L.items.push({c:'#b03a2e', t:"Estat «a validar» (p. ex. test BULL-S, sense ubicació)"});
    if (v === 'diversitat') { L.items.unshift({c:'#7b5a2e', t:'Comunitats religioses'}); L.notes.push("Buit confirmat per la Memòria 2025 de la Comissió Comunitària (document intern): cap activitat conjunta de l'EAP amb comunitats religioses ni amb associacions d'origen."); }
    if (v === 'tercer' && !es3D(v)) L.items.push({c:'#555', t:'Relació documentada (línia)', linia:true},{c:'#2b6cd6', t:'Relació hipòtesi (discontínua)', linia:true, dash:true});
    L.font = FONT_ACT; L.any = DATA_ACT; L.metode = "Mètode Alberich (esferes i nivells). Geolocalització per adreça pública (Nominatim/OSM); la precisió consta a cada fitxa."; nota();
  } else if (v === 'salut') {
    L.items = Object.keys(SALUT_COL).map(k => ({c:SALUT_COL[k], t:k}));
    L.font = FONT_ACT; L.any = DATA_ACT; L.metode = "Selecció: esfera Salut o àmbit amb «salut». Les 14 farmàcies comunitàries consten com a actor agregat, no ubicades una per una."; nota();
  } else if (v === 'ist') {
    L.etiq = [['mesura','Mesura'],['context','context de la secció, no de l\'actor']];
    L.rampa = IST_BR.map(b => ({c:b[2], t:b[3]})); L.items = [{c:'url', t:'Sense dada (no es pinta com a zero)', ratllat:true}];
    L.font = "Idescat, Índex socioeconòmic territorial (IST) per secció censal; límits: INE, Seccionat censal 1/1/2023"; L.any = "IST 2023 (2024 provisional a la fitxa)";
    L.metode = "Catalunya = 100. Valors baixos = més vulnerabilitat. 15 seccions de Salt; el terme municipal és la unió de les seccions INE.";
  } else if (v === 'zones') {
    L.etiq = [['hipotesi','Hipòtesi · no oficial']];
    L.items = [{c:'#3f6fb5', t:'Proximitat a CAP Salt 1 (hipòtesi)'},{c:'#d17a22', t:'Proximitat a CAP Salt 2 (hipòtesi)'},{c:'#999', t:'Servei sense ubicació o supramunicipal'}];
    L.font = "Coordenades dels CAP (OpenStreetMap); terme municipal: unió de seccions INE 2023"; L.any = "2026";
    L.metode = "Mediatriu entre els dos CAP retallada pel terme. NO és l'assignació oficial, i no és un descuit: Salt és una sola àrea bàsica de salut (ABS 199) amb un sol equip de l'ICS, i el cercador del CatSalut «Quin CAP correspon a una adreça?» retorna tots dos CAP per a qualsevol adreça de Salt (58 adreces provades el 07/10/2026). El repartiment de carrers entre Salt 1 i Salt 2 es decideix dins de l'EAP i no és públic (consultats també ICS Girona, Ajuntament, premsa i BOE/DOGC). Nord-oest (seccions 01-003, 01-005, 01-006): probablement atès pel CAP Salt 1 (segons l'equip, pendent de confirmar l'assignació per carrers)."; nota();
  } else if (v === 'distancia') {
    L.etiq = [['mesura','Mesura'],['context','distància en línia recta, no temps a peu']];
    L.items = Object.keys(DIST_COL).map(k => ({c:DIST_COL[k], t:k + ' del CAP més proper'})); L.items.push({c:'#555', t:'Anells de 500 m i 1.000 m', linia:true, dash:true});
    L.font = FONT_ACT + "; coordenades dels CAP (OSM)"; L.any = DATA_ACT; L.metode = "Distància haversine en línia recta fins al CAP més proper. No té en compte carrers, desnivells ni barreres."; nota();
  } else if (v === 'xarxa') {
    L.items = [{forma:'triangle', t:'Triangle · poder / institució'},{forma:'rect', t:'Rectangle · servei / tècnic / entitat'},{forma:'cercle', t:'Cercle · població no organitzada'},
      {c:'#333', t:'Forta', linia:true, w:3},{c:'#888', t:'Feble', linia:true, w:1},{c:'#c0392b', t:'Conflicte', linia:true, w:2.5},{c:'#666', t:'Indirecta', linia:true, dot:true},
      {c:'#2b6cd6', t:'Hipòtesi a validar (blau, discontínua)', linia:true, dash:true}];
    L.font = "relacions.csv i actors.csv del sociograma (fonts citades a cada relació)"; L.any = DATA_ACT;
    L.metode = "Mètode Alberich: franges NIVELL POLÍTIC / TÈCNIC / SOCIAL; color per esfera. Les relacions estructurals (pertinença, seu, agregador) s'amaguen per defecte.";
    L.etiq = [['mesura','Mesura (documentades)'],['hipotesi','Hipòtesi (blaves)']];
  }
  if (V[v].tipus === 'mapa' && es3D(v) && v !== 'ist') {
    L.items.push({c:'#555', t:`Alçada = nombre de relacions documentades (${H_BASE} m de base + ${H_REL} m per relació; la base sola = cap relació documentada, no vol dir que no n'hi hagi)`, alt:true},
      {c:'#2b6cd6', t:'Actor no verificat: columna semitransparent amb vora blava discontínua', hipcol:true},
      {c:'#c0392b', t:'CAP Salt 1 i CAP Salt 2: fites'});
    if (!MOBIL) L.items.push({c:'#f0b43c', t:'Edifici que allotja algun actor (només ubicacions a portal o POI)'});
    if (v === 'tercer' || (v === 'actors' && estat.arcs)) L.items.push({c:'#333', t:'Arc de relació forta', linia:true, w:3},{c:'#888', t:'Arc de relació feble', linia:true, w:1},{c:'#c0392b', t:'Conflicte', linia:true, w:2.5},{c:'#2b6cd6', t:'Hipòtesi a validar (blau, discontínua)', linia:true, dash:true});
    L.notes.push(EDIF_NOTA);
    L.metode += " Vista 3D: columnes per actor (mesura); arcs dibuixats amb deck.gl. Actors amb la mateixa adreça es separen en un anell de 20-40 m.";
  }
  if (v === 'actors' && estat.arcs && !es3D(v)) L.items.push({c:'#333', t:'Relació forta', linia:true, w:3},{c:'#888', t:'Relació feble', linia:true, w:1},{c:'#c0392b', t:'Conflicte', linia:true, w:2.5},{c:'#2b6cd6', t:'Hipòtesi a validar (blau, discontínua)', linia:true, dash:true});
  if (v === 'ist' && es3D(v)) { L.items.unshift({c:'#777', t:"Alçada = vulnerabilitat (IST invers): com més alta, més vulnerable", alt:true}); L.metode += ` Alçada = ${H_IST} m × (110 − IST); les etiquetes se situen al punt interior (polylabel) i, en 3D, damunt de cada prisma; les seccions sense dada no s'aixequen ni es pinten com a zero.`; }
  if (V[v].tipus === 'mapa' && (estat.base === 'orto' || estat.relleu)) L.font += (estat.base === 'orto' ? ' · Ortofoto: ICGC' : '') + (estat.relleu ? ' · Ombrejat: ICGC' : '');
  return L;
}
function pintaLlegenda(v){
  const el = $('#llegenda'); if (V[v].tipus === 'panell') { el.hidden = true; return; }
  const L = llegendaSpec(v); el.hidden = false; el.classList.toggle('hipotesi', !!V[v].hip);
  const sw = it => it.forma ? `<svg width="14" height="14" aria-hidden="true">${it.forma==='triangle'?'<polygon points="7,1 13,13 1,13" fill="#ddd" stroke="#333"/>':it.forma==='rect'?'<rect x="1" y="3" width="12" height="9" fill="#ddd" stroke="#333"/>':'<circle cx="7" cy="7" r="6" fill="#ddd" stroke="#333"/>'}</svg>`
    : it.alt ? `<svg width="14" height="16" aria-hidden="true"><rect x="3" y="6" width="8" height="9" fill="#bbb"/><rect x="3" y="1" width="8" height="5" fill="#777"/></svg>`
    : it.hipcol ? `<svg width="14" height="14" aria-hidden="true"><rect x="2" y="2" width="10" height="10" fill="rgba(120,120,120,.35)" stroke="#2b6cd6" stroke-dasharray="2,1.5"/></svg>`
    : it.linia ? `<svg width="22" height="10" aria-hidden="true"><line x1="0" y1="5" x2="22" y2="5" stroke="${it.c}" stroke-width="${it.w||2}" ${it.dash?'stroke-dasharray="5,3"':''}${it.dot?'stroke-dasharray="1,3"':''}/></svg>`
    : it.ratllat ? `<span class="sw" style="background:repeating-linear-gradient(45deg,#eee 0 3px,#bbb 3px 5px)"></span>` : `<span class="sw" style="background:${it.c}"></span>`;
  el.innerHTML = `<h2>${esc(L.titol)}</h2><div>${L.etiq.map(e => `<span class="etq ${e[0]}">${esc(e[1])}</span>`).join(' ')}</div>`
   + (L.rampa ? `<div class="rampa" style="background:linear-gradient(90deg,${L.rampa.map(r=>r.c).join(',')})"></div><div class="rampa-et">${L.rampa.map(r=>`<span>${esc(r.t)}</span>`).join('')}</div>` : '')
   + `<ul>${L.items.map(it => `<li>${sw(it)}<span>${esc(it.t)}</span></li>`).join('')}</ul>`
   + L.notes.map(n => `<p class="met">${esc(n)}</p>`).join('')
   + `<p class="met"><b>Font:</b> ${esc(L.font)}<br><b>Any:</b> ${esc(L.any)}<br><b>Mètode:</b> ${esc(L.metode)}</p>`;
}

/* ---------- dades per vista ---------- */
function actorsVista(v){
  const vv = V[v]; if (!vv || !vv.sel) return [];
  let s = A.filter(vv.sel);
  if (vv.filtreEsfera) s = s.filter(a => estat.esf.has(a.esfera));
  return s;
}
function fcActors(v){
  const vv = V[v];
  return {type:'FeatureCollection', features: actorsVista(v).filter(a => a.lat != null).map(a => ({type:'Feature', id: A.indexOf(a),
    properties:{id:a.id, nom:a.nom, c: vv.col(a), dash: a.estat_verificacio !== 'verificat' ? 1 : 0}, geometry:{type:'Point', coordinates:[a.lon, a.lat]}}))};
}
function cercle(lon, lat, r){ const pts = []; for (let i = 0; i <= 64; i++){ const t = i/64*2*Math.PI; pts.push([lon + r*Math.cos(t)/(111320*Math.cos(lat*Math.PI/180)), lat + r*Math.sin(t)/110540]); } return pts; }
function liniesTercer(){
  const ids = new Set(actorsVista('tercer').map(a => a.id)), f = [];
  R.forEach(r => { const o = byId[r.origen], d = byId[r.desti]; if (!o || !d || o.lat == null || d.lat == null) return;
    if (!(ids.has(r.origen) || ids.has(r.desti)) || r.classe !== 'funcional' || r.tipus_relacio === 'sense relació') return;
    f.push({type:'Feature', properties:{hip: r.estat === HIP ? 1 : 0}, geometry:{type:'LineString', coordinates:[[o.lon,o.lat],[d.lon,d.lat]]}}); });
  return {type:'FeatureCollection', features:f};
}

/* ---------- 3D: columnes, arcs, edificis ---------- */
const VISTES_3D = ['actors','salut','tercer','educatiu','diversitat','ist'];   // zones i distància es mantenen en 2D
const es3D = v => estat.d3 && VISTES_3D.includes(v);
const funcDoc = r => r.classe === 'funcional' && r.estat !== HIP && r.tipus_relacio !== 'sense relació';
const GRAU = {}; R.forEach(r => { if (funcDoc(r)) { GRAU[r.origen] = (GRAU[r.origen]||0) + 1; GRAU[r.desti] = (GRAU[r.desti]||0) + 1; } });
const H_IST = 4;   // IST 3D: alçada = 4 m × (110 − IST)
const H_BASE = 10, H_REL = 6;   // alçada = 10 m + 6 m per relació documentada
const alcada = a => H_BASE + H_REL * (GRAU[a.id] || 0);
const CAP_IDS = new Set(CAPS.map(c => c.id));
function poligon(lon, lat, r, n){ const k = Math.cos(lat*Math.PI/180), p = []; for (let i = 0; i <= n; i++){ const t = i/n*2*Math.PI; p.push([lon + r*Math.cos(t)/(111320*k), lat + r*Math.sin(t)/110540]); } return [p]; }
function posicions(L){   // separa actors que comparteixen adreça (p. ex. Hotel d'Entitats) en un anell petit
  const g = {}; L.forEach(a => { const k = a.lon.toFixed(5) + ',' + a.lat.toFixed(5); (g[k] = g[k] || []).push(a); });
  const pos = {}; Object.values(g).forEach(gr => gr.forEach((a,i) => { if (gr.length === 1) { pos[a.id] = [a.lon, a.lat]; return; }
    const r = 16 + 3*gr.length, t = i/gr.length*2*Math.PI, k = Math.cos(a.lat*Math.PI/180); pos[a.id] = [a.lon + r*Math.cos(t)/(111320*k), a.lat + r*Math.sin(t)/110540]; }));
  return pos;
}
let POS = {};
function fcColumnes(v){
  const vv = V[v], L = actorsVista(v).filter(a => a.lat != null && !CAP_IDS.has(a.id)); POS = posicions(A.filter(a => a.lat != null));
  return {type:'FeatureCollection', features: L.map(a => ({type:'Feature', id:A.indexOf(a), properties:{id:a.id, c:vv.col(a), h:alcada(a), hip:a.estat_verificacio !== 'verificat' ? 1 : 0},
    geometry:{type:'Polygon', coordinates:poligon(POS[a.id][0], POS[a.id][1], 11, MOBIL ? 10 : 18)}}))};
}
function fcCaps(){ const hmax = Math.max(...A.filter(a => !CAP_IDS.has(a.id)).map(alcada)) + 30;
  return {type:'FeatureCollection', features: CAPS.map(c => ({type:'Feature', properties:{id:c.id, nom:c.nom, h:hmax, g:GRAU[c.id]||0}, geometry:{type:'Polygon', coordinates:poligon(c.lon, c.lat, 18, MOBIL ? 12 : 28)}}))}; }
function arcCami(o, d, pla){
  const n = MOBIL ? 12 : 28, k = Math.cos(o[1]*Math.PI/180), dx = (d[0]-o[0])*111320*k, dy = (d[1]-o[1])*110540, dist = Math.hypot(dx, dy);
  const hmax = pla ? 0 : Math.max(40, dist * 0.35), p = [];
  for (let i = 0; i <= n; i++){ const t = i/n; p.push([o[0] + (d[0]-o[0])*t, o[1] + (d[1]-o[1])*t, hmax * 4*t*(1-t) + (pla ? 0 : 6)]); }
  return p;
}
function relacionsArcs(){
  const v = estat.v; let L = [];
  const ok = r => { const o = byId[r.origen], d = byId[r.desti]; return o && d && o.lat != null && d.lat != null && r.classe === 'funcional' && r.tipus_relacio !== 'sense relació'; };
  if (v === 'tercer' && es3D(v)) { const ids = new Set(actorsVista('tercer').map(a => a.id)); L = R.filter(r => ok(r) && (ids.has(r.origen) || ids.has(r.desti))); }
  else if (v === 'actors' && estat.arcs) { L = R.filter(r => ok(r) && estat.esf.has(byId[r.origen].esfera) && estat.esf.has(byId[r.desti].esfera)); }
  if (estat.fitxa && V[v].tipus === 'mapa' && es3D(v)) { const f = estat.fitxa; L = L.concat(R.filter(r => ok(r) && (r.origen === f || r.desti === f) && !L.includes(r))); }
  return L;
}
const COL_REL = r => r.tipus_relacio === 'conflicte' ? [192,57,43,235] : r.estat === HIP ? [43,108,214,190] : r.tipus_relacio === 'forta' ? [40,40,40,215] : r.tipus_relacio === 'indirecta' ? [102,102,102,190] : [120,120,120,180];
let overlay = null, ARCS = [];
function pintaArcs(){
  if (!overlay) return;
  const pla = !es3D(estat.v), pos = id => POS[id] || [byId[id].lon, byId[id].lat];
  const data = relacionsArcs().map(r => ({r, path:arcCami(pos(r.origen), pos(r.desti), pla), sel: estat.fitxa && (r.origen === estat.fitxa || r.desti === estat.fitxa)}));
  ARCS = data;
  overlay.setProps({layers:[new deck.PathLayer({id:'arcs-relacions', data, getPath:d => d.path, getColor:d => COL_REL(d.r),
    getWidth:d => (d.r.tipus_relacio === 'forta' ? 2.6 : d.r.tipus_relacio === 'conflicte' ? 3 : 1.4) + (d.sel ? 1.2 : 0), widthUnits:'pixels', widthMinPixels:1,
    getDashArray:d => d.r.estat === HIP ? [5,3] : d.r.tipus_relacio === 'indirecta' ? [1,2] : [0,0], dashJustified:true, capRounded:true, billboard:true,
    extensions:[new deck.PathStyleExtension({dash:true})], pickable:true,
    onHover:info => { const tt = $('#tooltip'); if (!info.object) { tt.hidden = true; return; } const r = info.object.r; tt.hidden = false;
      tt.innerHTML = `${esc(r.origen_nom)} — ${esc(r.desti_nom)}<br>${esc(r.tipus_relacio)} · ${r.estat === HIP ? '<b style="color:#9ec5ff">hipòtesi</b>' : 'documentada'}`; tt.style.left = (info.x + 330) + 'px'; tt.style.top = (info.y + 60) + 'px'; },
    updateTriggers:{getWidth:estat.fitxa}})].concat(estat.v === 'ist' && es3D('ist') ? [new deck.TextLayer({id:'ist-etiquetes',
      data:D.seccions.features.map(f => f.properties), getPosition:p => [p.lx, p.ly, (p.ist_2023 == null ? 0 : H_IST * Math.max(8, 110 - p.ist_2023)) + 12],
      getText:p => p.codi + '\n' + (p.ist_2023 == null ? 's/d' : String(p.ist_2023)), getSize:12, getColor:[25,25,25,255], fontWeight:600, fontFamily:'system-ui, Noto Sans, sans-serif',
      outlineWidth:3, outlineColor:[255,255,255,230], fontSettings:{sdf:true}, characterSet:'0123456789-./sd\n', billboard:true, getTextAnchor:'middle', getAlignmentBaseline:'center'})] : [])});
}
/* edificis que allotgen actors: punt dins polígon sobre la capa building de les tessel·les */
function dinsPol(pt, anell){ let c = false; for (let i = 0, j = anell.length - 1; i < anell.length; j = i++){ const [xi,yi] = anell[i], [xj,yj] = anell[j];
  if ((yi > pt[1]) !== (yj > pt[1]) && pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi) c = !c; } return c; }
function marcaEdificis(){
  if (!mapLlest || !map.getLayer('edificis-3d') || MOBIL) return;
  const vis = es3D(estat.v) && estat.v !== 'ist' && map.getZoom() >= 14; if (!vis) { map.getSource('edif-actor').setData({type:'FeatureCollection', features:[]}); return; }
  const pts = actorsVista(estat.v).filter(a => a.lat != null && /portal|edifici|POI/i.test(a.precisio_geo || '')).map(a => [a.lon, a.lat]);
  const fs = map.querySourceFeatures('openmaptiles', {sourceLayer:'building'}), out = [], vist = new Set();
  fs.forEach(f => { const g = f.geometry, polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    polys.forEach(pc => { const k = pc[0][0].join(','); if (vist.has(k)) return; if (pts.some(p => dinsPol(p, pc[0]))) { vist.add(k); out.push({type:'Feature', properties:{h:f.properties.render_height || 5, b:f.properties.render_min_height || 0}, geometry:{type:'Polygon', coordinates:pc}}); } }); });
  map.getSource('edif-actor').setData({type:'FeatureCollection', features:out}); EDIF_N = out.length;
}
let EDIF_N = 0;
const EDIF_NOTA = "Edificis 3D: alçada render_height de les tessel·les OpenFreeMap (OpenStreetMap: alçada o nombre de plantes). A Salt hi ha alçades variades; quan OSM no en té, l'esquema hi posa una alçada per defecte discreta (≈5 m), que no és una mesura.";
/* càmeres per vista (vols) */
const CAM = {
  actors:{center:[2.7915,41.9738], zoom:15.0, pitch:58, bearing:-22}, salut:{center:[2.7905,41.9725], zoom:15.1, pitch:56, bearing:18},
  tercer:{center:[2.7925,41.9752], zoom:15.2, pitch:62, bearing:-38}, educatiu:{center:[2.7900,41.9728], zoom:14.9, pitch:52, bearing:32},
  diversitat:{center:[2.7925,41.9748], zoom:15.4, pitch:56, bearing:-8}, ist:{center:[2.7905,41.9738], zoom:14.35, pitch:50, bearing:-20},
  zones:{center:[2.789,41.974], zoom:13.6, pitch:0, bearing:0}, distancia:{center:[2.789,41.974], zoom:13.9, pitch:0, bearing:0}};
function vola(v){
  if (!mapLlest) return; const c = Object.assign({padding:{top:0, bottom:0, left:0, right:MOBIL ? 0 : 230}}, CAM[v] || CAM.zones);
  if (!es3D(v)) { c.pitch = 0; c.bearing = 0; } else if (MOBIL) { c.pitch = Math.min(c.pitch, 40); c.zoom -= 0.4; }
  MOVIMENT ? map.flyTo(Object.assign(c, {duration:2400, curve:1.3, essential:false})) : map.jumpTo(c);
}

/* ---------- mapa ---------- */
function iniciaMapa(){
  map = new maplibregl.Map({container:'mapa', style:'https://tiles.openfreemap.org/styles/positron', center:[2.789,41.974], zoom:13.6,
    preserveDrawingBuffer:true, attributionControl:false, hash:false});
  map.addControl(new maplibregl.AttributionControl({compact:false, customAttribution:'© col·laboradors d\'<a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>, OpenMapTiles i <a href="https://openfreemap.org">OpenFreeMap</a> · Límits: INE · IST: Idescat'}));
  map.addControl(new maplibregl.NavigationControl({showCompass:false}), 'top-right');
  map.addControl(new maplibregl.ScaleControl({unit:'metric'}), 'bottom-left');
  map.on('load', () => {
    const secc = JSON.parse(JSON.stringify(D.seccions)); secc.features.forEach(f => { f.properties.c = istCol(f.properties.ist_2023) || '#000'; f.properties.nd = f.properties.ist_2023 == null ? 1 : 0; });
    map.addSource('seccions', {type:'geojson', data:secc});
    map.addSource('secc-pts', {type:'geojson', data:{type:'FeatureCollection', features:secc.features.map(f => ({type:'Feature', properties:f.properties, geometry:{type:'Point', coordinates:[f.properties.lx, f.properties.ly]}}))}});
    map.addSource('terme', {type:'geojson', data:D.terme});
    map.addSource('zones', {type:'geojson', data:D.zones});
    map.addSource('actors', {type:'geojson', data:{type:'FeatureCollection', features:[]}});
    map.addSource('linies', {type:'geojson', data:{type:'FeatureCollection', features:[]}});
    map.addSource('anells', {type:'geojson', data:{type:'FeatureCollection', features: CAPS.flatMap(c => [500,1000].map(r => ({type:'Feature', properties:{r}, geometry:{type:'LineString', coordinates:cercle(c.lon,c.lat,r)}})))}});
    map.addSource('caps', {type:'geojson', data:{type:'FeatureCollection', features: CAPS.map(c => ({type:'Feature', properties:{id:c.id, nom:c.nom}, geometry:{type:'Point', coordinates:[c.lon,c.lat]}}))}});
    map.addLayer({id:'secc-fill', type:'fill', source:'seccions', filter:['==',['get','nd'],0], paint:{'fill-color':['get','c'], 'fill-opacity':0.75}});
    map.addLayer({id:'secc-nd', type:'fill', source:'seccions', filter:['==',['get','nd'],1], paint:{'fill-color':'#ccc', 'fill-opacity':0.5}});
    map.addLayer({id:'secc-line', type:'line', source:'seccions', paint:{'line-color':'#555', 'line-width':0.8}});
    map.addLayer({id:'secc-lab', type:'symbol', source:'secc-pts', layout:{'text-allow-overlap':true, 'text-field':['concat',['get','codi'],'\n',['to-string',['coalesce',['get','ist_2023'],'s/d']]], 'text-size':11, 'text-font':['Noto Sans Regular']}, paint:{'text-color':'#222','text-halo-color':'#fff','text-halo-width':1.2}});
    map.addLayer({id:'zones-fill', type:'fill', source:'zones', paint:{'fill-color':['case',['in','Salt 1',['get','zona']],'#3f6fb5','#d17a22'], 'fill-opacity':0.16}});
    map.addLayer({id:'zones-line', type:'line', source:'zones', paint:{'line-color':'#2b6cd6', 'line-width':1.6, 'line-dasharray':[3,2]}});
    map.addLayer({id:'terme', type:'line', source:'terme', paint:{'line-color':'#222', 'line-width':1.6}});
    map.addLayer({id:'anells', type:'line', source:'anells', paint:{'line-color':'#555', 'line-width':1.1, 'line-dasharray':[2,2]}});
    map.addLayer({id:'linies', type:'line', source:'linies', paint:{'line-color':['case',['==',['get','hip'],1],'#2b6cd6','#555'], 'line-width':['case',['==',['get','hip'],1],1,1.3], 'line-opacity':0.55, 'line-dasharray':[1,0]}});
    map.addLayer({id:'linies-hip', type:'line', source:'linies', filter:['==',['get','hip'],1], paint:{'line-color':'#2b6cd6','line-width':1.1,'line-dasharray':[3,2],'line-opacity':0.7}});
    map.setFilter('linies', ['==',['get','hip'],0]);
    map.addLayer({id:'actors', type:'circle', source:'actors', paint:{'circle-radius':['interpolate',['linear'],['zoom'],12,4,16,8], 'circle-color':['get','c'], 'circle-stroke-color':['case',['boolean',['feature-state','sel'],false],'#000','#fff'], 'circle-stroke-width':['case',['boolean',['feature-state','sel'],false],3,1.2]}});
    map.addLayer({id:'caps', type:'circle', source:'caps', paint:{'circle-radius':8, 'circle-color':'#fff', 'circle-stroke-color':'#c0392b', 'circle-stroke-width':3}});
    map.addLayer({id:'caps-lab', type:'symbol', source:'caps', layout:{'text-field':['get','nom'], 'text-size':12, 'text-offset':[0,1.3], 'text-anchor':'top', 'text-font':['Noto Sans Bold']}, paint:{'text-color':'#c0392b','text-halo-color':'#fff','text-halo-width':1.5}});
    // --- capes 3D
    const primera = map.getStyle().layers.find(l => l.type === 'symbol' && l.source === 'openmaptiles');
    map.addSource('orto', {type:'raster', tiles:['https://geoserveis.icgc.cat/icc_mapesmultibase/noutm/wmts/orto/GRID3857/{z}/{x}/{y}.jpeg'], tileSize:256, maxzoom:19, attribution:'Ortofoto © <a href="https://www.icgc.cat">ICGC</a>'});
    map.addSource('relleu', {type:'raster', tiles:['https://geoserveis.icgc.cat/icgc_ombres_muntanya/noutm/wmts/ombres_tclar/GRID3857/{z}/{x}/{y}.jpeg'], tileSize:256, maxzoom:14, attribution:'Ombrejat © <a href="https://www.icgc.cat">ICGC</a>'});
    map.addLayer({id:'orto', type:'raster', source:'orto', layout:{visibility:'none'}, paint:{'raster-opacity':0.95}}, primera && primera.id);
    map.addLayer({id:'relleu', type:'raster', source:'relleu', layout:{visibility:'none'}, paint:{'raster-opacity':0.35}}, primera && primera.id);
    map.getStyle().layers.filter(l => l['source-layer'] === 'building' && l.type !== 'fill-extrusion').forEach(l => EDIF2D.push(l.id));
    map.addLayer({id:'edificis-3d', type:'fill-extrusion', source:'openmaptiles', 'source-layer':'building', minzoom:14.2,
      paint:{'fill-extrusion-color':'#dcd9d2', 'fill-extrusion-height':['coalesce',['get','render_height'],5], 'fill-extrusion-base':['coalesce',['get','render_min_height'],0], 'fill-extrusion-opacity':0.62}}, 'secc-fill');
    map.addSource('edif-actor', {type:'geojson', data:{type:'FeatureCollection', features:[]}});
    map.addLayer({id:'edif-actor', type:'fill-extrusion', source:'edif-actor', paint:{'fill-extrusion-color':'#f0b43c', 'fill-extrusion-height':['+',['get','h'],0.5], 'fill-extrusion-base':['get','b'], 'fill-extrusion-opacity':0.9}});
    map.addSource('secc3d', {type:'geojson', data:secc});
    map.addLayer({id:'secc-3d', type:'fill-extrusion', source:'secc3d', filter:['==',['get','nd'],0], paint:{'fill-extrusion-color':['get','c'],
      'fill-extrusion-height':['*', H_IST, ['max', 8, ['-', 110, ['get','ist_2023']]]], 'fill-extrusion-opacity':0.86, 'fill-extrusion-vertical-gradient':true}}, 'secc-lab');
    map.addSource('columnes', {type:'geojson', data:{type:'FeatureCollection', features:[]}});
    map.addSource('caps3d', {type:'geojson', data:fcCaps()});
    const colPaint = op => ({'fill-extrusion-color':['case',['boolean',['feature-state','sel'],false],'#111',['get','c']], 'fill-extrusion-height':['get','h'], 'fill-extrusion-base':0, 'fill-extrusion-opacity':op});
    map.addLayer({id:'col-ver', type:'fill-extrusion', source:'columnes', filter:['==',['get','hip'],0], paint:colPaint(0.93)}, 'caps-lab');
    map.addLayer({id:'col-hip', type:'fill-extrusion', source:'columnes', filter:['==',['get','hip'],1], paint:colPaint(0.42)}, 'caps-lab');
    map.addLayer({id:'col-hip-vora', type:'line', source:'columnes', filter:['==',['get','hip'],1], paint:{'line-color':'#2b6cd6', 'line-width':1.4, 'line-dasharray':[2,1.5]}}, 'caps-lab');
    map.addLayer({id:'caps-3d', type:'fill-extrusion', source:'caps3d', paint:{'fill-extrusion-color':'#c0392b', 'fill-extrusion-height':['get','h'], 'fill-extrusion-opacity':0.9}}, 'caps-lab');
    map.setLayoutProperty('caps-lab', 'text-size', 13);
    overlay = new deck.MapboxOverlay({interleaved:true, layers:[]}); map.addControl(overlay);
    map.on('idle', () => { if (es3D(estat.v)) marcaEdificis(); });
    const tt = $('#tooltip');
    const hover = (layer, txt) => { map.on('mousemove', layer, e => { map.getCanvas().style.cursor = 'pointer'; tt.hidden = false; tt.innerHTML = txt(e.features[0].properties); tt.style.left = (e.originalEvent.clientX + 12) + 'px'; tt.style.top = (e.originalEvent.clientY + 12) + 'px'; });
      map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; tt.hidden = true; }); };
    hover('actors', p => { const a = byId[p.id]; return `${verif(a)?'<b style="color:#ff8a80">VERIFICAR</b> · ':''}<b>${esc(a.nom)}</b><br>${esc(a.tipus_alberich)} · ${esc(a.nivell)} · ${esc(a.ambit)}` + (estat.v==='distancia' ? `<br>${fmt(a.dist_cap_m)} m en línia recta fins a ${esc(a.cap_mes_proper)}` : ''); });
    hover('secc-fill', p => `<b>Secció ${esc(p.codi)}</b><br>IST 2023: ${p.ist_2023 ?? 's/d'} (Catalunya = 100)<br><i>context de la secció, no de l'actor</i>`);
    hover('zones-fill', p => `${esc(p.zona)}<br><i>Hipòtesi · no oficial</i>`);
    hover('caps', p => `<b>${esc(p.nom)}</b>`);
    ['col-ver','col-hip'].forEach(l => { hover(l, p => { const a = byId[p.id]; return `${verif(a)?'<b style="color:#ff8a80">VERIFICAR</b> · ':''}<b>${esc(a.nom)}</b><br>${esc(a.tipus_alberich)} · ${esc(a.esfera)}<br>${GRAU[a.id]||0} relacions documentades${a.estat_verificacio!=='verificat'?' · <i>actor '+esc(a.estat_verificacio)+'</i>':''}`; });
      map.on('click', l, e => obreFitxa(e.features[0].properties.id)); });
    hover('caps-3d', p => `<b>${esc(p.nom)}</b><br>${p.g} relacions documentades · fita`); map.on('click', 'caps-3d', e => obreFitxa(e.features[0].properties.id));
    hover('secc-3d', p => `<b>Secció ${esc(p.codi)}</b><br>IST 2023: ${p.ist_2023 ?? 's/d'} (Catalunya = 100)<br><i>context de la secció, no de l'actor</i>`); map.on('click', 'secc-3d', e => fitxaSeccio(e.features[0].properties.CUSEC));
    map.on('click', 'actors', e => obreFitxa(e.features[0].properties.id));
    map.on('click', 'caps', e => obreFitxa(e.features[0].properties.id));
    map.on('click', 'secc-fill', e => fitxaSeccio(e.features[0].properties.CUSEC));
    map.on('moveend', () => { if (V[estat.v].tipus === 'mapa') desaHash(); });
    mapLlest = true; aplicaMapa(); if (map._camPendent) { map.jumpTo(map._camPendent); map._camPendent = null; } else vola(estat.v);
  });
}
const CAPES = {
  ist:['secc-fill','secc-nd','secc-line','secc-lab','terme','caps','caps-lab'],
  zones:['zones-fill','zones-line','terme','actors','caps','caps-lab'],
  distancia:['anells','terme','actors','caps','caps-lab'],
  tercer:['terme','linies','linies-hip','actors','caps'],
  _def:['terme','actors','caps']
};
const TOTES = ['secc-fill','secc-nd','secc-line','secc-lab','zones-fill','zones-line','terme','anells','linies','linies-hip','actors','caps','caps-lab','secc-3d','col-ver','col-hip','col-hip-vora','caps-3d','edificis-3d','edif-actor'];
const EDIF2D = [];
function aplicaMapa(){
  if (!mapLlest || V[estat.v].tipus !== 'mapa') return;
  let vis = (CAPES[estat.v] || CAPES._def).slice();
  if (es3D(estat.v)) {
    if (estat.v === 'ist') vis = vis.filter(l => l !== 'secc-fill' && l !== 'secc-lab').concat(['secc-3d']);
    else { vis = vis.filter(l => !['actors','caps','linies','linies-hip'].includes(l)).concat(['col-ver','col-hip','col-hip-vora','caps-3d','caps-lab']); if (!MOBIL) vis.push('edificis-3d','edif-actor'); }
  }
  TOTES.forEach(l => map.setLayoutProperty(l, 'visibility', vis.includes(l) ? 'visible' : 'none'));
  EDIF2D.forEach(l => map.setLayoutProperty(l, 'visibility', vis.includes('edificis-3d') ? 'none' : 'visible'));
  map.setLayoutProperty('orto', 'visibility', estat.base === 'orto' ? 'visible' : 'none');
  map.setLayoutProperty('relleu', 'visibility', estat.relleu ? 'visible' : 'none');
  map.setPaintProperty('edificis-3d', 'fill-extrusion-color', estat.base === 'orto' ? '#f4f2ec' : '#dcd9d2');
  map.getSource('actors').setData(fcActors(estat.v));
  map.getSource('columnes').setData(fcColumnes(estat.v));
  if (estat.v === 'tercer') map.getSource('linies').setData(liniesTercer());
  marcaSel(); pintaArcs(); marcaEdificis();
}
function marcaSel(){ if (!mapLlest) return; map.removeFeatureState({source:'actors'}); map.removeFeatureState({source:'columnes'}); if (estat.fitxa && byId[estat.fitxa]) { const id = A.indexOf(byId[estat.fitxa]); map.setFeatureState({source:'actors', id}, {sel:true}); map.setFeatureState({source:'columnes', id}, {sel:true}); } pintaArcs(); }

/* ---------- filtres al calaix ---------- */
function pintaFiltres(){
  const v = estat.v, el = $('#filtres'); let h = '';
  if (V[v].filtreEsfera) h += `<fieldset><legend>Esferes</legend>${Object.keys(ESF).map(e => `<label><input type="checkbox" data-esf="${esc(e)}" ${estat.esf.has(e)?'checked':''}><span class="sw" style="background:${ESF[e]}"></span>${esc(e)} <small>(${A.filter(a=>a.esfera===e).length})</small></label>`).join('')}</fieldset>`;
  if (v === 'xarxa') {
    h += `<fieldset><legend>Filtres de la xarxa</legend><label for="f-esf">Esfera</label><select id="f-esf"><option value="">Totes</option>${Object.keys(ESF).map(e=>`<option ${estat.xEsf===e?'selected':''}>${esc(e)}</option>`).join('')}</select>
      <label for="f-niv">Nivell</label><select id="f-niv"><option value="">Tots</option>${['polític','tècnic','social'].map(n=>`<option ${estat.xNiv===n?'selected':''}>${n}</option>`).join('')}</select>
      <label><input type="checkbox" id="f-hip" ${estat.xHip?'checked':''}> Mostra relacions hipòtesi</label>
      <label><input type="checkbox" id="f-est" ${estat.xEst?'checked':''}> Mostra relacions estructurals</label></fieldset>`;
  }
  if (V[v].tipus === 'mapa') {
    h += `<fieldset><legend>Mapa</legend>
      <label><input type="radio" name="base" value="positron" ${estat.base==='positron'?'checked':''}> Mapa base (OpenFreeMap)</label>
      <label><input type="radio" name="base" value="orto" ${estat.base==='orto'?'checked':''}> Ortofoto de l'ICGC</label>
      <label><input type="checkbox" id="f-relleu" ${estat.relleu?'checked':''}> Ombrejat del relleu (ICGC)</label>
      ${v === 'actors' ? `<label><input type="checkbox" id="f-arcs" ${estat.arcs?'checked':''}> Arcs de relacions (opcional)</label>` : ''}
      ${VISTES_3D.includes(v) ? '' : '<small>Aquesta vista es manté en 2D: el 3D no hi aporta lectura.</small>'}</fieldset>`;
  }
  if (V[v].tipus === 'mapa' && V[v].sel && v !== 'ist') {
    const ng = actorsVista(v).filter(a => a.lat == null);
    if (ng.length) h += `<fieldset><legend>Sense coordenades (${ng.length})</legend><ul style="padding-left:16px;margin:0">${ng.map(a => `<li><a href="#" data-obre="${a.id}">${esc(a.nom)}</a>${a.estat_verificacio!=='verificat'?` <span class="etq hipotesi">${esc(a.estat_verificacio)}</span>`:''}</li>`).join('')}</ul></fieldset>`;
  }
  el.innerHTML = h;
  el.querySelectorAll('[data-esf]').forEach(c => c.onchange = () => { c.checked ? estat.esf.add(c.dataset.esf) : estat.esf.delete(c.dataset.esf); aplicaMapa(); pintaLlegenda(v); desaHash(); });
  el.querySelectorAll('[data-obre]').forEach(a => a.onclick = e => { e.preventDefault(); obreFitxa(a.dataset.obre); });
  el.querySelectorAll('input[name="base"]').forEach(c => c.onchange = () => { estat.base = c.value; aplicaMapa(); desaHash(); });
  if (el.querySelector('#f-relleu')) el.querySelector('#f-relleu').onchange = e => { estat.relleu = e.target.checked; aplicaMapa(); desaHash(); };
  if (el.querySelector('#f-arcs')) el.querySelector('#f-arcs').onchange = e => { estat.arcs = e.target.checked; pintaArcs(); pintaLlegenda(v); desaHash(); };
  const g = id => el.querySelector(id);
  if (g('#f-esf')) { g('#f-esf').onchange = e => { estat.xEsf = e.target.value; filtraXarxa(); desaHash(); };
    g('#f-niv').onchange = e => { estat.xNiv = e.target.value; filtraXarxa(); desaHash(); };
    g('#f-hip').onchange = e => { estat.xHip = e.target.checked; filtraXarxa(); };
    g('#f-est').onchange = e => { estat.xEst = e.target.checked; filtraXarxa(); }; }
}

/* ---------- xarxa (Cytoscape) ---------- */
const BANDA = {'polític':[0,420], 'tècnic':[480,1560], 'social':[1620,2900]};
function iniciaXarxa(){
  const W = 2000, els = [];
  Object.entries(BANDA).forEach(([n,[y0,y1]]) => els.push({group:'nodes', data:{id:'banda-'+n, lab:'NIVELL ' + n.toUpperCase(), w:W+300, h:y1-y0}, position:{x:W/2, y:(y0+y1)/2}, classes:'banda', selectable:false, grabbable:false}));
  const ordre = Object.keys(ESF);
  Object.entries(BANDA).forEach(([n,[y0,y1]]) => {
    const ns = A.filter(a => a.nivell === n).sort((a,b) => ordre.indexOf(a.esfera) - ordre.indexOf(b.esfera) || a.id.localeCompare(b.id));
    const cols = Math.max(1, Math.ceil(Math.sqrt(ns.length * W / (y1-y0) ))), files = Math.ceil(ns.length / cols);
    ns.forEach((a,i) => { const c = i % cols, f = Math.floor(i / cols);
      els.push({group:'nodes', data:{id:a.id, lab:a.nom.length > 34 ? a.nom.slice(0,32) + '…' : a.nom, col:ESF_SOC[a.esfera], forma:a.tipus_alberich==='triangle'?'triangle':a.tipus_alberich==='cercle'?'ellipse':'round-rectangle', esf:a.esfera, niv:a.nivell},
        position:{x: 60 + c * (W-120)/Math.max(1,cols-1), y: y0 + 60 + (f + 0.5) * (y1-y0-90)/files}}); }); });
  R.forEach((r,i) => { if (!byId[r.origen] || !byId[r.desti]) return;
    els.push({group:'edges', data:{id:'r'+i, source:r.origen, target:r.desti, tipus:r.tipus_relacio, i}, classes:[({'forta':'forta','feble':'feble','conflicte':'conflicte','indirecta':'indirecta'}[r.tipus_relacio]||'sense'), r.estat===HIP?'hip':'doc', r.classe==='funcional'?'func':'estr'].join(' ')}); });
  cy = cytoscape({container:$('#xarxa'), elements:els, layout:{name:'preset'}, minZoom:0.08, maxZoom:3,
    style:[
      {selector:'node', style:{'z-index-compare':'manual','z-index':10,'shape':'data(forma)', 'background-color':'data(col)', 'border-width':1, 'border-color':'#555', 'width':34, 'height':26, 'label':'data(lab)', 'font-size':11, 'text-valign':'bottom', 'text-margin-y':3, 'text-wrap':'wrap', 'text-max-width':120, 'color':'#222', 'text-background-color':'#fff', 'text-background-opacity':0.6, 'min-zoomed-font-size':7}},
      {selector:'node[forma="triangle"]', style:{'width':38,'height':34}},
      {selector:'node[forma="ellipse"]', style:{'width':30,'height':30}},
      {selector:'node.banda', style:{'width':'data(w)','height':'data(h)','shape':'rectangle', 'background-color':'#f3f3f1', 'background-opacity':1, 'border-width':0, 'label':'data(lab)', 'text-valign':'top', 'text-halign':'center', 'font-size':34, 'font-weight':'bold', 'color':'#77776f', 'text-margin-y':44, 'events':'no', 'z-index':0, 'text-background-opacity':0}},
      {selector:'node.banda[id="banda-tècnic"]', style:{'background-color':'#fafaf8'}},
      {selector:'edge', style:{'z-index-compare':'manual','z-index':5,'curve-style':'straight', 'width':1, 'line-color':'#888', 'opacity':0.55}},
      {selector:'edge.forta', style:{'width':2.6, 'line-color':'#333'}},
      {selector:'edge.feble', style:{'width':1, 'line-color':'#888'}},
      {selector:'edge.conflicte', style:{'width':3, 'line-color':'#c0392b', 'opacity':0.95, 'target-arrow-shape':'tee', 'source-arrow-shape':'tee', 'target-arrow-color':'#c0392b', 'source-arrow-color':'#c0392b'}},
      {selector:'edge.indirecta', style:{'line-style':'dotted', 'line-color':'#666'}},
      {selector:'edge.estr', style:{'line-color':'#c8c8c8', 'opacity':0.4}},
      {selector:'edge.hip', style:{'line-color':'#2b6cd6', 'line-style':'dashed', 'line-dash-pattern':[8,5], 'opacity':0.75}},
      {selector:'edge.sense', style:{'width':1, 'opacity':0.45}},
      {selector:'.apagat', style:{'opacity':0.08}},
      {selector:'edge.ressalt', style:{'opacity':1, 'z-index':9}},
      {selector:'node.ressalt', style:{'border-width':3, 'border-color':'#000', 'z-index':10}},
      {selector:'.amagat', style:{'display':'none'}}
    ]});
  const tt = $('#tooltip');
  cy.on('mouseover', 'node', e => { if (e.target.hasClass('banda')) return; const a = byId[e.target.id()]; const rp = e.renderedPosition, bb = $('#xarxa').getBoundingClientRect();
    tt.hidden = false; tt.innerHTML = `${verif(a)?'<b style="color:#ff8a80">VERIFICAR</b> · ':''}<b>${esc(a.nom)}</b><br>${esc(a.tipus_alberich)} · ${esc(a.nivell)} · ${esc(a.esfera)}<br>${a.grau} relacions`; tt.style.left = (bb.left + rp.x + 14) + 'px'; tt.style.top = (bb.top + rp.y + 14) + 'px'; });
  cy.on('mouseover', 'edge', e => { const r = R[e.target.data('i')], rp = e.renderedPosition, bb = $('#xarxa').getBoundingClientRect();
    tt.hidden = false; tt.innerHTML = `${esc(r.origen_nom)} — ${esc(r.desti_nom)}<br>${esc(r.tipus_relacio)} · ${esc(r.estat)}`; tt.style.left = (bb.left + rp.x + 14) + 'px'; tt.style.top = (bb.top + rp.y + 14) + 'px'; });
  cy.on('mouseout', () => tt.hidden = true);
  cy.on('tap', 'node', e => { if (!e.target.hasClass('banda')) obreFitxa(e.target.id()); });
  cy.on('tap', e => { if (e.target === cy) { treuRessalt(); tancaFitxa(); } });
  cy.on('viewport', () => { clearTimeout(cy._t); cy._t = setTimeout(desaHash, 300); });
  filtraXarxa();
}
function encaixaXarxa(){
  const el = $('#xarxa'), w = el.clientWidth, hh = el.clientHeight, an = $('#analisi'), esq = (!an.hidden && !an.classList.contains('plegat') && w > 760) ? an.offsetWidth + 24 : 10;
  const dreta = (!$('#fitxa').hidden && w > 760) ? 0 : 0, bb = cy.nodes('.banda').boundingBox();
  const z = Math.min((w - esq - 12 - dreta) / bb.w, (hh - 20) / bb.h); cy.viewport({zoom:z, pan:{x: esq - bb.x1 * z, y: 10 - bb.y1 * z}});
}
function filtraXarxa(){
  if (!cy) return;
  cy.batch(() => {
    cy.nodes().not('.banda').forEach(n => n.toggleClass('amagat', (estat.xEsf && n.data('esf') !== estat.xEsf) || (estat.xNiv && n.data('niv') !== estat.xNiv)));
    cy.edges().forEach(e => e.toggleClass('amagat', e.source().hasClass('amagat') || e.target().hasClass('amagat') || (!estat.xHip && e.hasClass('hip')) || (!estat.xEst && e.hasClass('estr'))));
  });
  if (estat.fitxa) ressalta(estat.fitxa);
}
function ressalta(id){
  if (!cy) return; const n = cy.getElementById(id); if (!n.length) return;
  cy.batch(() => { cy.elements().not('.banda').addClass('apagat').removeClass('ressalt');
    const h = n.closedNeighborhood().filter(x => !x.hasClass('amagat')); h.removeClass('apagat').addClass('ressalt'); });
}
function treuRessalt(){ if (cy) cy.elements().removeClass('apagat ressalt'); }
function pintaAnalisi(){
  const el = $('#analisi'); if (estat.v !== 'xarxa') { el.hidden = true; return; } el.hidden = false;
  const func = R.filter(r => r.classe === 'funcional' && r.estat === 'documentada' && r.tipus_relacio !== 'sense relació');
  const esfVei = {}; func.forEach(r => { const o = byId[r.origen], d = byId[r.desti]; if (!o || !d) return;
    (esfVei[o.id] = esfVei[o.id] || new Set()).add(d.esfera); (esfVei[d.id] = esfVei[d.id] || new Set()).add(o.esfera); });
  const ponts = Object.entries(esfVei).map(([id,s]) => [id, s.size]).sort((a,b) => b[1]-a[1]).slice(0,8);
  const grauDoc = {}; R.filter(r => r.estat === 'documentada').forEach(r => { grauDoc[r.origen] = (grauDoc[r.origen]||0)+1; grauDoc[r.desti] = (grauDoc[r.desti]||0)+1; });
  const aill = Object.keys(ESF).map(e => [e, A.filter(a => a.esfera === e && !grauDoc[a.id]).length, A.filter(a => a.esfera === e).length]);
  const conf = R.filter(r => r.tipus_relacio === 'conflicte');
  const T = D.textos.analisi, sec = t => T.find(x => x.titol.includes(t));
  const det = (s, obert) => s ? `<details ${obert?'open':''}><summary>${esc(s.titol)} <small>(document)</small></summary><ul>${s.items.map(i => { const v = /^VERIFICAR · /.test(i); return `<li${v?' class="li-verificar"':''}>${v ? BADGE_V + ' ' : ''}${linkify(v ? i.replace(/^VERIFICAR · /,'') : i)}</li>`; }).join('')}</ul></details>` : '';
  el.innerHTML = `<button class="btn" id="plega-an" style="float:right;font-size:11px" aria-expanded="${!el.classList.contains('plegat')}">${el.classList.contains('plegat')?'Mostra':'Amaga'}</button><h2 style="font-size:14px;margin:0">Lectura: ponts, buits i bloquejos</h2><div class="cos-an">
   <p class="subt" style="margin:2px 0 6px;font-size:12px">Indicadors calculats sobre relacions <b>documentades</b> i funcionals; les hipòtesis no compten.</p>
   <h3>Ponts (més esferes connectades)</h3><ul>${ponts.map(([id,n]) => `<li><a href="#" data-obre="${id}">${esc(byId[id].nom)}</a> · ${n} esferes</li>`).join('')}</ul>
   <h3>Buits (actors sense cap relació documentada)</h3><ul>${aill.map(([e,n,t]) => `<li>${esc(e)}: ${n} de ${t}</li>`).join('')}</ul>
   <h3>Bloquejos (relacions de conflicte)</h3><ul>${conf.map(r => `<li>${esc(r.origen_nom)} — ${esc(r.desti_nom)}: ${esc(r.evidencia)}</li>`).join('') || '<li>Cap documentada</li>'}</ul>
   <h3>Del document</h3>${det(sec('6.3'), true)}${det(sec('6.0'))}${det(sec('6.1'))}${det(sec('6.4'))}${det(sec('6.5'))}</div>`;
  $('#plega-an').onclick = () => { el.classList.toggle('plegat'); pintaAnalisi(); encaixaXarxa(); };
  el.querySelectorAll('[data-obre]').forEach(a => a.onclick = e => { e.preventDefault(); obreFitxa(a.dataset.obre); });
}

/* ---------- fitxa ---------- */
function linkWeb(w){ if (!w) return '<i>no consta</i>'; const m = String(w).match(/^(https?:\/\/)?([a-z0-9.-]+\.[a-z]{2,}(\/\S*)?)$/i); return m ? `<a href="${esc((m[1]||'https://') + m[2])}" target="_blank" rel="noopener">${esc(w)}</a>` : esc(w); }
function fontsHtml(f){ const us = String(f||'').split(/\s*\|\s*/).filter(Boolean); if (!us.length) return '<i>no consta</i>';
  return us.map(x => safeUrl(x) ? `<a href="${esc(x)}" target="_blank" rel="noopener">${esc(x.replace(/^https?:\/\/(www\.)?/,'').slice(0,60))}</a>` : esc(x)).join('<br>'); }
function obreFitxa(id){
  const a = byId[id]; if (!a) return; estat.fitxa = id;
  const rels = R.filter(r => r.origen === id || r.desti === id);
  const u = safeUrl(a.font_url);
  const ev = a.estat_verificacio, evc = ev === 'verificat' ? 'estat-verificat' : ev === 'probable' ? 'estat-probable' : 'estat-a';
  $('#fitxa').innerHTML = `<button class="btn tanca" aria-label="Tanca la fitxa">✕</button><h2>${esc(a.nom)}</h2>
   <div>${verif(a) ? BADGE_V + ' ' : ''}<span class="etq ${ev==='verificat'?'mesura':'hipotesi'}">${ev==='verificat'?'Mesura · verificat':'A validar · '+esc(ev)}</span> <small>${esc(a.id)}</small></div>
   <dl><dt>Tipus Alberich</dt><dd>${esc(a.tipus_alberich)}</dd><dt>Nivell</dt><dd>${esc(a.nivell)}</dd><dt>Esfera</dt><dd>${esc(a.esfera)}</dd><dt>Àmbit</dt><dd>${esc(a.ambit)}</dd>
   <dt>Zona / barri</dt><dd>${esc(a.zona_barri)}</dd><dt>Cobertura</dt><dd>${esc(a.cobertura)}</dd>
   <dt>Adreça</dt><dd>${a.adreca ? esc(a.adreca) : '<i>no consta</i>'}</dd><dt>Web / contacte públic</dt><dd>${linkWeb(a.web_contacte_public)}</dd>
   <dt>Rol en salut comunitària</dt><dd>${esc(a.rol_potencial)}</dd>
   <dt>Font</dt><dd>${fontsHtml(a.font_url)}</dd><dt>Data de la font</dt><dd>${esc(a.data_font)}</dd>
   <dt>Estat de verificació</dt><dd class="${evc}">${esc(ev)}</dd>
   ${a.nota ? `<dt>Nota</dt><dd>${esc(a.nota)}</dd>` : ''}
   <dt>Ubicació</dt><dd>${a.lat != null ? `${a.lat.toFixed(5)}, ${a.lon.toFixed(5)} · precisió: ${esc(a.precisio_geo)}` : '<i>sense coordenades</i>'}</dd>
   ${a.dist_cap_m != null ? `<dt>CAP més proper</dt><dd>${esc(a.cap_mes_proper)} · ${fmt(a.dist_cap_m)} m <i>en línia recta</i></dd>` : ''}
   <dt>Proximitat CAP</dt><dd>${esc(a.cap_proximitat)} <span class="etq hipotesi">Hipòtesi · no oficial</span></dd></dl>
   <h3 style="font-size:14px;margin:8px 0 2px">Relacions (${rels.length})</h3>
   <ul>${rels.map(r => { const alt = r.origen === id ? r.desti : r.origen, nm = r.origen === id ? r.desti_nom : r.origen_nom, fu = safeUrl(r.font_url);
     return `<li><a href="#" data-obre="${esc(alt)}">${esc(nm)}</a> · ${esc(r.tipus_relacio)}${r.estat===HIP?' <span class="etq hipotesi">hipòtesi</span>':''}${r.classe!=='funcional'?' <small>(estructural)</small>':''}<br><small>${esc(r.evidencia)}${fu?` · <a href="${esc(fu)}" target="_blank" rel="noopener">font</a>`:''}</small></li>`; }).join('') || '<li><i>Sense relacions registrades (buit, no vol dir que no n\'hi hagi)</i></li>'}</ul>`;
  $('#fitxa').hidden = false;
  $('#fitxa .tanca').onclick = tancaFitxa;
  $('#fitxa').querySelectorAll('[data-obre]').forEach(x => x.onclick = e => { e.preventDefault(); obreFitxa(x.dataset.obre); });
  if (estat.v === 'xarxa') ressalta(id);
  else if (V[estat.v].tipus === 'mapa' && a.lat != null && mapLlest) { marcaSel();
    if (!restaurant) { const c = {center:[a.lon, a.lat], zoom:Math.max(map.getZoom(), 16.2), pitch:es3D(estat.v) ? (MOBIL ? 40 : 62) : 0, bearing:es3D(estat.v) ? map.getBearing() + 35 : 0};
      MOVIMENT ? map.flyTo(Object.assign(c, {duration:2200, curve:1.2})) : map.jumpTo(c); } }
  desaHash();
}
function fitxaSeccio(cusec){
  const f = D.seccions.features.find(x => x.properties.CUSEC === cusec); if (!f) return; const p = f.properties; estat.fitxa = null;
  $('#fitxa').innerHTML = `<button class="btn tanca" aria-label="Tanca la fitxa">✕</button><h2>Secció censal ${esc(p.codi)} (${esc(p.CUSEC)})</h2>
   <div><span class="etq mesura">Mesura</span> <span class="etq context">context de la secció, no de l'actor</span></div>
   <dl><dt>IST 2023</dt><dd>${p.ist_2023 ?? 's/d'} (Catalunya = 100)</dd><dt>IST 2024</dt><dd>${p.ist_2024p ?? 's/d'} (provisional)</dd>
   <dt>Sèrie</dt><dd>${Object.entries(p.serie).map(([k,v]) => `${k}: ${v ?? 's/d'}`).join(' · ')}</dd>
   <dt>Distància del centroide al CAP més proper</dt><dd>${fmt(p.dist_cap_centroide_m)} m <i>en línia recta</i></dd>
   <dt>Font</dt><dd><a href="https://www.idescat.cat/indicadors/?id=ist" target="_blank" rel="noopener">Idescat – IST</a>; límits <a href="https://www.ine.es/ss/Satellite?c=Page&cid=1259952026632&pagename=ProductosYServicios%2FPYSLayout" target="_blank" rel="noopener">INE – Seccionat censal 2023</a></dd></dl>
   <p style="font-size:12px;color:#666">Les agrupacions «Salt 1/2/3» de l'Idescat (AC) no són les zones dels CAP.</p>`;
  $('#fitxa').hidden = false; $('#fitxa .tanca').onclick = tancaFitxa;
}
function tancaFitxa(){ $('#fitxa').hidden = true; estat.fitxa = null; marcaSel(); treuRessalt(); desaHash(); }

/* ---------- panells ---------- */
function pintaPortada(){
  const nHip = R.filter(r => r.estat === HIP).length, nGeo = A.filter(a => a.lat != null).length;
  $('#portada').innerHTML = `<h2>Sociograma comunitari del territori dels CAP Salt 1 i Salt 2</h2>
   <p class="subt">EAP Salt · ICS Girona · ABS 199 · octubre de 2026 · <span class="etq hipotesi">Document de treball per validar amb l'equip</span></p>
   <h3>Què és</h3><p>Un mapa d'actors i relacions del municipi de Salt per orientar la salut comunitària dels dos CAP. Recull ${A.length} actors (${nGeo} ubicats) i ${R.length} relacions, de les quals ${nHip} són hipòtesis pendents de validar. Queden fora els pobles de l'ABS (Aiguaviva, Bescanó amb Estanyol i Vilanna, Fornells de la Selva i Vilablareix).</p>
   <h3>Mètode Alberich</h3><p>Cada actor té una <b>forma</b> (triangle: poder o institució; rectangle: servei, tècnic o entitat; cercle: població no organitzada), un <b>nivell</b> (polític, tècnic, social) i una <b>esfera</b>. Les relacions són fortes, febles, de conflicte o indirectes; les que no tenen evidència pública es dibuixen en <span style="color:#2b6cd6">blau discontinu</span> com a hipòtesi.</p>
   <h3>Com llegir-lo</h3><p>Cada vista respon una pregunta (calaix de l'esquerra). <span class="etq mesura">Mesura</span> vol dir dada publicada amb font; <span class="etq hipotesi">Hipòtesi</span> és una suposició a validar. Un valor desconegut no es pinta mai com a zero. Feu clic en un actor per obrir-ne la fitxa; <kbd>Ctrl K</kbd> per cercar.</p>
   <h3>Fonts</h3><p>Webs de l'ICS, l'Ajuntament de Salt, el CBSGS, el Departament d'Educació i les entitats; premsa local; Idescat (IST 2023 per secció censal); INE (seccionat censal 2023); AQuAS; OpenStreetMap. Totes les fonts (${D.fonts.length}) són a <a href="descarregues/fonts.csv">fonts.csv</a>, i cada actor i relació porta la seva URL i data.</p>
   <h3>Límits</h3><ul>
    <li>El repartiment oficial de carrers entre Salt 1 i Salt 2 no és públic: les zones de proximitat són una <b>hipòtesi no oficial</b>.</li>
    <li>Les distàncies són en línia recta, no temps a peu.</li>
    <li>L'IST descriu el context de la secció censal, no de cada actor.</li>
    <li>Les relacions s'han deduït de documents públics; les relacions reals de l'equip falten i s'han de validar en sessió.</li>
    <li>No s'hi inclouen dades de particulars: només serveis i càrrecs públics (p. ex. «Direcció EAP»).</li></ul>
   <h3>Descàrregues</h3><ul>
    <li><a href="descarregues/Sociograma_comunitari_CAP_Salt1_Salt2_2026.pdf">Document complet (PDF)</a> · <a href="descarregues/Sociograma_comunitari_CAP_Salt1_Salt2_2026.docx">DOCX</a></li>
    <li><a href="descarregues/actors.csv">actors.csv</a> · <a href="descarregues/relacions.csv">relacions.csv</a> · <a href="descarregues/fonts.csv">fonts.csv</a> · <a href="descarregues/registre_entitats_salt_annex.csv">registre d'entitats (annex)</a></li></ul>
   <p><a class="btn" href="#v=actors">Comença: on són els actors comunitaris? →</a></p>
   <p style="font-size:12px;color:#666;margin-top:30px">Estil inspirat en Xamfrà. Mapa base © col·laboradors d'OpenStreetMap, OpenMapTiles i OpenFreeMap. Biblioteques: MapLibre GL JS, Cytoscape.js.</p>`;
}
function pintaValidacio(){
  const h = R.filter(r => r.estat === HIP);
  const pv = A.filter(a => a.estat_verificacio !== 'verificat');
  $('#validacio').innerHTML = `<h2>Què cal validar amb l'equip?</h2>
   <p class="subt"><span class="etq hipotesi">Hipòtesi</span> Preguntes pendents, ${h.length} relacions hipòtesi i ${pv.length} actors no verificats. Exporta el CSV per a la sessió de validació.</p>
   <h3>Preguntes pendents (${D.textos.preguntes.length})</h3><ol>${D.textos.preguntes.map(q => `<li>${esc(q)}</li>`).join('')}</ol>
   <h3>Relacions hipòtesi (${h.length})</h3>
   <table><thead><tr><th>Origen</th><th>Destí</th><th>Tipus proposat</th><th>Evidència / raó</th></tr></thead><tbody>
   ${h.map(r => `<tr><td><a href="#" data-obre="${esc(r.origen)}">${esc(r.origen_nom)}</a></td><td><a href="#" data-obre="${esc(r.desti)}">${esc(r.desti_nom)}</a></td><td>${esc(r.tipus_relacio)}</td><td>${esc(r.evidencia)}</td></tr>`).join('')}</tbody></table>
   <h3>Actors no verificats (${pv.length})</h3>
   <table><thead><tr><th>ID</th><th>Actor</th><th>Estat</th><th>Nota</th></tr></thead><tbody>
   ${pv.map(a => `<tr><td>${esc(a.id)}</td><td><a href="#" data-obre="${esc(a.id)}">${esc(a.nom)}</a></td><td>${esc(a.estat_verificacio)}</td><td>${esc(a.nota)}</td></tr>`).join('')}</tbody></table>`;
  $('#validacio').querySelectorAll('[data-obre]').forEach(x => x.onclick = e => { e.preventDefault(); obreFitxa(x.dataset.obre); });
}

/* ---------- navegació i hash ---------- */
let restaurant = false;
function desaHash(){
  if (restaurant) return; const p = new URLSearchParams(); p.set('v', estat.v);
  if (V[estat.v].tipus === 'mapa' && mapLlest) { const c = map.getCenter(); p.set('c', [c.lng.toFixed(5), c.lat.toFixed(5), map.getZoom().toFixed(2), map.getPitch().toFixed(0), map.getBearing().toFixed(0)].join(',')); }
  if (!estat.d3) p.set('m', '2d'); if (estat.arcs) p.set('r', '1'); if (estat.base !== 'positron') p.set('b', estat.base); if (estat.relleu) p.set('o', '1');
  if (estat.v === 'xarxa' && cy) { const pn = cy.pan(); p.set('x', [pn.x.toFixed(0), pn.y.toFixed(0), cy.zoom().toFixed(3)].join(',')); if (estat.xEsf) p.set('esf', estat.xEsf); if (estat.xNiv) p.set('niv', estat.xNiv); }
  if (V[estat.v].filtreEsfera && estat.esf.size < Object.keys(ESF).length) p.set('e', Object.keys(ESF).map((e,i) => estat.esf.has(e) ? i : '').filter(x => x !== '').join('.'));
  if (estat.fitxa) p.set('a', estat.fitxa);
  history.replaceState(null, '', '#' + p.toString());
}
function llegeixHash(){
  const p = new URLSearchParams(location.hash.slice(1)); const v = V[p.get('v')] ? p.get('v') : 'portada';
  if (p.has('e')) { const ix = p.get('e').split('.').map(Number); estat.esf = new Set(Object.keys(ESF).filter((e,i) => ix.includes(i))); }
  estat.xEsf = p.get('esf') || ''; estat.xNiv = p.get('niv') || '';
  estat.d3 = p.get('m') !== '2d'; estat.arcs = p.get('r') === '1'; estat.base = p.get('b') === 'orto' ? 'orto' : 'positron'; estat.relleu = p.get('o') === '1'; botons3D();
  return {v, c:p.get('c'), x:p.get('x'), a:p.get('a')};
}
function mostra(v, h){
  restaurant = true; estat.v = v; const t = V[v].tipus;
  document.querySelectorAll('#llista-vistes a').forEach(a => a.dataset.v === v ? a.setAttribute('aria-current','page') : a.removeAttribute('aria-current'));
  $('#portada').hidden = v !== 'portada'; $('#validacio').hidden = v !== 'validar';
  $('#mapa').style.visibility = t === 'mapa' ? 'visible' : 'hidden'; $('#xarxa').style.visibility = t === 'xarxa' ? 'visible' : 'hidden';
  if (t === 'mapa') { const nou = !map; if (nou) iniciaMapa(); else { map.resize(); aplicaMapa(); }
    if (h && h.c) { const [x,y,z,pt,br] = h.c.split(',').map(Number); if (isFinite(z)) { const c = {center:[x,y], zoom:z, pitch:isFinite(pt) && es3D(v) ? pt : 0, bearing:isFinite(br) && es3D(v) ? br : 0}; if (mapLlest) map.jumpTo(c); else map._camPendent = c; } }
    else if (!nou && !(h && h.a)) vola(v); }
  if (t === 'xarxa') { if (!cy) iniciaXarxa(); cy.resize(); if (h && h.x) { const [x,y,z] = h.x.split(',').map(Number); cy.viewport({zoom:z, pan:{x,y}}); } else if (!h || !h.x) encaixaXarxa(); filtraXarxa(); }
  if (v === 'portada') pintaPortada(); if (v === 'validar') pintaValidacio();
  pintaLlegenda(v); pintaFiltres(); pintaAnalisi();
  if (t === 'xarxa' && !(h && h.x)) encaixaXarxa();
  document.title = V[v].q + ' · Sociograma CAP Salt';
  if (h && h.a && byId[h.a]) obreFitxa(h.a); else if (estat.fitxa && !(h && h.a)) { $('#fitxa').hidden = true; estat.fitxa = null; treuRessalt(); }
  restaurant = false; desaHash();
}
window.addEventListener('hashchange', () => { const h = llegeixHash(); if (h.v !== estat.v || h.a !== estat.fitxa) mostra(h.v, h); });
document.querySelectorAll('#llista-vistes a').forEach(a => a.addEventListener('click', e => { e.preventDefault(); estat.fitxa = null; $('#fitxa').hidden = true; mostra(a.dataset.v, null); if (matchMedia('(max-width:760px)').matches) { document.body.classList.add('calaix-tancat'); } }));

/* ---------- cerca Ctrl+K ---------- */
const dlg = $('#dlg-cerca'), cin = $('#cerca-in'), cres = $('#cerca-res'); let resultats = [], ix = 0;
const norm = s => String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
function cerca(){
  const q = norm(cin.value).trim(); const tk = q.split(/\s+/).filter(Boolean);
  resultats = A.filter(a => { const h = norm([a.nom, a.tipus_alberich, a.nivell, a.esfera, a.ambit, a.id].join(' ')); return tk.every(t => h.includes(t)); }).slice(0, 40); ix = 0;
  cres.innerHTML = resultats.map((a,i) => `<li role="option" id="res-${i}" aria-selected="${i===ix}" data-i="${i}">${esc(a.nom)}<small>${esc(a.tipus_alberich)} · ${esc(a.nivell)} · ${esc(a.ambit)}</small></li>`).join('') || '<li>Cap resultat</li>';
  cres.querySelectorAll('[data-i]').forEach(li => li.onclick = () => tria(+li.dataset.i));
}
function tria(i){ const a = resultats[i]; if (!a) return; dlg.close(); if (V[estat.v].tipus === 'panell') mostra(a.lat != null ? 'actors' : 'xarxa', null); else if (estat.v === 'ist' && a.lat != null) mostra('actors', null);
  if (a.lat != null && V[estat.v].tipus === 'mapa') { if (!actorsVista(estat.v).includes(a)) mostra('actors', null); if (mapLlest) map.flyTo({center:[a.lon,a.lat], zoom:Math.max(map.getZoom(), 15.5)}); }
  obreFitxa(a.id); }
function obreCerca(){ cin.value = ''; cerca(); dlg.showModal(); cin.focus(); }
$('#btn-cerca').onclick = obreCerca;
cin.oninput = cerca;
cin.onkeydown = e => { if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); ix = Math.max(0, Math.min(resultats.length-1, ix + (e.key === 'ArrowDown' ? 1 : -1)));
  cres.querySelectorAll('[data-i]').forEach((li,i) => li.setAttribute('aria-selected', i === ix)); const s = cres.querySelector(`#res-${ix}`); if (s) s.scrollIntoView({block:'nearest'}); }
  if (e.key === 'Enter') { e.preventDefault(); tria(ix); } };
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); obreCerca(); }
  else if (e.key === 'Escape' && !dlg.open && !$('#fitxa').hidden) tancaFitxa();
});

/* ---------- exportacions ---------- */
function avis(t){ const a = $('#avis'); a.textContent = t; a.hidden = false; clearTimeout(avis._t); avis._t = setTimeout(() => a.hidden = true, 2600); }
function baixa(nom, url){ const l = document.createElement('a'); l.href = url; l.download = nom; document.body.appendChild(l); l.click(); l.remove(); }
function wrap(ctx, text, maxW){ const w = String(text).split(' '), out = []; let l = ''; w.forEach(p => { const t = l ? l + ' ' + p : p; if (ctx.measureText(t).width > maxW && l) { out.push(l); l = p; } else l = t; }); if (l) out.push(l); return out; }
function dibuixaLlegenda(ctx, L, x, y, W){
  const pad = 12, lh = 16; ctx.font = '12px system-ui, sans-serif';
  const linies = []; linies.push({b:true, t:L.titol}); linies.push({t:L.etiq.map(e => '[' + e[1] + ']').join('  '), c:'#2b6cd6'});
  L.items.forEach(it => linies.push({it, t:it.t}));
  if (L.rampa) linies.push({rampa:L.rampa});
  L.notes.forEach(n => wrap(ctx, n, W - 2*pad).forEach(t => linies.push({t, c:'#555'})));
  [['Font: ', L.font], ['Any: ', L.any], ['Mètode: ', L.metode]].forEach(([k,v]) => wrap(ctx, k + v, W - 2*pad).forEach(t => linies.push({t, c:'#444'})));
  const H = pad*2 + linies.length * lh + (L.rampa ? 10 : 0);
  ctx.fillStyle = 'rgba(255,255,255,0.96)'; ctx.fillRect(x, y - H, W, H); ctx.strokeStyle = '#bbb'; ctx.setLineDash(L.hip ? [5,3] : []); ctx.strokeRect(x, y - H, W, H); ctx.setLineDash([]);
  let yy = y - H + pad + 11;
  linies.forEach(l => {
    if (l.rampa) { const sw = (W - 2*pad) / l.rampa.length; l.rampa.forEach((r,i) => { ctx.fillStyle = r.c; ctx.fillRect(x+pad+i*sw, yy-10, sw, 10); ctx.fillStyle = '#333'; ctx.fillText(r.t, x+pad+i*sw+2, yy+12); }); yy += lh + 10; return; }
    ctx.font = (l.b ? 'bold 13px' : '12px') + ' system-ui, sans-serif'; let tx = x + pad;
    if (l.it) { const it = l.it; ctx.strokeStyle = it.c || '#333'; ctx.fillStyle = it.c && it.c !== 'url' ? it.c : '#ccc';
      if (it.linia) { ctx.lineWidth = it.w || 2; ctx.setLineDash(it.dash ? [5,3] : it.dot ? [1,3] : []); ctx.beginPath(); ctx.moveTo(tx, yy-4); ctx.lineTo(tx+20, yy-4); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = 1; }
      else if (it.forma) { ctx.fillStyle = '#ddd'; ctx.strokeStyle = '#333'; ctx.beginPath(); if (it.forma === 'triangle') { ctx.moveTo(tx+6, yy-11); ctx.lineTo(tx+12, yy); ctx.lineTo(tx, yy); ctx.closePath(); } else if (it.forma === 'rect') ctx.rect(tx, yy-9, 12, 9); else ctx.arc(tx+6, yy-5, 6, 0, 7); ctx.fill(); ctx.stroke(); }
      else { ctx.fillRect(tx, yy-10, 12, 12); ctx.strokeStyle = '#999'; ctx.strokeRect(tx, yy-10, 12, 12); }
      tx += 26; }
    ctx.fillStyle = l.c || '#1d1d1b'; ctx.fillText(l.t, tx, yy); yy += lh; });
}
async function exportaPNG(){
  const v = estat.v, t = V[v].tipus; if (t === 'panell') { avis('Aquesta vista és un text: feu servir les descàrregues PDF/CSV.'); return; }
  let img, Wd, Hd;
  if (t === 'mapa') { await new Promise(r => { map.once('render', r); map.triggerRepaint(); }); const c = map.getCanvas(); img = c; Wd = c.width; Hd = c.height; }
  else { const uri = cy.png({full:false, scale:2, bg:'#ffffff'}); img = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = uri; }); Wd = img.width; Hd = img.height; }
  const cv = document.createElement('canvas'); cv.width = Wd; cv.height = Hd; const ctx = cv.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0,0,Wd,Hd); ctx.drawImage(img, 0, 0, Wd, Hd);
  const s = Wd / ($(t === 'mapa' ? '#mapa' : '#xarxa').clientWidth || Wd); ctx.save(); ctx.scale(s, s);
  const L = llegendaSpec(v); L.hip = !!V[v].hip; const lw = 330, Wc = Wd/s, Hc = Hd/s;
  dibuixaLlegenda(ctx, L, Wc - lw - 12, Hc - 24, lw);
  ctx.font = '11px system-ui, sans-serif'; ctx.fillStyle = '#444';
  ctx.fillText((t === 'mapa' ? "© col·laboradors d'OpenStreetMap, OpenMapTiles i OpenFreeMap · " : '') + 'Sociograma comunitari CAP Salt 1 i Salt 2 · 2026', 10, Hc - 8);
  ctx.restore();
  baixa(`sociograma_salt_${v}.png`, cv.toDataURL('image/png')); avis('PNG exportat amb la llegenda');
}
function csv(rows, cols){ const q = x => { const s = String(x == null ? '' : x); return /[",\n;]/.test(s) ? '"' + s.replace(/"/g,'""') + '"' : s; };
  return '\ufeff' + cols.join(',') + '\n' + rows.map(r => cols.map(c => q(r[c])).join(',')).join('\n'); }
function exportaCSV(){
  const v = estat.v; let rows, cols, nom = `seleccio_${v}.csv`;
  const AC = ['id','nom','tipus_alberich','nivell','esfera','ambit','adreca','web_contacte_public','rol_potencial','font_url','data_font','estat_verificacio','lat','lon','precisio_geo','cap_proximitat','cap_mes_proper','dist_cap_m'];
  const RC = ['origen','origen_nom','desti','desti_nom','tipus_relacio','estat','classe','evidencia','font_url','data_font'];
  if (v === 'ist') { rows = D.seccions.features.map(f => ({seccio:f.properties.CUSEC, codi:f.properties.codi, ist_2023:f.properties.ist_2023, ist_2024_provisional:f.properties.ist_2024p, dist_centroide_cap_m:f.properties.dist_cap_centroide_m})); cols = Object.keys(rows[0]); }
  else if (v === 'validar') { rows = R.filter(r => r.estat === HIP).map(r => Object.assign({}, r, {tipus_validat:'', qui_ho_sap:'', comentari:''})); cols = RC.concat(['tipus_validat','qui_ho_sap','comentari']); nom = 'relacions_hipotesi_a_validar.csv'; }
  else if (v === 'xarxa') { const ids = new Set(cy.nodes().not('.banda').not('.amagat').map(n => n.id())); rows = A.filter(a => ids.has(a.id)); cols = AC; }
  else if (v === 'portada') { rows = A; cols = AC; nom = 'actors.csv'; }
  else { rows = actorsVista(v); cols = AC; }
  if (estat.fitxa && v !== 'validar' && v !== 'ist' && v !== 'portada' && confirm("Exportar només l'actor seleccionat? (Cancel·la = tota la vista)")) rows = rows.filter(a => a.id === estat.fitxa);
  baixa(nom, URL.createObjectURL(new Blob([csv(rows, cols)], {type:'text/csv;charset=utf-8'}))); avis(`CSV exportat: ${rows.length} files`);
}
/* ---------- 2D/3D i mode presentació ---------- */
function botons3D(){ const b = $('#btn-3d'); if (b) { b.textContent = estat.d3 ? '3D' : '2D'; b.setAttribute('aria-pressed', estat.d3); b.title = estat.d3 ? 'Vista 3D activa: passa a 2D' : 'Vista 2D activa: passa a 3D'; } }
$('#btn-3d').onclick = () => { estat.d3 = !estat.d3; botons3D(); if (V[estat.v].tipus === 'mapa' && mapLlest) { aplicaMapa(); pintaLlegenda(estat.v); vola(estat.v); } desaHash(); };
const RECORREGUT = ['actors','salut','tercer','educatiu','diversitat','ist','zones','distancia'];
let presen = null;
function aturaPresentacio(){ if (!presen) return; clearTimeout(presen); presen = null; $('#btn-pres').setAttribute('aria-pressed','false'); $('#btn-pres').innerHTML = '▶ <span>Presentació</span>'; }
function pasPresentacio(i){ estat.fitxa = null; $('#fitxa').hidden = true; mostra(RECORREGUT[i % RECORREGUT.length], null); presen = setTimeout(() => pasPresentacio(i + 1), 7000); }
$('#btn-pres').onclick = () => { if (presen) { aturaPresentacio(); return; } $('#btn-pres').setAttribute('aria-pressed','true'); $('#btn-pres').innerHTML = '■ <span>Atura</span>'; pasPresentacio(Math.max(0, RECORREGUT.indexOf(estat.v) + 1)); };
document.addEventListener('pointerdown', e => { if (presen && !e.target.closest('#btn-pres')) aturaPresentacio(); }, true);
$('#btn-png').onclick = () => exportaPNG().catch(e => { console.warn(e); avis('No s\'ha pogut exportar el PNG'); });
$('#btn-csv').onclick = exportaCSV;
$('#btn-enllac').onclick = () => { desaHash(); (navigator.clipboard ? navigator.clipboard.writeText(location.href) : Promise.reject()).then(() => avis('Enllaç copiat: restaura la vista i la càmera'), () => avis(location.href)); };
window.VISOR = {mostra, estat, fitxaSeccio, get map(){return map}, get cy(){return cy}, obreFitxa, exportaCSV, llegendaSpec, get overlay(){return overlay}, get edificis(){return EDIF_N}, get arcs(){return ARCS}, GRAU};

/* ---------- inici ---------- */
const h0 = llegeixHash(); mostra(h0.v, h0);
})();
