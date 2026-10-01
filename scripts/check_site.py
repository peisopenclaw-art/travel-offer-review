from html.parser import HTMLParser
from pathlib import Path
import os
import re
import sys
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SELF = Path(__file__).resolve()
HTML = [ROOT / "index.html", ROOT / "offers.html", ROOT / "decision.html", ROOT / "about.html", ROOT / "privacy.html", ROOT / "yahoo-travel-campaign.html"]
PUBLIC_ORIGIN = "https://travel.tokuerabi.com"
CANONICALS = {
    "index.html": f"{PUBLIC_ORIGIN}/",
    "offers.html": f"{PUBLIC_ORIGIN}/offers.html",
    "decision.html": f"{PUBLIC_ORIGIN}/decision.html",
    "about.html": f"{PUBLIC_ORIGIN}/about.html",
    "privacy.html": f"{PUBLIC_ORIGIN}/privacy.html",
    "yahoo-travel-campaign.html": f"{PUBLIC_ORIGIN}/yahoo-travel-campaign.html",
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

public_analytics_pages = ["index.html", "offers.html", "about.html", "privacy.html", "yahoo-travel-campaign.html"]
for page_name in public_analytics_pages:
    page_text = (ROOT / page_name).read_text(encoding="utf-8")
    for script_name in ["analytics-config.js", "analytics.js"]:
        expected_script = f'<script src="{script_name}" defer></script>'
        if expected_script not in page_text:
            errors.append(f"{page_name}: missing analytics script: {script_name}")

analytics_path = ROOT / "analytics.js"
analytics_config_path = ROOT / "analytics-config.js"
measurement_id = ""
if not analytics_path.is_file():
    errors.append("missing: analytics.js")
if not analytics_config_path.is_file():
    errors.append("missing: analytics-config.js")
else:
    analytics_config = analytics_config_path.read_text(encoding="utf-8")
    match = re.search(r'ga4MeasurementId:\\s*"([^"]*)"', analytics_config)
    if not match:
        errors.append("analytics-config.js missing ga4MeasurementId")
    else:
        measurement_id = match.group(1)
        if measurement_id and not re.fullmatch(r"G-[A-Z0-9]+", measurement_id):
            errors.append("analytics-config.js contains an invalid GA4 measurement ID")
        if os.environ.get("REQUIRE_GA4") == "1" and not re.fullmatch(r"G-[A-Z0-9]+", measurement_id):
            errors.append("GA4 release gate requires an active measurement ID")

if analytics_path.is_file():
    analytics = analytics_path.read_text(encoding="utf-8")
    for required_event in [
        "offer_view",
        "offer_outbound_click",
        "decision_destination_select",
        "decision_step_action",
        "offer_detail_open",
    ]:
        if f'"{required_event}"' not in analytics:
            errors.append(f"analytics.js missing event: {required_event}")
    for forbidden_param in ["email", "phone", "full_name", "user_name"]:
        if re.search(rf'["\\']{forbidden_param}["\\']\\s*:', analytics):
            errors.append(f"analytics.js must not send direct PII field: {forbidden_param}")

privacy_text = (ROOT / "privacy.html").read_text(encoding="utf-8")
if "Google Analytics 4" not in privacy_text:
    errors.append("privacy.html missing analytics disclosure")

index = (ROOT / "index.html").read_text(encoding="utf-8")
for required in ["トクえらび", "どこへ行く？", "decision-ui.css", "decision-ui.js"]:
    if required not in index:
        errors.append(f"index.html missing decision UI marker: {required}")

offers = (ROOT / "offers.html").read_text(encoding="utf-8")
required_offer_ids = [
    "yahoo-always-10",
    "yahoo-ryokan-resort-sale",
    "yahoo-popular-hotels-sale",
]
for offer_id in required_offer_ids:
    if offers.count(f'data-offer-id="{offer_id}"') != 1:
        errors.append(f"offers.html must contain exactly one analytics offer id: {offer_id}")
if offers.count('data-offer-placement="') != 3:
    errors.append("offers.html must identify exactly 3 offer placements")

for required in ["旅行オファー比較", "一次情報", "広告"]:
    if required not in offers:
        errors.append(f"offers.html missing required text: {required}")

affiliate_href = "https://px.a8.net/svt/ejp?a8mat=4B3UZ5+38P0W2+4ZCO+60WN6"
affiliate_pixel = "https://www13.a8.net/0.gif?a8mat=4B3UZ5+38P0W2+4ZCO+60WN6"
if offers.count(affiliate_href) != 2:
    errors.append(f"offers.html affiliate href count must be 2, got {offers.count(affiliate_href)}")
if offers.count(affiliate_pixel) != 2:
    errors.append(f"offers.html affiliate pixel count must be 2, got {offers.count(affiliate_pixel)}")
official_affiliate_material = f'''<a href="{affiliate_href}" rel="nofollow">【ヤフートラベル】</a>\n              <img border="0" width="1" height="1" src="{affiliate_pixel}" alt="">'''
official_affiliate_material_feature = f'''<a href="{affiliate_href}" rel="nofollow">【ヤフートラベル】</a>\n              <img border="0" width="1" height="1" src="{affiliate_pixel}" alt="">'''
if offers.count('<a href="' + affiliate_href + '" rel="nofollow">【ヤフートラベル】</a>') != 2:
    errors.append("offers.html must keep the A8-generated Yahoo! Travel text anchor exactly twice")
if offers.count('<img border="0" width="1" height="1" src="' + affiliate_pixel + '" alt="">') != 2:
    errors.append("offers.html must keep the A8-generated tracking pixel markup exactly twice")
if f'class="primary-cta" href="{affiliate_href}"' in offers or "Yahoo!トラベルで見る" in offers:
    errors.append("offers.html must not customize the A8-generated Yahoo! Travel ad material")
if 'アフィリエイト広告はまだ有効化していません' in offers:
    errors.append("offers.html still says affiliate ads are disabled")
if '一部リンクは広告です' not in offers:
    errors.append("offers.html missing concise affiliate disclosure")
for source_url in [
    "https://travel.yahoo.co.jp/feature/campaign_pointup/",
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
    ]
    for url in sitemap_urls:
        if sitemap.count(f"<loc>{url}</loc>") != 1:
            errors.append(f"sitemap.xml must contain exactly one URL: {url}")

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
