/* ==========================================================================
   ⚠️ ORDER PRICE VERIFICATION — كشف التلاعب في السعر (Admin-side)
   ========================================================================== */

(function () {
    "use strict";

    async function verifyOrderPricing(order) {
        const lineResults = [];
        let hasTampering = false;
        let hasUnverifiable = false;

        const items = Array.isArray(order.items) ? order.items : [];

        for (const item of items) {
            const productId = item.productId || item.id || null;
            const storedPrice = Number(item.price) || 0;
            const quantity = Number(item.quantity) || 1;

            if (!productId) {
                lineResults.push({
                    name: item.name || "منتج غير معروف",
                    storedPrice,
                    realPrice: null,
                    quantity,
                    status: "unverifiable",
                    difference: null
                });
                hasUnverifiable = true;
                continue;
            }

            try {
                let productData = null;
                if (window.voltFirebase && typeof window.voltFirebase.getProducts === "function") {
                    const allProducts = await window.voltFirebase.getProducts();
                    productData = (allProducts || []).find(p => String(p.id) === String(productId));
                }

                if (!productData) {
                    lineResults.push({
                        name: item.name || "منتج محذوف",
                        storedPrice,
                        realPrice: null,
                        quantity,
                        status: "unverifiable",
                        difference: null
                    });
                    hasUnverifiable = true;
                    continue;
                }

                const realPrice = Number(productData.price) || 0;
                const difference = realPrice - storedPrice;
                const isMismatch = Math.abs(difference) >= 0.01;

                lineResults.push({
                    name: item.name || productData.name || "منتج",
                    storedPrice,
                    realPrice,
                    quantity,
                    status: isMismatch ? "mismatch" : "match",
                    difference: Math.round(difference * 100) / 100
                });

                if (isMismatch) hasTampering = true;

            } catch (err) {
                console.warn("verifyOrderPricing: فشل التحقق من منتج", productId, err);
                lineResults.push({
                    name: item.name || "منتج",
                    storedPrice,
                    realPrice: null,
                    quantity,
                    status: "unverifiable",
                    difference: null
                });
                hasUnverifiable = true;
            }
        }

        return { hasTampering, hasUnverifiable, lineResults };
    }

    window.__voltVerifyOrderPricing = verifyOrderPricing;
})();
