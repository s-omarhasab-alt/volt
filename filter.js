/* ==========================================================================
   UNIVERSAL PRODUCT FILTER (Vanilla JS)
   ==========================================================================
   Matches sidebar buttons [data-filter="X"] against product cards
   [data-category="X"]. Fully attribute-driven — add new categories in HTML
   only; this script never needs to change.

   Also supports an OPTIONAL price range slider, matched against each card's
   [data-price="N"]. Both filters are attribute-driven and both funnel into
   the SAME applyFilter() call — there is exactly one function that decides
   whether a card is visible, combining "does the category match" AND "is
   the price within range". This is deliberate: two independent functions
   each calling showCard()/hideCard() on their own would let a card's
   visibility race between them (e.g. the price filter shows a card the
   category filter just hid, or vice versa, depending on call order).
   Instead the slider's input handler re-reads the currently active
   category button and calls applyFilter(category) — same as a category
   click does — so applyFilter() always has full context and there is only
   ever one place that touches showCard()/hideCard().

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
   - A product grid container, with each card carrying its price for the
     slider to read (omit data-price on a card and it is treated as always
     within range — the slider only excludes cards that explicitly opt in
     with a numeric data-price):
       <div id="productGrid">
         <div class="product-card" data-category="arduino" data-price="450" data-testid="product-card">...</div>
         <div class="product-card" data-category="medical" data-price="85" data-testid="product-card">...</div>
       </div>
   - An OPTIONAL price slider, single <input type="range">, e.g.:
       <input type="range" id="priceFilterSlider" data-testid="price-filter-slider"
              min="0" max="1000" step="10" value="1000">
       <output id="priceFilterValue" data-testid="price-filter-value"></output>
     If #priceFilterSlider is not present in the DOM, price filtering is
     silently skipped — category filtering alone still works exactly as
     before. The slider represents a single MAXIMUM price (0..max, matching
     the common "up to X" shopping pattern); a card passes if it has no
     data-price, or if data-price <= the slider's current value.

   WHY EVENT DELEGATION (not per-button addEventListener):
   Attaching a listener to each button at setup time only covers buttons
   that exist in the DOM at that exact moment. Add a button later — via a
   CMS, a template loop, or an innerHTML swap — and it would silently have
   no listener, because querySelectorAll never re-runs on its own.
   Delegation attaches ONE listener to the stable parent container. Clicks
   bubble up to it regardless of when the button was added, so new
   categories work automatically with zero JS changes — which is exactly
   what requirement #5 asks for. The price slider is a single, known
   element rather than a dynamic list, so it's bound directly the same way
   showCard/hideCard already bind directly to known DOM APIs — no
   delegation needed there, but it still funnels into the one applyFilter()
   entry point rather than becoming a second mechanism.
========================================================================== */

function initProductFilter(config = {}) {
    const filterContainerSelector  = config.filterContainerSelector  || "#filterSidebar";
    const productContainerSelector = config.productContainerSelector || "#productGrid";
    const productSelector          = config.productSelector          || "[data-category]";
    const activeClass              = config.activeClass              || "active";
    // Optional — price filtering is skipped entirely if this element isn't
    // in the DOM, so passing a wrong/absent selector here degrades to
    // "category filtering only" rather than throwing.
    const priceSliderSelector      = config.priceSliderSelector      || "#priceFilterSlider";
    const priceOutputSelector      = config.priceOutputSelector      || "#priceFilterValue";

    const filterContainer  = document.querySelector(filterContainerSelector);
    const productContainer = document.querySelector(productContainerSelector);

    if (!filterContainer || !productContainer) {
        // FIX #6: Generic warning — does not expose internal selector strings.
        console.warn("initProductFilter: required filter or product container not found. Filter not initialized.");
        return;
    }

    // Optional — unlike filterContainer/productContainer above, a missing
    // slider is not an init failure. It just means this page has no price
    // filter UI; category filtering still works standalone.
    const priceSlider = document.querySelector(priceSliderSelector);
    const priceOutput = document.querySelector(priceOutputSelector);

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

    // Price slider — optional. Reads the currently active category button
    // (same lookup api.refresh() already uses below) and re-runs
    // applyFilter() with it, so a slider move re-evaluates through the
    // exact same category+price logic as a button click would. "input"
    // fires continuously while dragging (live filtering), not just on
    // release, matching how the category buttons filter immediately on click.
    if (priceSlider) {
        const updatePriceOutput = () => {
            if (priceOutput) {
                // textContent, not innerHTML — priceSlider.value is a
                // browser-controlled numeric string from a range input,
                // but textContent costs nothing extra and keeps this
                // consistent with never assuming a value is safe for innerHTML.
                priceOutput.textContent = priceSlider.value;
            }
        };

        priceSlider.addEventListener("input", () => {
            updatePriceOutput();
            const activeBtn = filterContainer.querySelector(`[data-filter].${activeClass}`);
            const currentCategory = activeBtn ? activeBtn.getAttribute("data-filter") : "all";
            applyFilter(currentCategory);
        });

        // Reflect the slider's initial value (e.g. value="1000" set in HTML)
        // before any interaction, so the output isn't blank on first paint.
        updatePriceOutput();
    }

    function applyFilter(targetCategory) {
        const products = productContainer.querySelectorAll(productSelector);
        // Read once per applyFilter() call, not once per card — the slider's
        // value can't change mid-loop since this is synchronous, so a single
        // read up front avoids querying priceSlider.value N times for N cards.
        const maxPrice = priceSlider ? Number(priceSlider.value) : null;

        products.forEach((card) => {
            const cardCategory = card.getAttribute("data-category");
            const categoryMatches = targetCategory === "all" || cardCategory === targetCategory;

            // Cards without a data-price attribute are never excluded by
            // price — the slider only constrains cards that opted in with
            // a numeric price. This matches how data-category is already
            // optional-by-omission via productSelector's "[data-category]"
            // default (a card outside that selector is never touched here
            // at all, category or price).
            let priceMatches = true;
            if (maxPrice !== null && card.hasAttribute("data-price")) {
                const cardPrice = Number(card.getAttribute("data-price"));
                // NaN-safe: a malformed data-price (non-numeric string)
                // fails the <= comparison either direction, so it's
                // treated as "does not match" rather than silently
                // passing through — surfaces bad data instead of hiding it.
                priceMatches = !Number.isNaN(cardPrice) && cardPrice <= maxPrice;
            }

            const shouldShow = categoryMatches && priceMatches;

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
    // Volt storefront uses script.js applyProductFilters() (category + search + price).
    if (document.querySelector(".filter-bar [data-category]")) return;

    window.__volt = window.__volt || {};
    window.__volt.productFilter = initProductFilter();
    window.productFilter = window.__volt.productFilter;
});