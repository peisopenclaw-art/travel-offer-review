# travel-offer-review

Secret-free static review media for the domestic travel offer comparison beta.

## Development

- Source of truth: GitHub `main`
- Flow: task branch → `python3 scripts/check_site.py` → GitHub Actions → main
- No production DB, snapshots, logs, credentials, tokens, cookies, or personal data are stored here.
- The dynamic `travel-campaign-monitor` runtime is a separate system.

## Revenue observability

The production site stays live while analytics changes are prepared on a task branch.

Release gate:
- Put the GA4 web-stream measurement ID in `analytics-config.js`.
- Keep A8-generated affiliate markup unchanged.
- `offer_view` records a 50% first-view of each offer card.
- `offer_outbound_click` records the offer id, placement, link role, and destination domain without sending direct personal identifiers.
- Run `python3 scripts/check_site.py`; it intentionally fails while the GA4 measurement ID is missing.
- After Google Analytics is connected to GSC Wizard, reconcile GSC acquisition, GA4 onsite behavior, and A8 click/result/approval reports. Do not treat an outbound click as a booking.
