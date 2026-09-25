from html.parser import HTMLParser
from pathlib import Path
import re
import sys

ROOT = Path(__file__).resolve().parents[1]
SELF = Path(__file__).resolve()
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

affiliate_href = "https://px.a8.net/svt/ejp?a8mat=4B3UZ5+38P0W2+4ZCO+60WN6"
affiliate_pixel = "https://www13.a8.net/0.gif?a8mat=4B3UZ5+38P0W2+4ZCO+60WN6"
if index.count(affiliate_href) != 2:
    errors.append(f"index.html affiliate href count must be 2, got {index.count(affiliate_href)}")
if index.count(affiliate_pixel) != 2:
    errors.append(f"index.html affiliate pixel count must be 2, got {index.count(affiliate_pixel)}")
if 'アフィリエイト広告はまだ有効化していません' in index:
    errors.append("index.html still says affiliate ads are disabled")
if 'A8.netのアフィリエイト広告を利用しています' not in index:
    errors.append("index.html missing first-view affiliate disclosure")
if '航空＋宿は現在の広告成果対象外' not in index:
    errors.append("index.html missing non-eligible package disclosure")
for source_url in [
    "https://travel.yahoo.co.jp/feature/campaign_pointup/",
    "https://travel.yahoo.co.jp/notice/special/post_7/",
]:
    if source_url not in index:
        errors.append(f"index.html missing official source link: {source_url}")

for path in ROOT.rglob("*"):
    if not path.is_file() or ".git" in path.parts or path.resolve() == SELF:
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
