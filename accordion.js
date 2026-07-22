/* ==========================================================================
   REUSABLE ACCORDION MENU (Vanilla JS)
   ==========================================================================
   Matches ANY .accordion-header / .accordion-content pair. Fully class-driven
   — add new accordion sections in HTML only; this script never needs to change.

   REQUIRED HTML CONTRACT (repeat this block per category):
     FIX #14: data-testid required on both header and content elements
     below. No HTML file was in scope for this pass, so these attributes
     can't be added to real markup — this is a requirement for whoever
     implements the markup, not a confirmation that it's already done.
     <div class="accordion-item">
       <button class="accordion-header" aria-expanded="false"
               data-testid="accordion-header">Sensors</button>
       <div class="accordion-content" data-testid="accordion-content">
         <ul>
           <li><a href="#">Ultrasonic</a></li>
           <li><a href="#">Infrared</a></li>
         </ul>
       </div>
     </div>

   WHY scrollHeight INSTEAD OF max-height: auto or none:
   CSS transitions can only interpolate between two NUMERIC values. "auto"
   and "none" aren't numbers the browser can animate toward — so a
   transition targeting either of those either doesn't play at all, or
   snaps instantly with no slide. The fix: read the content's real pixel
   height via scrollHeight at the moment of opening, and transition to
   THAT exact number. scrollHeight always reflects the content's natural
   height regardless of how much text/sub-items it has, so this works
   whether a category has 2 sub-items or 20, without hardcoding any height.

   WHY EVENT DELEGATION (not per-header addEventListener):
   Same reasoning as the filter script: a listener attached to each header
   at setup time only covers headers that exist at that moment. A single
   delegated listener on the shared parent container catches clicks on
   any header added later too, so new categories need zero JS changes —
   which is exactly requirement #5's intent, mirrored here for the sidebar.
========================================================================== */

function initAccordion(config) {
    config = config || {};
    const containerSelector = config.containerSelector || "#accordionSidebar";
    const headerClass       = config.headerClass       || "accordion-header";
    const contentClass      = config.contentClass      || "accordion-content";
    const activeClass       = config.activeClass       || "active";

    // FIX #7: CSS.escape() prevents DOMException if class names contain
    // CSS special characters. Fallback strips non-alphanumeric chars for
    // browsers that don't support CSS.escape (IE11, very old WebKit).
    function escapeClass(cls) {
        if (typeof CSS !== "undefined" && CSS.escape) return CSS.escape(cls);
        return String(cls).replace(/[^a-zA-Z0-9_-]/g, "");
    }
    const safeHeaderClass  = escapeClass(headerClass);
    const safeContentClass = escapeClass(contentClass);
    const safeActiveClass  = escapeClass(activeClass);

    const container = document.querySelector(containerSelector);
    if (!container) {
        // FIX #6: Generic message — does not expose internal selector strings.
        console.warn("initAccordion: required container not found. Accordion not initialized.");
        return;
    }

    // FIX #8: Debounced, passive resize handler. Caches the querySelector
    // result per call instead of re-querying on every resize frame.
    var _resizeTimer = null;
    function _debouncedRefresh() {
        if (_resizeTimer) clearTimeout(_resizeTimer);
        _resizeTimer = setTimeout(refreshOpenSection, 100);
    }

    // FIX #10: Clean up any prior resize listener before adding a new one
    // (guards against double-init accumulating listeners).
    if (container.__voltAccordionCleanup) {
        container.__voltAccordionCleanup();
    }
    // FIX #8: passive:true — resize handler never calls preventDefault.
    window.addEventListener("resize", _debouncedRefresh, { passive: true });

    // FIX #12: Named (not inline-anonymous) so __voltAccordionCleanup can
    // pass the same reference to removeEventListener. An inline arrow here
    // has no reference outside this scope — removeEventListener requires
    // the exact function it was added with, so it could never be un-added,
    // unlike the resize handler below which was already named for this reason.
    // Single delegated listener — survives any accordion items added later.
    function _handleContainerClick(e) {
        const header = e.target.closest(`.${safeHeaderClass}`);
        if (!header || !container.contains(header)) return;

        const content = header.nextElementSibling;
        if (!content || !content.classList.contains(contentClass)) {
            // FIX #6: No DOM node reference in warn — doesn't expose internals.
            console.warn("initAccordion: expected accordion content immediately after header.");
            return;
        }

        const isCurrentlyOpen = header.classList.contains(activeClass);

        // Accordion logic: close every OTHER open section first.
        container.querySelectorAll(`.${safeHeaderClass}.${safeActiveClass}`).forEach((openHeader) => {
            if (openHeader !== header) {
                closeSection(openHeader);
            }
        });

        // Then toggle the clicked one.
        if (isCurrentlyOpen) {
            closeSection(header);
        } else {
            openSection(header, content);
        }
    }
    container.addEventListener("click", _handleContainerClick);

    // FIX #12: Store cleanup function on the container for re-init safety
    // (FIX #10). Originally this removed only the resize listener — the
    // click listener above had no matching removal, so a second
    // initAccordion() call on the same container stacked a second click
    // handler and every click after that double-fired openSection/
    // closeSection. Click removal is added here alongside resize removal.
    container.__voltAccordionCleanup = function () {
        window.removeEventListener("resize", _debouncedRefresh);
        if (_resizeTimer) clearTimeout(_resizeTimer);
        container.removeEventListener("click", _handleContainerClick);
    };

    function openSection(header, content) {
        header.classList.add(activeClass);
        // FIX #11: aria-expanded for screen reader support.
        header.setAttribute("aria-expanded", "true");
        // scrollHeight = the content's real, natural pixel height.
        content.style.maxHeight = content.scrollHeight + "px";
    }

    function closeSection(header) {
        const content = header.nextElementSibling;
        header.classList.remove(activeClass);
        // FIX #11: aria-expanded for screen reader support.
        header.setAttribute("aria-expanded", "false");
        // contentClass is the raw name (safe for classList.contains);
        // safeContentClass is the CSS-escaped form (used in selectors).
        if (content && content.classList.contains(contentClass)) {
            content.style.maxHeight = "0px";
        }
    }

    // If content height can change AFTER opening (e.g. an image inside
    // finishes loading, or sub-items are added dynamically to an open
    // section), the max-height we set earlier goes stale. Call this to
    // re-measure.
    function refreshOpenSection() {
        const openHeader = container.querySelector(`.${safeHeaderClass}.${safeActiveClass}`);
        if (!openHeader) return;
        const content = openHeader.nextElementSibling;
        if (!content) {
            console.warn("initAccordion: open section content missing during refresh.");
            return;
        }
        content.style.maxHeight = content.scrollHeight + "px";
    }

    // FIX #11: Set initial aria-expanded state on all headers at init time.
    container.querySelectorAll(`.${safeHeaderClass}`).forEach((header) => {
        if (!header.hasAttribute("aria-expanded")) {
            header.setAttribute("aria-expanded",
                header.classList.contains(activeClass) ? "true" : "false"
            );
        }
    });

    const api = {
        refresh:  refreshOpenSection,
        // FIX #10: Expose destroy for SPA teardown.
        destroy: function () {
            if (container.__voltAccordionCleanup) {
                container.__voltAccordionCleanup();
                delete container.__voltAccordionCleanup;
            }
        }
    };

    return api;
}

document.addEventListener("DOMContentLoaded", () => {
    // FIX #9: Namespaced under window.__volt.
    // FIX #13: Backward-compat alias removed; if any external code still
    // reads window.accordionMenu, restore here.
    // Testability contract: every .accordion-header must carry
    // data-testid="accordion-header"; every .accordion-content
    // must carry data-testid="accordion-content" (see file header
    // comment for the full HTML contract). The HTML pass adds
    // these; this file does not.
    window.__volt = window.__volt || {};
    window.__volt.accordionMenu = initAccordion();
});