/* ==========================================================================
   VOLT — PCB micro-animations (7 improvements)
   Prompt tail was truncated at rule #5 — seven targets chosen from live
   store touchpoints: filter, card, FAB, cart badge, search, checkout, title.
   ========================================================================== */
(function () {
    "use strict";

    if (window.__voltMicroAnimInit) return;
    window.__voltMicroAnimInit = true;

    window.__volt = window.__volt || {};

    var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    var pulseTimers = new WeakMap();

    function pulseOnce(el, className, ms) {
        if (!el || reduceMotion.matches) return;
        el.classList.remove(className);
        void el.offsetWidth;
        el.classList.add(className);
        var prev = pulseTimers.get(el);
        if (prev) clearTimeout(prev);
        pulseTimers.set(el, setTimeout(function () {
            el.classList.remove(className);
        }, ms || 700));
    }

    function bindViewportLoop(el, liveClass) {
        if (!el || !("IntersectionObserver" in window)) {
            if (el) el.classList.add(liveClass);
            return null;
        }
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (reduceMotion.matches) {
                    el.classList.remove(liveClass);
                    return;
                }
                el.classList.toggle(liveClass, entry.isIntersecting);
            });
        }, { rootMargin: "80px 0px", threshold: 0.05 });
        io.observe(el);
        return io;
    }

    function init() {
        var filterBar = document.querySelector(".filter-bar");
        var productsGrid = document.getElementById("products");
        var heroSearch = document.querySelector(".hero-search");
        var navSearch = document.querySelector(".v-shop-addon-nav-search");
        var checkoutBtn = document.getElementById("checkoutBtn");
        var sectionTitles = document.querySelectorAll(".section-title");

        bindViewportLoop(filterBar, "volt-pcb-live");
        bindViewportLoop(heroSearch, "volt-pcb-search-live");
        bindViewportLoop(navSearch, "volt-pcb-search-live");
        sectionTitles.forEach(function (title) {
            bindViewportLoop(title, "volt-pcb-title-live");
        });

        if (productsGrid && "IntersectionObserver" in window) {
            new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (reduceMotion.matches) {
                        productsGrid.classList.remove("volt-pcb-cards-live");
                    } else {
                        productsGrid.classList.toggle("volt-pcb-cards-live", entry.isIntersecting);
                    }
                    onProductsRendered();
                });
            }, { rootMargin: "80px 0px", threshold: 0.05 }).observe(productsGrid);
        } else if (productsGrid) {
            productsGrid.classList.add("volt-pcb-cards-live");
            onProductsRendered();
        }

        document.addEventListener("click", function (e) {
            var fab = e.target.closest(".fab-add--active");
            if (fab && (!productsGrid || productsGrid.contains(fab))) {
                pulseOnce(fab, "volt-pcb-fab-surge", 560);
            }
            if (checkoutBtn && e.target === checkoutBtn) {
                pulseOnce(checkoutBtn, "volt-pcb-checkout-surge", 720);
            }
        }, true);

        reduceMotion.addEventListener("change", function () {
            [filterBar, heroSearch, navSearch].forEach(function (node) {
                if (node) node.classList.remove("volt-pcb-live", "volt-pcb-search-live");
            });
            sectionTitles.forEach(function (title) {
                title.classList.remove("volt-pcb-title-live");
            });
            if (productsGrid) productsGrid.classList.remove("volt-pcb-cards-live");
        });
    }

    function onCartUpdate(count) {
        var badge = document.getElementById("cartCount");
        if (!badge || count <= 0) return;
        pulseOnce(badge, "volt-pcb-badge-pulse", 660);
    }

    function onProductsRendered() {
        var grid = document.getElementById("products");
        if (!grid) return;
        var live = grid.classList.contains("volt-pcb-cards-live");
        grid.querySelectorAll(".card.glow-card").forEach(function (card) {
            card.classList.toggle("volt-pcb-card-live", live);
        });
    }

    window.__volt.microAnimations = {
        onCartUpdate: onCartUpdate,
        onProductsRendered: onProductsRendered,
        pulseOnce: pulseOnce
    };

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
