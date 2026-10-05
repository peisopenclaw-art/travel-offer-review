from pathlib import Path
import shutil
import argparse
import json
from check_public_benefits import validate

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist"
PUBLIC_FILES = [
    "index.html",
    "offers.html",
    "decision.html",
    "decision-ui.css",
    "decision-ui.js",
    "benefit-rules.js",
    "decision-data.json",
    "design-samples.json",
    "campaign-highlights.json",
    "search-geography.json",
    "yahoo-travel-logo.svg",
    "ikyu-logo.svg",
    "jtb-logo.svg",
    "sample-campaign.html",
    "campaign-detail.js",
    "yahoo-travel-campaign.html",
    "kyushu-recovery-discount.html",
    "about.html",
    "privacy.html",
    "styles.css",
    "robots.txt",
    "sitemap.xml",
    "qa-mobile-390.html",
]

ap=argparse.ArgumentParser();ap.add_argument('--snapshot',type=Path);args=ap.parse_args()
if args.snapshot:
    validate(json.loads(args.snapshot.read_text()),require_live=True)
else:
    validate(json.loads((ROOT/'decision-data.json').read_text()))

if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir()

missing = [name for name in PUBLIC_FILES if not (ROOT / name).is_file()]
if missing:
    raise SystemExit("missing public files: " + ", ".join(missing))

for name in PUBLIC_FILES:
    shutil.copy2(args.snapshot if name=="decision-data.json" and args.snapshot else ROOT / name, OUT / name)

unexpected = sorted(
    str(path.relative_to(OUT))
    for path in OUT.rglob("*")
    if path.is_file() and path.name not in PUBLIC_FILES
)
if unexpected:
    raise SystemExit("unexpected public files: " + ", ".join(unexpected))

print("cloudflare static bundle: PASS")
