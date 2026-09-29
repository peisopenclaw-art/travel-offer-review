(function () {
  "use strict";

  var meta = document.querySelector('meta[name="ga4-measurement-id"]');
  var measurementId = meta ? meta.getAttribute("content").trim() : "";
  var validMeasurementId = /^G-[A-Z0-9]+$/.test(measurementId);

  window.travelAnalytics = {
    enabled: validMeasurementId,
    measurementId: validMeasurementId ? measurementId : null
  };

  if (!validMeasurementId) {
    return;
  }

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

  function eventParams(card, extra) {
    var params = {
      offer_id: card && card.dataset.offerId ? card.dataset.offerId : "unknown",
      offer_placement: card && card.dataset.offerPlacement ? card.dataset.offerPlacement : "unknown"
    };
    Object.keys(extra || {}).forEach(function (key) {
      params[key] = extra[key];
    });
    return params;
  }

  function track(eventName, params) {
    window.gtag("event", eventName, params);
  }

  var seenOffers = new Set();
  var cards = document.querySelectorAll("[data-offer-id]");
  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        var card = entry.target;
        var offerId = card.dataset.offerId;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5 && !seenOffers.has(offerId)) {
          seenOffers.add(offerId);
          track("offer_view", eventParams(card, {}));
          observer.unobserve(card);
        }
      });
    }, { threshold: [0.5] });
    cards.forEach(function (card) { observer.observe(card); });
  }

  document.addEventListener("click", function (event) {
    var link = event.target.closest("a");
    if (!link) return;

    var card = link.closest("[data-offer-id]");
    if (!card) return;

    var role = null;
    if (link.closest(".a8-ad-material")) {
      role = "affiliate";
    } else if (link.classList.contains("source-link")) {
      role = "official_source";
    } else if (link.classList.contains("secondary-cta")) {
      role = "official_booking";
    }
    if (!role) return;

    var destination;
    try {
      destination = new URL(link.href, window.location.href);
    } catch (error) {
      return;
    }

    track("offer_outbound_click", eventParams(card, {
      link_role: role,
      link_domain: destination.hostname
    }));
  }, true);
}());
