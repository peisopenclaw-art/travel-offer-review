from datetime import datetime
from pathlib import Path
import json
import sys

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "decision-data.json"
UI = ROOT / "decision-ui.js"

errors = []

def fail(message):
    errors.append(message)

def parse_dt(value, label):
    if value is None:
        return
    try:
        dt = datetime.fromisoformat(value)
    except ValueError:
        fail(f"{label}: invalid ISO datetime: {value}")
        return
    if dt.tzinfo is None:
        fail(f"{label}: timezone offset required")

payload = json.loads(DATA.read_text(encoding="utf-8"))

if payload.get("schema_version") != "public-offer-v1":
    fail("schema_version must be public-offer-v1")
if payload.get("data_level") != 1:
    fail("data_level must remain 1 until comparable price/inventory is connected")
if payload.get("price_inventory_available") is not False:
    fail("Level 1 must not claim price/inventory availability")

rules = payload.get("comparison_rules") or {}
for key in [
    "booking_window_is_not_stay_window",
    "do_not_sum_rates_between_offers",
    "minimum_rate_is_not_exact_rate",
    "all_match_requirements_must_pass_before_eligible",
]:
    if rules.get(key) is not True:
        fail(f"comparison_rules.{key} must be true")
if rules.get("price_sort_enabled") is not False:
    fail("comparison_rules.price_sort_enabled must be false at Level 1")

offers = payload.get("offers") or []
ids = [offer.get("id") for offer in offers]
if len(ids) != len(set(ids)):
    fail("offer ids must be unique")
known_ids = set(ids)

for offer in offers:
    oid = offer.get("id") or "<missing-id>"
    for key in ["provider", "product", "name", "scope", "booking_start", "stay_window", "property_scope", "benefit", "stacking", "match_requirements", "match_state_label", "summary", "condition_note", "source", "booking"]:
        if key not in offer:
            fail(f"{oid}: missing {key}")
    parse_dt(offer.get("booking_start"), f"{oid}.booking_start")
    parse_dt(offer.get("booking_end"), f"{oid}.booking_end")

    source = offer.get("source") or {}
    url = source.get("official_url", "")
    if not url.startswith("https://travel.yahoo.co.jp/"):
        fail(f"{oid}: official_url must be Yahoo! Travel official source in current sample")
    parse_dt(source.get("source_updated_at"), f"{oid}.source_updated_at")
    parse_dt(source.get("checked_at"), f"{oid}.checked_at")

    booking = offer.get("booking") or {}
    provider_url = booking.get("provider_url", "")
    if not provider_url.startswith("https://travel.yahoo.co.jp/"):
        fail(f"{oid}: booking.provider_url must use the official Yahoo! Travel destination in current sample")
    if booking.get("monetization") != "official_non_affiliate_prototype":
        fail(f"{oid}: prototype booking link must explicitly remain non-affiliate until revenue wiring is approved")

    benefit = offer.get("benefit") or {}
    semantics = benefit.get("rate_semantics")
    label = benefit.get("display_label", "")
    if semantics == "minimum_total" and "以上" not in label:
        fail(f"{oid}: minimum_total must visibly say 以上")
    if semantics != "minimum_total" and "以上" in label:
        fail(f"{oid}: non-minimum rate must not use 以上")
    includes = benefit.get("includes_offer_ids") or []
    for included in includes:
        if included not in known_ids:
            fail(f"{oid}: includes unknown offer {included}")
        if included == oid:
            fail(f"{oid}: offer cannot include itself")

    property_mode = (offer.get("property_scope") or {}).get("mode")
    reqs = set(offer.get("match_requirements") or [])
    if property_mode == "limited_property_plan" and "property_plan_check" not in reqs:
        fail(f"{oid}: limited property/plan offer must require property_plan_check")
    if property_mode == "mostly_all_with_exclusions" and "property_exclusion_check" not in reqs:
        fail(f"{oid}: exclusion offer must require property_exclusion_check")

    stay = offer.get("stay_window") or {}
    if stay.get("mode") == "provider_plan_availability" and stay.get("campaign_level_date_decidable") is not False:
        fail(f"{oid}: provider-plan stay window cannot be campaign-level date-decidable")

    stacking = offer.get("stacking") or {}
    if includes and not stacking.get("note"):
        fail(f"{oid}: included benefit requires an explicit non-addition note")

ui = UI.read_text(encoding="utf-8")
if "function bookingOverlap" in ui:
    fail("decision-ui.js must not filter booking campaigns by selected stay month")
if "return b.rate_value - a.rate_value" in ui:
    fail("decision-ui.js must not rank Level 1 offers by headline rate")
if "offerDecisionState" not in ui:
    fail("decision-ui.js must expose additional-condition decision state")
if "includes_offer_ids" not in ui:
    fail("decision-ui.js must surface included-benefit semantics")
if "function goToStep" not in ui or "function loadUrlState" not in ui or "function buildStateUrl" not in ui:
    fail("decision-ui.js must support independent search views and shareable URL state")
view_block = ui.split("function goToStep", 1)[1].split("function renderAll", 1)[0]
if "!state.destination" in view_block or "!state.travelDate" in view_block:
    fail("search views must not require destination or date selection")
samples = json.loads((ROOT / "design-samples.json").read_text(encoding="utf-8")).get("offers", [])
for sample in samples:
    if sample.get("sample") is not True:
        fail("design sample must explicitly set sample: true")
    if sample.get("booking") or sample.get("source"):
        fail("fictional offers must not provide official or booking links")
    if sample.get("id") in known_ids:
        fail("sample IDs must be separate from confirmed offer IDs")

if "function estimateDiscountForBenefit" not in ui or "function estimateDiscount" not in ui:
    fail("decision-ui.js must implement the guarded Level 2 estimator")
estimate_block = ui.split("function estimateDiscount", 1)[1].split("function formatDateTime", 1)[0] if "function estimateDiscount" in ui and "function formatDateTime" in ui else ""
for allowed in ['benefit.kind === "coupon_rate"', 'benefit.kind === "coupon_fixed"']:
    if allowed not in estimate_block:
        fail(f"safe estimator missing whitelist branch: {allowed}")
if 'benefit.kind === "paypay_total_rate"' in estimate_block:
    fail("paypay_total_rate must never be converted to a coupon discount estimate")
for guard in ['benefit.currency === "JPY"', 'benefit.calculation_base === "eligible_stay_amount"', 'benefit.rounding !== "floor"', 'benefit.minimum_spend']:
    if guard not in estimate_block:
        fail(f"safe estimator missing required calculation guard: {guard}")
if "ポイント型のため割引額に換算しません" not in ui:
    fail("UI must explicitly refuse reward-point-to-discount conversion")
if "navigator.share" not in ui or "navigator.clipboard" not in ui:
    fail("shareable URL control must support native share or clipboard fallback")

if errors:
    print("\n".join(errors))
    sys.exit(1)
print("public offer contract: PASS")
