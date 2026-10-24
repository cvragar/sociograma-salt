"""Spreadsheet-safe CSV output; raw JSON/source values must remain untouched.

Use the same policy as csvSafeCell in both browser entry points. CSV quoting
alone does not stop formula evaluation. Preserve complete negative numeric
strings without parsing/rounding them; neutralize all other formula prefixes.
"""
import csv
import re

_PADDING = re.compile(r'^[\x00-\x20\x7f-\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000\ufeff]*')
_CONTROL = re.compile(r'[\x00-\x1f\x7f-\x9f]')
_NEGATIVE_NUMBER = re.compile(
    r'-(?:[0-9]+(?:[.,][0-9]+)?|[.,][0-9]+'
    r'|[0-9]{1,3}(?:,[0-9]{3})+(?:\.[0-9]+)?'
    r'|[0-9]{1,3}(?:\.[0-9]{3})+(?:,[0-9]+)?)'
    r'(?:[eE][+-]?[0-9]+)?%?\Z'
)


def spreadsheet_cell(value):
    """Return an inert CSV cell, retaining genuine numbers and original text."""
    if value is None:
        return ''
    # Numeric fields are already typed; never parse a textual value as a float.
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value
    original = str(value)
    padding = _PADDING.match(original).group()
    candidate = original[len(padding):]
    dangerous = (_CONTROL.search(padding) is not None
                 or candidate.startswith(('=', '+', '@'))
                 or (candidate.startswith('-')
                     and _NEGATIVE_NUMBER.fullmatch(candidate) is None))
    return "'" + original if dangerous else original


def write_spreadsheet_csv(path, fieldnames, rows):
    """Write safe headers and values, preserving the requested column order."""
    with path.open('w', encoding='utf-8-sig', newline='') as stream:
        writer = csv.writer(stream)
        writer.writerow([spreadsheet_cell(field) for field in fieldnames])
        for row in rows:
            writer.writerow([spreadsheet_cell(row.get(field)) for field in fieldnames])
