(function () {
  "use strict";

  var MONTHS = ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02", "2027-03"];
  var STORAGE_KEY = "tokuerabi-flexible-search-v2";
  var state = {
    destination: "",
    availability: "active",
    month: "2026-10",
    adults: 2,
    children: 0,
    provider: "",
    travelDate: "",
    assumedPrice: null,
    step: 1
  };
  var data = null, geography = [];
  var calendarOpen = false, bestResult = null;
  var slideIndex = 0, slideTimer = null, carouselPaused = false;

  var els = {};

  function $(selector) {
    return document.querySelector(selector);
  }

  function $all(selector) {
    return Array.prototype.slice.call(document.querySelectorAll(selector));
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadStoredState() {
    try {
      var saved = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || "{}");
      if (typeof saved.destination === "string") state.destination = saved.destination;
      if (["active","upcoming","all"].indexOf(saved.availability) >= 0) state.availability = saved.availability;
      if (MONTHS.indexOf(saved.month) >= 0) state.month = saved.month;
      if (Number.isInteger(saved.adults) && saved.adults >= 1 && saved.adults <= 9) state.adults = saved.adults;
      if (validDate(saved.travelDate)) state.travelDate = saved.travelDate;
      if (Number.isFinite(saved.assumedPrice) && saved.assumedPrice >= 0) state.assumedPrice = saved.assumedPrice;
      if (Number.isInteger(saved.children) && saved.children >= 0 && saved.children <= 6) state.children = saved.children;
      if (["Yahoo!トラベル", "楽天トラベル", "じゃらん", "JTB", "一休.com", ""].indexOf(saved.provider) >= 0) state.provider = saved.provider;
      if ([1, 2, 3, 4].indexOf(saved.step) >= 0) state.step = saved.step;
    } catch (error) {
      // Storage may be disabled; keep the in-memory conditions.
    }
  }

  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "") || MONTHS.indexOf(value.slice(0,7)) < 0) return false;
    var date = new Date(value + "T00:00:00Z");
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }


  function loadUrlState() {
    var params = new URLSearchParams(window.location.search);
    if (!params.size) return;
    // A shared URL fully describes conditions; do not inherit another session's filters.
    state.destination = ""; state.travelDate = ""; state.provider = ""; state.availability = "active";
    state.adults = 2; state.children = 0; state.assumedPrice = null; state.month = "2026-10"; state.step = 1;
    var destination = params.get("destination"), month = params.get("month"), date = params.get("date");
    if (/^[a-z][a-z-]{0,30}$/.test(destination || "")) state.destination = destination;
    if (["active","upcoming","all"].indexOf(params.get("availability")) >= 0) state.availability=params.get("availability");
    if (MONTHS.indexOf(month) >= 0) state.month = month;
    if (validDate(date)) { state.travelDate = date; state.month = date.slice(0, 7); }
    var adults = Number(params.get("adults")), children = Number(params.get("children"));
    if (Number.isInteger(adults) && adults >= 1 && adults <= 9) state.adults = adults;
    if (Number.isInteger(children) && children >= 0 && children <= 6) state.children = children;
    if (["Yahoo!トラベル", "楽天トラベル", "じゃらん", "JTB", "一休.com"].indexOf(params.get("provider")) >= 0) state.provider = params.get("provider");
    calendarOpen = params.get("calendar") === "1";
    var views = { map: 1, date: 2, provider: 3, campaign: 4 };
    if (views[params.get("view")]) state.step = views[params.get("view")];
    var price = Number(params.get("price"));
    if (params.has("price") && Number.isFinite(price) && price >= 0) state.assumedPrice = Math.round(price);
  }


  function buildStateUrl() {
    var url = new URL(window.location.href);
    url.search = "";
    if (state.availability !== "active") url.searchParams.set("availability",state.availability);
    if (state.destination) url.searchParams.set("destination", state.destination);
    url.searchParams.set("month", state.month);
    url.searchParams.set("view", ["", "map", "date", "provider", "campaign"][state.step]);
    if (calendarOpen) url.searchParams.set("calendar", "1");
    if (state.provider) url.searchParams.set("provider", state.provider);
    if (state.children) url.searchParams.set("children", String(state.children));
    if (state.travelDate) url.searchParams.set("date", state.travelDate);
    if (state.adults !== 2) url.searchParams.set("adults", String(state.adults));
    if (Number.isFinite(state.assumedPrice) && state.assumedPrice > 0) url.searchParams.set("price", String(state.assumedPrice));
    return url;
  }

  function syncUrl() {
    window.history.replaceState(null, "", buildStateUrl().toString());
  }

  function persistState() {
    try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (error) { /* URL and memory remain available. */ }
    syncUrl();
  }

  function regionById(id) {
    if (!data) return null;
    return data.regions.find(function (region) { return region.id === id; }) || null;
  }

  function geoNode(id) { return geography.find(function(node) { return node.id===id; }); }
  function geoAncestors(id) { var ids=[],node=geoNode(id); while(node) { ids.push(node.id);node=geoNode(node.parent); } return ids; }
  function geoMatches(offer,selected) {
    var destination=selected===undefined ? state.destination : selected;
    if (!destination || offer.scope === '全国') return true;
    return (offer.geo_ids || offer.regions || []).some(function(id) { return geoAncestors(id).indexOf(destination)>=0 || geoAncestors(destination).indexOf(id)>=0; });
  }
  function destinationName() { var node=geoNode(state.destination);return node ? node.name : '全国'; }
  function availabilityOf(offer) {
    var today=new Date().toLocaleDateString('sv-SE',{timeZone:'Asia/Tokyo'});
    var start=offer.sample ? offer.sample_booking_start : offer.booking_start;
    if (start && (offer.sample ? today<start : Date.now()<Date.parse(start))) return 'upcoming';
    if (!offer.sample && offerStatus(offer).key==='ended') return 'ended';
    return 'active';
  }
  function availabilityMatches(offer) { var status=availabilityOf(offer);return status!=='ended' && (state.availability==='all' || status===state.availability); }
  function periodLabel(offer) { return stayStart(offer) ? stayStart(offer).replace(/-/g,'/') + '〜' + stayEnd(offer).replace(/-/g,'/') + (offer.sample ? '（例）' : '宿泊分') : '宿泊対象期間：未掲載'; }
  function otaLogos(offer) {
    var images={'楽天トラベル':'https://trvimg.r10s.jp/share/common/images/travel-logo-pc.png','じゃらん':'https://www.jalan.net/assets/img/pages/smart/header/header_logo_sp.svg','Yahoo!トラベル':'yahoo-travel-logo.svg','一休.com':'ikyu-logo.svg','JTB':'jtb-logo.svg'};
    var names=offer.otas || [offer.provider];
    return '<span class="ota-logos" aria-label="取扱OTA">' + names.map(function(name) { return images[name] ? '<span class="ota-logo"><img src="'+images[name]+'" alt="'+escapeHtml(name)+'" loading="lazy"></span>' : '<span class="ota-logo ota-wordmark" data-brand="'+escapeHtml(name)+'">'+escapeHtml(name)+'</span>'; }).join('') + '</span>';
  }
  function renderGeography() {
    var selected=geoNode(state.destination), root=selected ? geoAncestors(selected.id).slice(-1)[0] : '';
    var options='<option value="">一番お得な場所</option>';
    geography.filter(function(n){return n.level==='region';}).forEach(function(region) {
      options+='<optgroup label="'+escapeHtml(region.name)+'"><option value="'+region.id+'">'+escapeHtml(region.name)+'全体</option>';
      geography.filter(function(n){return n.parent===region.id;}).forEach(function(pref) {
        options+='<option value="'+pref.id+'">'+escapeHtml(pref.name)+'</option>';
        geography.filter(function(n){return n.parent===pref.id;}).forEach(function(city){options+='<option value="'+city.id+'">'+escapeHtml(pref.name)+' / '+escapeHtml(city.name)+'</option>';});
      }); options+='</optgroup>';
    });
    els.destination.innerHTML=options;els.destination.value=state.destination;
    $('#geo-detail').hidden=!selected;
    $('#region-map').classList.toggle('is-zoomed',!!selected);
    $('#region-map').dataset.zoomRegion=root;
    $('#region-map').dataset.zoomLevel=selected ? selected.level : '';
    if (selected) {
      var children=geography.filter(function(n){return n.parent===selected.id;});
      var breadcrumbs=geoAncestors(selected.id).reverse().map(function(id){var n=geoNode(id);return '<button type="button" data-geo="'+id+'">'+escapeHtml(n.name)+'</button>';}).join('<span aria-hidden="true">›</span>');
      $('#geo-detail').innerHTML='<div class="geo-breadcrumb"><button type="button" data-geo="">全国</button><span aria-hidden="true">›</span>'+breadcrumbs+'</div><div class="geo-detail-heading"><strong>'+escapeHtml(selected.name)+'を拡大中</strong><button type="button" data-geo="'+escapeHtml(selected.parent)+'">'+(selected.parent ? 'ひとつ戻る' : '全国地図へ')+'</button></div><p class="geo-current">'+escapeHtml(selected.name)+'全体で検索中</p><div class="geo-options">'+children.map(function(node){return '<button type="button" data-geo="'+node.id+'"><strong>'+escapeHtml(node.name)+'</strong><small>'+(node.level==='prefecture'?'県全体でも検索できます':'この市町のクーポン')+'</small></button>';}).join('')+'</div>';
    }
    $all('[data-availability]').forEach(function(button){button.setAttribute('aria-pressed',String(button.dataset.availability===state.availability));});
    $('#regional-readiness').textContent=state.availability==='all' ? '開催中・開始予定を表示' : state.availability==='upcoming' ? '予約開始前の割引を表示' : '予約受付が始まった割引を表示';
    $all('.region-button').forEach(function(button){
      button.setAttribute('aria-selected',String(button.dataset.region===root));
      var offers=data.highlights.concat(data.offers).filter(function(offer){return geoMatches(offer,button.dataset.region) && availabilityMatches(offer);});
      var caption=button.querySelector('span:not(.hot-badge):not(.map-rate):not(.map-cap)');
      if(caption)caption.textContent=offers.length+'件の特典';
      if(button.dataset.region==='kyushu') {var rate=offers.reduce(function(max,offer){return Math.max(max,campaignRate(offer,state.travelDate));},0);button.querySelector('.map-rate').textContent=rate ? '最大'+rate+'％' : '特典なし';button.querySelector('.map-cap').textContent=state.availability==='upcoming' ? '開始予定・サンプルを含む' : '対象地域は詳細で確認';}
    });
  }

  function formatMonth(month) {
    var parts = month.split("-");
    return Number(parts[0]) + "年" + Number(parts[1]) + "月";
  }

  function formatDate(dateString) {
    if (!dateString) return "日付未定";
    var parts = dateString.split("-");
    return Number(parts[1]) + "月" + Number(parts[2]) + "日";
  }

  function formatYen(value) {
    return new Intl.NumberFormat("ja-JP").format(Math.round(value)) + "円";
  }

  function estimateDiscountForBenefit(benefit, assumedPrice) {
    if (!Number.isFinite(assumedPrice) || assumedPrice <= 0) {
      return { key: "not-entered", label: "料金未入力" };
    }
    benefit = benefit || {};
    var baseReady = benefit.currency === "JPY" &&
      benefit.calculation_base === "eligible_stay_amount" &&
      Number.isFinite(benefit.minimum_spend) &&
      benefit.minimum_spend >= 0;

    if (benefit.kind === "coupon_rate") {
      var capKnown = Object.prototype.hasOwnProperty.call(benefit, "max_discount_amount") &&
        (benefit.max_discount_amount === null || Number.isFinite(benefit.max_discount_amount));
      if (!baseReady || benefit.rounding !== "floor" || !Number.isFinite(benefit.rate_percent) || !capKnown) {
        return { key: "not-calculable", label: "計算条件が未確認" };
      }
      if (assumedPrice < benefit.minimum_spend) {
        return { key: "below-minimum", label: "最低利用額未満" };
      }
      var rateAmount = Math.floor(assumedPrice * benefit.rate_percent / 100);
      if (Number.isFinite(benefit.max_discount_amount)) rateAmount = Math.min(rateAmount, benefit.max_discount_amount);
      return { key: "estimated", label: "約" + formatYen(rateAmount) };
    }

    if (benefit.kind === "coupon_fixed") {
      if (!baseReady || !Number.isFinite(benefit.discount_amount)) {
        return { key: "not-calculable", label: "計算条件が未確認" };
      }
      if (assumedPrice < benefit.minimum_spend) {
        return { key: "below-minimum", label: "最低利用額未満" };
      }
      return { key: "estimated", label: "約" + formatYen(Math.min(assumedPrice, benefit.discount_amount)) };
    }

    return { key: "not-calculable", label: "未算出（ポイント型）" };
  }

  function estimateDiscount(offer) {
    var benefit = Object.assign({}, offer.benefit || {});
    if (offer.sample_periods && state.travelDate) benefit.rate_percent = campaignRate(offer, state.travelDate);
    return estimateDiscountForBenefit(benefit, state.assumedPrice);
  }

  if (window.location.hostname === "127.0.0.1" || window.location.hostname === "localhost") {
    window.__TOKUERABI_QA__ = Object.freeze({ estimateDiscountForBenefit: estimateDiscountForBenefit });
  }

  function formatDateTime(value) {
    if (!value) return "終了日記載なし";
    var date = new Date(value);
    if (Number.isNaN(date.getTime())) return "確認中";
    return date.toLocaleString("ja-JP", {
      timeZone: "Asia/Tokyo",
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    });
  }

  function offerStatus(offer) {
    if (offer.sample) return { key: "sample", label: "サンプル・予約不可" };
    var now = Date.now();
    var start = offer.booking_start ? Date.parse(offer.booking_start) : null;
    var end = offer.booking_end ? Date.parse(offer.booking_end) : null;
    if (start && now < start) return { key: "scheduled", label: "開始予定" };
    if (end && now > end) return { key: "ended", label: "受付期間終了" };
    return { key: "active", label: "掲載中" };
  }

  function offerDecisionState(offer) {
    if (offer.sample) return { key: "sample", label: "デザイン確認用" };
    if ((offer.match_requirements || []).length) {
      return { key: "needs-more-data", label: offer.match_state_label || "追加条件の確認が必要" };
    }
    return { key: "candidate", label: "条件上の候補" };
  }

  function benefitLabel(offer) {
    return offer.benefit && offer.benefit.display_label ? offer.benefit.display_label : "確認中";
  }

  function benefitCapLabel(offer) {
    return offer.benefit && offer.benefit.cap_label ? offer.benefit.cap_label : "確認中";
  }

  function stayWindowLabel(offer) {
    return offer.stay_window && offer.stay_window.label ? offer.stay_window.label : "確認中";
  }

  function includesBenefitNote(offer) {
    var includes = offer.benefit && offer.benefit.includes_offer_ids ? offer.benefit.includes_offer_ids : [];
    if (!includes.length) return "";
    return (offer.stacking && offer.stacking.note) || "他施策を含む総率です。別加算しません。";
  }

  function offersForRegion(date) {
    if (!data) return [];
    var stayDate = typeof date === "string" ? date : state.travelDate;
    return data.offers.filter(function (offer) {
      var regionMatch = geoMatches(offer);
      var providerMatch = !state.provider || offer.provider === state.provider;
      // Confirmed plan-based offers remain candidates; booking dates are never stay dates.
      var dateMatch = !offer.sample || (stayDate ? stayDate >= offer.sample_stay_start && stayDate <= offer.sample_stay_end : offer.sample_stay_start.slice(0, 7) <= state.month && offer.sample_stay_end.slice(0, 7) >= state.month);
      return regionMatch && providerMatch && dateMatch && availabilityMatches(offer);
    });
  }


  function announce(message) {
    els.statusMessage.textContent = "";
    window.setTimeout(function () {
      els.statusMessage.textContent = message;
    }, 10);
  }

  function syncControls() {
    els.destination.value = state.destination;
    els.travelDate.value = state.travelDate;
    els.travelDate.setAttribute("aria-label", state.travelDate ? "宿泊日" : "宿泊日 一番お得な日");
    els.travelDate.classList.toggle("is-empty", !state.travelDate);
    els.assumedPrice.value = Number.isFinite(state.assumedPrice) && state.assumedPrice > 0 ? String(state.assumedPrice) : "";
    els.adultCount.textContent = "大人" + state.adults + "人";
    els.adultMinus.disabled = state.adults <= 1;
    els.adultPlus.disabled = state.adults >= 9;

    $all(".region-button").forEach(function (button) {
      var selected = button.dataset.region === state.destination;
      button.setAttribute("aria-selected", selected ? "true" : "false");
    });
    $all(".destination-card").forEach(function (button) {
      var selected = button.dataset.region === state.destination;
      button.setAttribute("aria-pressed", selected ? "true" : "false");
    });

    els.childCount.textContent = "子供" + state.children + "人";
    els.childMinus.disabled = state.children <= 0;
    els.childPlus.disabled = state.children >= 6;
    els.searchConditions.innerHTML = 'この条件で探す <span aria-hidden="true">→</span>';
    els.toCalendar.disabled = false;
    els.toCalendar.innerHTML = '日付を選ぶ <span aria-hidden="true">→</span>';
    els.toCompare.disabled = false;
  }

  function renderStage() {

    document.body.dataset.decisionStep = String(state.step);

    $all(".step-tab").forEach(function (button) {
      var active = Number(button.dataset.step) === state.step;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", String(active));
      button.tabIndex = active ? 0 : -1;
    });

    $all(".decision-stage").forEach(function (panel) {
      var active = Number(panel.dataset.panel) === state.step;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
  }

  function renderRegionSummary() {
    els.regionTitle.textContent = destinationName() + "のお得";
    els.calendarRegion.textContent = destinationName();
    els.calendarRegion.setAttribute('aria-label', destinationName() + '、地図で地域を選び直す');
  }

  function renderCalendar() {
    var year = Number(state.month.slice(0, 4));
    var monthIndex = Number(state.month.slice(5, 7)) - 1;
    var first = new Date(Date.UTC(year, monthIndex, 1));
    var next = new Date(Date.UTC(year, monthIndex + 1, 1));
    var days = Math.round((next - first) / 86400000);
    var startDay = first.getUTCDay();

    els.calendarMonth.textContent = formatMonth(state.month);
    var prev = $("#month-prev"), nextButton = $("#month-next");
    if (prev) prev.disabled = state.month === "2026-10";
    if (nextButton) nextButton.disabled = state.month === MONTHS[MONTHS.length - 1];
    var focusedDate = document.activeElement && document.activeElement.dataset.date;
    els.calendarGrid.innerHTML = "";

    for (var blank = 0; blank < startDay; blank += 1) {
      var empty = document.createElement("span");
      empty.className = "calendar-blank";
      empty.setAttribute("aria-hidden", "true");
      els.calendarGrid.appendChild(empty);
    }

    for (var day = 1; day <= days; day += 1) {
      var padded = String(day).padStart(2, "0");
      var dateString = state.month + "-" + padded;
      var button = document.createElement("button");
      var weekday = new Date(Date.UTC(year, monthIndex, day)).getUTCDay();
      button.type = "button";
      button.className = "calendar-day" + (weekday === 0 || weekday === 6 ? " weekend" : "");
      button.dataset.date = dateString;
      button.setAttribute("aria-label", year + "年" + (monthIndex + 1) + "月" + day + "日を旅行日に選ぶ");
      var best = bestOnDate(dateString), rate = best ? campaignRate(best,dateString) : 0;
      button.classList.add(best && !rate ? 'heat-fixed' : rate >= 50 ? 'heat-high' : rate >= 20 ? 'heat-medium' : 'heat-low');
      button.innerHTML = '<span class="day-number">' + day + '</span><small class="day-offers">' + escapeHtml(best ? rate ? rate + '％' + (best.sample ? '例' : '') : (best.benefit.discount_amount / 1000) + '千円' + (best.sample ? '例' : '') : '—') + '</small>';
      var count = campaignCandidates(dateString, null, true).length;
      var cap = best && best.benefit.max_discount_amount;
      var capText = best ? cap ? '上限' + (cap >= 10000 ? cap/10000 + '万円' : cap/1000 + '千円') + (best.benefit.cap_unit ? '/' + best.benefit.cap_unit : '') : best.benefit.discount_amount ? '定額クーポン' : '上限未掲載' : '';
      button.innerHTML += '<small class="day-cap" title="' + escapeHtml(capText) + '">' + (capText.indexOf('上限') === 0 ? '<span class="cap-prefix">上限</span>' + escapeHtml(capText.slice(2)) : escapeHtml(capText)) + '</small><small class="day-count">' + count + '件</small>';
      button.setAttribute("aria-label", year + "年" + (monthIndex + 1) + "月" + day + "日、" + (best ? rateLabel(best,rate) + "、" + best.name : "対象期間のデータなし") + "、" + capText + "、候補" + count + "件");
      if (state.travelDate === dateString) {
        button.classList.add("is-selected");
        button.setAttribute("aria-pressed", "true");
      } else {
        button.setAttribute("aria-pressed", "false");
      }
      button.addEventListener("click", function () {
        bestResult = null;
        state.travelDate = this.dataset.date;
        persistState();
        renderAll();
        announce(formatDate(state.travelDate) + "を旅行日に選びました");
      });
      els.calendarGrid.appendChild(button);
      if (focusedDate === dateString) button.focus({ preventScroll: true });
    }
  }

  function campaignSummary(offer,index,date,month) {
    var start=offer.sample ? offer.sample_booking_start : offer.booking_start;
    var status=availabilityOf(offer)==='upcoming' ? '開始予定 '+ (start ? start.slice(0,10).replace(/-/g,'/') : '') : '開催中';
    return '<button type="button" class="booking-hint" data-campaign="'+escapeHtml(offer.id)+'"><div class="booking-benefit-main"><span class="hint-rank">'+(index+1)+'</span><strong class="hint-rate">'+escapeHtml(rateLabel(offer,campaignRate(offer,date,month)))+'</strong></div><strong class="hint-name">'+escapeHtml(offer.name)+'</strong><span class="hint-cap">¥ '+escapeHtml(benefitCapLabel(offer))+'</span><span class="hint-scope">⌖ '+escapeHtml(offer.scope)+'</span><span class="hint-period">▦ '+escapeHtml(periodLabel(offer))+'</span><span class="hint-availability">'+escapeHtml(status)+'</span>'+otaLogos(offer)+(offer.sample ? '<span class="sample-badge">サンプル</span>' : '')+'</button>';
  }
  function renderBookingHints() {
    var relevant=campaignCandidates(state.travelDate,state.month,false).slice(0,3);
    var html=relevant.length ? relevant.map(function(offer,index){return campaignSummary(offer,index,state.travelDate,state.month);}).join('') : '<p class="empty-state">この条件の特典はありません。</p>';
    els.bookingHints.innerHTML=html;
    var mapOffers=campaignCandidates(state.travelDate,null,false).slice(0,3);
    $('#map-booking-hints').innerHTML=mapOffers.length ? mapOffers.map(function(offer,index){return campaignSummary(offer,index,state.travelDate,null);}).join('') : '<p class="empty-state">この条件の特典はありません。</p>';
    var monthly=campaignCandidates('',state.month,false);
    $('#month-campaigns').hidden=!calendarOpen;
    $('#month-campaigns-title').textContent=formatMonth(state.month)+'のキャンペーン · '+monthly.length+'件';
    $('#month-campaign-list').innerHTML=monthly.length ? monthly.map(function(offer,index){return campaignSummary(offer,index,'',state.month);}).join('') : '<p class="empty-state">この月の対象キャンペーンはありません。</p>';
  }

  function stayStart(offer) { return offer.stay_start || offer.sample_stay_start || ""; }
  function stayEnd(offer) { return offer.stay_end || offer.sample_stay_end || ""; }
  function campaignRate(offer, date, month) {
    var rate = offer.benefit.rate_percent;
    if (!Number.isFinite(rate)) rate = /[％%]/.test(benefitLabel(offer)) ? parseFloat(benefitLabel(offer).replace(/[^0-9.]/g, "")) : 0;
    if (date) (offer.sample_periods || []).forEach(function (period) { if (date >= period.start && date <= period.end) rate = period.rate_percent; });
    else (offer.sample_periods || []).forEach(function (period) { if ((!month || period.start.slice(0,7) <= month && period.end.slice(0,7) >= month)) rate = Math.max(rate, period.rate_percent); });
    return rate || 0;
  }
  function rateLabel(offer, rate) {
    return offer.sample && rate ? rate + '％（例）' : benefitLabel(offer);
  }
  function campaignCandidates(date, month, knownOnly) {
    return data.highlights.concat(data.offers).filter(function (offer) {
      if (!geoMatches(offer) || !availabilityMatches(offer)) return false;
      // Participating OTA membership is a candidate, not an eligibility verdict.
      if (state.provider && offer.provider !== state.provider && (offer.otas || []).indexOf(state.provider)<0) return false;
      if (!offer.sample && !offer.highlight && offerStatus(offer).key === 'ended') return false;
      var start = stayStart(offer), end = stayEnd(offer);
      if (!start) return !knownOnly;
      return date ? date >= start && date <= end : (!month || start.slice(0,7) <= month && end.slice(0,7) >= month);
    }).sort(function (a,b) { return campaignRate(b,date,month) - campaignRate(a,date,month) || (b.benefit.max_discount_amount || 0) - (a.benefit.max_discount_amount || 0); });
  }
  function bestOnDate(date) { return campaignCandidates(date, null, true)[0]; }
  function renderMonths() {
    var focusedMonth = document.activeElement && document.activeElement.dataset.month;
    $('#month-offers').hidden = calendarOpen;
    $('#calendar-workspace').hidden = !calendarOpen;
    $('#month-offers').innerHTML = MONTHS.map(function (month) {
      var best = null, bestRate = -1;
      for (var day=1; day<=31; day++) {
        var date = month + '-' + String(day).padStart(2,'0');
        if (!validDate(date)) continue;
        var offer = bestOnDate(date), rate = offer ? campaignRate(offer,date) : 0;
        if (offer && rate > bestRate) { best=offer; bestRate=rate; }
      }
      return '<button type="button" class="month-offer-row" data-month="' + month + '" aria-expanded="false"><span class="month-label"><small>' + Number(month.slice(0,4)) + '</small><strong>' + Number(month.slice(5)) + '<small>月</small></strong></span><span class="month-campaign"><span class="' + (best && best.sample ? 'sample-badge' : 'month-pick-label') + '">' + (best && best.sample ? 'サンプル' : '✦ 注目') + '</span><strong>' + escapeHtml(best ? best.name : '対象期間のデータなし') + '</strong><small>⌖ ' + escapeHtml(best ? best.scope : destinationName()) + '</small></span><span class="month-saving"><strong>' + escapeHtml(best ? rateLabel(best,bestRate) : '—') + '</strong><small>' + escapeHtml(best ? benefitCapLabel(best) : '別の条件でも探せます') + '</small></span><span class="month-open">施策・日付を見る <b aria-hidden="true">→</b></span></button>';
    }).join('') + '<p class="month-list-note">宿泊対象期間が分かるキャンペーンを、月ごとの最大割引・還元率で紹介。定額クーポンは％に換算しません。</p>';
    if (focusedMonth && !calendarOpen) $('[data-month="' + focusedMonth + '"]').focus({preventScroll:true});
  }
  function campaignById(id) { return data.highlights.concat(data.offers).find(function (offer) { return offer.id === id; }); }
  function openCampaign(id, chosenDate) {
    var offer = campaignById(id);
    if (!offer) return;
    els.dialogProvider.textContent = offer.sample ? 'デザインサンプル · 予約不可' : (offer.highlight ? '注目のキャンペーン' : offer.provider);
    els.dialogTitle.textContent = offer.name;
    var date = chosenDate || state.travelDate;
    els.dialogContent.innerHTML = '<div class="campaign-pop-benefit">' + escapeHtml(rateLabel(offer,campaignRate(offer,date))) + '</div><p class="hint-cap">¥ ' + escapeHtml(benefitCapLabel(offer)) + '</p><p>' + escapeHtml(offer.summary) + '</p><div class="dialog-fact"><span>⌖ 対象地域</span><strong>' + escapeHtml(offer.scope) + '</strong></div><div class="dialog-fact"><span>▦ ' + (chosenDate ? 'おすすめ宿泊日' : '宿泊対象期間') + '</span><strong>' + escapeHtml(chosenDate ? formatDate(chosenDate) + '（掲載割引率で選定）' : stayStart(offer) ? stayStart(offer) + ' 〜 ' + stayEnd(offer) : '宿泊対象期間は未掲載') + '</strong></div><div class="dialog-otas"><strong>取扱OTA</strong>' + otaLogos(offer) + '</div><p class="' + (offer.sample ? 'sample-detail-note' : 'campaign-condition') + '">' + escapeHtml(offer.condition_note) + '</p>' + (offer.highlight ? '<a class="dialog-source" href="' + escapeHtml(offer.source_url) + '" target="_blank" rel="noopener noreferrer">キャンペーンの詳細を見る ↗</a>' : offer.sample ? '<a class="primary-action" href="' + escapeHtml(sampleCampaignUrl(offer.id, chosenDate)) + '">サンプルの詳細を見る →</a>' : '<button class="primary-action" type="button" data-offer="' + escapeHtml(offer.id) + '">詳しい条件を見る →</button>');
    if (!els.dialog.open) els.dialog.showModal();
  }
  function searchBestCampaign() {
    var best = null, bestDate = '', rate = -1;
    var today = new Date().toLocaleDateString('sv-SE', {timeZone:'Asia/Tokyo'});
    var dates = state.travelDate ? [state.travelDate] : [];
    if (!dates.length) MONTHS.forEach(function(month) { for(var day=1;day<=31;day++) { var date=month+'-'+String(day).padStart(2,'0'); if(validDate(date) && date>=today) dates.push(date); } });
    dates.forEach(function(date) { var candidate=bestOnDate(date), value=candidate ? campaignRate(candidate,date) : -1; if(candidate && value>rate) { best=candidate;bestDate=date;rate=value; } });
    bestResult = best ? {id:best.id,date:bestDate,automaticDate:!state.travelDate} : {empty:true};
    goToStep(4);
    if (best) openCampaign(best.id, !state.travelDate ? bestDate : null);
    else announce('この条件で宿泊対象期間が分かるキャンペーンがありません');
  }


  function offerCard(offer) {
    var estimate = estimateDiscount(offer);
    return '<article class="offer-card"><div class="offer-card-top"><span class="provider-wordmark" data-provider="' + escapeHtml(offer.provider) + '">' + escapeHtml(offer.provider) + '</span><span class="' + (offer.sample ? 'sample-badge' : 'verified-badge') + '">' + (offer.sample ? 'サンプル' : '掲載データ') + '</span></div><h3>' + escapeHtml(offer.name) + '</h3><p class="offer-benefit">' + escapeHtml(rateLabel(offer,campaignRate(offer,state.travelDate))) + '<small>' + (offer.sample && offer.benefit.kind === 'coupon_fixed' ? 'クーポン' : 'お得') + '</small></p><p class="offer-cap">' + escapeHtml(benefitCapLabel(offer)) + '</p><div class="offer-meta"><span>⌖ ' + escapeHtml(offer.scope) + '</span><span>▦ ' + escapeHtml(offer.sample ? offer.sample_stay_start.slice(5).replace('-', '/') + '〜' + offer.sample_stay_end.slice(5).replace('-', '/') : '宿泊期間は条件を確認') + '</span></div><span class="status-line">' + escapeHtml(offerStatus(offer).label) + '</span><p class="offer-description">' + escapeHtml(offer.summary) + '</p>' + (!offer.sample ? '<p class="card-condition">' + escapeHtml(offerDecisionState(offer).label) + '</p>' : '') + (state.assumedPrice ? '<p class="card-estimate">' + (offer.sample ? 'サンプル試算：' : '推定割引：') + escapeHtml(estimate.label) + '</p>' : '') + otaLogos(offer) + '<button class="offer-detail-button" type="button" data-offer="' + escapeHtml(offer.id) + '">' + (offer.sample ? 'サンプルの詳細を見る' : '条件を見る') + ' <span aria-hidden="true">→</span></button></article>';
  }

  function renderComparison() {
    var offers = offersForRegion().sort(function(a,b) { return campaignRate(b,state.travelDate,state.month)-campaignRate(a,state.travelDate,state.month); });
    els.tripSummary.textContent = offers.length + "件の特典（サンプルを含む）";
    els.comparisonBody.innerHTML = offers.length ? offers.map(offerCard).join("") : '<div class="empty-state"><h3>この条件の特典はありません</h3><p>条件を外すか、別の月を選んで探してみてください。</p><button class="secondary-action" type="button" data-clear-all>絞り込みをクリア</button></div>';
  }


  function renderEstimateNote() {
    if (!Number.isFinite(state.assumedPrice) || state.assumedPrice <= 0) {
      els.estimateNote.textContent = "旅行全体の予算ではなく、クーポン計算の対象になる宿泊料金だけを入れます。現在のポイント型施策は割引額へ換算しません。";
      return;
    }
    var calculable = offersForRegion().some(function (offer) {
      var kind = offer.benefit && offer.benefit.kind;
      return kind === "coupon_rate" || kind === "coupon_fixed";
    });
    els.estimateNote.textContent = calculable
      ? formatYen(state.assumedPrice) + "を対象宿泊料金として、条件が揃った単独クーポンだけ推定します。"
      : formatYen(state.assumedPrice) + "を入力しました。現在の確認済み施策はポイント型のため割引額に換算しません。";
  }

  async function shareState() {
    var url = buildStateUrl().toString();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(url);
        announce("旅行条件のURLをコピーしました");
        return;
      }
    } catch (error) {
      if (error && error.name === "AbortError") return;
    }
    window.prompt("このURLをコピーしてください", url);
  }

  function openOffer(id) {
    var offer = data.offers.find(function (item) { return item.id === id; });
    if (!offer) return;
    if (offer.sample) {
      els.dialogProvider.textContent = offer.provider + " / デザインサンプル";
      els.dialogTitle.textContent = offer.name;
      els.dialogContent.innerHTML = '<p class="sample-detail-note">このキャンペーンは架空のサンプルです。予約には使えません。</p><p>' + escapeHtml(offer.summary) + '</p><div class="dialog-fact"><span>特典の表示例</span><strong>' + escapeHtml(rateLabel(offer,campaignRate(offer,state.travelDate))) + '</strong></div><div class="dialog-fact"><span>対象地域</span><strong>' + escapeHtml(offer.scope) + '</strong></div><div class="dialog-fact"><span>宿泊期間の表示例</span><strong>' + escapeHtml(stayWindowLabel(offer)) + '</strong></div><p>最低宿泊料金20,000円の表示例です。子供料金・年齢区分は予約先ごとに異なります。</p><button type="button" class="primary-action" data-apply-sample="' + escapeHtml(offer.id) + '">この地域・旅行会社で探す →</button>';
      els.dialogContent.innerHTML += '<div class="dialog-otas"><strong>取扱OTA</strong>' + otaLogos(offer) + '</div>';
      els.dialog.showModal();
      return;
    }
    var status = offerStatus(offer);
    var decision = offerDecisionState(offer);
    var included = includesBenefitNote(offer);
    var estimate = estimateDiscount(offer);
    els.dialogProvider.textContent = offer.provider + " / " + offer.product;
    els.dialogTitle.textContent = offer.name;
    els.dialogContent.innerHTML =
      '<p class="dialog-summary">' + escapeHtml(offer.summary) + '</p>' +
      '<div class="dialog-fact"><span>予約受付の状態</span><strong>' + escapeHtml(status.label) + '</strong></div>' +
      '<div class="dialog-fact"><span>この入力だけでの判定</span><strong>' + escapeHtml(decision.label) + '</strong></div>' +
      '<div class="dialog-fact"><span>特典</span><strong>' + escapeHtml(benefitLabel(offer)) + '</strong></div>' +
      '<div class="dialog-fact"><span>上限・最低額</span><strong>' + escapeHtml(benefitCapLabel(offer)) + '</strong></div>' +
      '<div class="dialog-fact"><span>入力料金での推定割引額</span><strong>' + escapeHtml(estimate.label) + '</strong></div>' +
      '<div class="dialog-fact"><span>予約期間</span><strong>' + escapeHtml(formatDateTime(offer.booking_start)) + ' 〜 ' + escapeHtml(formatDateTime(offer.booking_end)) + '</strong></div>' +
      '<div class="dialog-fact"><span>宿泊日の条件</span><strong>' + escapeHtml(stayWindowLabel(offer)) + '</strong></div>' +
      (included ? '<div class="dialog-fact"><span>重複・内包</span><strong>' + escapeHtml(included) + '</strong></div>' : '') +
      '<div class="dialog-fact"><span>注意</span><strong>' + escapeHtml(offer.condition_note) + '</strong></div>' +
      '<div class="dialog-links">' +
        '<a class="dialog-source" href="' + escapeHtml(offer.source.official_url) + '" target="_blank" rel="noopener noreferrer">公式条件を見る ↗</a>' +
        '<a class="dialog-source" href="' + escapeHtml(offer.booking.provider_url) + '" target="_blank" rel="noopener noreferrer">正式予約先を開く ↗</a>' +
      '</div>';
    els.dialogContent.innerHTML += '<div class="dialog-otas"><strong>取扱OTA</strong>' + otaLogos(offer) + '</div>';
    if (typeof els.dialog.showModal === "function") {
      els.dialog.showModal();
    } else {
      els.dialog.setAttribute("open", "");
    }
  }

  function goToStep(step) {

    state.step = step;
    persistState();
    renderAll();
    announce(["", "地図で探す", "日付で探す", "旅行会社で探す", "注目のキャンペーン"][step] + "を表示しました");
  }

  function renderAll() {
    renderGeography();
    syncControls();
    renderStage();
    renderRegionSummary();
    renderMonths();
    renderCalendar();
    renderBookingHints();
    renderComparison();
    renderEstimateNote();
    renderFilters();
    renderProviders();
    renderCampaigns();
  }

  function renderFilters() {
    var filtered = !!(state.destination || state.travelDate || state.provider || state.availability!=="active");
    $(".filter-console").classList.toggle("is-filtered",filtered);
    var filters = ['<strong class="filters-label">' + (filtered ? "絞り込み中" : "検索条件") + '</strong>'];
    if (state.destination) filters.push('<button type="button" data-clear="destination">⌖ ' + escapeHtml(destinationName()) + ' ×<span class="sr-only">地域の条件を解除</span></button>');
    if (state.travelDate) filters.push('<button type="button" data-clear="travelDate">▦ ' + escapeHtml(formatDate(state.travelDate)) + ' ×<span class="sr-only">日付の条件を解除</span></button>');
    if (state.provider) filters.push('<button type="button" data-clear="provider">' + escapeHtml(state.provider) + ' ×<span class="sr-only">旅行会社の条件を解除</span></button>');
    if (state.availability!=="active") filters.push('<button type="button" data-reset-availability>' + (state.availability==="all" ? "開催中・開始予定" : "開始予定") + ' ×</button>');
    filters.push('<span class="party-summary">大人' + state.adults + '人・子供' + state.children + '人</span>');
    if (filtered) filters.push('<button type="button" class="clear-all" data-clear-all>絞り込みをクリア</button>');
    $("#active-filters").innerHTML = filters.join("");
  }

  function renderProviders() {
    var focusedProvider = document.activeElement && document.activeElement.closest("#provider-filters") ? document.activeElement.dataset.provider : null;
    var providers = ["", "Yahoo!トラベル", "楽天トラベル", "じゃらん", "JTB", "一休.com"];
    $("#provider-filters").innerHTML = providers.map(function (provider) {
      return '<button type="button" data-provider="' + escapeHtml(provider) + '" aria-pressed="' + (provider === state.provider) + '"><span class="provider-monogram" aria-hidden="true">' + escapeHtml(provider ? provider.slice(0, 1) : '全') + '</span><strong>' + escapeHtml(provider || "すべて") + '</strong></button>';
    }).join("");
    if (focusedProvider !== null) $all("#provider-filters button").find(function (button) { return button.dataset.provider === focusedProvider; }).focus({ preventScroll: true });
  }

  function sampleCampaignUrl(id, recommendedDate) {
    var url = new URL("sample-campaign.html", window.location.href);
    url.search = buildStateUrl().search;
    url.searchParams.set("campaign", id);
    if (recommendedDate) url.searchParams.set("date", recommendedDate);
    return url.pathname + url.search;
  }

  function renderCampaigns() {
    $all(".campaign-slide").forEach(function (slide, index) { slide.href = sampleCampaignUrl(["sample-seaside", "sample-autumn", "sample-winter"][index]); });
    var result = $('#best-search-result');
    result.hidden = !bestResult;
    if (bestResult) result.textContent = bestResult.empty ? 'この条件で宿泊対象期間が分かるキャンペーンがありません。条件を変えて探せます。' : '✦ 掲載割引・還元率で選んだキャンペーン：' + campaignById(bestResult.id).name + (bestResult.automaticDate ? ' · ' + formatDate(bestResult.date) : '') + '（宿泊価格の最安順ではありません）';
    var picks = data.highlights.concat(data.offers.filter(function(offer) { return offer.sample && offer.image; }));
    if (bestResult && bestResult.id && !picks.some(function(offer) { return offer.id === bestResult.id; })) picks.unshift(campaignById(bestResult.id));
    $('#campaign-picks').innerHTML = picks.map(function (offer) {
      var selected = bestResult && bestResult.id === offer.id;
      return '<article class="campaign-pick' + (selected ? ' is-recommended' : '') + '" id="' + escapeHtml(offer.id) + '">' + (offer.image ? '<img src="' + escapeHtml(offer.image) + '" alt="' + escapeHtml(offer.name) + 'の旅行先イメージ" loading="lazy">' : '<div class="campaign-visual" aria-hidden="true">' + (offer.scope === '全国' ? '✦' : '⌖') + '</div>') + '<div>' + (offer.sample ? '<span class="sample-badge">サンプル</span>' : '') + '<h3>' + escapeHtml(offer.name) + '</h3><strong class="campaign-card-rate">' + escapeHtml(rateLabel(offer,campaignRate(offer,state.travelDate))) + '</strong><p class="hint-cap">' + escapeHtml(benefitCapLabel(offer)) + '</p><p>⌖ ' + escapeHtml(offer.scope) + '</p>' + otaLogos(offer) + '<button type="button" class="offer-detail-button" data-campaign="' + escapeHtml(offer.id) + '">キャンペーンを見る →</button>' + (offer.sample && offer.image ? '<a class="quiet-link" href="' + escapeHtml(sampleCampaignUrl(offer.id)) + '">特集ページを見る →</a>' : '') + '</div></article>';
    }).join('');
  }

  function initCarousel() {
    var carousel = $(".campaign-carousel"), reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    var hovering = false, focused = false;
    function stop() { if (slideTimer) window.clearInterval(slideTimer); slideTimer = null; }
    function show(index) {
      slideIndex = (index + 3) % 3;
      $all(".campaign-slide").forEach(function (slide, i) { slide.hidden = i !== slideIndex; slide.classList.toggle("is-active", i === slideIndex); slide.tabIndex = i === slideIndex ? 0 : -1; });
      $all("[data-slide-to]").forEach(function (dot, i) { dot.setAttribute("aria-pressed", String(i === slideIndex)); });
    }
    function restart() {
      stop();
      if (!carouselPaused && !reduced.matches && !document.hidden && !hovering && !focused) slideTimer = window.setInterval(function () { show(slideIndex + 1); }, 6000);
    }
    $("#slide-prev").addEventListener("click", function () { show(slideIndex - 1); restart(); });
    $("#slide-next").addEventListener("click", function () { show(slideIndex + 1); restart(); });
    $all("[data-slide-to]").forEach(function (dot) { dot.addEventListener("click", function () { show(Number(dot.dataset.slideTo)); restart(); }); });
    $("#slide-pause").addEventListener("click", function () { carouselPaused = !carouselPaused; this.textContent = carouselPaused ? "▶" : "Ⅱ"; this.setAttribute("aria-pressed", String(carouselPaused)); this.setAttribute("aria-label", carouselPaused ? "自動スライドを再開" : "自動スライドを停止"); restart(); });
    carousel.addEventListener("mouseenter", function () { hovering = true; stop(); });
    carousel.addEventListener("mouseleave", function () { hovering = false; restart(); });
    carousel.addEventListener("focusin", function () { focused = true; stop(); });
    carousel.addEventListener("focusout", function () { window.setTimeout(function () { focused = carousel.contains(document.activeElement); restart(); }, 0); });
    document.addEventListener("visibilitychange", restart);
    reduced.addEventListener("change", restart);
    window.addEventListener("pagehide", stop);
    window.addEventListener("pageshow", restart);
    restart();
  }

  function bindEvents() {
    $("#trip-form").addEventListener("submit", function (event) {
      event.preventDefault();
      els.searchConditions.click();
    });
    ["prev", "next"].forEach(function (direction) {
      var button = $("#month-" + direction);
      if (!button) return;
      button.addEventListener("click", function () {
        var months = MONTHS;
        var index = months.indexOf(state.month) + (direction === "next" ? 1 : -1);
        if (index < 0 || index >= months.length) return;
        state.month = months[index];
        state.travelDate = "";
        persistState();
        renderAll();
        announce(formatMonth(state.month) + "に変更しました");
      });
    });
    $("#date-picker").addEventListener("click",function(){try {els.travelDate.showPicker();}catch(error){els.travelDate.focus();}});
    $("#jump-calendar").addEventListener("click",function(){$("#calendar-workspace").scrollIntoView({behavior:"smooth",block:"start"});$("#months-back").focus({preventScroll:true});});
    els.destination.addEventListener("change", function () {
      bestResult = null;
      state.destination = this.value;
      persistState();
      renderAll();
      if (state.destination) announce(destinationName() + "を選びました");
    });


    els.travelDate.addEventListener("change", function () {
      bestResult = null;
      state.travelDate = validDate(this.value) ? this.value : "";
      if (state.travelDate) state.month = state.travelDate.slice(0, 7);
      persistState();
      renderAll();
      announce(state.travelDate ? formatDate(state.travelDate) + "を宿泊日にしました" : "宿泊日を未定に戻しました");
    });

    els.adultMinus.addEventListener("click", function () {
      if (state.adults <= 1) return;
      state.adults -= 1;
      persistState();
      renderAll();
    });

    els.adultPlus.addEventListener("click", function () {
      if (state.adults >= 9) return;
      state.adults += 1;
      persistState();
      renderAll();
    });

    $all(".region-button, .destination-card").forEach(function (button) {
      button.addEventListener("click", function () {
        bestResult = null;
        state.destination = this.dataset.region;
        persistState();
        renderAll();
        announce(destinationName() + "を選びました");

      });
    });

    $all(".step-tab").forEach(function (button) {
      button.addEventListener("click", function () {
        if (this.disabled) return;
        goToStep(Number(this.dataset.step));
      });
    });

    if (els.searchConditions) {
      els.searchConditions.addEventListener("click", function () { if (!state.destination || !state.travelDate) searchBestCampaign(); else { bestResult=null; goToStep(3); } $("#search-tabs").scrollIntoView({ behavior: "smooth", block: "start" }); });
    }
    els.toCalendar.addEventListener("click", function () { calendarOpen=true; goToStep(2); $("#calendar-workspace").scrollIntoView({behavior:"smooth",block:"start"}); $("#months-back").focus({preventScroll:true}); });
    els.calendarRegion.addEventListener("click", function() { goToStep(1); $("#search-tabs").scrollIntoView({behavior:"smooth",block:"start"}); var button=$("#tab-map"); button.focus({preventScroll:true}); });
    els.toCompare.addEventListener("click", function () { goToStep(3); });
    els.assumedPrice.addEventListener("input", function () {
      var value = this.value === "" ? null : Number(this.value);
      state.assumedPrice = Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
      persistState();
      renderComparison();
      renderEstimateNote();
    });
    els.shareState.addEventListener("click", shareState);
    ["minus", "plus"].forEach(function (direction) {
      $("#child-" + direction).addEventListener("click", function () {
        state.children = Math.max(0, Math.min(6, state.children + (direction === "plus" ? 1 : -1)));
        persistState(); renderAll(); announce("子供" + state.children + "人に変更しました");
      });
    });
    $("#search-tabs").addEventListener("keydown", function (event) {
      var tabs = $all(".step-tab"), index = tabs.indexOf(document.activeElement);
      if (index < 0) return;
      if (["ArrowRight", "ArrowLeft", "Home", "End"].indexOf(event.key) < 0) return;
      event.preventDefault();
      var next = event.key === "Home" ? 0 : event.key === "End" ? tabs.length - 1 : (index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
      goToStep(Number(tabs[next].dataset.step)); tabs[next].focus();
    });
    document.addEventListener("click", function (event) {
      var button = event.target.closest("[data-provider], [data-clear], [data-clear-all], [data-offer], [data-apply-sample], [data-campaign], [data-availability], [data-geo], [data-reset-availability]");
      if (!button) return;
      if (button.hasAttribute("data-availability")) {state.availability=button.dataset.availability;bestResult=null;persistState();renderAll();var updated=$('[data-availability-view="'+(state.step===1?"map":"date")+'"] [data-availability="'+state.availability+'"]');if(updated)updated.focus({preventScroll:true});}
      else if (button.hasAttribute("data-reset-availability")) {state.availability="active";persistState();renderAll();$(".step-tab.is-active").focus({preventScroll:true});}
      else if (button.hasAttribute("data-geo")) {state.destination=button.dataset.geo;bestResult=null;persistState();renderAll();var back=$("#geo-detail .geo-detail-heading button");if(back && state.destination)back.focus({preventScroll:true});else $("#tab-map").focus({preventScroll:true});}
      else if (button.hasAttribute("data-campaign")) openCampaign(button.dataset.campaign);
      else if (button.hasAttribute("data-offer")) { if (els.dialog.open) els.dialog.close(); openOffer(button.dataset.offer); }
      else if (button.hasAttribute("data-apply-sample")) {
        var sample = data.offers.find(function (offer) { return offer.id === button.dataset.applySample; });
        state.destination = (sample.geo_ids || sample.regions)[0] || ""; state.provider = sample.provider;
        els.dialog.close(); goToStep(3);
      }
      else if (button.hasAttribute("data-clear-all")) { bestResult=null; state.destination = ""; state.travelDate = ""; state.provider = ""; state.availability="active"; persistState(); renderAll(); $(".step-tab.is-active").focus({ preventScroll: true }); }
      else if (button.hasAttribute("data-clear")) { bestResult=null; state[button.dataset.clear] = ""; persistState(); renderAll(); $(".step-tab.is-active").focus({ preventScroll: true }); }
      else if (button.tagName === "BUTTON" && button.hasAttribute("data-provider")) { bestResult=null; state.provider = button.dataset.provider; persistState(); renderAll(); }
    });
    $('#months-back').addEventListener('click', function() { calendarOpen=false; persistState(); renderAll(); $('[data-month="'+state.month+'"]').focus(); });
    $('#month-offers').addEventListener('click', function(event) { var row=event.target.closest('[data-month]'); if(!row) return; state.month=row.dataset.month; if(state.travelDate && state.travelDate.slice(0,7)!==state.month) state.travelDate=''; calendarOpen=true; persistState();renderAll();$('#month-campaigns').scrollIntoView({behavior:'smooth',block:'start'});$('#jump-calendar').focus({preventScroll:true}); });
    initCarousel();

    els.dialogClose.addEventListener("click", function () {
      els.dialog.close();
    });

    els.dialog.addEventListener("click", function (event) {
      if (event.target === els.dialog) els.dialog.close();
    });
  }

  function cacheElements() {
    els.destination = $("#destination");
    els.travelDate = $("#travel-date");
    els.assumedPrice = $("#assumed-price");
    els.shareState = $("#share-state");
    els.searchConditions = $("#search-conditions");
    els.estimateNote = $("#estimate-note");
    els.adultMinus = $("#adult-minus");
    els.adultPlus = $("#adult-plus");
    els.adultCount = $("#adult-count");
    els.childCount = $("#child-count");
    els.childMinus = $("#child-minus");
    els.childPlus = $("#child-plus");
    els.statusMessage = $("#status-message");
    els.regionTitle = $("#region-summary-title");
    els.toCalendar = $("#to-calendar");
    els.calendarMonth = $("#calendar-month-label");
    els.calendarRegion = $("#calendar-region-label");
    els.calendarGrid = $("#calendar-grid");
    els.bookingHints = $("#booking-hints");
    els.toCompare = $("#to-compare");
    els.tripSummary = $("#trip-summary");
    els.comparisonBody = $("#comparison-body");
    els.dialog = $("#offer-dialog");
    els.dialogClose = $("#dialog-close");
    els.dialogProvider = $("#dialog-provider");
    els.dialogTitle = $("#dialog-title");
    els.dialogContent = $("#dialog-content");
  }

  async function boot() {
    cacheElements();
    loadStoredState();
    loadUrlState();
    persistState();
    syncControls();
    var loadingControls = $all("#trip-form input, #trip-form select, #trip-form button, .step-tab, .region-button, #to-calendar, #to-compare, #share-state");
    loadingControls.forEach(function (control) { control.disabled = true; });
    $("#decision-main").setAttribute("aria-busy", "true");
    els.statusMessage.className = "data-loading";
    els.statusMessage.textContent = "宿泊特典を読み込み中…";
    var controller = new AbortController();
    var timeout = window.setTimeout(function () { controller.abort(); }, 10000);
    try {
      var responses = await Promise.all([fetch("decision-data.json", { cache: "no-store", signal: controller.signal }), fetch("design-samples.json", { signal: controller.signal }), fetch("campaign-highlights.json", { signal: controller.signal }), fetch("search-geography.json", { signal: controller.signal })]);
      var response = responses[0];
      if (!response.ok) throw new Error("decision data http " + response.status);
      data = await response.json();
      var sampleResponse = responses[1];
      if (!sampleResponse.ok) throw new Error("sample data http " + sampleResponse.status);
      var sampleData = await sampleResponse.json();
      data.offers = data.offers.concat(sampleData.offers);
      if (!responses[2].ok) throw new Error("campaign data unavailable");
      data.highlights = (await responses[2].json()).campaigns;
      if (!responses[3].ok) throw new Error("geography unavailable");
      geography=(await responses[3].json()).nodes;
      if (state.destination && !geoNode(state.destination)) state.destination="";
      persistState();
    } catch (error) {
      document.body.classList.add("decision-data-error");
      $("#status-message").className = "load-error";
      $("#status-message").innerHTML = '特典を読み込めませんでした。旅行条件は保持しています。<button type="button" onclick="location.reload()">再読み込み</button>';
      return;
    } finally {
      window.clearTimeout(timeout);
      $("#decision-main").setAttribute("aria-busy", "false");
    }
    loadingControls.forEach(function (control) { control.disabled = false; });
    els.statusMessage.className = "sr-only";
    els.statusMessage.textContent = "宿泊特典を読み込みました";
    bindEvents();
    renderAll();
  }

  document.addEventListener("DOMContentLoaded", boot);
}());
