from pathlib import Path
import shutil

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "dist"
PUBLIC_FILES = [
    "index.html",
    "about.html",
    "privacy.html",
    "styles.css",
    "robots.txt",
    "qa-mobile-390.html",
]

if OUT.exists():
    shutil.rmtree(OUT)
OUT.mkdir()

missing = [name for name in PUBLIC_FILES if not (ROOT / name).is_file()]
if missing:
    raise SystemExit("missing public files: " + ", ".join(missing))

for name in PUBLIC_FILES:
    shutil.copy2(ROOT / name, OUT / name)

unexpected = sorted(
    str(path.relative_to(OUT))
    for path in OUT.rglob("*")
    if path.is_file() and path.name not in PUBLIC_FILES
)
if unexpected:
    raise SystemExit("unexpected public files: " + ", ".join(unexpected))

print("cloudflare static bundle: PASS")
