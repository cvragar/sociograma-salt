"""Regenera el resum oficial a partir de les taules transcrites i verificades.

Executar des de qualsevol directori: python3 scripts/build_observatori.py
No consulta la xarxa ni modifica el catàleg d'actors o les relacions.
"""
import json
from pathlib import Path
from urllib.parse import quote
from csv_safety import write_spreadsheet_csv

ROOT = Path(__file__).resolve().parents[1]
raw = json.loads((ROOT / 'data/observatori-fonts.json').read_text())
src = raw['sources']
ind = []
for m in raw['metrics2025']:
    ident = m['id']
    featured = ident in ('population', 'age_0_15', 'age_65_plus', 'foreign_born')
    percent_main = featured and ident != 'population'
    group = 'Població i diversitat' if ident in ('population', 'age_0_15', 'age_16_64', 'age_65_plus', 'foreign_born', 'foreign_nationality', 'birth_countries') else 'Llars i densitat'
    note = m.get('note', '')
    if 'percent' in m:
        count = f"{m['value']:,}".replace(',', '.')
        pc = str(m['percent']).replace('.', ',')
        note = (f"{count} {m['unit']}; {pc}% de {m['denominator']}. " + note).strip()
    if ident == 'foreign_born': note += ' País de naixement, no nacionalitat ni situació administrativa.'
    if ident == 'foreign_nationality': note += ' Nacionalitat i país de naixement són variables diferents; no se sumen.'
    if ident.startswith('single_households'): note += ' Viure sol no mesura soledat no volguda.'
    url = src[m['source']]
    if m.get('variant'): url += '#municipi/Municipi/' + quote(m['variant']) + '/anual'
    definition = m.get('definition', m['label'])
    ind.append(dict(id=ident, nom=m['label'], valor=m['percent'] if percent_main else m['value'], unitat='%' if percent_main else m['unit'], any=2025, grup=group, font=raw['primarySource'] + ' · Observatori de Salt', url=url, definicio=definition, nota=note.strip(), destacat=featured))

for i, b in enumerate(raw['neighborhoods2025']):
    ind.append(dict(id=f'barri_{i}', nom=b['label'], valor=b['population'], unitat='habitants', any=2025, grup='Població per barri', font=raw['primarySource'] + ' · Observatori de Salt', url=src['neighborhoods'], definicio='Població empadronada al barri; no és una zona de cobertura de CAP.', nota=f"{str(b['percent']).replace('.', ',')}% de la població municipal. " + b.get('note', '')))

housing_url = 'https://observatori.salt.cat/indicadors/territori/habitatge/habitatges-amb-persones-empadronades/'
housing_note = "Es reprodueixen els recomptes. Els percentatges publicats no concorden amb aquests recomptes i la font mostra un total del 101%; per això no es reutilitzen. Sense padró no acredita que un habitatge estigui buit."
for ident, nom, count in [('habitatges_padro', 'Habitatges amb persones empadronades', 10526), ('habitatges_sense_padro', 'Habitatges sense persones empadronades', 1098), ('habitatges_total', 'Total d’habitatges de la taula de padró', 11624)]:
    ind.append(dict(id=ident, nom=nom, valor=count, unitat='habitatges', any=2025, grup='Habitatge', font='Àrea de Territori, Ajuntament de Salt · Observatori de Salt', url=housing_url, definicio='Habitatges amb o sense persones empadronades, segons la taula municipal.', nota=housing_note))

out = {
 'metadades': {
  'titol': 'Què ens diuen les dades oficials?', 'consultat': '2026-10-17', 'ambit': 'Municipi de Salt',
  'nota': "Últim any disponible a les taules seleccionades: 2025. Són dades municipals, no població assignada als CAP Salt 1 i Salt 2 ni del conjunt de l’EAP. Els barris no equivalen a seccions censals ni a zones de CAP. Temporalitat anual; la fitxa no especifica el dia de tall. La distribució per barris inclou 2025 encara que el títol de la pàgina digui 2000–2024.",
  'licencia': {'nom': 'Ajuntament de Salt · Observatori · CC BY-NC-SA 3.0 ES (llicència indicada al portal)', 'url': 'https://creativecommons.org/licenses/by-nc-sa/3.0/es/deed.ca'}
 },
 'indicadors': ind,
 'oportunitats': [
  {'titol': 'Infància i famílies', 'text': '6.455 habitants de 0 a 15 anys. Proposta a validar amb la Comissió: planificar activitats amb escoles, SOAF i entitats de famílies; contrastar la participació real i les necessitats amb les famílies.', 'vista': 'educatiu', 'actors': ['S04', 'E02', 'SS03', 'T02']},
  {'titol': 'Acollida i participació', 'text': 'El 46,4% ha nascut a l’estranger; el 36,7% té nacionalitat estrangera. Proposta: acordar canals de participació amb Acollida i mediació. Aquestes dades no identifiquen llengües, creences, barreres individuals ni necessitats assistencials.', 'vista': 'diversitat', 'actors': ['SS10', 'SS26', 'T03']},
  {'titol': 'Envelliment i xarxes de suport', 'text': '4.800 persones de 65 anys i més i 360 llars unipersonals al grup literal «Més de 80 anys». Proposta: explorar amb Gent Gran i la Taula de Soledat la participació en activitats i el suport social. Viure sol no implica soledat no volguda.', 'vista': 'tercer', 'actors': ['SS02', 'SS29', 'G02', 'T01']},
  {'titol': 'Activitats de proximitat als barris', 'text': 'Centre té 12.261 habitants i Veïnat, 9.142. Proposta: contrastar equipaments, accessibilitat i participació en aquests barris i en la resta del municipi abans de distribuir activitats. La població i el padró d’habitatges no mesuren per si sols vulnerabilitat ni cobertura dels CAP.', 'vista': 'actors', 'actors': ['C01', 'SS01', 'SS14', 'S04']}
 ]
}

# Coherència substantiva: població per edat, barris i llars; referències d'actors.
metrics = {m['id']: m for m in raw['metrics2025']}
population = metrics['population']['value']
assert sum(metrics[k]['value'] for k in ('age_0_15', 'age_16_64', 'age_65_plus')) == population
assert sum(b['population'] for b in raw['neighborhoods2025']) == population
assert sum(h['value'] for h in raw['singleHouseholdsByAge2025']) == metrics['single_households']['value']
assert 10526 + 1098 == 11624
actor_ids = {a['id'] for a in json.loads((ROOT/'data/actors.json').read_text())}
assert all(a in actor_ids for o in out['oportunitats'] for a in o['actors'])
assert len({m['id'] for m in ind}) == len(ind)

serialized = json.dumps(out, ensure_ascii=False, indent=2)
(ROOT/'data/observatori.json').write_text(serialized + '\n')
(ROOT/'data/observatori.js').write_text('window.OBSERVATORI = ' + serialized + ';\n')
(ROOT/'descarregues').mkdir(exist_ok=True)
cols = ['id', 'nom', 'valor', 'unitat', 'any', 'grup', 'font', 'url', 'definicio', 'nota', 'ambit', 'consultat']
write_spreadsheet_csv(ROOT/'descarregues/observatori_salt_2025.csv', cols,
    (dict(row, ambit=out['metadades']['ambit'], consultat=out['metadades']['consultat']) for row in ind))
print(f"{len(ind)} indicadors verificats; {len(out['oportunitats'])} propostes enllaçades; dades generades.")
