// ==================== script2.js ====================
document.addEventListener("DOMContentLoaded", () => {
    // ── Admin panel button handler ────────────────────────────────────────────
    // SECURITY FIXES APPLIED:
    // #1: Removed console.table(window.PromoEngine.PROMO_CODES) — this exposed
    //     every valid coupon code to any user with DevTools access. Promo code
    //     validation must be server-side only (see Section 4 backend config).
    // #2: Removed console.log confirmation — do not advertise admin surface
    //     existence to DevTools observers.
    // #3: Added frontend auth guard. NOTE: this is defence-in-depth only.
    //     The admin button must NOT be rendered in the DOM for non-admin users
    //     (controlled server-side via Supabase app_metadata.role — see Section 4).
    //     Every admin action must also be gated server-side in an Edge Function.

    // FIX #7 (EXTERNAL DEPENDENCY): data-testid="admin-panel-btn" must be
    // added to the #adminPanelBtn element in the HTML/template that renders
    // this button. This file only reads the element via getElementById — it
    // cannot self-inject the attribute onto a server-rendered node. Add:
    //   <button id="adminPanelBtn" data-testid="admin-panel-btn">…</button>
    // in whatever template produces this button (Supabase server component,
    // Jinja template, or static HTML). This mirrors the data-testid contract
    // applied across this codebase in Product_filter___JS and the Accordion.
    const adminBtn = document.getElementById("adminPanelBtn");
    if (!adminBtn) return;

    adminBtn.addEventListener("click", () => {
        // Frontend auth guard — defence-in-depth only.
        // Real gate: server-side role check in Edge Function.
        try {
            const LOGGED_USER_KEY = "volt_logged_user";
            const u = JSON.parse(sessionStorage.getItem(LOGGED_USER_KEY));
            if (!u || u.role !== "admin") {
                // Silently abort — do not reveal why or that a gate exists.
                return;
            }
        } catch (e) {
            return;
        }

        // Admin panel logic goes here.
        // All admin operations must call a Supabase Edge Function that
        // re-validates the session and role server-side before acting.
        // Example: fetch("/functions/v1/admin-action", { method: "POST", ... })

        // FIX: moved here from script.js, which previously attached a SECOND,
        // completely unguarded click listener to this same #adminPanelBtn —
        // one with no auth check at all, reachable by any visitor. That
        // listener has been removed from script.js; this is now the only
        // place the promo panel opens, and it only runs after the role
        // check above passes.
        //
        // FIX (data leak closed): window.PromoEngine.PROMO_CODES is no
        // longer populated at page load for every visitor — it starts
        // empty (see promoCodeEngine.js) and is only fetched here, via
        // loadForAdmin(), after the role check above has already passed.
        // renderPromoTable() is called only once that fetch resolves, so
        // the table it reads from is guaranteed to be populated before
        // rendering. The modal itself still opens immediately below,
        // independent of the fetch, so there's no added open-delay.
        const promoModal = document.getElementById("promo-modal");
        if (promoModal) {
            promoModal.style.display = "flex";
        }

        (async () => {
            if (window.PromoEngine && typeof window.PromoEngine.loadForAdmin === "function") {
                await window.PromoEngine.loadForAdmin();
            }
            if (typeof window.renderPromoTable === "function") {
                renderPromoTable();
            }
        })();
    });
});