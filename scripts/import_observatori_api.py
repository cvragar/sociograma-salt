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
import math
import os
import re
import stat
import struct
import zipfile
from contextlib import contextmanager
from pathlib import Path
from urllib.parse import quote, urlparse

from build_observatori_catalog import ROOT, EXPECTED_FICHES

# The committed capture is 0.61 MiB compressed / 3.06 MiB expanded; its largest
# member is 0.86 MiB and its highest compression ratio is 7.98. These budgets
# leave room for ordinary updates without accepting arbitrary archive workloads.
MAX_ARCHIVE_BYTES = 16 * 1024 * 1024
MAX_MEMBER_BYTES = 2 * 1024 * 1024
MAX_MEMBER_COMPRESSED_BYTES = MAX_MEMBER_BYTES + 64 * 1024
MAX_TOTAL_BYTES = 16 * 1024 * 1024
MAX_COMPRESSION_RATIO = 100
MAX_DIRECTORY_BYTES = 128 * 1024
MAX_JSON_DEPTH = 16
MAX_JSON_TOKENS = 10000
MAX_TOTAL_JSON_TOKENS = 100000
MAX_RAW_CELLS = 500000
MAX_TOTAL_RAW_CELLS = 2000000
MAX_MEMBERS = EXPECTED_FICHES + 1  # Optional capture download-index.json.
MEMBER_NAME = re.compile(r'[a-z0-9]+(?:-[a-z0-9]+)*\.json\Z')


@contextmanager
def open_regular(path, limit):
    """Do not follow symlinks or block on special files selected as input."""
    before = path.lstat()
    if not stat.S_ISREG(before.st_mode) or before.st_size > limit:
        raise ValueError(f'Input is not a regular file within its size budget: {path.name}')
    flags = os.O_RDONLY | getattr(os, 'O_NOFOLLOW', 0) | getattr(os, 'O_NONBLOCK', 0)
    descriptor = os.open(path, flags)
    with os.fdopen(descriptor, 'rb') as stream:
        current = os.fstat(stream.fileno())
        if (not stat.S_ISREG(current.st_mode) or current.st_size > limit or
                (current.st_dev, current.st_ino, current.st_size) !=
                (before.st_dev, before.st_ino, before.st_size)):
            raise ValueError(f'Input changed during inspection: {path.name}')
        yield stream, current.st_size


def check_zip_directory(stream, size):
    """Bound the central directory before ZipFile allocates its member objects.

    Captures use ordinary single-volume ZIP files, not ZIP64 or appended data.
    Checking both its declared count and byte size also bounds forged counts.
    """
    tail_size = min(size, 65535 + 22)
    stream.seek(size - tail_size)
    tail = stream.read(tail_size)
    offset = tail.rfind(b'PK\x05\x06')
    if offset < 0 or offset + 22 > len(tail):
        raise ValueError('Missing ZIP end-of-directory record')
    end_record = size - tail_size + offset
    if end_record >= 20:
        stream.seek(end_record - 20)
        if stream.read(4) == b'PK\x06\x07':
            # ZipFile otherwise lets ZIP64 replace even plausible classic
            # counts and offsets, bypassing the central-directory budget.
            raise ValueError('ZIP64 captures are not supported')
    _, disk, start_disk, disk_count, count, length, start, comment = struct.unpack_from('<4s4H2LH', tail, offset)
    if (disk or start_disk or disk_count != count or count not in (EXPECTED_FICHES, MAX_MEMBERS)
            or length > MAX_DIRECTORY_BYTES or start + length != size - tail_size + offset
            or offset + 22 + comment != len(tail)):
        raise ValueError('Unexpected ZIP member count or central-directory bounds')


def check_members(members):
    """Validate the complete inventory before reading any JSON body."""
    names = [name for name, _, _ in members]
    if len(names) > MAX_MEMBERS or len(set(names)) != len(names):
        raise ValueError('Duplicate or excessive input members')
    if any(len(name) > 200 or not MEMBER_NAME.fullmatch(name) for name in names):
        raise ValueError('Expected flat, lowercase JSON capture filenames')
    if len([name for name in names if name != 'download-index.json']) != EXPECTED_FICHES:
        raise ValueError(f'Expected {EXPECTED_FICHES} API files')
    if any(size < 0 or size > MAX_MEMBER_BYTES for _, size, _ in members):
        raise ValueError('JSON member exceeds the byte budget')
    if sum(size for _, size, _ in members) > MAX_TOTAL_BYTES:
        raise ValueError('Expanded input exceeds the aggregate byte budget')


def bounded_read(stream, name, expected_size, budget):
    chunks, size = [], 0
    while True:
        # Read one extra byte to detect incorrect metadata, without ever asking
        # a decompressor to materialize an unbounded member.
        chunk = stream.read(min(65536, expected_size - size + 1))
        if not chunk:
            break
        size += len(chunk)
        if size > expected_size or size > MAX_MEMBER_BYTES or budget['bytes'] + size > MAX_TOTAL_BYTES:
            raise ValueError(f'Actual member size exceeds the byte budget: {name}')
        chunks.append(chunk)
    if size != expected_size:
        raise ValueError(f'Member size differs from its metadata: {name}')
    budget['bytes'] += size
    return b''.join(chunks)


def bounded_json(payload, name, budget):
    """Check nesting and structural work before constructing Python objects."""
    text = payload.decode('utf-8-sig')
    depth = tokens = 0
    quoted = escaped = False
    for char in text:
        if quoted:
            if escaped:
                escaped = False
            elif char == '\\':
                escaped = True
            elif char == '"':
                quoted = False
            continue
        if char == '"':
            quoted = True
            tokens += 1
        elif char in '[{':
            depth += 1
            tokens += 1
        elif char in ']}':
            depth -= 1
            tokens += 1
        elif char in ',:':
            tokens += 1
        if depth < 0 or depth > MAX_JSON_DEPTH or tokens > MAX_JSON_TOKENS or budget['tokens'] + tokens > MAX_TOTAL_JSON_TOKENS:
            raise ValueError(f'JSON structure exceeds its budget: {name}')
    if quoted or depth:
        raise ValueError(f'Unterminated JSON structure: {name}')
    budget['tokens'] += tokens

    def number(value):
        if len(value) > 256:
            raise ValueError(f'JSON number exceeds its budget: {name}')
        result = float(value) if any(c in value for c in '.eE') else int(value)
        if isinstance(result, float) and not math.isfinite(result):
            raise ValueError(f'Nonfinite JSON number: {name}')
        return result

    def invalid_constant(value):
        raise ValueError(f'Nonstandard JSON constant: {value}')

    wrapper = json.loads(text, parse_int=number, parse_float=number, parse_constant=invalid_constant)
    if not isinstance(wrapper, dict) or not isinstance(wrapper.get('data'), dict):
        raise ValueError(f'Expected an API wrapper object: {name}')
    if not all(isinstance(wrapper.get(key), str) for key in ('source_url', 'api_url')):
        raise ValueError(f'Missing API wrapper URLs: {name}')
    variants = wrapper['data'].get('dades', [])
    if not isinstance(variants, list):
        raise ValueError(f'Expected API variants: {name}')
    cells = 0
    for variant in variants:
        if not isinstance(variant, dict) or not isinstance(variant.get('rawdata') or '', str):
            raise ValueError(f'Expected textual API rawdata: {name}')
        # Raw CSV is another expansion boundary. Count both cells and rows,
        # including delimiters inside quoted original text (a safe upper bound).
        raw = variant.get('rawdata') or ''
        cells += raw.count(';') + raw.count('\n') + raw.count('\r') + bool(raw)
    if cells > MAX_RAW_CELLS or budget['cells'] + cells > MAX_TOTAL_RAW_CELLS:
        raise ValueError(f'Raw CSV exceeds the cell budget: {name}')
    budget['cells'] += cells
    return wrapper


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
    budget = {'bytes': 0, 'tokens': 0, 'cells': 0}
    wrappers = []
    if archive:
        with open_regular(archive, MAX_ARCHIVE_BYTES) as (stream, size):
            check_zip_directory(stream, size)
            with zipfile.ZipFile(stream) as z:
                infos = z.infolist()
                members = [(info.filename, info.file_size, info) for info in infos]
                check_members(members)
                for info in infos:
                    if (info.orig_filename != info.filename or info.is_dir() or
                            stat.S_ISLNK(info.external_attr >> 16) or info.flag_bits & 1 or
                            info.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED) or
                            info.compress_size > MAX_MEMBER_COMPRESSED_BYTES or
                            info.file_size > MAX_COMPRESSION_RATIO * info.compress_size):
                        raise ValueError(f'Unsupported or excessive ZIP member: {info.filename}')
                if sum(info.compress_size for info in infos) > MAX_ARCHIVE_BYTES:
                    raise ValueError('Compressed input exceeds the aggregate byte budget')
                for name, size, info in sorted(members):
                    if name == 'download-index.json':
                        continue
                    with z.open(info) as body:
                        wrappers.append(bounded_json(bounded_read(body, name, size, budget), name, budget))
        return wrappers
    members = []
    with os.scandir(directory) as entries:
        for entry in entries:
            if len(members) == MAX_MEMBERS:
                raise ValueError('Excessive input members')
            info = entry.stat(follow_symlinks=False)
            if not stat.S_ISREG(info.st_mode):
                raise ValueError(f'Expected a regular capture file: {entry.name}')
            members.append((entry.name, info.st_size, Path(entry.path)))
    check_members(members)
    for name, expected_size, path in sorted(members):
        if name == 'download-index.json':
            continue
        with open_regular(path, MAX_MEMBER_BYTES) as (stream, size):
            if size != expected_size:
                raise ValueError(f'Input changed during inspection: {name}')
            wrappers.append(bounded_json(bounded_read(stream, name, size, budget), name, budget))
    return wrappers


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
