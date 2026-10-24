"""Regression tests for bounded offline Observatori captures (standard library)."""
import hashlib
import io
import json
from pathlib import Path
import stat
import struct
import tempfile
import unittest
from unittest.mock import patch
import warnings
import zipfile

import import_observatori_api as importer


def wrapper():
    return {'source_url': 'https://observatori.salt.cat/indicadors/demografia/grup/test/',
            'api_url': 'https://observatori.salt.cat/indicadors/api/indicadors/test/',
            'data': {'nom': 'Test', 'dades': []}}


def budget():
    return {'bytes': 0, 'tokens': 0, 'cells': 0}


class CaptureSecurityTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)

    def tearDown(self):
        self.temp.cleanup()

    def archive(self, entries=None, compression=zipfile.ZIP_STORED):
        if entries is None:
            entries = [(f'fiche-{i}.json', json.dumps(wrapper())) for i in range(importer.EXPECTED_FICHES)]
        target = self.root / 'capture.zip'
        with warnings.catch_warnings():
            warnings.simplefilter('ignore', UserWarning)
            with zipfile.ZipFile(target, 'w', compression=compression) as archive:
                for name, body in entries:
                    archive.writestr(name, body)
        return target

    def entries(self):
        return [(f'fiche-{i}.json', json.dumps(wrapper())) for i in range(importer.EXPECTED_FICHES)]

    def reject_before_body(self, archive):
        with patch.object(zipfile.ZipFile, 'open', side_effect=AssertionError('body read')) as opened:
            with self.assertRaises(ValueError):
                importer.load_wrappers(None, archive)
            opened.assert_not_called()

    def test_excess_count_rejected_before_zipfile_allocation(self):
        archive = self.archive(self.entries() + [('extra-a.json', '{}'), ('extra-b.json', '{}')])
        with patch.object(importer.zipfile, 'ZipFile', side_effect=AssertionError('allocated')) as allocated:
            with self.assertRaises(ValueError):
                importer.load_wrappers(None, archive)
            allocated.assert_not_called()

    def test_forged_directory_count_rejected_before_zipfile_allocation(self):
        archive = self.archive()
        content = bytearray(archive.read_bytes())
        end = content.rfind(b'PK\x05\x06')
        struct.pack_into('<HH', content, end + 8, 65535, 65535)
        archive.write_bytes(content)
        with patch.object(importer.zipfile, 'ZipFile', side_effect=AssertionError('allocated')):
            with self.assertRaises(ValueError):
                importer.load_wrappers(None, archive)

    def test_archive_byte_limit_before_zipfile_allocation(self):
        archive = self.archive()
        with patch.object(importer, 'MAX_ARCHIVE_BYTES', archive.stat().st_size - 1), \
                patch.object(importer.zipfile, 'ZipFile', side_effect=AssertionError('allocated')):
            with self.assertRaises(ValueError):
                importer.load_wrappers(None, archive)

    def test_zip64_cannot_override_checked_classic_directory(self):
        archive = self.archive([(f'fiche-{i}.json', '{}') for i in range(3000)])
        content = archive.read_bytes()
        end = content.rfind(b'PK\x05\x06')
        classic = list(struct.unpack_from('<4s4H2LH', content, end))
        zip64 = struct.pack('<4sQ2H2L4Q', b'PK\x06\x06', 44, 45, 45, 0, 0,
                            3000, 3000, classic[5], classic[6])
        locator = struct.pack('<4sLQL', b'PK\x06\x07', 0, end, 1)
        classic[3:7] = [importer.EXPECTED_FICHES, importer.EXPECTED_FICHES, 64,
                        end + len(zip64) + len(locator) - 64]
        for comment in (b'', b'x' * 65535):
            classic[7] = len(comment)
            archive.write_bytes(content[:end] + zip64 + locator + struct.pack('<4s4H2LH', *classic) + comment)
            # This is a real ZIP64 archive despite apparently safe classic fields.
            with zipfile.ZipFile(archive) as parsed:
                self.assertEqual(3000, len(parsed.infolist()))
            with patch.object(importer.zipfile, 'ZipFile', side_effect=AssertionError('allocated')) as allocated:
                with self.assertRaisesRegex(ValueError, 'ZIP64'):
                    importer.load_wrappers(None, archive)
                allocated.assert_not_called()

    def test_names_duplicates_and_unexpected_members_rejected_before_body(self):
        for name in ['../outside.json', 'nested/file.json', '/absolute.json',
                     'MixedCase.json', 'file.txt', 'fiche-1.json']:
            with self.subTest(name=name):
                entries = self.entries()
                entries[0] = (name, entries[0][1])
                self.reject_before_body(self.archive(entries))

    def test_oversized_member_rejected_before_body(self):
        entries = self.entries()
        entries[0] = ('fiche-0.json', ' ' * (importer.MAX_MEMBER_BYTES + 1))
        self.reject_before_body(self.archive(entries))

    def test_aggregate_byte_limit_before_body(self):
        archive = self.archive()
        with patch.object(importer, 'MAX_TOTAL_BYTES', 100):
            self.reject_before_body(archive)

    def test_high_compression_ratio_before_body(self):
        entries = self.entries()
        entries[0] = ('fiche-0.json', ' ' * 100000)
        self.reject_before_body(self.archive(entries, zipfile.ZIP_DEFLATED))

    def test_zip_symlink_before_body(self):
        entries = self.entries()
        link = zipfile.ZipInfo('fiche-0.json')
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        entries[0] = (link, 'elsewhere')
        self.reject_before_body(self.archive(entries))

    def test_actual_read_is_bounded_when_metadata_lies(self):
        for actual, declared in [(b'x' * 11, 10), (b'x' * 9, 10)]:
            with self.subTest(actual=len(actual)):
                source = io.BytesIO(actual)
                with self.assertRaises(ValueError):
                    importer.bounded_read(source, 'fiche.json', declared, budget())
                self.assertLessEqual(source.tell(), declared + 1)

    def test_depth_and_token_limits_before_json_decode(self):
        payloads = [b'[' * (importer.MAX_JSON_DEPTH + 1) + b'0' + b']' * (importer.MAX_JSON_DEPTH + 1),
                    ('{' + '"same":0,' * importer.MAX_JSON_TOKENS + '"last":0}').encode()]
        for payload in payloads:
            with patch.object(importer.json, 'loads', side_effect=AssertionError('decoded')) as decoded:
                with self.assertRaises(ValueError):
                    importer.bounded_json(payload, 'fiche.json', budget())
                decoded.assert_not_called()

    def test_total_json_budget_is_enforced(self):
        totals = budget()
        totals['tokens'] = importer.MAX_TOTAL_JSON_TOKENS
        with patch.object(importer.json, 'loads', side_effect=AssertionError('decoded')):
            with self.assertRaises(ValueError):
                importer.bounded_json(json.dumps(wrapper()).encode(), 'fiche.json', totals)

    def test_strings_and_escapes_do_not_count_as_json_structure(self):
        data = wrapper()
        data['data']['nom'] = '[{}]' * 10000 + '\\" []'
        self.assertEqual(data, importer.bounded_json(json.dumps(data).encode(), 'fiche.json', budget()))

    def test_raw_csv_expansion_budget(self):
        for raw in [';' * (importer.MAX_RAW_CELLS + 1), '\n' * (importer.MAX_RAW_CELLS + 1)]:
            data = wrapper()
            data['data']['dades'] = [{'rawdata': raw}]
            with self.assertRaises(ValueError):
                importer.bounded_json(json.dumps(data).encode(), 'fiche.json', budget())

    def test_schema_and_nonfinite_numbers_rejected(self):
        for payload in [b'[]', b'{"data": []}', b'{"data":NaN}',
                        json.dumps(wrapper()).replace('"dades": []', '"dades": 1e999').encode()]:
            with self.subTest(payload=payload):
                with self.assertRaises(ValueError):
                    importer.bounded_json(payload, 'fiche.json', budget())

    def test_optional_index_is_validated_but_not_parsed_as_wrapper(self):
        archive = self.archive(self.entries() + [('download-index.json', '{"capture":"index"}')])
        self.assertEqual(importer.EXPECTED_FICHES, len(importer.load_wrappers(None, archive)))

    def test_directory_count_size_and_symlinks_before_read(self):
        directory = self.root / 'directory'
        directory.mkdir()
        for name, payload in self.entries():
            (directory / name).write_text(payload)
        self.assertEqual(importer.EXPECTED_FICHES, len(importer.load_wrappers(directory, None)))
        with patch.object(importer, 'MAX_TOTAL_BYTES', 100), \
                patch.object(importer, 'open_regular', side_effect=AssertionError('body read')):
            with self.assertRaises(ValueError):
                importer.load_wrappers(directory, None)
        (directory / 'fiche-0.json').unlink()
        (directory / 'fiche-0.json').symlink_to(directory / 'fiche-1.json')
        with patch.object(importer, 'open_regular', side_effect=AssertionError('body read')):
            with self.assertRaises(ValueError):
                importer.load_wrappers(directory, None)

    def test_committed_capture_and_converted_output_are_unchanged(self):
        archive_path = importer.ROOT / 'descarregues/observatori_fonts_originals.zip'
        with zipfile.ZipFile(archive_path) as archive:
            baseline = [json.loads(archive.read(name)) for name in sorted(archive.namelist())]
        actual = importer.load_wrappers(None, archive_path)
        self.assertEqual(baseline, actual)
        result = {'fitxes': [importer.convert(item, '2026-10-17') for item in actual]}
        expected = json.loads((importer.ROOT / 'data/observatori-raw/api-complet.json').read_text())
        self.assertEqual(expected, result)
        canonical = (json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n').encode()
        self.assertEqual(hashlib.sha256(canonical).hexdigest(),
                         hashlib.sha256((importer.ROOT / 'data/observatori-raw/api-complet.json').read_bytes()).hexdigest())


if __name__ == '__main__':
    unittest.main()
