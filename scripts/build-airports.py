# /// script
# requires-python = ">=3.12"
# dependencies = []
# ///
"""Builds src/data/airports.json from two public datasets.

OurAirports airports.csv gives the type, IATA code and whether the airport has
scheduled service. OpenFlights airports.dat gives the city and the IANA time
zone. Airports are kept when they are large or medium, have scheduled service
and an IATA code, and appear in both files. Rows are [code, city, name, zone,
country, large]. Run with `uv run scripts/build-airports.py`.
"""

import csv
import io
import json
import urllib.request
from pathlib import Path

OURAIRPORTS = "https://davidmegginson.github.io/ourairports-data/airports.csv"
OPENFLIGHTS = "https://raw.githubusercontent.com/jpatokal/openflights/master/data/airports.dat"
OUT = Path(__file__).resolve().parent.parent / "src" / "data" / "airports.json"
STRIP = (" International", " Airport", " Intl", " Regional")


def fetch(url: str) -> str:
    with urllib.request.urlopen(url, timeout=60) as r:
        return r.read().decode("utf-8")


def main() -> None:
    openflights = {}
    for row in csv.reader(io.StringIO(fetch(OPENFLIGHTS))):
        if len(row) > 11 and row[4] not in ("", r"\N") and row[11] not in ("", r"\N"):
            openflights[row[4]] = {"city": row[2], "tz": row[11]}
    out = []
    for r in csv.DictReader(io.StringIO(fetch(OURAIRPORTS))):
        code = r["iata_code"]
        if not code or r["scheduled_service"] != "yes" or r["type"] not in ("large_airport", "medium_airport"):
            continue
        o = openflights.get(code)
        if not o:
            continue
        city = o["city"] or r["municipality"] or r["name"]
        name = r["name"]
        for s in STRIP:
            name = name.replace(s, "")
        large = r["type"] == "large_airport"
        out.append([code, city, name if name != city else "", o["tz"], r["iso_country"], 1 if large else 0])
    out.sort(key=lambda a: (-a[5], a[1], a[0]))
    OUT.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"{len(out)} airports, {sum(a[5] for a in out)} large, {OUT.stat().st_size} bytes")


if __name__ == "__main__":
    main()
