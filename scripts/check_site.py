from html.parser import HTMLParser
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
HTML = [ROOT / "index.html", ROOT / "about.html", ROOT / "privacy.html"]

class Parser(HTMLParser):
    def error(self, message):
        raise AssertionError(message)

errors = []
for path in HTML:
    if not path.exists():
        errors.append(f"missing: {path.name}")
        continue
    text = path.read_text(encoding="utf-8")
    try:
        Parser().feed(text)
    except Exception as exc:
        errors.append(f"{path.name}: html parse failed: {exc}")
    for target in re.findall(r'href="([^"]+\.html)"', text):
        if not (ROOT / target).exists():
            errors.append(f"{path.name}: broken local link: {target}")

index = (ROOT / "index.html").read_text(encoding="utf-8")
for required in ["旅行オファー比較", "一次情報", "広告"]:
    if required not in index:
        errors.append(f"index.html missing required text: {required}")

for path in ROOT.rglob("*"):
    if not path.is_file() or ".git" in path.parts:
        continue
    try:
        text = path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        continue
    for forbidden in ["gho_", "BEGIN PRIVATE KEY", "Bearer ", "password="]:
        if forbidden in text:
            errors.append(f"forbidden secret-like pattern in {path.relative_to(ROOT)}: {forbidden}")

if errors:
    print("\n".join(errors))
    sys.exit(1)
print("site checks: PASS")
