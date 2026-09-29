from datetime import datetime, timedelta, timezone
from pathlib import Path
import os
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
INDEX = ROOT / "index.html"
JST = timezone(timedelta(hours=9))


def parse_now():
    raw = os.environ.get("OFFER_CHECK_NOW")
    if not raw:
        return datetime.now(JST)
    value = datetime.fromisoformat(raw)
    if value.tzinfo is None:
        raise ValueError("OFFER_CHECK_NOW must include a timezone offset")
    return value.astimezone(JST)


def main():
    now = parse_now()
    text = INDEX.read_text(encoding="utf-8")
    raw_deadlines = re.findall(r'data-booking-end="([^"]+)"', text)

    if not raw_deadlines:
        print("freshness check: FAIL - no dated offers found")
        return 1

    deadlines = []
    for raw in raw_deadlines:
        try:
            end = datetime.fromisoformat(raw)
        except ValueError:
            print(f"freshness check: FAIL - invalid data-booking-end: {raw}")
            return 1
        if end.tzinfo is None:
            print(f"freshness check: FAIL - timezone missing: {raw}")
            return 1
        deadlines.append(end.astimezone(JST))

    future = [end for end in deadlines if end > now]
    if not future:
        latest = max(deadlines)
        print(
            "freshness check: FAIL - all dated offers have expired; "
            f"latest booking end was {latest.isoformat()}. "
            "Replace or refresh the dated offer cards before the next revenue cycle."
        )
        return 1

    nearest = min(future)
    print(
        "freshness check: PASS - "
        f"{len(future)}/{len(deadlines)} dated offers remain future-dated; "
        f"nearest booking end {nearest.isoformat()} (checked {now.isoformat()})"
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except Exception as exc:
        print(f"freshness check: FAIL - {exc}")
        raise SystemExit(1)
