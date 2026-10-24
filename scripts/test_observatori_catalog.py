"""Check coverage, exact source preservation and downloadable data integrity.

Run after build_observatori_catalog.py. --parser-only checks number semantics
without requiring the completed source capture.
"""
import argparse
import csv
import json
import io
import hashlib
import zipfile
from pathlib import Path

from build_observatori_catalog import ROOT, EXPECTED_FICHES, parse_number, read_fiches
from csv_safety import spreadsheet_cell


def test_number_semantics():
    cases = {
        '': (None, 'missing'), '—': (None, 'missing'), '..': (None, 'missing'),
        'n.d.': (None, 'missing'), 'Sense dades': (None, 'missing'),
        '0': (0, 'number'), '0,0': (0, 'number'), '0%': (0, 'number'),
        '6.455': (6455, 'number'), '35.106': (35106, 'number'),
        '5.311,7': (5311.7, 'number'), '3,32': (3.32, 'number'),
        '18,4%': (18.4, 'number'), '1\u00a0234,50': (1234.5, 'number'),
        '−2,5': (-2.5, 'number'), '101%': (101, 'number'),
        '<5': (None, 'text'), '2020–2025': (None, 'text'),
        'Confidencial': (None, 'text'), '1.234.56': (None, 'text'),
        'No consta': (None, 'text'), '2019/20': (None, 'text'),
    }
    for raw, expected in cases.items():
        assert parse_number(raw) == expected, (raw, parse_number(raw), expected)
    assert parse_number('2.770', 'decimal-punt') == (2.77, 'number')
    assert parse_number('41.982', 'decimal-punt') == (41.982, 'number')
    assert parse_number('18.4%', 'decimal-punt') == (18.4, 'number')


def check_catalog(root=ROOT, expected=EXPECTED_FICHES):
    data = root / 'data'
    catalog_text = (data / 'observatori-cataleg.json').read_text(encoding='utf-8')
    catalog = json.loads(catalog_text)
    js = (data / 'observatori-cataleg.js').read_text(encoding='utf-8')
    assert json.loads(js.removeprefix('window.OBSERVATORI_CATALEG = ').strip().removesuffix(';')) == catalog
    assert (root / 'descarregues/observatori_cataleg_complet.json').read_text(encoding='utf-8') == catalog_text
    with zipfile.ZipFile(root / 'descarregues/observatori_dades_completes.zip') as archive:
        assert archive.namelist() == ['observatori_dades_completes.csv']
        assert archive.read('observatori_dades_completes.csv') == (root / 'descarregues/observatori_dades_completes.csv').read_bytes(), 'ZIP differs from the complete CSV'
    fiches = catalog['fitxes']
    assert len(fiches) == expected, f'Expected {expected}, found {len(fiches)}'
    assert len({f['id'] for f in fiches}) == expected
    raw_fiches, _ = read_fiches(data / 'observatori-raw')
    raw_by_id = {f['id']: f for f in raw_fiches}
    assert len(raw_fiches) == len(raw_by_id) == expected
    assert set(raw_by_id) == {f['id'] for f in fiches}
    all_cells, source_zeros, numeric_zeros = 0, 0, 0
    with (root / 'descarregues/observatori_dades_completes.csv').open(encoding='utf-8-sig', newline='') as stream:
        csv_rows = list(csv.DictReader(stream))
    cursor = 0
    for fiche in fiches:
        raw = raw_by_id[fiche['id']]
        assert len(fiche['variants']) == len(raw.get('variants', []))
        for key in ('id', 'titol', 'url', 'definicio', 'font', 'calcul', 'consultat'):
            assert fiche.get(key) == raw.get(key), (fiche['id'], key, 'metadata changed')
        for variant, raw_variant in zip(fiche['variants'], raw.get('variants', [])):
            assert len(variant.get('tables', [])) == len(raw_variant.get('tables', []))
            for table, raw_table in zip(variant.get('tables', []), raw_variant.get('tables', [])):
                assert table['headers'] == raw_table['headers'], (fiche['id'], 'headers changed')
                assert table['rows'] == raw_table['rows'], (fiche['id'], 'source cells changed')
                width = max([len(r) for r in table['rows']] + [len(table['columnes'])])
                assert len(table['columnes']) == len(table['anys']) == len(table['unitats']) == width
                label_col = table['columna_etiqueta']
                for ri, row in enumerate(table['rows']):
                    for ci, value in enumerate(row):
                        if ci == label_col:
                            continue
                        result = csv_rows[cursor]
                        cursor += 1
                        assert result['fitxa_id'] == fiche['id']
                        assert result['fila'] == str(ri) and result['columna'] == str(ci)
                        assert result['valor_text'] == str(spreadsheet_cell(value))
                        if label_col is not None and label_col < len(row):
                            assert result['etiqueta_fila'] == str(spreadsheet_cell(row[label_col]))
                        if str(value).strip() in ('0', '0,0', '0.0', '0%'):
                            source_zeros += 1
                            assert result['valor_num'] == '0' and result['estat_valor'] == 'number'
                        if result['estat_valor'] != 'number':
                            assert result['valor_num'] == '', 'Non-number acquired a numeric value'
                        if result['valor_num'] == '0':
                            numeric_zeros += 1
                        all_cells += 1
        assert fiche['estat'] == ('disponible' if any(t['rows'] for v in fiche['variants'] for t in v.get('tables', [])) else 'sense_taula')
    assert cursor == len(csv_rows) == all_cells == catalog['metadades']['total_celles']
    assert catalog['metadades']['total_fitxes'] == expected
    assert catalog['metadades']['fitxes_amb_dades'] + catalog['metadades']['fitxes_sense_taula'] == expected
    with (root / 'descarregues/observatori_cobertura.csv').open(encoding='utf-8-sig', newline='') as stream:
        coverage = list(csv.DictReader(stream))
    assert len(coverage) == expected and {r['fitxa_id'] for r in coverage} == set(raw_by_id)
    assert sum(int(r['celles']) for r in coverage) == all_cells
    sources_archive = root / 'descarregues/observatori_fonts_originals.zip'
    if sources_archive.exists():
        with zipfile.ZipFile(sources_archive) as source_zip:
            wrappers = [json.loads(source_zip.read(name)) for name in source_zip.namelist() if name.endswith('.json')]
        assert len(wrappers) == expected
        source_by_url = {w['source_url']: w['data'] for w in wrappers}
        for fiche in fiches:
            source = source_by_url[fiche['url']]
            assert len(source['dades']) == len(fiche['variants'])
            for original, variant in zip(source['dades'], fiche['variants']):
                rawdata = original.get('rawdata') or ''
                assert variant['rawdata'] == rawdata
                assert variant['rawdata_sha256'] == hashlib.sha256(rawdata.encode('utf-8')).hexdigest()
                assert variant['notes'] == ([original['nota']] if original.get('nota') else [])
                if rawdata:
                    records = [row for row in csv.reader(io.StringIO(rawdata), delimiter=';') if row]
                    terminator = all(row[-1] == '' for row in records)
                    data_rows = [row[1:-1] if terminator else row[1:] for row in records if row[0] == 'dades']
                    header_rows = [row[1:-1] if terminator else row[1:] for row in records if row[0] in ('anys', 'columnes')]
                    assert len(variant['tables']) == 1
                    assert variant['tables'][0]['rows'] == data_rows
                    assert variant['tables'][0]['headers'] == header_rows
        print('Original API ZIP verified: all fiches, variants, notes, headers and data cells retained.')
    print(f'{expected} fitxes; {all_cells} cel·les exactes; CSV/JSON/JS equivalents; {source_zeros} zeros literals preservats ({numeric_zeros} zeros numèrics).')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--parser-only', action='store_true')
    parser.add_argument('--expected', type=int, default=EXPECTED_FICHES)
    args = parser.parse_args()
    test_number_semantics()
    if not args.parser_only:
        check_catalog(expected=args.expected)
    else:
        print('Number parsing checks passed: missing, zero, percentages, grouped decimals and suppressed values.')
