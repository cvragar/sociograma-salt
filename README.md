# Visor del sociograma comunitari · CAP Salt 1 i Salt 2 (2026)

Visor web estàtic (sense backend) del sociograma comunitari del territori dels CAP Salt 1 i Salt 2 (EAP Salt, ICS Girona, ABS 199), segons el mètode Alberich. Queden fora els pobles d'Aiguaviva, Bescanó (amb Estanyol i Vilanna), Fornells de la Selva i Vilablareix. L'estil s'inspira en Xamfrà: un calaix de vistes, cadascuna formulada com una pregunta, i una llegenda per vista amb la font, l'any i el mètode.

## Correccions de seguretat · 24/10/2026

El visor continua sent públic i no requereix compte ni inici de sessió. Aquesta
revisió resol les tres troballes de l'anàlisi Codex Security sobre el commit
`9747499a9b94dde464261901cab3cdea0d535dc7`:

- **Atribució del mapa:** les dues entrades web mostren crèdits locals amb text i
  enllaços fixos. No incorporen com a HTML les atribucions rebudes de l'estil o
  del TileJSON extern. Es mantenen els crèdits d'OpenStreetMap, OpenMapTiles,
  OpenFreeMap, INE, Idescat i ICGC.
- **CSV per a fulls de càlcul:** els exportadors del navegador i els generadors
  Python comparteixen la mateixa política. Les cel·les de text amb prefixos de
  fórmula reben un apòstrof protector, també si hi ha espais o controls al davant.
  Els nombres negatius complets es conserven sense arrodonir. Això també pot
  afegir un apòstrof a marcadors com `-`; no els converteix en zeros ni en nombres.
  El JSON i les fonts originals conserven literalment els valors de la captura.
- **Importació de fonts:** abans de descomprimir, s'exigeixen els 87 membres JSON
  de la captura, amb noms plans i únics, i es comproven mida, recompte i ràtio de
  compressió. La lectura real i l'estructura JSON tenen pressupostos limitats.
  Els mateixos límits de dades s'apliquen a la importació des d'un directori.

Proves de regressió, sense dependències noves:

```bash
node scripts/test_map_security.js
python3 scripts/test_csv_security.py
python3 scripts/test_import_security.py
python3 scripts/build_observatori_catalog.py
python3 scripts/test_observatori_catalog.py
```

L'informe original queda referit a la versió analitzada; aquestes proves locals
verifiquen les correccions i la conservació de les dades, però no són un nou
escaneig complet de Codex Security.

## Actualització de l’Observatori de Salt · 17/10/2026

La vista **Què ens diuen les dades oficials?** (`#v=observatori`) reuneix un resum de **23 indicadors seleccionats de 2025** i un explorador de les fitxes de l’[Observatori de Salt](https://observatori.salt.cat/): demografia, medi ambient i territori. El catàleg permet cercar, filtrar per tema i disponibilitat, escollir la variant territorial o estadística i consultar l’últim any o la sèrie recollida. Les xifres efectives de cobertura es calculen des de les dades capturades i consten al visor, al JSON i al CSV de cobertura; no es pressuposa que cada fitxa publiqui una taula.

El resum inclou població per edat, naixement i nacionalitat, llars, densitat, població per barris i habitatges amb/sense empadronament. Manté el mapa i la xarxa originals i connecta quatre propostes de planificació amb 14 actors ja existents. Les propostes són orientacions a validar, no conclusions publicades per l’Observatori. El catàleg és una captura datada, sense actualització automàtica en temps real.

La captura de 17/10/2026 comprèn les **87 fitxes** de l’inventari (53 de demografia, 20 de medi ambient i 14 de territori), **798 variants** i **590.469 cel·les**. Hi ha 86 fitxes amb taules i una sense dades: «Evolució de la població 2000–2025». Els anys representats al conjunt van de 1857 a 2025; aquest interval no implica una sèrie contínua a cada indicador. Es conserven les 210 notes originals associades a variants.

- Àmbit: municipi de Salt. No representa la població assignada als dos CAP ni la de tot l’EAP; barris, seccions censals i zones de CAP no són intercanviables.
- Any del resum seleccionat: 2025; consulta: 17/10/2026. Les fitxes del catàleg conserven el seu propi període i periodicitat. La font demogràfica indica periodicitat anual, sense data exacta de tall visible. El títol de la pàgina de barris conserva «2000–2024», però la taula ja inclou 2025.
- Naixement a l’estranger i nacionalitat estrangera són variables diferents. Viure sol no acredita soledat no volguda. Els 90 països corresponen al naixement a l’estranger, no a nacionalitats.
- Habitatge: el resum reprodueix els recomptes 10.526 amb padró, 1.098 sense padró i 11.624 totals i omet els percentatges inconsistents (91,1%, 9,5% i total mostrat de 101%). La taula original del catàleg conserva els valors publicats amb l’advertiment corresponent. No s’equipara «sense padró» amb habitatge buit.
- Els PDF/DOCX anteriors es conserven com a documents base. Els documents d’actualització de l’Observatori s’identifiquen amb la data 17/10/2026; no substitueixen les fonts originals.
- Atribució: Ajuntament de Salt, Observatori de Salt; Padró Municipal d’Habitants i Àrea de Territori. El portal indica [CC BY-NC-SA 3.0 ES](https://creativecommons.org/licenses/by-nc-sa/3.0/es/deed.ca).

Fitxers del resum:
- `data/observatori-fonts.json`: transcripció de les taules demogràfiques consultades, amb sèries i URLs.
- `data/observatori.json` i `data/observatori.js`: dades publicades, independents del bundle d’actors.
- `descarregues/observatori_salt_2025.csv`: exportació dels 23 indicadors seleccionats, amb fonts i dates.
- `scripts/build_observatori.py`: regenera els fitxers amb Python estàndard. Comprova les sumes d’edats, barris i llars, i l’existència dels actors enllaçats. Executar `python3 scripts/build_observatori.py`.

### Catàleg, sèries i cobertura

- `data/observatori-raw/api-complet.json`: importació de les respostes de l’API pública que utilitza el mateix portal. Es mantenen les etiquetes, capçaleres, cel·les i notes originals, inclosos els marcadors d’absència de dades. També conserva `rawdata` i les configuracions originals dels gràfics i mapes.
- `data/observatori-cataleg.json` i `data/observatori-cataleg.js`: catàleg del visor, independent del resum i del conjunt d’actors. Les propietats `columnes`, `anys`, `unitats` i `columna_etiqueta` descriuen les taules sense modificar `headers` ni `rows`.
- `descarregues/observatori_cataleg_complet.json`: còpia íntegra descarregable del catàleg.
- `descarregues/observatori_dades_completes.zip`: CSV complet comprimit. Cada registre identifica fitxa, àmbit, variant, taula, fila, columna, any, text original, interpretació numèrica, unitat i font. Els índexs de taula, fila i columna comencen a zero. Les absències no es converteixen en zero; desigualtats i altres textos conserven el text sense valor numèric inventat.
- `descarregues/observatori_cobertura.csv`: disponibilitat, nombre de variants i taules, cel·les, períodes, fonts i notes per fitxa. Una fitxa sense taula es conserva amb la seva definició i no representa un valor zero.
- `descarregues/observatori_fonts_originals.zip`: les 87 respostes originals de l’API, amb URL de la fitxa i de l’API. Permet reproduir la importació sense tornar a consultar la xarxa.
- El botó **CSV filtrat** exporta totes les variants i anys de les fitxes que compleixen els filtres del catàleg. El botó de la fitxa exporta la variant i el període visibles. Els filtres, la fitxa, la variant i l’opció d’anys es conserven a l’enllaç compartit.

Regeneració i comprovació (Python estàndard, sense connexió de xarxa):

```bash
python3 scripts/import_observatori_api.py --api-zip descarregues/observatori_fonts_originals.zip
python3 scripts/build_observatori_catalog.py
python3 scripts/test_observatori_catalog.py
```

L’importador interpreta els marcadors estructurals `anys`, `columnes` i `dades` del CSV intern de l’API i elimina només el marcador de registre i el separador final. Les columnes repetides d’any es mantenen alineades amb les subcolumnes, com ara nombre i percentatge o dones i homes. El filtre de sèries dels gràfics originals no elimina cap dada de l’exportació. La notació numèrica original de l’API fa servir el punt decimal: per exemple, `2.770` és 2,77, no 2.770 unitats; `format_numeric` ho declara explícitament.

Les notes originals són necessàries per interpretar els valors. Per exemple, algunes sèries del barri del Pla codifiquen amb zero els anys 2000–2006 tot i indicar expressament que no hi ha dades per a aquest període. Es conserva el valor literal juntament amb la nota, també a la columna `nota_variant` del CSV, sense considerar-lo una observació demogràfica vàlida.

Les advertències de revisió s’inclouen també a `nota_fitxa`: percentatges d’habitatge incoherents, discrepàncies dels totals de població i del lloc de naixement entre variants de «Naturalesa dels habitants», i una fórmula inversa al títol de «Nombre d’arbres per habitant». No es corregeixen les xifres publicades ni es calculen nous indicadors a partir dels valors discrepants.

El generador exigeix les 87 fitxes de l’inventari del portal; el recompte no implica que totes tinguin valors publicats. Rebutja identificadors duplicats i estats de disponibilitat incompatibles amb les taules. La comprovació contrasta la captura amb el catàleg, el CSV, el ZIP i el JavaScript, inclosa la preservació dels zeros i dels valors absents. `--allow-partial` és una opció de desenvolupament i no acredita una captura completa.

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
1. Observatori: resum, catàleg temàtic, variants, sèries recollides, cobertura i descàrregues.
2. On són els actors comunitaris? Filtre per esfera.
3. Quins actors de salut hi ha? Les 14 farmàcies consten com a actor agregat, sense ubicació individual.
4. Qui fa xarxa al Tercer Sector? Inclou les línies de relació.
5. Quins són els actors educatius? El test BULL-S apareix «a validar», sense ubicació.
6. On són els actors de diversitat i culte?
7. Quina és la vulnerabilitat de cada secció censal? Valors IST 2023 de l'Idescat sobre els límits del seccionat censal 2023 de l'INE. Etiqueta: «context de la secció, no de l'actor».
8. Quina zona cobreix cada CAP? **Hipòtesi · no oficial**: mediatriu entre els dos CAP.
9. Qui queda lluny d'un CAP? Distància en línia recta, no temps a peu.
10. Com es relacionen? Xarxa Cytoscape amb franges per nivell (polític, tècnic, social), formes Alberich i filtres per esfera i nivell. Les línies indiquen relació forta, feble, conflicte o indirecta; les hipòtesis són blaves i discontínues. Inclou anàlisi de ponts, buits i bloquejos.
11. Què cal validar amb l'equip? 20 preguntes, les 56 relacions hipòtesi i els actors no verificats. El CSV d'aquesta vista inclou columnes buides per omplir a la sessió.

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
- El conjunt conté 259 nodes: 256 actors i 3 agregadors (E00, MG00 i R00). Hi ha 120 nodes amb coordenades i 139 sense coordenades; aquests últims no es pinten al mapa, però apareixen al catàleg d’actors i a la xarxa.
- Les 478 relacions inclouen 422 documentades i 56 hipòtesis; 378 són funcionals i 100 estructurals. Els agregadors i les relacions estructurals ajuden a organitzar la xarxa, però no equivalen a actors o activitats addicionals.
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

