(function () {
  "use strict";

  var config = window.TRAVEL_ANALYTICS_CONFIG || {};
  var measurementId = String(config.ga4MeasurementId || "").trim();
  var validMeasurementId = /^G-[A-Z0-9]+$/.test(measurementId);

  function noop() { return false; }

  window.travelAnalytics = {
    enabled: validMeasurementId,
    measurementId: validMeasurementId ? measurementId : null,
    track: noop
  };

  if (!validMeasurementId) return;

  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () {
    window.dataLayer.push(arguments);
  };

  window.gtag("js", new Date());
  window.gtag("config", measurementId, {
    allow_google_signals: false,
    allow_ad_personalization_signals: false
  });

  var loader = document.createElement("script");
  loader.async = true;
  loader.src = "https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(measurementId);
  document.head.appendChild(loader);

  function track(eventName, params) {
    window.gtag("event", eventName, params || {});
    return true;
  }
  window.travelAnalytics.track = track;

  function externalDomain(link) {
    try {
      return new URL(link.href, window.location.href).hostname;
    } catch (error) {
      return "";
    }
  }

  function offerParams(card, extra) {
    var params = {};
    if (card && card.dataset.offerId) params.offer_id = card.dataset.offerId;
    if (card && card.dataset.offerPlacement) params.offer_placement = card.dataset.offerPlacement;
    Object.keys(extra || {}).forEach(function (key) { params[key] = extra[key]; });
    return params;
  }

  var seenOffers = new Set();
  var offerCards = document.querySelectorAll("[data-offer-id]");
  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var card = entry.target;
        var offerId = card.dataset.offerId;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && offerId && !seenOffers.has(offerId)) {
          seenOffers.add(offerId);
          track("offer_view", offerParams(card));
          observer.unobserve(card);
        }
      });
    }, { threshold: [0.5] });
    offerCards.forEach(function (card) { observer.observe(card); });
  }

  document.addEventListener("change", function (event) {
    if (event.target && event.target.id === "destination") {
      track("decision_destination_select", { destination_region: event.target.value || "undecided" });
    } else if (event.target && event.target.id === "travel-month") {
      track("decision_month_select", { travel_month: event.target.value || "unknown" });
    } else if (event.target && event.target.id === "travel-date") {
      track("decision_date_state", {
        has_travel_date: Boolean(event.target.value),
        travel_month: event.target.value ? event.target.value.slice(0, 7) : "unknown"
      });
    }
  }, true);

  document.addEventListener("click", function (event) {
    var target = event.target && event.target.closest ? event.target : null;
    if (!target) return;

    var regionChoice = target.closest(".region-button, .destination-card");
    if (regionChoice && regionChoice.dataset.region) {
      track("decision_destination_select", { destination_region: regionChoice.dataset.region });
    }

    var stepControl = target.closest(".step-tab, #search-conditions, #to-calendar, #to-compare");
    if (stepControl) {
      var step = stepControl.dataset.step || (stepControl.id === "to-calendar" ? "2" : stepControl.id === "to-compare" ? "3" : "1");
      track("decision_step_action", { decision_step: String(step) });
    }

    var offerButton = target.closest("[data-offer]");
    if (offerButton && offerButton.dataset.offer) {
      track("offer_detail_open", { offer_id: offerButton.dataset.offer });
    }

    var link = target.closest("a");
    if (!link) return;
    var domain = externalDomain(link);
    if (!domain || domain === window.location.hostname) return;

    var card = link.closest("[data-offer-id]");
    var role = "external";
    if (link.closest(".a8-ad-material")) role = "affiliate";
    else if (link.classList.contains("source-link") || link.classList.contains("dialog-source")) role = "official_source";

    track("offer_outbound_click", offerParams(card, {
      link_role: role,
      link_domain: domain
    }));
  }, true);
}());
