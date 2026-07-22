(function () {
    "use strict";

    // ── Guard: prevent duplicate init (e.g. SPA soft navigation) ──────────────
    if (window.__sscInit) return;
    window.__sscInit = true;

    // ── HTML CONTRACT (FIX #5): The following attributes are REQUIRED on the
    //    host HTML elements for test-runner stability. Add them in whatever
    //    template or server-render produces these nodes:
    //      <section id="scrollSplitCard" data-testid="scroll-split-section">
    //      <div class="ssc__panel" data-testid="ssc-panel"> (repeat per panel)
    //    These mirror the data-testid contract used in Product_filter___JS and
    //    the Accordion file — class names and IDs are NOT stable test hooks by
    //    convention. This file documents the contract; it cannot self-inject it
    //    because the HTML is rendered server-side or by a separate template.
    // ─────────────────────────────────────────────────────────────────────────

    var section = document.getElementById('scrollSplitCard');
    if (!section) return;

    // Use Array.from instead of Array.prototype.slice to avoid Prototype
    // Pollution risk on the slice method.
    var panels = Array.from(section.querySelectorAll('.ssc__panel'));
    var panelsEl = section.querySelector('.ssc__panels');
    if (panels.length === 0 || !panelsEl) return;

    var FLIP_WINDOWS = [
        [0.38, 0.72],
        [0.42, 0.76],
        [0.46, 0.80]
    ];

    var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    // Store rAF handle so we can cancel on teardown.
    var rafHandle = null;
    var ticking = false;

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
    function mapRange(v, inMin, inMax, outMin, outMax) {
        var t = clamp((v - inMin) / (inMax - inMin), 0, 1);
        return outMin + t * (outMax - outMin);
    }

    // ── Null-safe helper: set aria-hidden and inert on a face element ──────────
    function setFaceVisibility(face, hidden) {
        if (!face) return;
        face.setAttribute('aria-hidden', String(hidden));
        // `inert` prevents keyboard focus into hidden content.
        // Supported in all modern browsers; degrades gracefully.
        if (hidden) {
            face.setAttribute('inert', '');
        } else {
            face.removeAttribute('inert');
        }
    }

    // FIX #6: Moved `var io` declaration to appear BEFORE `function destroy()`
    // textually. Previously `io` was declared at line 105 (after destroy at
    // line 90), relying on `var` hoisting to make io.disconnect() inside
    // destroy() work at call-time. Functionally correct, but fragile: if io
    // were ever converted to `const`/`let` or this IIFE were split into
    // modules, the reference would break silently. Declaration-before-use is
    // now enforced by source order, removing the hoisting dependency entirely.
    var io = new IntersectionObserver(function (entries) {
        var visible = entries[0].isIntersecting;
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
        if (visible) {
            window.addEventListener('scroll', onScroll, { passive: true });
            // Added passive: true to resize to match scroll and signal to browser.
            window.addEventListener('resize', onScroll, { passive: true });
            update();
        }
    // Replaced '50% 0px 50% 0px' with pixel values: avoids early listener
    // attachment when section is half a viewport away (wasted CPU).
    }, { rootMargin: '200px 0px 200px 0px' });

    // ── Teardown: remove listeners and disconnect observer cleanly ────────────
    function destroy() {
        window.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', onScroll);
        reduceMotion.removeEventListener('change', update);
        // io is now declared above this function in source order — no hoisting
        // dependency. Safe under any future refactor to const/let or module split.
        io.disconnect();
        if (rafHandle !== null) {
            cancelAnimationFrame(rafHandle);
            rafHandle = null;
        }
        // Allow re-init if section is re-mounted (e.g. SPA route revisit).
        window.__sscInit = false;
    }

    function update() {
        ticking = false;
        rafHandle = null;

        // ── Null-guard: abort if section or panelsEl were removed from DOM ────
        if (!section.isConnected || !panelsEl.isConnected) return;

        var rect = section.getBoundingClientRect();
        var scrollable = rect.height - window.innerHeight;
        var raw = scrollable > 0 ? clamp(-rect.top / scrollable, 0, 1) : 0;

        if (reduceMotion.matches) {
            var split = raw > 0.1 ? 1 : 0;
            panelsEl.style.setProperty('--ssc-split', split);
            panelsEl.style.setProperty('--ssc-zoom', 1);
            section.style.setProperty('--ssc-scrim', split ? 0.6 : 0);

            panels.forEach(function (panel, i) {
                // ── Null-guard: skip panel if children are missing ─────────────
                var flip = panel.querySelector('.ssc__flip');
                var front = panel.querySelector('.ssc__face--front');
                var back = panel.querySelector('.ssc__face--back');
                if (!flip || !front || !back) return;

                var showBack = raw > (FLIP_WINDOWS[i][0] + FLIP_WINDOWS[i][1]) / 2;
                flip.style.setProperty('--ssc-flip', showBack ? 180 : 0);
                front.style.opacity = showBack ? 0 : 1;
                back.style.opacity = showBack ? 1 : 0;
                setFaceVisibility(front, showBack);
                setFaceVisibility(back, !showBack);
            });
            return;
        }

        var zoom  = mapRange(raw, 0,    0.12, 1,    1.06);
        var split = mapRange(raw, 0.10, 0.40, 0,    1);
        var scrim = mapRange(raw, 0.08, 0.35, 0,    0.75);

        panelsEl.style.setProperty('--ssc-zoom',  zoom);
        panelsEl.style.setProperty('--ssc-split', split);
        section.style.setProperty('--ssc-scrim',  scrim);

        panels.forEach(function (panel, i) {
            // ── Null-guard: skip panel if children are missing ─────────────────
            var flipEl = panel.querySelector('.ssc__flip');
            var front  = panel.querySelector('.ssc__face--front');
            var back   = panel.querySelector('.ssc__face--back');
            if (!flipEl || !front || !back) return;

            var win       = FLIP_WINDOWS[i];
            var flipAngle = mapRange(raw, win[0], win[1], 0, 180);
            flipEl.style.setProperty('--ssc-flip', flipAngle + 'deg');

            var backVisible = flipAngle >= 90;
            setFaceVisibility(front, backVisible);
            setFaceVisibility(back,  !backVisible);
        });
    }

    function onScroll() {
        if (!ticking) {
            rafHandle = requestAnimationFrame(update);
            ticking = true;
        }
    }

    io.observe(section);

    reduceMotion.addEventListener('change', update);

    // ── Expose teardown for SPA frameworks that unmount DOM nodes ─────────────
    // Call window.__sscDestroy() before removing #scrollSplitCard from DOM.
    window.__sscDestroy = destroy;

    update();
})();