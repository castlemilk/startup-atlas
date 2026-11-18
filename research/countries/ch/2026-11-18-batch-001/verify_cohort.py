#!/usr/bin/env python3
"""Reproduce the GDP cohort from a separately obtained, checksum-pinned workbook.

Offline only. Requires openpyxl. Does not download data or write production files.
Usage: python3 verify_cohort.py /path/to/WEOOct2026all.xlsx
"""
import hashlib
import json
import sys
from pathlib import Path

def main():
    from openpyxl import load_workbook
    workbook = Path(sys.argv[1])
    receipt = json.loads((Path(__file__).parent / 'cohort-verification.json').read_text())
    actual_hash = hashlib.sha256(workbook.read_bytes()).hexdigest()
    expected_hash = '2aa4f70a05931197b41ed7e0202dc56eee8d816858ac14521e4f8f5dbc38696c'
    if actual_hash != expected_hash:
        raise ValueError('Workbook hash differs from this checkpoint. Treat a newer vintage as a new cohort, not a silent replacement.')
    book = load_workbook(workbook, read_only=True, data_only=True)
    rows = book['Countries'].iter_rows(values_only=True)
    header = next(rows)
    positions = {name: header.index(name) for name in ['INDICATOR.ID', 'COUNTRY.ID', 'COUNTRY', 'LATEST_ACTUAL_ANNUAL_DATA', 2026]}
    economies = []
    for row in rows:
        if row[positions['INDICATOR.ID']] != 'NGDPD':
            continue
        value = row[positions[2026]]
        if not isinstance(value, (int, float)):
            continue
        economies.append({'code':row[positions['COUNTRY.ID']], 'name':row[positions['COUNTRY']],
                          'ngdpd_2026_usd_billions':value,
                          'latest_actual_year':row[positions['LATEST_ACTUAL_ANNUAL_DATA']]})
    book.close()
    economies.sort(key=lambda row: row['ngdpd_2026_usd_billions'], reverse=True)
    target = next({'rank':i+1, **row} for i, row in enumerate(economies) if row['code'] == 'CHE')
    assert len(economies) == 191
    assert target['rank'] == 20
    assert abs(target['ngdpd_2026_usd_billions'] - 1135.739) < 1e-9
    assert target['latest_actual_year'] == 2025
    assert any(row['code'] == 'TWN' for row in economies)
    print(json.dumps({'valid':True, 'workbook_sha256':actual_hash, 'numeric_economies':len(economies),
                      'switzerland':target, 'aggregates':'Excluded by using Countries, not CountryGroups.',
                      'estimate_not_actual':True}, indent=2))

if __name__ == '__main__':
    main()
