/* ==========================================================================
   ⚠️ ORDER PRICE VERIFICATION — كشف التلاعب في السعر (Admin-side)
   ==========================================================================
   🆕 API INFRASTRUCTURE PASS: each line item's product lookup now goes
   through window.voltFirebase.getProductByIdEnvelope when available, so
   an "unverifiable" result carries a `reason` distinguishing:
     - "not_found"     -> Firestore confirmed the product doc doesn't
                          exist (404). Legitimate finding — product was
                          deleted after the order was placed.
     - "fetch_failed"  -> Firestore/network call itself failed (403/500/
                          timeout/etc). Transient — worth a retry, not a
                          deletion.
     - "no_product_id" -> the order's line item never carried a
                          productId/id to look up in the first place
                          (unchanged from original behavior).

   IMPORTANT — loop behavior is UNCHANGED from the original: a single
   item's lookup failing (of ANY kind, 404 or 500) still does NOT abort
   verification of the remaining items. The function's job is to report
   per-item findings across the whole order; aborting early on the first
   failure would silently drop coverage of every item after it, which is
   a worse outcome than flagging one item "unverifiable" and continuing.
   Only the REASON attached to "unverifiable" is new — the control flow
   that reaches it is not.

   Falls back to the original getProductById / getProducts path if
   getProductByIdEnvelope isn't available (e.g. config.js not yet
   reloaded), so this file degrades gracefully rather than breaking.
   ==========================================================================
   🆕 PERF PASS (load-test audit): per-item lookups previously ran inside
   a sequential `for...of` loop — each item's Firestore/network round-trip
   awaited before the next item's lookup even started. For an order with
   many line items this meant N sequential round-trips end-to-end instead
   of N concurrent ones, and admin dashboard "verify pricing" latency grew
   linearly with items-per-order.

   Refactored to fire every item's lookup concurrently via
   Promise.allSettled(). This does not change the "never abort on one
   item's failure" guarantee documented above — allSettled resolves once
   every promise has settled (success or failure) and never short-circuits
   on a rejection, so the exact same "one item's failure never blocks
   coverage of the rest" behavior holds, it just now happens in parallel
   instead of sequentially. The per-item fetch/comparison logic itself
   (envelope path, fallback path, reason classification) is completely
   unchanged — only the loop that dispatches it is different. A top-level
   .catch is still needed on the mapped async function itself: an
   unexpected synchronous throw before any await (e.g. a malformed item
   object) would otherwise become a rejected promise in the allSettled
   array, which the mapping step below already accounts for via the
   status === "fulfilled" check.
   ========================================================================== */

(function () {
    "use strict";

    async function verifyOrderPricing(order) {
        if (!order || typeof order !== "object") throw new Error("Invalid order object");

        const items = Array.isArray(order.items) ? order.items : [];

        const results = await Promise.allSettled(items.map(async (item) => {
            const productId = item.productId || item.id || null;
            const storedPrice = Number(item.price) || 0;
            const quantity = Number(item.quantity) || 1;

            if (!productId) {
                return {
                    name: item.name || "منتج غير معروف",
                    storedPrice,
                    realPrice: null,
                    quantity,
                    status: "unverifiable",
                    reason: "no_product_id",
                    difference: null
                };
            }

            try {
                let productData = null;
                let lookupFailed = false;
                let lookupNotFound = false;

                if (window.voltFirebase && typeof window.voltFirebase.getProductByIdEnvelope === "function") {
                    // 🆕 Envelope path — distinguishes 404 from 500/403.
                    const envelope = await window.voltFirebase.getProductByIdEnvelope(productId);
                    if (envelope.ok) {
                        productData = envelope.data;
                    } else if (envelope.status === 404) {
                        lookupNotFound = true;
                    } else {
                        // 403/500/etc — treat as a failed fetch, not a
                        // confirmed deletion. envelope.error.message is
                        // already a safe, mapped string (never raw
                        // err.message) — logged here for admin console
                        // visibility only, never rendered anywhere.
                        console.warn("verifyOrderPricing: envelope lookup failed", productId, envelope.error);
                        lookupFailed = true;
                    }
                } else if (window.voltFirebase && typeof window.voltFirebase.getProductById === "function") {
                    // Fallback — original behavior, no reason distinction
                    // possible (getProductById collapses 404 and 500 into
                    // the same null return, same as before this pass).
                    productData = await window.voltFirebase.getProductById(productId);
                    if (!productData) lookupNotFound = true; // best-effort guess, matches prior behavior
                } else if (window.voltFirebase && typeof window.voltFirebase.getProducts === "function") {
                    const allProducts = await window.voltFirebase.getProducts();
                    productData = (allProducts || []).find(p => String(p.id) === String(productId));
                    if (!productData) lookupNotFound = true;
                }

                if (lookupFailed) {
                    return {
                        name: item.name || "منتج",
                        storedPrice,
                        realPrice: null,
                        quantity,
                        status: "unverifiable",
                        reason: "fetch_failed",
                        difference: null
                    };
                }

                if (!productData || lookupNotFound) {
                    return {
                        name: item.name || "منتج محذوف",
                        storedPrice,
                        realPrice: null,
                        quantity,
                        status: "unverifiable",
                        reason: "not_found",
                        difference: null
                    };
                }

                const realPrice = Number(productData.price) || 0;
                const difference = realPrice - storedPrice;
                const isMismatch = Math.abs(difference) >= 0.01;

                return {
                    name: item.name || productData.name || "منتج",
                    storedPrice,
                    realPrice,
                    quantity,
                    status: isMismatch ? "mismatch" : "match",
                    difference: Math.round(difference * 100) / 100
                };

            } catch (err) {
                // Unexpected throw outside the envelope path itself (e.g.
                // the fallback branches above threw). Same "unverifiable,
                // continue" behavior as always — never abort the loop.
                console.warn("verifyOrderPricing: فشل التحقق من منتج", productId, err);
                return {
                    name: item.name || "منتج",
                    storedPrice,
                    realPrice: null,
                    quantity,
                    status: "unverifiable",
                    reason: "fetch_failed",
                    difference: null
                };
            }
        }));

        // allSettled never rejects and never short-circuits on a single
        // item's rejection — every item's outcome (fulfilled or rejected)
        // is captured here. A "rejected" entry can only occur from a
        // synchronous throw in the mapped function itself before its own
        // try/catch could intercept it (e.g. an exception thrown while
        // reading item.productId on a malformed item), so it is mapped to
        // the same "unverifiable" / "fetch_failed" shape every other
        // failure path in this function already produces — preserving the
        // exact same return contract lineResults consumers rely on.
        const lineResults = results.map(r => r.status === "fulfilled" ? r.value : {
            name: "منتج",
            storedPrice: 0,
            realPrice: null,
            quantity: 1,
            status: "unverifiable",
            reason: "fetch_failed",
            difference: null
        });

        const hasTampering = lineResults.some(r => r.status === "mismatch");
        const hasUnverifiable = lineResults.some(r => r.status === "unverifiable");

        return { hasTampering, hasUnverifiable, lineResults };
    }

    window.__voltVerifyOrderPricing = verifyOrderPricing;
})();