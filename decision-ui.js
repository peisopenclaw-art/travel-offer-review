(function () {
  "use strict";

  var STORAGE_KEY = "tokuerabi-decision-ui-v1";
  var state = {
    destination: "",
    month: "2026-10",
    adults: 2,
    travelDate: "",
    assumedPrice: null,
    step: 1
  };
  var data = null;

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
      if (/^2026-(10|11|12)$/.test(saved.month || "")) state.month = saved.month;
      if (Number.isInteger(saved.adults) && saved.adults >= 1 && saved.adults <= 9) state.adults = saved.adults;
      if (/^2026-(10|11|12)-\d{2}$/.test(saved.travelDate || "")) state.travelDate = saved.travelDate;
      if (Number.isFinite(saved.assumedPrice) && saved.assumedPrice >= 0) state.assumedPrice = saved.assumedPrice;
      if ([1, 2, 3].indexOf(saved.step) >= 0) state.step = saved.step;
    } catch (error) {
      sessionStorage.removeItem(STORAGE_KEY);
    }
  }

  function entryStep() {
    if (state.destination && state.travelDate) return 3;
    if (state.destination) return 2;
    return 1;
  }

  function loadUrlState() {
    var params = new URLSearchParams(window.location.search);
    var touched = false;
    var destination = params.get("destination");
    var month = params.get("month");
    var date = params.get("date");
    var adults = Number(params.get("adults"));
    var price = Number(params.get("price"));

    if (destination !== null && (destination === "" || ["hokkaido","tohoku","kanto","chubu","kinki","chugoku","shikoku","kyushu"].indexOf(destination) >= 0)) {
      state.destination = destination;
      touched = true;
    }
    if (/^2026-(10|11|12)$/.test(month || "")) {
      state.month = month;
      touched = true;
    }
    if (/^2026-(10|11|12)-\d{2}$/.test(date || "") && !Number.isNaN(Date.parse(date + "T00:00:00+09:00"))) {
      state.travelDate = date;
      state.month = date.slice(0, 7);
      touched = true;
    }
    if (Number.isInteger(adults) && adults >= 1 && adults <= 9) {
      state.adults = adults;
      touched = true;
    }
    if (Number.isFinite(price) && price >= 0) {
      state.assumedPrice = Math.round(price);
      touched = true;
    }
    if (touched) state.step = entryStep();
    return touched;
  }

  function buildStateUrl() {
    var url = new URL(window.location.href);
    url.search = "";
    if (state.destination) url.searchParams.set("destination", state.destination);
    url.searchParams.set("month", state.month);
    if (state.travelDate) url.searchParams.set("date", state.travelDate);
    if (state.adults !== 2) url.searchParams.set("adults", String(state.adults));
    if (Number.isFinite(state.assumedPrice) && state.assumedPrice > 0) url.searchParams.set("price", String(state.assumedPrice));
    return url;
  }

  function syncUrl() {
    window.history.replaceState(null, "", buildStateUrl().toString());
  }

  function persistState() {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    syncUrl();
  }

  function regionById(id) {
    if (!data) return null;
    return data.regions.find(function (region) { return region.id === id; }) || null;
  }

  function destinationName() {
    var region = regionById(state.destination);
    return region ? region.name : "行き先未定";
  }

  function formatMonth(month) {
    var parts = month.split("-");
    return Number(parts[0]) + "年" + Number(parts[1]) + "月";
  }

  function formatDate(dateString) {
    if (!dateString) return "未選択";
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

    return { key: "not-calculable", label: "ポイント型のため割引額に換算しません" };
  }

  function estimateDiscount(offer) {
    return estimateDiscountForBenefit(offer.benefit || {}, state.assumedPrice);
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
    var now = Date.now();
    var start = offer.booking_start ? Date.parse(offer.booking_start) : null;
    var end = offer.booking_end ? Date.parse(offer.booking_end) : null;
    if (start && now < start) return { key: "scheduled", label: "開始予定" };
    if (end && now > end) return { key: "ended", label: "受付期間終了" };
    return { key: "active", label: "掲載中" };
  }

  function offerDecisionState(offer) {
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

  function offersForRegion() {
    if (!data) return [];
    return data.offers.filter(function (offer) {
      return offer.scope === "全国" || offer.scope === destinationName();
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
    els.month.value = state.month;
    els.travelDate.value = state.travelDate;
    els.assumedPrice.value = Number.isFinite(state.assumedPrice) && state.assumedPrice > 0 ? String(state.assumedPrice) : "";
    els.adultCount.textContent = "大人" + state.adults + "人";
    els.adultMinus.disabled = state.adults <= 1;
    els.adultPlus.disabled = state.adults >= 9;

    $all(".region-button").forEach(function (button) {
      var selected = button.dataset.region === state.destination;
      button.setAttribute("aria-selected", selected ? "true" : "false");
    });

    var hasDestination = Boolean(state.destination);
    var hasDate = Boolean(state.travelDate);
    var step2 = $('.step-tab[data-step="2"]');
    var step3 = $('.step-tab[data-step="3"]');
    step2.disabled = !hasDestination;
    step3.disabled = !(hasDestination && hasDate);
    els.toCalendar.disabled = !hasDestination;
    els.toCalendar.innerHTML = hasDate ? 'この条件で予約先を見る <span aria-hidden="true">→</span>' : 'この地域で日付を見る <span aria-hidden="true">→</span>';
    els.toCompare.disabled = !(hasDestination && hasDate);
  }

  function renderStage() {
    if (state.step > 1 && !state.destination) state.step = 1;
    if (state.step > 2 && !state.travelDate) state.step = 2;

    $all(".step-tab").forEach(function (button) {
      var active = Number(button.dataset.step) === state.step;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });

    $all(".decision-stage").forEach(function (panel) {
      var active = Number(panel.dataset.panel) === state.step;
      panel.classList.toggle("is-active", active);
      panel.hidden = !active;
    });
  }

  function renderRegionSummary() {
    var region = regionById(state.destination);
    if (!region) {
      els.regionTitle.textContent = "地域を選んでください";
      els.regionCopy.textContent = "行き先が未定なら、地図から気になる地域を選べます。";
      els.regionMetrics.hidden = true;
      els.regionCaveat.hidden = true;
      return;
    }

    var offers = offersForRegion();
    els.regionTitle.textContent = region.name;
    els.regionCopy.textContent = data.regional_comparison_ready
      ? "地域別の確認済み施策を比較しています。"
      : "今の確認済みデータでは全国施策が中心のため、地域間の優劣はまだ付けません。";
    els.regionOfferCount.textContent = offers.length + "施策";
    els.regionRate.textContent = offers.map(benefitLabel).join(" / ");
    els.regionMetrics.hidden = false;
    els.regionCaveat.textContent = "「15％以上」等が基礎10％を含む場合は足し算しません。施設・プラン等を確認するまで「使える」と確定しません。";
    els.regionCaveat.hidden = offers.length < 2;
    els.calendarRegion.textContent = region.name;
  }

  function renderCalendar() {
    var year = Number(state.month.slice(0, 4));
    var monthIndex = Number(state.month.slice(5, 7)) - 1;
    var first = new Date(Date.UTC(year, monthIndex, 1));
    var next = new Date(Date.UTC(year, monthIndex + 1, 1));
    var days = Math.round((next - first) / 86400000);
    var startDay = first.getUTCDay();

    els.calendarMonth.textContent = formatMonth(state.month);
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
      button.innerHTML = '<span class="day-number">' + day + '</span><span class="day-note">適用条件は未算出</span>';
      if (state.travelDate === dateString) {
        button.classList.add("is-selected");
        button.setAttribute("aria-pressed", "true");
      } else {
        button.setAttribute("aria-pressed", "false");
      }
      button.addEventListener("click", function () {
        state.travelDate = this.dataset.date;
        persistState();
        renderAll();
        announce(formatDate(state.travelDate) + "を旅行日に選びました");
      });
      els.calendarGrid.appendChild(button);
    }
  }

  function renderBookingHints() {
    var relevant = data.offers.filter(function (offer) {
      return offerStatus(offer).key !== "ended";
    }).sort(function (a, b) {
      var order = { active: 0, scheduled: 1, ended: 2 };
      var statusDiff = order[offerStatus(a).key] - order[offerStatus(b).key];
      if (statusDiff) return statusDiff;
      return Date.parse(a.booking_start) - Date.parse(b.booking_start);
    });
    if (!relevant.length) {
      els.bookingHints.innerHTML = '<div class="booking-hint"><strong>現在表示できる予約施策はありません</strong><span>旅行日の選択はできます。一次情報を更新後に施策を追加します。</span></div>';
      return;
    }
    els.bookingHints.innerHTML = relevant.map(function (offer) {
      var status = offerStatus(offer);
      return '<div class="booking-hint">' +
        '<strong>' + escapeHtml(offer.name) + '</strong>' +
        '<span>予約: ' + escapeHtml(formatDateTime(offer.booking_start)) + ' 〜 ' + escapeHtml(formatDateTime(offer.booking_end)) + '</span>' +
        '<span class="hint-rate">' + escapeHtml(benefitLabel(offer)) + '</span>' +
        '<span>宿泊: ' + escapeHtml(stayWindowLabel(offer)) + '</span>' +
        '<span>' + escapeHtml(status.label) + ' / ' + escapeHtml(offer.provider) + '</span>' +
      '</div>';
    }).join("");
  }

  function renderComparison() {
    var statusOrder = { active: 0, scheduled: 1, ended: 2 };
    var offers = offersForRegion().slice().sort(function (a, b) {
      var diff = statusOrder[offerStatus(a).key] - statusOrder[offerStatus(b).key];
      if (diff) return diff;
      return a.name.localeCompare(b.name, "ja");
    });

    els.tripSummary.innerHTML =
      '<span>' + escapeHtml(destinationName()) + '</span>' +
      '<span>' + escapeHtml(formatDate(state.travelDate)) + '</span>' +
      '<span>大人' + state.adults + '人</span>';

    els.comparisonBody.innerHTML = offers.map(function (offer) {
      var status = offerStatus(offer);
      var decision = offerDecisionState(offer);
      var estimate = estimateDiscount(offer);
      return '<tr>' +
        '<td class="benefit-cell" data-label="お得の大きさ"><strong>' + escapeHtml(benefitLabel(offer)) + '</strong><span>' + escapeHtml(benefitCapLabel(offer)) + '</span></td>' +
        '<td class="eligibility-cell" data-label="この条件で使える？"><strong>' + escapeHtml(decision.label) + '</strong><span class="status-line ' + status.key + '">' + escapeHtml(status.label) + '</span></td>' +
        '<td class="estimate-cell" data-label="推定割引額"><strong>' + escapeHtml(estimate.label) + '</strong></td>' +
        '<td data-label="予約期間">' + escapeHtml(formatDateTime(offer.booking_start)) + '<br>〜 ' + escapeHtml(formatDateTime(offer.booking_end)) + '</td>' +
        '<td class="provider-cell" data-label="予約先・施策"><strong>' + escapeHtml(offer.provider) + '</strong><span>' + escapeHtml(offer.name) + '</span></td>' +
        '<td data-label="詳細"><button class="offer-detail-button" type="button" data-offer="' + escapeHtml(offer.id) + '">条件を見る</button></td>' +
      '</tr>';
    }).join("");

    $all(".offer-detail-button").forEach(function (button) {
      button.addEventListener("click", function () {
        openOffer(this.dataset.offer);
      });
    });
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
      : formatYen(state.assumedPrice) + "を入力しました。現在の確認済み施策はポイント型なので、割引額として10％/15％を機械換算しません。";
  }

  async function shareState() {
    var url = buildStateUrl().toString();
    try {
      if (navigator.share) {
        await navigator.share({ title: document.title, url: url });
        announce("旅行条件のURLを共有しました");
        return;
      }
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
    if (typeof els.dialog.showModal === "function") {
      els.dialog.showModal();
    } else {
      els.dialog.setAttribute("open", "");
    }
  }

  function goToStep(step) {
    if (step === 2 && !state.destination) return;
    if (step === 3 && (!state.destination || !state.travelDate)) return;
    state.step = step;
    persistState();
    renderAll();
    var panel = $('.decision-stage[data-panel="' + step + '"]');
    if (panel) {
      panel.scrollIntoView({ behavior: "smooth", block: "start" });
      var heading = panel.querySelector("h2");
      if (heading) heading.setAttribute("tabindex", "-1");
      window.setTimeout(function () {
        if (heading) heading.focus({ preventScroll: true });
      }, 320);
    }
  }

  function renderAll() {
    syncControls();
    renderStage();
    renderRegionSummary();
    renderCalendar();
    renderBookingHints();
    renderComparison();
    renderEstimateNote();
  }

  function bindEvents() {
    els.destination.addEventListener("change", function () {
      state.destination = this.value;
      state.step = entryStep();
      persistState();
      renderAll();
      if (state.destination) announce(destinationName() + "を選びました");
    });

    els.month.addEventListener("change", function () {
      state.month = this.value;
      if (state.travelDate && state.travelDate.slice(0, 7) !== state.month) state.travelDate = "";
      state.step = entryStep();
      persistState();
      renderAll();
      announce(formatMonth(state.month) + "に変更しました");
    });

    els.travelDate.addEventListener("change", function () {
      state.travelDate = this.value;
      if (state.travelDate) state.month = state.travelDate.slice(0, 7);
      state.step = entryStep();
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

    $all(".region-button").forEach(function (button) {
      button.addEventListener("click", function () {
        state.destination = this.dataset.region;
        state.step = state.travelDate ? 3 : 1;
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

    els.toCalendar.addEventListener("click", function () { goToStep(state.travelDate ? 3 : 2); });
    els.toCompare.addEventListener("click", function () { goToStep(3); });
    els.assumedPrice.addEventListener("input", function () {
      var value = this.value === "" ? null : Number(this.value);
      state.assumedPrice = Number.isFinite(value) && value >= 0 ? Math.round(value) : null;
      persistState();
      renderComparison();
      renderEstimateNote();
    });
    els.shareState.addEventListener("click", shareState);

    els.dialogClose.addEventListener("click", function () {
      els.dialog.close();
    });

    els.dialog.addEventListener("click", function (event) {
      if (event.target === els.dialog) els.dialog.close();
    });
  }

  function cacheElements() {
    els.destination = $("#destination");
    els.month = $("#travel-month");
    els.travelDate = $("#travel-date");
    els.assumedPrice = $("#assumed-price");
    els.shareState = $("#share-state");
    els.estimateNote = $("#estimate-note");
    els.adultMinus = $("#adult-minus");
    els.adultPlus = $("#adult-plus");
    els.adultCount = $("#adult-count");
    els.statusMessage = $("#status-message");
    els.regionTitle = $("#region-summary-title");
    els.regionCopy = $("#region-summary-copy");
    els.regionMetrics = $("#region-metrics");
    els.regionOfferCount = $("#region-offer-count");
    els.regionRate = $("#region-rate");
    els.regionCaveat = $("#region-caveat");
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
    try {
      var response = await fetch("decision-data.json", { cache: "no-store" });
      if (!response.ok) throw new Error("decision data http " + response.status);
      data = await response.json();
    } catch (error) {
      document.body.classList.add("decision-data-error");
      $(".decision-main").innerHTML =
        '<section class="prototype-boundary"><div><p class="eyebrow">DATA ERROR</p><h1>比較データを読み込めませんでした。</h1></div><p>ページを再読み込みしてください。改善しない場合は公開側のデータ接続を確認します。</p></section>';
      return;
    }
    bindEvents();
    renderAll();
  }

  document.addEventListener("DOMContentLoaded", boot);
}());
