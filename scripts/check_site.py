from html.parser import HTMLParser
from pathlib import Path
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SELF = Path(__file__).resolve()
HTML = [ROOT / "index.html", ROOT / "offers.html", ROOT / "decision.html", ROOT / "about.html", ROOT / "privacy.html", ROOT / "yahoo-travel-campaign.html", ROOT / "kyushu-recovery-discount.html"]
PUBLIC_ORIGIN = "https://travel.tokuerabi.com"
CANONICALS = {
    "index.html": f"{PUBLIC_ORIGIN}/",
    "offers.html": f"{PUBLIC_ORIGIN}/offers.html",
    "decision.html": f"{PUBLIC_ORIGIN}/decision.html",
    "about.html": f"{PUBLIC_ORIGIN}/about.html",
    "privacy.html": f"{PUBLIC_ORIGIN}/privacy.html",
    "yahoo-travel-campaign.html": f"{PUBLIC_ORIGIN}/yahoo-travel-campaign.html",
    "kyushu-recovery-discount.html": f"{PUBLIC_ORIGIN}/kyushu-recovery-discount.html",
}

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
        if "://" in target or target.startswith(("/", "#", "mailto:", "tel:")):
            continue
        if not (ROOT / target).exists():
            errors.append(f"{path.name}: broken local link: {target}")

    canonical = CANONICALS[path.name]
    if f'<link rel="canonical" href="{canonical}">' not in text:
        errors.append(f"{path.name}: missing canonical: {canonical}")
    if f'<meta property="og:url" content="{canonical}">' not in text:
        errors.append(f"{path.name}: missing og:url: {canonical}")
    for prop in ["og:type", "og:locale", "og:site_name", "og:title", "og:description"]:
        if f'<meta property="{prop}"' not in text:
            errors.append(f"{path.name}: missing {prop}")

index = (ROOT / "index.html").read_text(encoding="utf-8")
for required in ["トクえらび", "どこへ行く？", "decision-ui.css", "decision-ui.js"]:
    if required not in index:
        errors.append(f"index.html missing decision UI marker: {required}")

offers = (ROOT / "offers.html").read_text(encoding="utf-8")
for required in ["トクえらび", "一次情報", "広告"]:
    if required not in offers:
        errors.append(f"offers.html missing required text: {required}")

affiliate_href = "https://px.a8.net/svt/ejp?a8mat=4B3UZ5+38P0W2+4ZCO+60WN6"
affiliate_pixel = "https://www13.a8.net/0.gif?a8mat=4B3UZ5+38P0W2+4ZCO+60WN6"
if offers.count(affiliate_href) != 3:
    errors.append(f"offers.html affiliate href count must be 3, got {offers.count(affiliate_href)}")
if "九州ふっこう応援割" not in offers or "最大60％" not in offers:
    errors.append("offers.html missing current Kyushu recovery discount priority")
if "kyushu-recovery-discount.html" not in offers:
    errors.append("offers.html missing Kyushu campaign detail link")
if offers.count(affiliate_pixel) != 3:
    errors.append(f"offers.html affiliate pixel count must be 3, got {offers.count(affiliate_pixel)}")
official_affiliate_material = f'''<a href="{affiliate_href}" rel="nofollow">【ヤフートラベル】</a>\n              <img border="0" width="1" height="1" src="{affiliate_pixel}" alt="">'''
official_affiliate_material_feature = f'''<a href="{affiliate_href}" rel="nofollow">【ヤフートラベル】</a>\n              <img border="0" width="1" height="1" src="{affiliate_pixel}" alt="">'''
if offers.count('<a href="' + affiliate_href + '" rel="nofollow">【ヤフートラベル】</a>') != 3:
    errors.append("offers.html must keep the A8-generated Yahoo! Travel text anchor exactly three times")
if offers.count('<img border="0" width="1" height="1" src="' + affiliate_pixel + '" alt="">') != 3:
    errors.append("offers.html must keep the A8-generated tracking pixel markup exactly three times")
if f'class="primary-cta" href="{affiliate_href}"' in offers or "Yahoo!トラベルで見る" in offers:
    errors.append("offers.html must not customize the A8-generated Yahoo! Travel ad material")
if 'アフィリエイト広告はまだ有効化していません' in offers:
    errors.append("offers.html still says affiliate ads are disabled")
if '一部リンクは広告です' not in offers:
    errors.append("offers.html missing concise affiliate disclosure")
for source_url in [
    "https://travel.yahoo.co.jp/notice/special/post_7/",
]:
    if source_url not in offers:
        errors.append(f"offers.html missing official source link: {source_url}")

sitemap_path = ROOT / "sitemap.xml"
if not sitemap_path.is_file():
    errors.append("missing: sitemap.xml")
else:
    sitemap = sitemap_path.read_text(encoding="utf-8")
    try:
        ET.fromstring(sitemap)
    except ET.ParseError as exc:
        errors.append(f"sitemap.xml parse failed: {exc}")
    sitemap_urls = [
        f"{PUBLIC_ORIGIN}/",
        f"{PUBLIC_ORIGIN}/offers.html",
        f"{PUBLIC_ORIGIN}/about.html",
        f"{PUBLIC_ORIGIN}/privacy.html",
        f"{PUBLIC_ORIGIN}/yahoo-travel-campaign.html",
        f"{PUBLIC_ORIGIN}/kyushu-recovery-discount.html",
    ]
    for url in sitemap_urls:
        if sitemap.count(f"<loc>{url}</loc>") != 1:
            errors.append(f"sitemap.xml must contain exactly one URL: {url}")

kyushu = (ROOT / "kyushu-recovery-discount.html").read_text(encoding="utf-8")
for required in [
    "九州ふっこう応援割",
    "最大60％",
    "https://fightkyushu.welcomekyushu.jp/",
    "https://travel.yahoo.co.jp/feature/kyushuouen/",
    "https://www.jtb.co.jp/kokunai/kyushu-ouen/",
    "https://www.jalan.net/kyushu-shien/",
    "一部リンクは広告です",
]:
    if required not in kyushu:
        errors.append(f"kyushu-recovery-discount.html missing required text: {required}")
if kyushu.count('<a href="' + affiliate_href + '" rel="nofollow">【ヤフートラベル】</a>') != 1:
    errors.append("kyushu-recovery-discount.html must keep one exact A8-generated Yahoo! Travel text anchor")
if kyushu.count('<img border="0" width="1" height="1" src="' + affiliate_pixel + '" alt="">') != 1:
    errors.append("kyushu-recovery-discount.html must keep one exact A8-generated tracking pixel")

styles_path = ROOT / "styles.css"
if not styles_path.is_file():
    errors.append("missing: styles.css")
else:
    styles = styles_path.read_text(encoding="utf-8")
    if "\\n" in styles:
        errors.append("styles.css contains literal backslash-n escape; use real newlines")

robots_path = ROOT / "robots.txt"
if not robots_path.is_file():
    errors.append("missing: robots.txt")
else:
    robots = robots_path.read_text(encoding="utf-8")
    sitemap_ref = f"Sitemap: {PUBLIC_ORIGIN}/sitemap.xml"
    if sitemap_ref not in robots:
        errors.append(f"robots.txt missing sitemap reference: {sitemap_ref}")

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
