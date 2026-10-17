"""Import all public API responses used by the Observatori's own website.

The API rawdata format is semicolon-separated: anys = column labels,
columnes = optional second header, dades = row label + original cells.
Only the structural record tag and final separator are removed. No numeric
cell is reformatted, filtered by the chart configuration, or filled with zero.

Input: tmp/api/fitxes/*.json, or --api-zip descarregues/observatori_fonts_originals.zip
Output: data/observatori-raw/api-complet.json (the input to build_observatori_catalog.py).
"""
import argparse
import csv
import hashlib
import io
import json
import re
import zipfile
from pathlib import Path
from urllib.parse import quote, urlparse

from build_observatori_catalog import ROOT, EXPECTED_FICHES


def parse_rawdata(raw, title):
    records = [row for row in csv.reader(io.StringIO(raw), delimiter=';') if row]
    if not records:
        return []
    if any(row[0] not in ('anys', 'columnes', 'dades') for row in records):
        raise ValueError(f'Unknown rawdata marker in {title}')
    if sum(row[0] == 'anys' for row in records) != 1:
        raise ValueError(f'Expected one primary header in {title}')
    if len({len(row) for row in records}) != 1:
        raise ValueError(f'Misaligned rawdata columns in {title}')
    # Every current API record ends in a semicolon. This empty field is a
    # structural terminator; real empty data cells preceding it are retained.
    has_terminator = all(row[-1] == '' for row in records)
    contents = [(row[0], row[1:-1] if has_terminator else row[1:]) for row in records]
    headers = [row for tag, row in contents if tag in ('anys', 'columnes')]
    rows = [row for tag, row in contents if tag == 'dades']
    return [{'titol': title, 'headers': headers, 'rows': rows,
             'columna_etiqueta': 0, 'format_numeric': 'decimal-punt'}]


def convert(wrapper, consulted):
    source_url, api_url, source = wrapper['source_url'], wrapper['api_url'], wrapper['data']
    path = urlparse(source_url).path.strip('/').split('/')
    if len(path) != 4 or path[0] != 'indicadors':
        raise ValueError(f'Unexpected fiche URL: {source_url}')
    ident, category = path[-1], path[1]
    subgroup = source.get('subgrup') or {}
    fiche = {
        'id': ident, 'titol': source['nom'], 'categoria': category,
        'subcategoria': subgroup.get('nom', path[2]),
        'subcategoria_codi': path[2], 'url': source_url,
        'definicio': source.get('descripcio', ''), 'font': source.get('font', ''),
        'calcul': source.get('calcul', ''), 'consultat': consulted,
        'notes': [], 'variants': [],
        'origen': {'metode': 'API pública utilitzada pel portal oficial',
                   'api_url': api_url, 'codi': source.get('codi'),
                   'subgrup': subgroup},
    }
    for index, variant in enumerate(source.get('dades', [])):
        area = variant['ambit_territorial']
        raw = variant.get('rawdata') or ''
        original_variant = variant.get('variant')
        # The official router maps a null variant to the literal key
        # "Sense dades"; this is a routing label, not a missing-data status.
        route = '/'.join(quote(str(x), safe='') for x in (
            area['univers'], area['nom'], original_variant or 'Sense dades', variant['periode']))
        note = variant.get('nota') or ''
        record = {
            'hash': route, 'url': source_url + '#' + route,
            'ambit': area['nom'], 'ambit_codi': area['codi'],
            'univers': area['univers'], 'variant': original_variant or '',
            'variant_original': original_variant, 'sexe': variant.get('sexe'),
            'temporalitat': variant['periode'], 'notes': [note] if note else [],
            'tables': parse_rawdata(raw, source['nom']),
            'api_registre': index, 'rawdata': raw,
            'rawdata_sha256': hashlib.sha256(raw.encode('utf-8')).hexdigest(),
            'ambit_territorial': area,
            'config_grafic': variant.get('config_grafic', ''),
            'config_mapa': variant.get('config_mapa', ''),
        }
        fiche['variants'].append(record)
    with_tables = any(t['rows'] for v in fiche['variants'] for t in v['tables'])
    fiche['estat'] = 'disponible' if with_tables else 'sense_taula'
    municipal = [v for v in fiche['variants'] if v['ambit_codi'] == 'municipi']
    default = next((v for v in municipal if not v['variant_original']), None)
    default = default or next((v for v in municipal if v['variant'].lower().startswith('total')), None)
    default = default or next(iter(municipal or fiche['variants']), None)
    fiche['variant_per_defecte'] = default['hash'] if default else ''
    if ident == 'habitatges-amb-persones-empadronades':
        fiche['notes'].append('Advertiment de revisió: els percentatges municipals de 2025 (91,1%, 9,5% i total 101%) no concorden amb els recomptes 10.526, 1.098 i 11.624. Es conserven literalment les dades originals. Sense padró no acredita que un habitatge estigui buit.')
    if ident == 'nombre-darbres-per-habitant':
        fiche['notes'].append('Advertiment de revisió: el títol i la fila de la taula expressen arbres per habitant, però la fórmula publicada indica «nombre total d’habitants / nombre total d’arbres», que és la relació inversa. Es conserven els valors i la definició originals; cal confirmar el sentit de la ràtio amb la font abans d’utilitzar-la.')
    if ident == 'naturalesa-dels-habitants':
        fiche['notes'].append('Advertiment de revisió: a la variant municipal «nacionalitzats», la fila TOTAL població indica 32.742 tant el 2023 com el 2024; les variants municipals «País naixement estranger» i «Nacionalitat estrangera» indiquen 33.440 i 34.079, respectivament. A més, la població nascuda a l’estranger el 2023 és 14.567 a «nacionalitzats» i 14.569 a «País naixement estranger» (diferència de 2). Es conserven les xifres originals sense reconciliar-les ni usar els totals discrepants per calcular indicadors nous.')
    if path[2] == 'dades-meteo':
        fiche['notes'].append('Nota temporal: la fitxa declara dades disponibles a partir de l’1/06/2016. Es conserven els anys efectivament publicats a cada taula; el 2016, quan hi apareix, és incomplet. La font indica l’estació de Plaça de la Vila per a 2016–2021 i l’observatori de Plaça Sant Cugat a partir de 2022. Cal tenir en compte el canvi d’estació en comparar la sèrie temporal.')
    return fiche


def load_wrappers(directory, archive):
    if archive:
        with zipfile.ZipFile(archive) as z:
            return [json.loads(z.read(name)) for name in sorted(z.namelist()) if name.endswith('.json') and not name.endswith('download-index.json')]
    return [json.loads(path.read_text(encoding='utf-8')) for path in sorted(directory.glob('*.json'))]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--api-dir', type=Path, default=ROOT / 'tmp/api/fitxes')
    parser.add_argument('--api-zip', type=Path)
    parser.add_argument('--consultat', default='2026-10-17')
    args = parser.parse_args()
    wrappers = load_wrappers(args.api_dir, args.api_zip)
    if len(wrappers) != EXPECTED_FICHES:
        raise ValueError(f'Expected {EXPECTED_FICHES} API files, got {len(wrappers)}')
    fiches = [convert(w, args.consultat) for w in wrappers]
    if len({f['id'] for f in fiches}) != EXPECTED_FICHES:
        raise ValueError('Duplicate fiche ids')
    target_dir = ROOT / 'data/observatori-raw'
    target_dir.mkdir(exist_ok=True, parents=True)
    others = [p for p in target_dir.glob('*.json') if p.name != 'api-complet.json']
    if others:
        raise ValueError('Other raw captures would duplicate the catalogue: ' + ', '.join(p.name for p in others))
    output = target_dir / 'api-complet.json'
    output.write_text(json.dumps({'fitxes': fiches}, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print(json.dumps({'fitxes': len(fiches), 'variants': sum(len(f['variants']) for f in fiches),
                      'taules': sum(len(v['tables']) for f in fiches for v in f['variants']),
                      'fitxer': str(output.relative_to(ROOT))}, ensure_ascii=False))


if __name__ == '__main__':
    main()
