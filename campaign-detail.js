(function () {
  "use strict";
  function escapeHtml(value) { return String(value == null ? "" : value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  async function boot() {
    var target = document.querySelector("#campaign-detail");
    var params = new URLSearchParams(window.location.search);
    var search = new URL("./", window.location.href);
    search.search = params.toString(); search.searchParams.delete("campaign"); search.searchParams.set("view", "campaign");
    document.querySelector("#back-to-search").href = search.pathname + search.search;
    var controller = new AbortController();
    var timeout = window.setTimeout(function () { controller.abort(); }, 10000);
    try {
      var response = await fetch("design-samples.json", {signal: controller.signal});
      if (!response.ok) throw new Error("sample unavailable");
      var data = await response.json();
      var offer = data.offers.find(function (item) { return item.id === params.get("campaign"); });
      if (!offer) { target.innerHTML = '<h1>この特集は見つかりませんでした</h1><p>キャンペーン一覧から選び直してください。</p>'; return; }
      var date = params.get('date'), rate = offer.benefit.rate_percent;
      (offer.sample_periods || []).forEach(function(period) { if(date && date >= period.start && date <= period.end) rate=period.rate_percent; });
      var displayBenefit = rate ? rate+'％（サンプル）' : offer.benefit.display_label;
      document.title = offer.name + "（サンプル） | トクえらび";
      var apply = new URL(search); apply.searchParams.set("view", "provider"); apply.searchParams.set("provider", offer.provider);
      var places=offer.geo_ids || offer.regions;
      if (places.length) apply.searchParams.set("destination", places[0]); else apply.searchParams.delete("destination");
      target.innerHTML = '<section class="sample-feature">' + (offer.image ? '<img src="' + escapeHtml(offer.image) + '" alt="' + escapeHtml(offer.name) + 'の旅行先イメージ">' : '') + '<div><span class="banner-tag">季節の特集 <small>サンプル</small></span><h1>' + escapeHtml(offer.name) + '</h1><p>' + escapeHtml(offer.summary) + '</p></div></section><div class="sample-detail-layout"><section class="sample-detail-copy"><p class="sample-detail-note">架空のキャンペーンです。デザイン確認用のため、実際の予約には使えません。</p><h2>休日の楽しみを、もうひとつ。</h2><p>気になる景色に出会ったら、旅行の計画を始めてみませんか。行き先・日付・旅行会社を自由に組み合わせて、宿泊特典を探せます。</p><h2>キャンペーン条件の表示例</h2><dl><div><dt>旅行会社</dt><dd>' + escapeHtml(offer.provider) + '</dd></div><div><dt>対象地域</dt><dd>' + escapeHtml(offer.scope) + '</dd></div><div><dt>対象宿泊期間</dt><dd>' + escapeHtml(offer.sample_stay_start) + ' 〜 ' + escapeHtml(offer.sample_stay_end) + '</dd></div><div><dt>最低宿泊料金</dt><dd>20,000円（サンプル）</dd></div></dl><p class="photo-caption">人数は検索条件です。子供料金・年齢区分・クーポン適用条件は予約先ごとに異なります。写真は旅行先のイメージです。阿蘇：STA3816 / CC BY-SA 3.0。</p></section><aside class="sample-detail-benefit"><span class="sample-badge">特典の表示例</span><p class="offer-benefit">' + escapeHtml(displayBenefit) + '</p><p class="offer-cap">' + escapeHtml(offer.benefit.cap_label) + '</p><a class="primary-action" href="' + escapeHtml(apply.pathname + apply.search) + '">この地域・旅行会社で探す →</a><small>検索条件へ反映します。予約は行いません。</small></aside></div>';
    } catch (error) {
      target.innerHTML = '<p class="load-error">特集を読み込めませんでした。条件はURLに保持しています。</p><button type="button" class="secondary-action" id="retry-detail">再読み込み</button>';
      document.querySelector("#retry-detail").addEventListener("click", function () { window.location.reload(); });
    } finally { window.clearTimeout(timeout); target.setAttribute("aria-busy", "false"); }
  }
  document.addEventListener("DOMContentLoaded", boot);
}());
