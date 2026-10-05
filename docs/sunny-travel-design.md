# Travel search design — 2026-10-05

The three independent discovery tabs remain map, date, and provider. Featured campaigns is a fourth browsing tab. Nothing requires choosing one axis before another.

## Visual choices

- Sky blue establishes the travel theme; coral draws attention to search actions and discount amounts; sunshine yellow marks periods with higher advertised rates.
- Color never carries the calendar information alone. Cells also contain a percentage or a fixed yen amount, and selected dates have an outline and pressed state.
- A restrained accent hierarchy follows [Nielsen Norman Group's color guidance](https://www.nngroup.com/articles/color-enhance-design/). This is a design hypothesis, not proof that a particular color increases purchases. The [color psychology review by Elliot (2015)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2015.00368/full) emphasizes context and limits of generalizing color effects.
- Legacy campaign guides use the same shared palette. Existing ad destinations and tracking markup are unchanged.

## Date discovery

A vertical October–December overview shows the leading campaign, target area, maximum advertised rate, and that campaign's associated cap. Clicking a month opens its calendar. The month overview remains the initial date-tab display on a fresh load; “月一覧” returns from the calendar.

Calendar intensity uses only records with a known stay period: 50% or more, 20–49%, and below 20%. Fixed coupons are displayed in yen and do not enter this percentage scale. Rates from separate campaigns are never added.

The sidebar orders advertised rates descending, then lists fixed coupons separately. It shows scope and caps. Unknown caps and unknown stay periods remain explicitly unknown. These booking candidates do not establish eligibility for the chosen day.

## Automatic search

The form has destination, stay date, adults, and children. Its empty defaults read “一番お得な場所” and “一番お得な日”. The duplicate month field and requested extra copy are removed.

If place or date is automatic, search selects the largest known advertised rate among campaigns whose published stay period matches the explicit conditions. With an automatic day it searches future dates within the prototype's October–December range, choosing the earliest date when the leading rate ties. It opens Featured Campaigns, marks the matching card, and opens its corresponding detail pop. Explicit input conditions are preserved. Without a known matching stay period it displays an empty result rather than inventing a date match. With both place and day specified, search displays provider results.

This ranks headline benefits, not accommodation prices. Points and cash discounts are not converted into an equivalent saving. Fixed coupons are not converted to percentages. Inventory, budget availability, facilities, and child eligibility still require their actual conditions.

## Data boundaries

`campaign-highlights.json` contains a curated prefectural-program headline separately from provider eligibility data. On 2026-10-05, the [Kyushu official site](https://fightkyushu.welcomekyushu.jp/) showed Kumamoto at up to 60%, October 1–December 25 stays, and lodging-only cap ¥20,000 per person per trip. Kagoshima's Kyushu recovery discount was still being coordinated; the popup and guide reflect that distinction. Okinawa is excluded.

`design-samples.json` contains fictional records and explicitly fictional varying rate periods. Samples remain labeled and have no booking destinations. Confirmed provider data and its guarded currency estimator keep their existing public-offer contract.

## Verification

Run `python3 scripts/check_site.py`, `python3 scripts/check_public_offer_contract.py`, `python3 scripts/check_offer_freshness.py`, and `python3 scripts/build_cloudflare.py`.

Run `node scripts/qa_flexible_search.cjs` with Playwright available. It verifies all six axis orders, five viewport widths, month-first display, calendar boundaries, ranked scope/cap display, automatic and fixed-plan searches, fixed coupons, unknown-period empty results, state retention, sample-detail navigation, carousel controls/reduced motion, and load-error recovery. Screenshots and its result JSON are saved under ignored `artifacts/flexible-search/`. The test browser closes in `finally`.

Publication remains outside this local design review. The existing localhost server and review tab are retained for the user; their lifecycle is recorded in the execution map.
