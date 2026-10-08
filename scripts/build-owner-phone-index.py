#!/usr/bin/env python3
"""Build the slim, server-only owner phone index used by /api/owner-search.

Input : the full owner index (owners table) built by listing-check-server/owner_db.py,
        e.g. owner-index-for-cloud.sqlite from Mahmoud's Google Drive.
Output: api/_lib/owner-phones.sqlite (NOT committed; .gitignore'd). Deploy it with the
        build, or host it privately and set OWNER_PHONES_INDEX_URL on the Vercel project.

Usage: python3 scripts/build-owner-phone-index.py <full-index.sqlite> [out.sqlite]
"""
import os
import re
import sqlite3
import sys


def norm_phone(raw: str) -> str:
    """Same rules as api/_lib/owner-search.js normPhone: +971 / 00971 / 05x / spaces / dashes."""
    d = re.sub(r"\D", "", raw or "")
    if d.startswith("00"):
        d = d[2:]
    if d.startswith("971"):
        d = d[3:]
    return d.lstrip("0")


def norm_text(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    src = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "api", "_lib", "owner-phones.sqlite")
    tmp = out + ".building"
    if os.path.exists(tmp):
        os.remove(tmp)
    s = sqlite3.connect(f"file:{src}?mode=ro", uri=True)
    o = sqlite3.connect(tmp)
    o.executescript(
        """
        PRAGMA journal_mode=OFF; PRAGMA synchronous=OFF;
        CREATE TABLE owners (id INTEGER PRIMARY KEY, name TEXT, name_norm TEXT, phone TEXT, email TEXT,
                             unit TEXT, building TEXT, cluster TEXT, land TEXT, source_file TEXT);
        CREATE TABLE phone_keys (rev_key TEXT NOT NULL, owner_id INTEGER NOT NULL);
        CREATE TABLE meta (k TEXT PRIMARY KEY, v TEXT);
        """
    )
    n = k = 0
    rows = s.execute(
        "SELECT id, name, name_norm, phone, email, unit, building, cluster, land, source_file FROM owners "
        "WHERE phone IS NOT NULL AND phone <> ''"
    )
    batch_o, batch_k = [], []
    for r in rows:
        keys = set()
        for part in re.split(r"[|,;/]", r[3]):
            p = norm_phone(part)
            if len(p) >= 7:
                keys.add(p[::-1])
        if not keys:
            continue
        rid = r[0]
        batch_o.append((rid, r[1], r[2] or norm_text(r[1]), r[3], r[4], r[5], r[6], r[7], r[8], os.path.basename(r[9] or "")))
        batch_k.extend((key, rid) for key in keys)
        n += 1
        k += len(keys)
        if len(batch_o) >= 50000:
            o.executemany("INSERT INTO owners VALUES (?,?,?,?,?,?,?,?,?,?)", batch_o)
            o.executemany("INSERT INTO phone_keys VALUES (?,?)", batch_k)
            batch_o, batch_k = [], []
    o.executemany("INSERT INTO owners VALUES (?,?,?,?,?,?,?,?,?,?)", batch_o)
    o.executemany("INSERT INTO phone_keys VALUES (?,?)", batch_k)
    o.execute("CREATE INDEX idx_phone_keys ON phone_keys(rev_key)")
    built = dict(s.execute("SELECT k, v FROM meta WHERE k IN ('built_at','rows_indexed','files_indexed')").fetchall()) if s.execute("SELECT name FROM sqlite_master WHERE name='meta'").fetchone() else {}
    o.executemany("INSERT INTO meta VALUES (?,?)", [("source_built_at", built.get("built_at", "")), ("owners_with_phone", str(n)), ("phone_keys", str(k)), ("format", "owner-phones-v1")])
    o.commit()
    o.execute("VACUUM")
    o.close()
    os.replace(tmp, out)
    print(f"wrote {out}: {n} owner rows with phones, {k} phone keys, {os.path.getsize(out)/1e6:.1f} MB")


if __name__ == "__main__":
    main()
