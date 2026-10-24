"""Build the complete Observatori catalogue from preserved official source tables.

No network access. Source headers, rows, labels and missing-value markers are
retained verbatim. The existing 23 highlights remain in observatori.json.
Run: python3 scripts/build_observatori_catalog.py
"""
from __future__ import annotations

import argparse
import copy
import hashlib
import json
import re
import zipfile
from collections import Counter
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.parse import urlparse
from csv_safety import write_spreadsheet_csv

ROOT = Path(__file__).resolve().parents[1]
EXPECTED_FICHES = 87
MISSING = {'', '-', '–', '—', '..', '...', '…', 'nd', 'n.d.', 'sd', 's.d.',
           'n/a', 'na', 'null', 'sense dada', 'sense dades', 'no disponible'}
LONG_COLUMNS = ['fitxa_id', 'titol', 'categoria', 'subcategoria', 'ambit',
                'variant', 'temporalitat', 'taula', 'fila', 'columna',
                'etiqueta_fila', 'etiqueta_columna', 'any', 'valor_text',
                'valor_num', 'estat_valor', 'unitat', 'font', 'url', 'consultat', 'nota_variant', 'nota_fitxa']
COVERAGE_COLUMNS = ['fitxa_id', 'titol', 'categoria', 'subcategoria', 'estat',
                    'variants', 'taules', 'files', 'celles', 'anys',
                    'font', 'url', 'consultat', 'notes']


def text(value):
    return '' if value is None else str(value)


def parse_number(value, number_format='catala'):
    """Return a conservative numeric interpretation; never fill a blank with 0.

    The portal uses Catalan number formatting. Comma decimals, grouped thousands
    and a literal percent/euro suffix are recognized. Inequalities, ranges,
    suppression symbols and text are retained without inventing a number.
    """
    raw = text(value).strip()
    if raw.lower() in MISSING:
        return None, 'missing'
    s = raw.replace('\u00a0', '').replace('\u202f', '').replace(' ', '')
    s = re.sub(r'[%€]$', '', s).replace('−', '-')
    if not re.fullmatch(r'[+-]?\d+(?:[.,]\d+)*', s):
        return None, 'text'
    if ',' in s:
        # Comma is decimal; dots may only group thousands.
        if s.count(',') != 1:
            return None, 'text'
        integral, decimal = s.split(',')
        if '.' in integral and not re.fullmatch(r'[+-]?\d{1,3}(?:\.\d{3})+', integral):
            return None, 'text'
        s = integral.replace('.', '') + '.' + decimal
    elif '.' in s and number_format != 'decimal-punt':
        if re.fullmatch(r'[+-]?\d{1,3}(?:\.\d{3})+', s):
            s = s.replace('.', '')
        elif s.count('.') != 1:
            return None, 'text'
    try:
        number = Decimal(s)
    except InvalidOperation:
        return None, 'text'
    if not number.is_finite():
        return None, 'text'
    return int(number) if number == number.to_integral_value() else float(number), 'number'


def read_fiches(raw_dir):
    fiches, inputs = [], []
    for path in sorted(raw_dir.glob('*.json')):
        payload = json.loads(path.read_text(encoding='utf-8'))
        if isinstance(payload, list):
            batch = payload
        elif isinstance(payload, dict) and ('fitxes' in payload or 'fiches' in payload):
            batch = payload.get('fitxes', payload.get('fiches'))
        elif isinstance(payload, dict) and 'id' in payload:
            batch = [payload]
        else:
            raise ValueError(f'{path}: expected fiche, list or object with fiches/fitxes')
        if not isinstance(batch, list):
            raise ValueError(f'{path}: fiches must be a list')
        fiches.extend(copy.deepcopy(batch))
        inputs.append({'fitxer': str(path.relative_to(ROOT)) if path.is_relative_to(ROOT) else path.name,
                       'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                       'fitxes': len(batch)})
    return fiches, inputs


def normalize_table(table, fallback_unit=''):
    headers, rows = table.get('headers', []), table.get('rows', [])
    if not isinstance(headers, list) or not isinstance(rows, list):
        raise ValueError('headers and rows must be lists')
    if any(not isinstance(row, list) for row in rows):
        raise ValueError('each table row must be a list')
    header_rows = headers if headers and isinstance(headers[0], list) else [headers]
    if any(not isinstance(row, list) for row in header_rows):
        raise ValueError('mixed flat and nested headers')
    width = max([len(row) for row in header_rows + rows] or [0])
    columns, years, units = [], [], []
    for column in range(width):
        levels = [text(row[column]) for row in header_rows if column < len(row)]
        nonempty = list(dict.fromkeys(v for v in levels if v.strip()))
        columns.append(' · '.join(nonempty))
        candidates = [int(v.strip()) for v in levels if re.fullmatch(r'(?:18|19|20|21)\d{2}', v.strip())]
        years.append(candidates[0] if candidates and len(set(candidates)) == 1 else None)
        explicit_unit = '%' if any(v.strip() == '%' for v in levels) else ''
        units.append(explicit_unit or text(table.get('unitat', fallback_unit)) or None)
    table['columnes'], table['anys'], table['unitats'] = columns, years, units
    # Tables with a first row-label column are the portal's normal arrangement.
    # Explicit supplied labels take precedence; never drop a year-valued column.
    table['columna_etiqueta'] = table.get('columna_etiqueta', 0 if width > 1 and years[0] is None else None)
    return table


def cells(fiche):
    """Yield source data cells, preserving source row/column positions (0-based)."""
    for variant in fiche['variants']:
        for ti, table in enumerate(variant.get('tables', [])):
            label_column = table['columna_etiqueta']
            for ri, row in enumerate(table['rows']):
                row_label = text(row[label_column]) if label_column is not None and label_column < len(row) else ''
                for ci, value in enumerate(row):
                    if ci == label_column:
                        continue
                    number, state = parse_number(value, table.get('format_numeric', 'catala'))
                    yield {
                        'fitxa_id': fiche['id'], 'titol': fiche['titol'],
                        'categoria': fiche['categoria'], 'subcategoria': fiche.get('subcategoria', ''),
                        'ambit': variant.get('ambit', ''), 'variant': variant.get('variant', ''),
                        'temporalitat': variant.get('temporalitat', ''), 'taula': ti,
                        'fila': ri, 'columna': ci, 'etiqueta_fila': row_label,
                        'etiqueta_columna': table['columnes'][ci],
                        'any': table['anys'][ci], 'valor_text': text(value),
                        'valor_num': number, 'estat_valor': state,
                        'unitat': table['unitats'][ci] or ('%' if text(value).strip().endswith('%') else ''),
                        'font': fiche.get('font', ''), 'url': variant.get('url') or fiche['url'],
                        'consultat': fiche['consultat'],
                        'nota_variant': ' | '.join(variant.get('notes', [])),
                        'nota_fitxa': ' | '.join(fiche.get('notes', [])),
                    }


def normalize(fiches, inputs, expected=EXPECTED_FICHES, allow_partial=False):
    if not fiches:
        raise ValueError('No captured fiches found')
    if not allow_partial and len(fiches) != expected:
        raise ValueError(f'Expected {expected} fiches; found {len(fiches)}. Use --allow-partial only for development.')
    ids, urls = set(), set()
    for fiche in fiches:
        for key in ('id', 'titol', 'categoria', 'url', 'consultat'):
            if not fiche.get(key):
                raise ValueError(f'Missing {key}: {fiche.get("id", "unknown")}')
        if fiche['id'] in ids or fiche['url'].rstrip('/') in urls:
            raise ValueError(f'Duplicate fiche: {fiche["id"]}')
        ids.add(fiche['id']); urls.add(fiche['url'].rstrip('/'))
        if urlparse(fiche['url']).hostname != 'observatori.salt.cat':
            raise ValueError(f'Unexpected source domain: {fiche["url"]}')
        if fiche['categoria'] not in ('demografia', 'medi-ambient', 'territori'):
            raise ValueError(f'Unknown category: {fiche["categoria"]}')
        fiche.setdefault('variants', [])
        fiche.setdefault('notes', [])
        if isinstance(fiche['notes'], str):
            fiche['notes'] = [fiche['notes']]
        seen_variants = set()
        for variant in fiche['variants']:
            key = (variant.get('hash', ''), variant.get('ambit', ''),
                   variant.get('variant', ''), variant.get('temporalitat', ''))
            if key in seen_variants:
                raise ValueError(f'Duplicate variant in {fiche["id"]}: {key}')
            seen_variants.add(key)
            for table in variant.get('tables', []):
                normalize_table(table, variant.get('unitat', fiche.get('unitat', '')))
        tables = [t for v in fiche['variants'] for t in v.get('tables', [])]
        has_data = any(t.get('rows') for t in tables)
        status = fiche.get('estat')
        if status and status not in ('disponible', 'sense_taula'):
            raise ValueError(f'Unknown status {status}: {fiche["id"]}')
        if status == 'disponible' and not has_data:
            raise ValueError(f'Fiche marked available but has no table: {fiche["id"]}')
        if status == 'sense_taula' and has_data:
            raise ValueError(f'Fiche marked without table but contains data: {fiche["id"]}')
        fiche['estat'] = 'disponible' if has_data else 'sense_taula'
        fiche['cobertura'] = {
            'variants': len(fiche['variants']), 'taules': len(tables),
            'files': sum(len(t.get('rows', [])) for t in tables),
            'celles': sum(1 for _ in cells(fiche)),
            'anys': sorted({y for t in tables for y in t['anys'] if y is not None}, reverse=True),
        }
    fiches.sort(key=lambda f: (f['categoria'], f.get('subcategoria', ''), f['titol'], f['id']))
    dates = sorted({f['consultat'] for f in fiches})
    metadata = {
        'versio': 1, 'titol': 'Catàleg complet de l’Observatori de Salt',
        'consultat': dates[-1], 'dates_consulta': dates,
        'total_fitxes': len(fiches), 'fitxes_esperades': expected,
        'captura_completa': len(fiches) == expected,
        'fitxes_amb_dades': sum(f['estat'] == 'disponible' for f in fiches),
        'fitxes_sense_taula': sum(f['estat'] == 'sense_taula' for f in fiches),
        'total_variants': sum(f['cobertura']['variants'] for f in fiches),
        'total_taules': sum(f['cobertura']['taules'] for f in fiches),
        'total_celles': sum(f['cobertura']['celles'] for f in fiches),
        'anys': sorted({y for f in fiches for y in f['cobertura']['anys']}, reverse=True),
        'categories': dict(sorted(Counter(f['categoria'] for f in fiches).items())),
        'font': 'Ajuntament de Salt · Observatori de Salt', 'url': 'https://observatori.salt.cat/',
        'nota': 'Captura de les fitxes i taules consultables. Les cel·les i marcadors de manca de dada es conserven literalment. Una fitxa sense taula no equival a zero. L’àmbit de cada variant es conserva: municipi, barri o altre àmbit no equivalen a població assignada als CAP.',
        'descarregues': {'json': 'descarregues/observatori_cataleg_complet.json',
                        'csv': 'descarregues/observatori_dades_completes.zip',
                        'fonts': 'descarregues/observatori_fonts_originals.zip',
                        'cobertura': 'descarregues/observatori_cobertura.csv'},
        'fitxers_origen': inputs,
    }
    return {'metadades': metadata, 'fitxes': fiches}


def write_csv(path, fieldnames, rows):
    write_spreadsheet_csv(path, fieldnames, rows)


def write_outputs(catalog, root=ROOT):
    data, downloads = root / 'data', root / 'descarregues'
    data.mkdir(exist_ok=True, parents=True); downloads.mkdir(exist_ok=True, parents=True)
    serialized = json.dumps(catalog, ensure_ascii=False, separators=(',', ':')) + '\n'
    (data / 'observatori-cataleg.json').write_text(serialized, encoding='utf-8')
    (data / 'observatori-cataleg.js').write_text('window.OBSERVATORI_CATALEG = ' + serialized.rstrip() + ';\n', encoding='utf-8')
    (downloads / 'observatori_cataleg_complet.json').write_text(serialized, encoding='utf-8')
    write_csv(downloads / 'observatori_dades_completes.csv', LONG_COLUMNS,
              (c for f in catalog['fitxes'] for c in cells(f)))
    with zipfile.ZipFile(downloads / 'observatori_dades_completes.zip', 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        entry = zipfile.ZipInfo('observatori_dades_completes.csv')
        entry.compress_type = zipfile.ZIP_DEFLATED
        archive.writestr(entry, (downloads / 'observatori_dades_completes.csv').read_bytes(), compress_type=zipfile.ZIP_DEFLATED, compresslevel=9)
    write_csv(downloads / 'observatori_cobertura.csv', COVERAGE_COLUMNS,
              (dict(f, fitxa_id=f['id'], **{k: v for k, v in f['cobertura'].items() if k != 'anys'},
                    anys='; '.join(map(str, f['cobertura']['anys'])), notes=' | '.join(f['notes']))
               for f in catalog['fitxes']))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--raw-dir', type=Path, default=ROOT / 'data/observatori-raw')
    parser.add_argument('--expected', type=int, default=EXPECTED_FICHES)
    parser.add_argument('--allow-partial', action='store_true')
    args = parser.parse_args()
    fiches, inputs = read_fiches(args.raw_dir)
    catalog = normalize(fiches, inputs, args.expected, args.allow_partial)
    write_outputs(catalog)
    print(json.dumps({k: v for k, v in catalog['metadades'].items() if k.startswith(('total_', 'fitxes_')) or k == 'captura_completa'}, ensure_ascii=False))


if __name__ == '__main__':
    main()
