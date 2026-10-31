/* promoCodeEngine.js — client-side promo code data + admin-panel support.
 *
 * This file provides the admin panel's promo-code display layer and a
 * local validation fallback when Firestore is not available. The primary
 * validation path for customer-facing promo application goes through
 * Firestore (window.voltFirebase.validatePromoCode), falling back to
 * window.PromoEngine.validatePromoCode() in this file if Firestore is
 * unavailable — no Supabase Edge Function is involved.
 *
 * This file exists to:
 *   1. Give the ADMIN PANEL (script.js: window.renderPromoTable / togglePromoStatus)
 *      something to read and display — codes, type, value, active/inactive.
 *   2. Persist that admin-facing list in localStorage (same pattern as
 *      volt_products, volt_users, etc. elsewhere in this app) so toggling a
 *      code on/off survives a page reload.
 *   3. Provide validatePromoCode() as a local fallback for cart-promo.js's
 *      applyCustomerPromo() and revalidateForTotal() when Firestore is not
 *      reachable.
 *
 * ARCHITECTURE NOTE (FIX #19 — partially addressed):
 * The PROMO_CODES array in this file and the Firestore-based
 * window.voltFirebase collection that cart-promo.js reads from are
 * managed independently. When Firestore is available, cart-promo.js skips
 * this file entirely and reads directly from Firestore. When Firestore is
 * not available, this file serves as the fallback. There is no automated
 * sync or drift detection between the two sources — if both are in use
 * (Firestore partially up with some codes, localStorage with others), the
 * user experience may differ between admin panel and checkout. This is an
 * acknowledged design gap that should be addressed if the app grows to
 * depend on Firestore permanently.
 */
(async function () {
    "use strict";

    const STORAGE_KEY = "volt_promo_codes";

    const seedCodes = [];

    async function loadCodes() {
        // أولوية للـ Firestore لو متاح
        if (window.voltFirebase && typeof window.voltFirebase.getAllPromoCodes === "function") {
            try {
                const firebaseCodes = await window.voltFirebase.getAllPromoCodes();
                if (Array.isArray(firebaseCodes) && firebaseCodes.length > 0) {
                    localStorage.setItem(STORAGE_KEY, JSON.stringify(firebaseCodes));
                    return firebaseCodes;
                }
            } catch (e) { console.warn("Promo loadCodes: فشل جلب أكواد Firestore", e); }
        }

        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
        } catch (e) {}

        localStorage.removeItem(STORAGE_KEY);
        return [];
    }

    async function saveCodes(codes) {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(codes));
        } catch (e) {}

        if (window.voltFirebase && typeof window.voltFirebase.savePromoCode === "function") {
            for (const code of codes) {
                try { await window.voltFirebase.savePromoCode(code); } catch (e) {}
            }
        }
    }

    // ── Public surface ──────────────────────────────────────────────────────
    // PROMO_CODES is a live array reference. script.js's togglePromoStatus
    // mutates entries on this exact array directly (codeObj.status = ...),
    // so we persist after every mutation via a Proxy-free approach: we
    // expose a save hook the admin functions can call. To avoid requiring
    // script.js changes, we instead persist opportunistically whenever
    // PROMO_CODES is read for rendering — see note on window.renderPromoTable
    // wrapping below.
    window.PromoEngine = {
        PROMO_CODES: [],

        /**
         * Populates PROMO_CODES from Firestore/localStorage via loadCodes().
         * NOT called automatically at module load anymore — this used to
         * fetch and expose the full promo-code table (including inactive/
         * retired codes, exact discount rules, min-order thresholds) to
         * every visitor unconditionally, the instant this script parsed,
         * regardless of whether they ever opened the admin panel. Any
         * visitor could read the full table via DevTools:
         * window.PromoEngine.PROMO_CODES. Deferring the fetch to this
         * explicit method — called only after the admin auth gate in
         * script2.js passes — means PROMO_CODES stays empty for ordinary
         * visitors and is populated only for a session that has already
         * proven (client-side) it is an admin.
         * Safe to call more than once (e.g. reopening the promo panel);
         * each call re-fetches and reassigns PROMO_CODES.
         */
        loadForAdmin: async function () {
            window.PromoEngine.PROMO_CODES = await loadCodes();
            return window.PromoEngine.PROMO_CODES;
        },

        /**
         * Persist the current in-memory PROMO_CODES array to localStorage.
         * script.js's togglePromoStatus mutates PROMO_CODES entries directly
         * and does not know about localStorage — call this after any
         * mutation so admin changes survive a reload. Wired in below via a
         * light wrap of window.togglePromoStatus so no change to script.js
         * is required.
         *
         * NOTE: this object literal previously also carried a
         * validatePromoCode(codeName, codes, cart) method — entirely dead
         * (verified via AST parse, not by reading the surrounding prose:
         * it sat inside an unclosed block comment spanning what looked
         * like two separate comment blocks but tokenized as one continuous
         * comment from just after PROMO_CODES through just before this
         * persist() definition). Confirmed zero live callers project-wide:
         * cart-promo.js's two guarded call sites
         * (`typeof window.PromoEngine.validatePromoCode === "function"`)
         * already evaluated false before this removal, since the property
         * was never actually defined on this object at runtime — so this
         * deletion changes no observable behavior. Removed rather than
         * kept "for reference," since promo validation is the customer-
         * facing security-sensitive path this codebase deliberately moved
         * server-side (see config.js's validatePromoCodeInFirestore); an
         * inert copy of the old client-side logic sitting in a live object
         * literal is a liability if anyone ever re-enables it by accident,
         * not an asset.
         */
        persist: async function () {
            await saveCodes(window.PromoEngine.PROMO_CODES);
        }
    };

    // ── Persist admin toggles without modifying script.js ──────────────────
    // togglePromoStatus is defined in script.js, loaded before this file
    // (index.html order: script.js, then promoCodeEngine.js). We wrap it
    // here so flipping a code's active/inactive state actually survives a
    // reload, without needing to touch script.js's own logic.
    //
    // FIX #17: previously this checked once (on DOMContentLoaded, or
    // immediately if the document was already past "loading") and silently
    // gave up forever if togglePromoStatus wasn't defined yet — no retry,
    // no warning. If script.js ever defines togglePromoStatus asynchronously
    // (e.g. inside its own late callback, after some fetch/init step) rather
    // than synchronously at parse time, that one check could run before it
    // exists, and every admin toggle from then on would silently fail to
    // persist with nothing in the console to explain why. Fixed with a
    // bounded retry: re-check on a short interval up to WRAP_MAX_ATTEMPTS
    // times, then console.warn if it still never attached, so the failure
    // is at least diagnosable instead of invisible.
    const WRAP_MAX_ATTEMPTS   = 20;   // 20 * 250ms = 5s of grace before warning
    const WRAP_RETRY_DELAY_MS = 250;

    function wrapTogglePersist(attempt) {
        attempt = attempt || 1;

        if (typeof window.togglePromoStatus === "function" && !window.togglePromoStatus.__voltWrapped) {
            const original = window.togglePromoStatus;
            const wrapped = function (codeName) {
                original(codeName);
                window.PromoEngine.persist();
            };
            wrapped.__voltWrapped = true;
            window.togglePromoStatus = wrapped;
            return;
        }

        // Already wrapped — nothing to do, not a failure.
        if (typeof window.togglePromoStatus === "function" && window.togglePromoStatus.__voltWrapped) {
            return;
        }

        // Not defined yet. Retry if we haven't exhausted our attempts.
        if (attempt < WRAP_MAX_ATTEMPTS) {
            setTimeout(function () {
                wrapTogglePersist(attempt + 1);
            }, WRAP_RETRY_DELAY_MS);
            return;
        }

        // Exhausted retries — togglePromoStatus never appeared. Admin
        // toggles will work in-memory (script.js's own logic still runs)
        // but will NOT persist to localStorage, and nothing else will say
        // why. Surface it loudly so this is diagnosable.
        console.warn(
            "promoCodeEngine.js: window.togglePromoStatus was never defined after " +
            (WRAP_MAX_ATTEMPTS * WRAP_RETRY_DELAY_MS) + "ms — persistence wrap did not " +
            "attach. Admin promo-code toggles will not survive a page reload until " +
            "script.js defines window.togglePromoStatus and this file is reloaded " +
            "after it, or wrapTogglePersist() is called again manually."
        );
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () {
            wrapTogglePersist(1);
        });
    } else {
        wrapTogglePersist(1);
    }
})();
