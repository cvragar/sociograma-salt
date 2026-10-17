# Visor del sociograma comunitari · CAP Salt 1 i Salt 2 (2026)

Visor web estàtic (sense backend) del sociograma comunitari del territori dels CAP Salt 1 i Salt 2 (EAP Salt, ICS Girona, ABS 199), segons el mètode Alberich. Queden fora els pobles d'Aiguaviva, Bescanó (amb Estanyol i Vilanna), Fornells de la Selva i Vilablareix. L'estil s'inspira en Xamfrà: un calaix de vistes, cadascuna formulada com una pregunta, i una llegenda per vista amb la font, l'any i el mètode.

## Actualització de l’Observatori de Salt · 17/10/2026

La vista **Què ens diuen les dades oficials?** (`#v=observatori`) integra 23 indicadors seleccionats de l’[Observatori de Salt](https://observatori.salt.cat/), amb dades de **2025**, font, definició i enllaç a la taula original. Inclou població per edat, naixement i nacionalitat, llars, densitat, població per barris i habitatges amb/sense empadronament. Manté el mapa i la xarxa originals i connecta quatre propostes de planificació amb actors ja existents. Les propostes són orientacions a validar, no conclusions publicades per l’Observatori.

- Àmbit: municipi de Salt. No representa la població assignada als dos CAP ni la de tot l’EAP; barris, seccions censals i zones de CAP no són intercanviables.
- Any de referència: 2025; consulta: 17/10/2026. La font indica periodicitat anual, sense data exacta de tall visible. El títol de la pàgina de barris conserva «2000–2024», però la taula ja inclou 2025.
- Naixement a l’estranger i nacionalitat estrangera són variables diferents. Viure sol no acredita soledat no volguda. Els 90 països corresponen al naixement a l’estranger, no a nacionalitats.
- Habitatge: es reprodueixen els recomptes 10.526 amb padró, 1.098 sense padró i 11.624 totals. S’ometen els percentatges inconsistents de la font (91,1%, 9,5% i total mostrat de 101%). No s’equipara «sense padró» amb habitatge buit.
- Els PDF/DOCX anteriors són documents base; aquesta actualització correspon al visor i al nou CSV.
- Atribució: Ajuntament de Salt, Observatori de Salt; Padró Municipal d’Habitants i Àrea de Territori. El portal indica [CC BY-NC-SA 3.0 ES](https://creativecommons.org/licenses/by-nc-sa/3.0/es/deed.ca).

Fitxers:
- `data/observatori-fonts.json`: transcripció de les taules demogràfiques consultades, amb sèries i URLs.
- `data/observatori.json` i `data/observatori.js`: dades publicades, independents del bundle d’actors.
- `descarregues/observatori_salt_2025.csv`: exportació amb fonts i dates; el botó CSV de la vista exporta també els indicadors.
- `scripts/build_observatori.py`: regenera els fitxers amb Python estàndard. Comprova les sumes d’edats, barris i llars, i l’existència dels actors enllaçats. Executar `python3 scripts/build_observatori.py`.

## Com obrir-lo
```
cd visor_sociograma_salt
python3 -m http.server 8000
# obriu http://localhost:8000/
```
**file://** també funciona: les dades es carreguen des de `data/dades.js`, no amb fetch, i s'ha provat amb Chromium. Amb file:// alguns navegadors no deixen copiar l'enllaç al porta-retalls; en aquest cas l'enllaç es mostra en pantalla. Recomanem fer servir http.server.

L'únic recurs extern són les teseles del mapa base (OpenFreeMap, positron), que necessiten connexió. Sense connexió, les capes de dades es pinten igualment, però sense el fons.

## Vistes
0. Portada: què és, mètode, fonts, límits i descàrregues (PDF, DOCX, CSV).
1. On són els actors comunitaris? Filtre per esfera.
2. Quins actors de salut hi ha? Les 14 farmàcies consten com a actor agregat, sense ubicació individual.
3. Qui fa xarxa al Tercer Sector? Inclou les línies de relació.
4. Quins són els actors educatius? El test BULL-S apareix «a validar», sense ubicació.
5. On són els actors de diversitat i culte?
6. Quina és la vulnerabilitat de cada secció censal? Valors IST 2023 de l'Idescat sobre els límits del seccionat censal 2023 de l'INE. Etiqueta: «context de la secció, no de l'actor».
7. Quina zona cobreix cada CAP? **Hipòtesi · no oficial**: mediatriu entre els dos CAP.
8. Qui queda lluny d'un CAP? Distància en línia recta, no temps a peu.
9. Com es relacionen? Xarxa Cytoscape amb:
   - franges per nivell (polític, tècnic, social) i formes Alberich;
   - línies forta, feble, conflicte o indirecta, i les hipòtesis en blau discontinu;
   - filtres per esfera i nivell;
   - anàlisi de ponts, buits i bloquejos.
10. Què cal validar amb l'equip? 20 preguntes, les relacions hipòtesi (55 ara mateix) i els actors no verificats. El CSV d'aquesta vista inclou columnes buides per omplir a la sessió.

## Funcions
- **Ctrl+K:** cerca per nom, tipus Alberich, nivell, esfera o àmbit.
- **PNG:** exporta la vista amb la llegenda.
- **CSV:** exporta la selecció de la vista.
- **Enllaç:** el hash de l'URL restaura la vista, la càmera, els filtres i la fitxa oberta.
- **Interacció:** tooltip en passar per sobre i fitxa en fer clic.
- **Mòbil:** el calaix i la fitxa es mostren com a fulls inferiors.

## Estructura
- `index.html`, `app.js`, `style.css`
- `lib/`: MapLibre GL JS 4.7.1 i Cytoscape.js 3.34.3, inclosos localment amb les seves llicències.
- `data/`:
  - `dades.js`: bundle amb totes les dades;
  - `actors.json`, `relacions.json`, `fonts.json`, `textos.json`;
  - `seccions_ist.geojson`, `terme_municipal.geojson`, `zones_proximitat_hipotesi.geojson`.
- `descarregues/`: document PDF i DOCX i els CSV.
- `scripts/`:
  - `build_data.py` regenera `data/` a partir de `/workspace/sociograma_salt` i del seccionat de l'INE;
  - `test_visor.py` és la prova amb Playwright.
- `captures/`: captures de pantalla a 1440x900.

## Fonts de geodades
- **Seccions censals:** INE, *Seccionat censal a 1/1/2023* (https://www.ine.es/prodyser/cartografia/seccionado_2023.zip), reprojectat d'ETRS89 UTM30 a WGS84.
- **Terme municipal:** unió de les 15 seccions de Salt (17155) de l'INE. No s'ha descarregat el límit de l'ICGC.
- **IST:** Idescat, API taules v2 IST per secció censal, sèrie 2015-2024 (2024 provisional).
- **CAP i actors:** OpenStreetMap i Nominatim. La precisió de cada actor consta a la seva fitxa.

## Límits
- El repartiment real de carrers entre Salt 1 i Salt 2 no és públic.
- 141 dels 246 actors no tenen coordenades: no es pinten al mapa, però apareixen al calaix i a la xarxa.
- Les relacions provenen de documents públics. Les marcades com a hipòtesi s'han de validar amb l'equip.
- No hi ha dades de particulars. La direcció apareix com a «Direcció EAP».

## Mapa 3D (octubre de 2026)

- **Botó 3D/2D** a la capçalera (el mode es desa a l'enllaç amb `m=2d`). Per defecte, 3D.
- **Edificis 3D**: capa `building` d'OpenFreeMap amb `fill-extrusion` i `render_height`. A Salt hi ha alçades variades (de 4 a 55 m a la mostra comprovada); quan OSM no té alçada ni plantes, l'esquema OpenMapTiles hi posa ≈5 m per defecte, i la llegenda ho diu. En taronja, els edificis que allotgen algun actor (només actors ubicats a portal o POI; els ubicats «a carrer» no il·luminen cap edifici).
- **Columnes d'actors**: un cilindre per actor, del color de l'esfera. Alçada = 10 m + 6 m per relació **documentada** i funcional (les hipòtesis no compten). Una columna de 10 m vol dir cap relació documentada, no un zero desconegut. Els actors no verificats són semitransparents i tenen una vora blava discontínua. Els actors que comparteixen adreça es reparteixen en un anell de 20-40 m. CAP Salt 1 i CAP Salt 2 apareixen com a fites vermelles.
- **IST 3D**: extrusió de les seccions; alçada = 7 m × (110 − IST), és a dir, com més alta, més vulnerable. Es manté el color. Les seccions sense dada no s'aixequen.
- **Arcs 3D** (deck.gl 9.4 `PathLayer` + `PathStyleExtension`, vendoritzat a `lib/deck.gl.min.js`, llicència MIT): a «Qui fa xarxa al Tercer Sector?», com a capa opcional a «On són els actors comunitaris?» i per a les relacions de l'actor que té la fitxa oberta. Gris = forta o feble, vermell = conflicte, blau discontinu = hipòtesi. S'han fet arcs propis amb `PathLayer` en comptes d'`ArcLayer` perquè l'`ArcLayer` no admet traç discontinu i el blau discontinu queda reservat a les hipòtesis.
- **Vols de càmera** (`flyTo` amb pitch i bearing) en canviar de vista i en obrir una fitxa. El hash `c=lon,lat,zoom,pitch,bearing` restaura la càmera. Amb `prefers-reduced-motion`, la càmera salta sense animació.
- **Mode presentació** (▶): recorre les vistes del mapa cada 7 s. S'atura amb qualsevol clic.
- **Mapa base opcional**: ortofoto de l'ICGC (WMTS `icc_mapesmultibase/noutm/wmts/orto/GRID3857`) i ombrejat del relleu de l'ICGC (`icgc_ombres_muntanya/noutm/wmts/ombres_tclar`, fins a z14). Salt és pla: l'ombrejat hi aporta poc.
- **Es mantenen en 2D**: «Quina zona cobreix cada CAP?» (hipòtesi de proximitat), «Qui queda lluny d'un CAP?», el sociograma de xarxa i les llistes.
- **Mòbil** (≤ 760 px o ≤ 4 nuclis): pitch màxim de 40°, sense edificis 3D, columnes i arcs amb menys vèrtexs.
- **Prova**: `python3 -m http.server 8765` i `python3 scripts/test_3d.py` (Chromium headless amb SwiftShader). Captures a `captures/3d_*.png`.

