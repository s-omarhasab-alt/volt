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
        // TODO (backend): renderPromoTable() currently reads
        // window.PromoEngine.PROMO_CODES directly in the browser — the full
        // coupon table is visible client-side regardless of this gate. This
        // still needs to be replaced with a fetch to a Supabase Edge
        // Function (e.g. GET /functions/v1/admin-promo-codes) that re-checks
        // the caller's role server-side before returning any codes. Left
        // as-is for this pass per your Supabase-already-set-up frontend-only
        // scope — flagging so it isn't mistaken for solved.
        //
        // FIX #4 (ARCHITECTURE — NO CODE CHANGE): The TODO above is the
        // correct and ONLY fix for the PROMO_CODES exposure. A client-side
        // patch (e.g. filtering rows, hiding UI) does NOT address the root
        // issue: window.PromoEngine.PROMO_CODES is already in browser memory
        // the moment the JS bundle loads, regardless of whether this modal
        // ever opens or the role check ever passes. Any visitor with DevTools
        // can read it. The fix requires replacing the renderPromoTable() call
        // with a fetch to a Supabase Edge Function that gates the data
        // server-side before it ever reaches the client. No change to this
        // file is correct until that Edge Function exists.
        const promoModal = document.getElementById("promo-modal");
        if (promoModal) {
            promoModal.style.display = "flex";
        }
        if (typeof window.renderPromoTable === "function") {
            renderPromoTable();
        }
    });
});