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

        /* === #61: section-title entrance reveal — fires once per title the
           first time it enters the viewport (not a live/loop toggle like
           volt-pcb-title-live above; this is a one-shot reveal, so the
           observer disconnects itself after firing on each title). Reuses
           the SAME sectionTitles NodeList already queried above — no new
           DOM query, no change to how that NodeList itself is used by the
           existing bindViewportLoop() call directly above. === */
        if ("IntersectionObserver" in window) {
            var titleRevealIO = new IntersectionObserver(function (entries, observer) {
                entries.forEach(function (entry) {
                    if (!entry.isIntersecting) return;
                    if (!reduceMotion.matches) {
                        entry.target.classList.add("volt-title-reveal");
                    }
                    observer.unobserve(entry.target);
                });
            }, { rootMargin: "0px 0px -10% 0px", threshold: 0.1 });
            sectionTitles.forEach(function (title) {
                titleRevealIO.observe(title);
            });
        } else {
            sectionTitles.forEach(function (title) {
                title.classList.add("volt-title-reveal");
            });
        }

        /* === #3: card-price gentle flicker every 3s. Uses the same
           products grid already selected above; re-scans on every
           onProductsRendered() call (already invoked elsewhere in this
           file) so newly-rendered cards are picked up automatically,
           consistent with how #onProductsRendered already re-applies
           volt-pcb-card-live to fresh cards. === */
        setInterval(function () {
            if (reduceMotion.matches) return;
            var grid = document.getElementById("products");
            if (!grid) return;
            grid.querySelectorAll(".card-price").forEach(function (priceEl) {
                pulseOnce(priceEl, "volt-price-flicker", 420);
            });
        }, 3000);

        /* === #14: cart badge shockwave, fires alongside the EXISTING
           volt-pcb-badge-pulse (onCartUpdate, already defined below in
           this file) rather than replacing it — both classes are applied
           together from the same onCartUpdate() call so they always fire
           in sync. See the modified onCartUpdate() function below. === */

        /* === #18: filter button spark travel === */
        var filterContainer = document.querySelector(".filter-bar");
        if (filterContainer) {
            var lastActiveFilterBtn = filterContainer.querySelector(".filter-btn.active");
            filterContainer.addEventListener("click", function (e) {
                var btn = e.target.closest(".filter-btn");
                if (!btn || !filterContainer.contains(btn)) return;
                if (reduceMotion.matches) { lastActiveFilterBtn = btn; return; }
                if (lastActiveFilterBtn && lastActiveFilterBtn !== btn) {
                    var fromRect = lastActiveFilterBtn.getBoundingClientRect();
                    var toRect = btn.getBoundingClientRect();
                    var spark = document.createElement("div");
                    spark.className = "volt-filter-spark";
                    spark.style.left = (fromRect.left + fromRect.width / 2 - 4) + "px";
                    spark.style.top = (fromRect.top + fromRect.height / 2 - 4) + "px";
                    document.body.appendChild(spark);
                    requestAnimationFrame(function () {
                        spark.classList.add("volt-filter-spark-active");
                        spark.style.opacity = "1";
                        requestAnimationFrame(function () {
                            spark.style.left = (toRect.left + toRect.width / 2 - 4) + "px";
                            spark.style.top = (toRect.top + toRect.height / 2 - 4) + "px";
                            setTimeout(function () { spark.style.opacity = "0"; }, 250);
                            setTimeout(function () { spark.remove(); }, 600);
                        });
                    });
                }
                lastActiveFilterBtn = btn;
            }, true);
        }

        /* === #69: alert-modal icon pulse is pure CSS (targets .alert-icon
           directly, runs whenever #alert-modal is visible) — no JS
           required, see volt-micro-animations.css. === */

        /* === #70 / #71: guest-checkout / pending-deposit glows are pure
           CSS (id-selector and attribute-selector driven respectively) —
           no JS required for either, see volt-micro-animations.css. === */

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
        /* === #14: shockwave ring, fires in sync with the existing pulse
           above via the same guard (badge exists, count > 0) — does not
           change when or why the existing pulse fires. === */
        pulseOnce(badge, "volt-badge-shockwave", 500);
    }

    function onProductsRendered() {
        var grid = document.getElementById("products");
        if (!grid) return;
        var live = grid.classList.contains("volt-pcb-cards-live");
        grid.querySelectorAll(".card.glow-card").forEach(function (card) {
            card.classList.toggle("volt-pcb-card-live", live);
        });

        /* === #11: 3D tilt on cards. Attaches mousemove/mouseleave
           listeners to each card exactly once (guarded by a data flag),
           so calling onProductsRendered() repeatedly (its existing,
           unmodified behavior — it already re-runs on every render) never
           double-attaches listeners to a card that was already wired on a
           previous render pass. === */
        if (!reduceMotion.matches) {
            grid.querySelectorAll(".card.glow-card").forEach(function (card) {
                if (card.__voltTiltBound) return;
                card.__voltTiltBound = true;
                card.addEventListener("mousemove", function (e) {
                    var rect = card.getBoundingClientRect();
                    var x = e.clientX - rect.left;
                    var y = e.clientY - rect.top;
                    var cx = rect.width / 2, cy = rect.height / 2;
                    var rotY = ((x - cx) / cx) * 6;
                    var rotX = -((y - cy) / cy) * 6;
                    card.style.setProperty("--volt-tilt-x", rotX + "deg");
                    card.style.setProperty("--volt-tilt-y", rotY + "deg");
                    card.classList.add("volt-tilt-active");
                });
                card.addEventListener("mouseleave", function () {
                    card.classList.remove("volt-tilt-active");
                    card.style.removeProperty("--volt-tilt-x");
                    card.style.removeProperty("--volt-tilt-y");
                });
            });
        }
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