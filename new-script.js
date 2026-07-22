/**
 * Sticky Scroll Cards — vanilla JS
 *
 * How it works:
 * Each .stack__item is a tall wrapper. Its .card child is `position: sticky`,
 * so it pins near the top of the viewport while the wrapper scrolls past.
 *
 * To get the "shrink into the background" effect when the NEXT card starts
 * covering the current one, we watch each wrapper with an IntersectionObserver.
 * When the wrapper AFTER a given card starts entering the viewport (crossing
 * a threshold near the top), we mark the current card as "receding" —
 * toggling a class that CSS transitions (scale down + darken).
 *
 * No manual scroll-position math, no jank, no getBoundingClientRect on
 * every scroll tick — the browser's observer does the heavy lifting.
 *
 * FIX #22 — TESTABILITY REQUIREMENT: no HTML file was in scope for this
 * pass, so these attributes can't be added to real markup here. Whoever
 * implements the .stack__item / .card markup this file expects should add:
 *   <div class="stack__item" data-testid="stack-item">
 *     <div class="card" data-testid="stack-card">...</div>
 *   </div>
 * This is a requirement for the HTML author, not a confirmation it's done.
 */

(function () {
    // FIX #14: Double-init guard.
    if (window.__voltStackInit) return;
    window.__voltStackInit = true;

    const items = Array.from(document.querySelectorAll(".stack__item"));
    if (!items.length) return;

    // Guard: if the browser has no IntersectionObserver support, just show
    // all cards statically (no animation) rather than break the page.
    if (!("IntersectionObserver" in window)) return;

    // FIX #12: WeakMap replaces dataset.index — not accessible from DevTools
    // console, cannot be tampered with to disrupt recede logic.
    const itemIndexMap = new WeakMap();
    items.forEach((item, i) => itemIndexMap.set(item, i));

    // FIX #13: Disconnect any prior observer before creating a new one
    // (guards against double-init in SPA contexts).
    if (window.__voltStackObserver) {
        window.__voltStackObserver.disconnect();
    }

    const observer = new IntersectionObserver(
        (entries) => {
            entries.forEach((entry) => {
                // FIX #12: Read index from WeakMap, not from dataset.
                const nextIndex = itemIndexMap.get(entry.target);
                if (nextIndex === undefined) return;

                const prevItem = items[nextIndex - 1];
                if (!prevItem) return;

                const prevCard = prevItem.querySelector(".card");
                if (!prevCard) return;

                // entry.isIntersecting tells us the next card is starting to
                // slide over the previous one.
                if (entry.isIntersecting) {
                    prevCard.classList.add("card--recede");
                } else {
                    prevCard.classList.remove("card--recede");
                }
            });
        },
        {
            root: null,
            // Fires when the top ~15% of the NEXT wrapper enters the viewport —
            // tune this to make the recede effect trigger earlier/later.
            rootMargin: "0px 0px -85% 0px",
            threshold:  0,
        }
    );

    // FIX #13: Store reference for cleanup.
    window.__voltStackObserver = observer;

    items.forEach((item, i) => {
        // FIX #12: index stored in WeakMap only (not in dataset).
        // Only observe items from index 1 onward — item 0 has no "previous card"
        // to recede, it only ever gets receded BY item 1.
        if (i > 0) observer.observe(item);
    });

    // FIX #13: Expose destroy via namespaced global for SPA teardown.
    //
    // FIX #21 — CONTRACT CLARIFICATION (destroy() and re-init):
    // Previously undocumented whether window.__voltStackInit = false here
    // is meant to enable a full re-init (rebuilding itemIndexMap) or is
    // just a partial teardown. Verified against this file's actual
    // structure, not assumed:
    //
    // This entire file is ONE self-invoking IIFE that runs exactly once,
    // at script-load time. There is no exposed init()/re-init() entry
    // point anywhere in this file — initStackCards, or anything callable
    // a second time, does not exist. itemIndexMap (line ~32) is a plain
    // closure-local `const`, not stored on window at all; once this IIFE
    // finishes running, nothing outside it can ever reference or rebuild
    // that map again.
    //
    // Consequence: destroy() setting window.__voltStackInit back to false
    // does NOT by itself cause a re-init, full or partial, because nothing
    // reads that flag again after this IIFE's first (and only) run — the
    // flag is checked once, at the very top of this file (FIX #14), and
    // never again. Concretely, in an SPA where destroy() is called and the
    // page then re-renders new .stack__item / .card elements client-side
    // (the exact scenario destroy()'s own comment says it exists for):
    // the observer stays disconnected, __voltStackInit stays false, and
    // the new DOM elements are NEVER observed — the recede effect will not
    // come back on those new elements, because there is no code path left
    // to call observer.observe() on them again.
    //
    // This was NOT changed in this pass — adding a real re-init entry
    // point is a new public API surface (something callable a second
    // time, replacing the run-once-IIFE structure), which is a bigger
    // design decision than a comment clarification and wasn't asked for
    // as a fix. If SPA re-render support is actually needed, the concrete
    // next step is exposing something like window.__volt.stackCards.init()
    // that re-runs the querySelectorAll + itemIndexMap + observer setup
    // block (lines ~23–80 above), callable after destroy(). Until that
    // exists, destroy() should be understood as a ONE-WAY teardown: fine
    // for "leaving this page and never coming back to stack cards," not
    // safe to assume it supports "tear down, then bring the same feature
    // back on new DOM."
    window.__volt = window.__volt || {};
    window.__volt.stackCards = {
        destroy: function () {
            observer.disconnect();
            window.__voltStackInit = false;
            window.__voltStackObserver = null;
        }
    };
})();