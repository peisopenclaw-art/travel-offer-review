# travel-offer-review

Secret-free static review media for the domestic travel offer comparison beta.

## Development

- Source of truth: GitHub `main`
- Flow: task branch → `python3 scripts/check_site.py` → GitHub Actions → main
- No production DB, snapshots, logs, credentials, tokens, cookies, or personal data are stored here.
- The dynamic `travel-campaign-monitor` runtime is a separate system.
