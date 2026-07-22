/* ==========================================================================
   UNIVERSAL PRODUCT FILTER (Vanilla JS)
   ==========================================================================
   Matches sidebar buttons [data-filter="X"] against product cards
   [data-category="X"]. Fully attribute-driven — add new categories in HTML
   only; this script never needs to change.

   REQUIRED HTML CONTRACT:
   FIX #16: data-testid required on both button and card elements below.
   No HTML file was in scope for this pass, so these attributes can't be
   added to real markup — this is a requirement for whoever implements the
   markup, not a confirmation that it's already done.
   - A filter button container, e.g.:
       <div id="filterSidebar">
         <button data-filter="all" data-testid="filter-button">All Products</button>
         <button data-filter="arduino" data-testid="filter-button">Arduino</button>
         <button data-filter="medical" data-testid="filter-button">Medical</button>
       </div>
   - A product grid container, e.g.:
       <div id="productGrid">
         <div class="product-card" data-category="arduino" data-testid="product-card">...</div>
         <div class="product-card" data-category="medical" data-testid="product-card">...</div>
       </div>

   WHY EVENT DELEGATION (not per-button addEventListener):
   Attaching a listener to each button at setup time only covers buttons
   that exist in the DOM at that exact moment. Add a button later — via a
   CMS, a template loop, or an innerHTML swap — and it would silently have
   no listener, because querySelectorAll never re-runs on its own.
   Delegation attaches ONE listener to the stable parent container. Clicks
   bubble up to it regardless of when the button was added, so new
   categories work automatically with zero JS changes — which is exactly
   what requirement #5 asks for.
========================================================================== */

function initProductFilter(config = {}) {
    const filterContainerSelector  = config.filterContainerSelector  || "#filterSidebar";
    const productContainerSelector = config.productContainerSelector || "#productGrid";
    const productSelector          = config.productSelector          || "[data-category]";
    const activeClass              = config.activeClass              || "active";

    const filterContainer  = document.querySelector(filterContainerSelector);
    const productContainer = document.querySelector(productContainerSelector);

    if (!filterContainer || !productContainer) {
        // FIX #6: Generic warning — does not expose internal selector strings.
        console.warn("initProductFilter: required filter or product container not found. Filter not initialized.");
        return;
    }

    // FIX #8: WeakMap tracks per-card hide state for a reliable guard in
    // the setTimeout callback, replacing the fragile opacity string comparison.
    const hiddenCards = new WeakMap();

    // FIX #15: WeakMap tracks the pending hide-timeout ID per card. Rapid
    // re-filter clicks on the same card previously stacked independent
    // timeouts with no way to cancel the earlier ones — each one still
    // checked hiddenCards.get(card) so the end state was always correct,
    // but every stale timeout still ran its callback and did the lookup
    // for nothing. Clearing the prior pending timeout (in both showCard()
    // and hideCard(), since showCard() can cancel a hide that hasn't fired
    // yet) means at most one pending timeout exists per card at a time.
    const pendingHideTimeouts = new WeakMap();

    // FIX #9: Detect reduced-motion preference once at init.
    const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // Single delegated listener — survives any future buttons added to this container.
    filterContainer.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-filter]");
        if (!btn || !filterContainer.contains(btn)) return;

        const targetCategory = btn.getAttribute("data-filter");

        // Toggle active state on the clicked button only.
        filterContainer.querySelectorAll("[data-filter]").forEach((b) => {
            b.classList.toggle(activeClass, b === btn);
        });

        applyFilter(targetCategory);
    });

    function applyFilter(targetCategory) {
        const products = productContainer.querySelectorAll(productSelector);

        products.forEach((card) => {
            const cardCategory = card.getAttribute("data-category");
            const shouldShow = targetCategory === "all" || cardCategory === targetCategory;

            if (shouldShow) {
                showCard(card);
            } else {
                hideCard(card);
            }
        });
    }

    function showCard(card) {
        // FIX #8: Mark card as not-hidden before any async callbacks fire.
        hiddenCards.set(card, false);

        // FIX #15: cancel any pending hide-timeout for this card — it would
        // still resolve correctly via the hiddenCards guard above, but
        // there's no reason to let it fire and do the lookup for nothing.
        const pendingTimeout = pendingHideTimeouts.get(card);
        if (pendingTimeout !== undefined) {
            clearTimeout(pendingTimeout);
            pendingHideTimeouts.delete(card);
        }

        if (prefersReducedMotion) {
            // FIX #9: Instant show for reduced-motion users — no opacity transition.
            card.style.display  = "";
            card.style.opacity  = "1";
            card.style.transform = "";
            return;
        }

        // Reset display first so the browser can compute a transition from opacity:0.
        card.style.display = "";
        // Force a reflow so the transition doesn't get skipped when display was "none".
        void card.offsetWidth;
        card.style.opacity   = "1";
        card.style.transform = "scale(1)";
    }

    function hideCard(card) {
        // FIX #8: Mark card as hidden immediately — checked in setTimeout callback.
        hiddenCards.set(card, true);

        // FIX #15: cancel any timeout already pending for this card before
        // scheduling a new one — a rapid re-filter back-and-forth on the
        // same card would otherwise stack N independent timeouts, each
        // still correct (guarded by hiddenCards) but wasted work.
        const existingTimeout = pendingHideTimeouts.get(card);
        if (existingTimeout !== undefined) {
            clearTimeout(existingTimeout);
            pendingHideTimeouts.delete(card);
        }

        if (prefersReducedMotion) {
            // FIX #9: Instant hide for reduced-motion users.
            card.style.display   = "none";
            card.style.opacity   = "0";
            card.style.transform = "";
            return;
        }

        card.style.opacity   = "0";
        card.style.transform = "scale(0.96)";

        // Remove from layout only after the fade-out finishes, so hidden cards
        // don't leave an invisible gap in the grid.
        const timeoutId = setTimeout(() => {
            // FIX #8: Guard uses WeakMap boolean — reliable across all browsers.
            // If the user re-filtered back to this category mid-transition,
            // hiddenCards.get(card) will be false, so we skip display:none.
            if (hiddenCards.get(card) === true) {
                card.style.display = "none";
            }
            // FIX #15: this timeout has now fired — clear its own entry so
            // pendingHideTimeouts doesn't hold a stale, already-elapsed ID.
            pendingHideTimeouts.delete(card);
        }, 250); // matches the CSS transition duration below
        // FIX #15: store the handle so a subsequent hideCard() or showCard()
        // call on this same card can cancel it before it fires.
        pendingHideTimeouts.set(card, timeoutId);
    }

    // Public re-filter hook — useful if you add cards dynamically after init
    // and want to re-apply whatever filter is currently active.
    const api = {
        refresh() {
            const activeBtn = filterContainer.querySelector(`[data-filter].${activeClass}`);
            const currentCategory = activeBtn ? activeBtn.getAttribute("data-filter") : "all";
            applyFilter(currentCategory);
        },
        // FIX #5: CSS.escape() prevents selector injection when category is
        // attacker-controlled or contains CSS special characters.
        setFilter(category) {
            const safeCategory = typeof CSS !== "undefined" && CSS.escape
                ? CSS.escape(String(category))
                : String(category).replace(/[^a-zA-Z0-9_-]/g, ""); // fallback for old browsers
            const targetBtn = filterContainer.querySelector(`[data-filter="${safeCategory}"]`);
            if (targetBtn) targetBtn.click();
        }
    };

    return api;
}

// Auto-init on the default IDs. If your HTML uses different container IDs,
// call initProductFilter({ filterContainerSelector: "...", productContainerSelector: "..." })
// manually instead of relying on this auto-init block.
document.addEventListener("DOMContentLoaded", () => {
    // FIX #7: Namespaced under window.__volt to reduce global pollution.
    // Backward-compatible alias preserved so any existing callers using
    // window.productFilter continue to work without changes.
    window.__volt = window.__volt || {};
    window.__volt.productFilter = initProductFilter();
    window.productFilter = window.__volt.productFilter; // backward-compat alias
});