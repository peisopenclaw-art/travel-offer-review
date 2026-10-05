# Travel search design — 2026-10-05

The three independent discovery tabs remain map, date, and provider. Featured campaigns is a fourth browsing tab. Nothing requires choosing one axis before another.

## Visual choices

- Sky blue establishes the travel theme; coral draws attention to search actions and discount amounts; sunshine yellow marks periods with higher advertised rates.
- Color never carries the calendar information alone. Cells also contain a percentage or a fixed yen amount, and selected dates have an outline and pressed state.
- A restrained accent hierarchy follows [Nielsen Norman Group's color guidance](https://www.nngroup.com/articles/color-enhance-design/). This is a design hypothesis, not proof that a particular color increases purchases. The [color psychology review by Elliot (2015)](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2015.00368/full) emphasizes context and limits of generalizing color effects.
- Legacy campaign guides use the same shared palette. Existing ad destinations and tracking markup are unchanged.

## Date discovery

A vertical October 2026–March 2027 overview shows the leading campaign, target area, maximum advertised rate, and that campaign's associated cap. Clicking a month opens all applicable campaigns for that month, followed by its calendar. The month overview remains the initial date-tab display on a fresh load; “月一覧” returns from the drilldown and calendar.

Calendar intensity uses only records with a known stay period: 50% or more, 20–49%, and below 20%. Fixed coupons are displayed in yen and do not enter this percentage scale. Rates from separate campaigns are never added.

The sidebar orders advertised rates descending, then lists fixed coupons separately. It shows scope and caps. Unknown caps and unknown stay periods remain explicitly unknown. These booking candidates do not establish eligibility for the chosen day.

## Automatic search

The form has destination, stay date, adults, and children. Its empty defaults read “一番お得な場所” and “一番お得な日”. The duplicate month field and requested extra copy are removed.

If place or date is automatic, search selects the largest known advertised rate among campaigns whose published stay period matches the explicit conditions. With an automatic day it searches future dates within the prototype's October 2026–March 2027 range, choosing the earliest date when the leading rate ties. It opens Featured Campaigns, marks the matching card, and opens its corresponding detail pop. Explicit input conditions are preserved. Without a known matching stay period it displays an empty result rather than inventing a date match. With both place and day specified, search displays provider results.

This ranks headline benefits, not accommodation prices. Points and cash discounts are not converted into an equivalent saving. Fixed coupons are not converted to percentages. Inventory, budget availability, facilities, and child eligibility still require their actual conditions.

## Data boundaries

`campaign-highlights.json` contains a curated prefectural-program headline separately from provider eligibility data. On 2026-10-05, the [Kyushu official site](https://fightkyushu.welcomekyushu.jp/) showed Kumamoto at up to 60%, October 1–December 25 stays, and lodging-only cap ¥20,000 per person per trip. Kagoshima's Kyushu recovery discount was still being coordinated; the popup and guide reflect that distinction. Okinawa is excluded.

`design-samples.json` contains fictional records and explicitly fictional varying rate periods. Samples remain labeled and have no booking destinations. Confirmed provider data and its guarded currency estimator keep their existing public-offer contract.

## Verification

Run `python3 scripts/check_site.py`, `python3 scripts/check_public_offer_contract.py`, `python3 scripts/check_offer_freshness.py`, and `python3 scripts/build_cloudflare.py`.

Run `node scripts/qa_flexible_search.cjs` with Playwright available. It verifies all six axis orders, five viewport widths, month-first display, calendar boundaries, ranked scope/cap display, automatic and fixed-plan searches, fixed coupons, unknown-period empty results, state retention, sample-detail navigation, carousel controls/reduced motion, and load-error recovery. Screenshots and its result JSON are saved under ignored `artifacts/flexible-search/`. The test browser closes in `finally`.

Publication remains outside this local design review. The existing localhost server and review tab are retained for the user; their lifecycle is recorded in the execution map.

## Compact review refinements — 2026-10-05

The search bar uses an icon beside each value, with adults and children on one row. Its desktop height is about 60px. The preview banner, map/date headings, calendar data note, and extra color-comparison caption were removed at the reviewer's request. Percentage and cap icons remain visible at mobile widths.

The filter bar has a border and a highlighted “絞り込み中” state. The former share action now has the explicit copy label “検索条件のリンクをコピー” and copies the condition URL, with a manual-copy fallback. It occupies the same filter bar instead of adding a separate line.

Map and calendar sidebars share the same ranked summaries. “日付を選ぶ” opens the calendar scoped to the selected region. Clicking the calendar region returns to the map while retaining the conditions. The open-calendar state is encoded in the URL so a copied link/reload keeps that view. Month arrows flank the month label. Desktop calendar and offer summary panels share their height; day cells add the leading offer's cap and count of known-period campaigns. Mobile panels stack.

The six-month list crosses into 2027. January–March offers use explicitly marked fictional sample periods; the real Kumamoto campaign still ends December 25. Confirmed provider data was not extended into unknown stay periods. The official campaign pop now contains one detail link directly to the official information instead of a duplicate internal-guide action.

Acceptance: 52 automated checks passed, including six-month/year-boundary dates, compact form geometry, equal desktop panel heights, region handoff/return, calendar reload state, and the single official destination.

## Availability and geographic drilldown — review round 4

The map header now switches between discounts whose booking has started and those whose booking start is still ahead. Date discovery provides active, upcoming, and both controls beside the percentage/cap legend on the left. These controls share one URL-backed filter. Booking status and the explicitly displayed stay period are separate facts; neither establishes remaining budget or actual availability. A missing stay period remains “未掲載”. The map's redundant heading, standalone Kyushu link, and “公式掲載” badges are removed.

`search-geography.json` supplies eight regions, 47 prefectures, and four prototype municipality nodes: Sendai, Matsushima, Kumamoto, and Naha. The destination menu and map breadcrumbs allow stopping at any level. Prefecture selection includes its city campaigns, and city selection includes applicable parent-area and nationwide campaigns; sibling places are excluded. Geography persists through date/provider handoffs, details, and reloads. The existing prefectural Japan illustration scales further at region, prefecture, and city levels. Municipality boundaries are not a new geographic dataset. More municipalities can be added when campaign data provides their scope. Miyagi, Sendai, and upcoming Okinawa records are clearly labeled fictional samples.

The monthly drilldown lists every matching campaign, including alternatives to the maximum-rate campaign. Each summary shows its scope, cap, stay period, booking phase, and participating OTA marks. A direct calendar jump remains available beneath the monthly summary view. Search fields share a consistent baseline; the duplicate right calendar decoration is removed, and the single left calendar button opens the native date picker.

The [official Kumamoto OTA list](https://kumamoto-ouenwari.com/ota-list.html) was inspected on October 5: Rakuten Travel and Jalan were listed with September 15 booking starts. The curated program now names these two OTA participants and its Kumamoto geographic scope; confirmed provider eligibility records remain separate and unchanged. Official header marks are used for [Rakuten Travel](https://travel.rakuten.co.jp/), [Jalan](https://www.jalan.net/), [Yahoo! Travel](https://travel.yahoo.co.jp/), [Ikyu](https://www.ikyu.com/), and [JTB](https://www.jtb.co.jp/). The latter three header SVGs are preserved as script-free local assets; an unknown future provider falls back to its name rather than an invented mark.

Acceptance is recorded in the execution map and `artifacts/flexible-search/qa.json`. The acceptance browser fixes its clock to October 5 for reproducible booking-phase fixtures; production UI uses the real current time. The additional coverage checks booking phases, monthly alternatives, period/OTA rendering and image loading, prefecture-level searches, city-level handoffs and reloads, sibling exclusion, invalid destinations, and three widths for geographic drilldown.
