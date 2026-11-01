/* ==========================================================================
   VOLT FILTER V2 — additive module. Does not edit script.js / index.html logic.

   WHAT IT DOES
   - Loads the product catalog ONCE (via the existing global getProducts()),
     caches it in memory (60s TTL), and filters/sorts/paginates in memory.
     No per-click Firestore queries, no index needed for any filter below.
   - Replaces (by reassignment, original source untouched) three globals that
     script.js already calls everywhere: applyProductFilters(),
     loadProductsPage(), and wraps renderProducts() to decorate cards.
   - Reuses the existing pagination UI (renderProductsPagination) by setting
     the same page-state variables script.js itself uses.
   - Search source of truth stays the nav input #searchInput.
   - Old .filter-bar / .price-filter-row stay in the DOM (hidden by CSS).

   DATA CONTRACT (optional product fields, all additive)
     model: string                      -> searchable, shown on card
     voltage / connectivity / compatibility: string[]  -> spec facets
   Voltage also falls back to any specs key containing "جهد"/"voltage"
   (e.g. specs["جهد التشغيل"] = "5V"). A facet group only renders if at
   least one product actually has data for it.
   ========================================================================== */
(function () {
    "use strict";
    if (window.__voltFilterInit) return;
    window.__voltFilterInit = true;

    var PAGE = (typeof PRODUCTS_PAGE_SIZE !== "undefined") ? PRODUCTS_PAGE_SIZE : 30;
    var TTL_MS = 60000;
    var LOW_STOCK = 3; // same threshold as admin low-stock alert (renderAdminDashboardKPIs)

    var CAT_LABELS = {
        arduino: "آردوينو ومتحكمات",
        sensors: "مستشعرات (Sensors)",
        modules: "موجّهات وموديولات",
        tools: "أدوات ومعدات",
        others: "أخرى"
    };
    var GROUPS = [
        { key: "voltage", label: "الجهد" },
        { key: "connectivity", label: "نوع الاتصال" },
        { key: "compatibility", label: "التوافق" }
    ];
    var SORT_OPTIONS = [
        ["new", "الأحدث"],
        ["asc", "السعر: الأقل أولاً"],
        ["desc", "السعر: الأعلى أولاً"],
        ["name", "الاسم"]
    ];

    var catalog = null;
    var byId = new Map();
    var DISP = { voltage: {}, connectivity: {}, compatibility: {} };
    var DM = 1000;
    var fetchedAt = 0;
    var stale = false;
    var loading = null;
    var priceTouched = false;
    var fadeTimer = null;
    var S = freshState();

    function freshState() {
        return { cat: "all", min: 0, max: DM, av: "all", sort: "new", f: { voltage: [], connectivity: [], compatibility: [] } };
    }

    /* ---------------------------- helpers ---------------------------- */
    function $(id) { return document.getElementById(id); }
    function h(tag, attrs, kids) {
        var e = document.createElement(tag);
        if (attrs) for (var k in attrs) {
            if (k === "text") e.textContent = attrs[k];
            else if (k === "class") e.className = attrs[k];
            else e.setAttribute(k, attrs[k]);
        }
        (kids || []).forEach(function (c) { e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
        return e;
    }
    function fmt(n) { return Number(n).toLocaleString("en-US") + " EGP"; }
    function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
    function idKey(id) { return String(id == null ? "" : id).replace(/[^a-zA-Z0-9_-]/g, ""); }
    function toast(msg, type) { if (typeof window.showToast === "function") window.showToast(msg, type); }
    function catLabel(c) { return CAT_LABELS[c] || c || CAT_LABELS.others; }

    function splitList(v) {
        var a = Array.isArray(v) ? v : (typeof v === "string" ? v.split(/[,،;\n]+/) : []);
        return a.map(function (x) { return String(x).trim().replace(/\s+/g, " "); }).filter(Boolean);
    }
    function normVolt(x) {
        var m = x.match(/^(\d+(?:\.\d+)?)\s*v$/i);
        return m ? m[1] + "V" : x;
    }
    function specVolts(p) {
        var out = [];
        if (p.specs && typeof p.specs === "object") {
            Object.keys(p.specs).forEach(function (k) {
                if (/جهد|volt/i.test(k)) {
                    (String(p.specs[k]).match(/\d+(?:\.\d+)?\s*V/gi) || []).forEach(function (m) { out.push(m); });
                }
            });
        }
        return out;
    }
    function toKeys(group, list) {
        var keys = [];
        list.forEach(function (x) {
            var k = x.toLowerCase();
            if (!DISP[group][k]) DISP[group][k] = x;
            if (keys.indexOf(k) < 0) keys.push(k);
        });
        return keys;
    }

    function normalize(p) {
        var price = Number(p.price); if (!isFinite(price)) price = 0;
        var stock = Number(p.stock); if (!isFinite(stock)) stock = 0;
        var t = Date.parse(p.createdAt);
        var volt = splitList(p.voltage).map(normVolt);
        if (!volt.length) volt = specVolts(p).map(normVolt);
        var cat = String(p.category || "").trim() || "others";
        var n = {
            p: p,
            id: String(p.id),
            name: String(p.name || ""),
            model: String(p.model || ""),
            cat: cat,
            price: price,
            stock: stock,
            created: isNaN(t) ? null : t,
            f: {
                voltage: toKeys("voltage", volt),
                connectivity: toKeys("connectivity", splitList(p.connectivity)),
                compatibility: toKeys("compatibility", splitList(p.compatibility))
            }
        };
        n.hay = [n.name, n.model, catLabel(cat), cat].join(" ").toLowerCase();
        return n;
    }

    function avail(n) { return n.stock <= 0 ? "out" : (n.stock <= LOW_STOCK ? "low" : "in"); }
    function tokens() {
        var el = $("searchInput");
        var q = el ? el.value : "";
        return q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    }

    /* ----------------------------- matching ---------------------------- */
    function match(n, ign, tk) {
        for (var i = 0; i < tk.length; i++) if (n.hay.indexOf(tk[i]) < 0) return false;
        if (ign !== "cat" && S.cat !== "all" && n.cat !== S.cat) return false;
        if (n.price < S.min || n.price > S.max) return false;
        if (ign !== "av") {
            if (S.av === "in" && n.stock <= 0) return false;
            if (S.av === "low" && avail(n) !== "low") return false;
        }
        for (var g = 0; g < GROUPS.length; g++) {
            var key = GROUPS[g].key, sel = S.f[key];
            if (ign !== key && sel.length && !sel.some(function (x) { return n.f[key].indexOf(x) > -1; })) return false;
        }
        return true;
    }
    function count(ign, tk, fn) {
        var c = 0;
        for (var i = 0; i < catalog.length; i++) if (match(catalog[i], ign, tk) && fn(catalog[i])) c++;
        return c;
    }
    function sorted(list) {
        var a = list.slice();
        a.sort(function (x, y) {
            if (S.sort === "asc") return x.price - y.price || x.name.localeCompare(y.name, "ar");
            if (S.sort === "desc") return y.price - x.price || x.name.localeCompare(y.name, "ar");
            if (S.sort === "name") return x.name.localeCompare(y.name, "ar");
            var cx = x.created === null ? -1 : x.created, cy = y.created === null ? -1 : y.created;
            return cy - cx || x.name.localeCompare(y.name, "ar");
        });
        return a;
    }

    /* ---------------------------- catalog load -------------------------- */
    function ensureCatalog() {
        if (catalog && !stale && (Date.now() - fetchedAt) < TTL_MS) return Promise.resolve();
        if (loading) return loading;
        loading = (async function () {
            var list = [];
            try {
                list = (typeof getProducts === "function") ? await getProducts() : [];
            } catch (e) {
                console.warn("volt-filter: catalog load failed", e);
            }
            if (!Array.isArray(list)) list = [];
            DISP = { voltage: {}, connectivity: {}, compatibility: {} };
            catalog = list.filter(function (p) { return p && p.id != null; }).map(normalize);
            byId = new Map();
            catalog.forEach(function (n) { byId.set(idKey(n.id), n); });
            var top = catalog.reduce(function (m, n) { return Math.max(m, n.price); }, 0);
            DM = Math.max(10, Math.ceil(top / 10) * 10);
            if (!priceTouched || S.max > DM) S.max = DM;
            if (S.min > S.max) S.min = 0;
            fetchedAt = Date.now();
            stale = false;
            setupPriceBounds();
            syncPrice();
        })();
        var done = function () { loading = null; };
        loading.then(done, done);
        return loading;
    }

    /* ------------------------------- UI build --------------------------- */
    function build() {
        var title = $("productsTitle"), products = $("products"), pag = $("productsPagination");
        if (!title || !products || $("voltFilterLayout")) return;

        var layout = h("div", { id: "voltFilterLayout", "class": "vf-layout", "data-testid": "volt-filter-layout" });
        layout.innerHTML =
            '<button type="button" class="vf-toggle" id="vfToggle" data-testid="vf-toggle" aria-expanded="false" aria-controls="vfSide">' +
            '<span>فلترة وترتيب</span><span id="vfBadge" class="vf-badge" hidden></span></button>' +
            '<aside class="vf-side" id="vfSide" data-testid="volt-filter-panel" aria-label="فلاتر المنتجات">' +
            '<div class="vf-head"><span class="vf-title">الفلاتر</span>' +
            '<button type="button" class="vf-reset" id="vfReset" data-testid="vf-reset" hidden>مسح الكل</button></div>' +
            '<div class="vf-sec"><div class="vf-st">التصنيف</div><div id="vfCats" data-testid="vf-cats"><p class="vf-muted">جارٍ تحميل الفلاتر…</p></div></div>' +
            '<div class="vf-sec"><div class="vf-st"><span>السعر</span><span id="vfPlab" class="vf-plab"></span></div>' +
            '<div class="vf-prange"><input class="vf-num" id="vfNmin" data-testid="vf-price-min" inputmode="numeric" aria-label="أقل سعر">' +
            '<span class="vf-dash">–</span>' +
            '<input class="vf-num" id="vfNmax" data-testid="vf-price-max" inputmode="numeric" aria-label="أعلى سعر"></div>' +
            '<div class="vf-dr"><div class="vf-tr"></div><div class="vf-fl" id="vfFill"></div>' +
            '<input type="range" id="vfRmin" data-testid="vf-range-min" min="0" max="1000" step="10" value="0" aria-label="شريط أقل سعر">' +
            '<input type="range" id="vfRmax" data-testid="vf-range-max" min="0" max="1000" step="10" value="1000" aria-label="شريط أعلى سعر"></div>' +
            '<div class="vf-dmlab"><span>0 EGP</span><span id="vfDm"></span></div>' +
            '<p id="vfPerr" class="vf-err" role="alert"></p></div>' +
            '<div class="vf-sec"><div class="vf-st">التوفر</div><div class="vf-seg" id="vfAv" data-testid="vf-availability"></div></div>' +
            '<div id="vfFacets" data-testid="vf-facets"></div>' +
            '</aside>';

        var main = h("div", { id: "vfMain", "class": "vf-main" });
        var bar = h("div", { "class": "vf-bar" });
        bar.appendChild(h("div", { id: "vfCount", "class": "vf-count", "aria-live": "polite", "data-testid": "vf-count" }));
        var sortWrap = h("label", { "class": "vf-sort" }, [h("span", { text: "ترتيب:" })]);
        var sel = h("select", { id: "vfSort", "data-testid": "vf-sort" });
        SORT_OPTIONS.forEach(function (o) { sel.appendChild(h("option", { value: o[0], text: o[1] })); });
        sortWrap.appendChild(sel);
        bar.appendChild(sortWrap);

        title.parentNode.insertBefore(layout, title);
        layout.appendChild(main);
        main.appendChild(title);
        main.appendChild(bar);
        main.appendChild(h("div", { id: "vfTags", "class": "vf-tags", "data-testid": "vf-tags" }));
        main.appendChild(products);
        if (pag) main.appendChild(pag);

        var inp = $("searchInput");
        if (inp) inp.placeholder = "ابحث بالاسم أو الموديل…";

        bind();
        setupPriceBounds();
        syncPrice();
    }

    function bind() {
        $("vfToggle").addEventListener("click", function () {
            var open = $("voltFilterLayout").classList.toggle("vf-open");
            this.setAttribute("aria-expanded", String(open));
        });
        $("vfReset").addEventListener("click", resetAll);
        $("vfSort").addEventListener("change", function () { S.sort = this.value; renderSoft(1); });

        $("vfRmin").addEventListener("input", function () {
            S.min = Math.min(Number(this.value), S.max); priceTouched = true; setErr(""); syncPrice(); change();
        });
        $("vfRmax").addEventListener("input", function () {
            S.max = Math.max(Number(this.value), S.min); priceTouched = true; setErr(""); syncPrice(); change();
        });
        $("vfNmin").addEventListener("change", applyNum);
        $("vfNmax").addEventListener("change", applyNum);

        $("vfSide").addEventListener("click", function (e) {
            var b;
            if ((b = e.target.closest("[data-c]"))) { S.cat = b.getAttribute("data-c"); }
            else if ((b = e.target.closest("[data-a]"))) { S.av = b.getAttribute("data-a"); }
            else if ((b = e.target.closest("[data-g]"))) {
                var g = b.getAttribute("data-g"), k = b.getAttribute("data-k"), i = S.f[g].indexOf(k);
                if (i > -1) S.f[g].splice(i, 1); else S.f[g].push(k);
            } else return;
            change();
        });

        $("vfTags").addEventListener("click", function (e) {
            var b = e.target.closest("[data-t]");
            if (!b) return;
            var t = b.getAttribute("data-t");
            if (t === "q") { var q = $("searchInput"); if (q) q.value = ""; }
            else if (t === "cat") S.cat = "all";
            else if (t === "price") { priceTouched = false; S.min = 0; S.max = DM; setErr(""); syncPrice(); }
            else if (t === "av") S.av = "all";
            else {
                var parts = t.split(":"), g = parts[0], k = parts.slice(1).join(":"), i = S.f[g].indexOf(k);
                if (i > -1) S.f[g].splice(i, 1);
            }
            change();
        });

        document.addEventListener("click", function (e) {
            if (e.target && e.target.id === "vfEmptyReset") resetAll();
        });
    }

    /* -------------------------------- price ----------------------------- */
    function setupPriceBounds() {
        var step = DM > 5000 ? 100 : (DM > 1000 ? 50 : 10);
        ["vfRmin", "vfRmax"].forEach(function (id) {
            var el = $(id); if (!el) return;
            el.max = DM; el.step = step;
        });
        var dm = $("vfDm"); if (dm) dm.textContent = fmt(DM);
    }
    function syncPrice() {
        if (!$("vfRmin")) return;
        $("vfRmin").value = S.min; $("vfRmax").value = S.max;
        $("vfNmin").value = S.min; $("vfNmax").value = S.max;
        $("vfFill").style.right = (S.min / DM * 100) + "%";
        $("vfFill").style.left = (100 - S.max / DM * 100) + "%";
        $("vfPlab").textContent = fmt(S.min) + " – " + fmt(S.max);
    }
    function setErr(msg) {
        var el = $("vfPerr"); if (!el) return;
        el.textContent = msg || "";
        $("vfNmin").classList.toggle("vf-bad", !!msg);
        $("vfNmax").classList.toggle("vf-bad", !!msg);
    }
    function applyNum() {
        var a = $("vfNmin").value.trim(), b = $("vfNmax").value.trim();
        if (a === "" || b === "" || isNaN(Number(a)) || isNaN(Number(b))) { setErr("أدخل أرقاماً صحيحة"); return; }
        a = Math.round(Number(a)); b = Math.round(Number(b));
        if (a < 0 || b < 0) { setErr("السعر لا يمكن أن يكون سالباً"); return; }
        if (a > b) { setErr("الحد الأدنى أكبر من الحد الأقصى"); return; }
        if (b > DM) { b = DM; if (a > b) a = b; }
        S.min = a; S.max = b; priceTouched = true;
        setErr(""); syncPrice(); change();
    }

    /* ------------------------------ side render ------------------------- */
    function renderSide(tk) {
        if (!catalog) return;
        var cats = [];
        Object.keys(CAT_LABELS).forEach(function (c) { if (catalog.some(function (n) { return n.cat === c; })) cats.push(c); });
        catalog.forEach(function (n) { if (cats.indexOf(n.cat) < 0) cats.push(n.cat); });

        var box = $("vfCats"); box.textContent = "";
        [["all", "الكل"]].concat(cats.map(function (c) { return [c, catLabel(c)]; })).forEach(function (it) {
            var n = count("cat", tk, function (x) { return it[0] === "all" || x.cat === it[0]; });
            if (it[0] !== "all" && !n && S.cat !== it[0]) return;
            var on = S.cat === it[0];
            box.appendChild(h("button", {
                type: "button", "class": "vf-ci" + (on ? " on" : ""), "data-c": it[0],
                "aria-pressed": String(on), "data-testid": "vf-cat-" + it[0]
            }, [h("span", { text: (on ? "✓ " : "") + it[1] }), h("small", { text: String(n) })]));
        });

        var av = $("vfAv"); av.textContent = "";
        [["all", "الكل", function () { return true; }],
         ["in", "متوفر", function (n) { return n.stock > 0; }],
         ["low", "كمية محدودة", function (n) { return avail(n) === "low"; }]].forEach(function (a) {
            av.appendChild(h("button", {
                type: "button", "class": S.av === a[0] ? "on" : "", "data-a": a[0],
                "aria-pressed": String(S.av === a[0]), "data-testid": "vf-av-" + a[0],
                text: a[1] + " (" + count("av", tk, a[2]) + ")"
            }));
        });

        var fx = $("vfFacets"); fx.textContent = "";
        GROUPS.forEach(function (g) {
            var keys = Object.keys(DISP[g.key]);
            if (!keys.length) return;
            keys.sort(function (a, b) { return DISP[g.key][a].localeCompare(DISP[g.key][b], "ar", { numeric: true }); });
            var wrap = h("div", { "class": "vf-chips" });
            keys.forEach(function (k) {
                var n = count(g.key, tk, function (x) { return x.f[g.key].indexOf(k) > -1; });
                var on = S.f[g.key].indexOf(k) > -1;
                if (!n && !on) return;
                wrap.appendChild(h("button", {
                    type: "button", "class": "vf-fc" + (on ? " on" : ""), "data-g": g.key, "data-k": k,
                    "aria-pressed": String(on), "data-testid": "vf-facet-" + g.key + "-" + k
                }, [h("span", { text: DISP[g.key][k] }), h("small", { text: String(n) })]));
            });
            if (!wrap.childNodes.length) return;
            fx.appendChild(h("div", { "class": "vf-sec" }, [h("div", { "class": "vf-st", text: g.label }), wrap]));
        });
    }

    function tagList() {
        var t = [], q = $("searchInput") ? $("searchInput").value.trim() : "";
        if (q) t.push(["q", "بحث: " + q]);
        if (S.cat !== "all") t.push(["cat", catLabel(S.cat)]);
        if (S.min > 0 || S.max < DM) t.push(["price", S.min + " – " + S.max + " EGP"]);
        if (S.av !== "all") t.push(["av", S.av === "in" ? "متوفر" : "كمية محدودة"]);
        GROUPS.forEach(function (g) {
            S.f[g.key].forEach(function (k) { t.push([g.key + ":" + k, g.label + ": " + (DISP[g.key][k] || k)]); });
        });
        return t;
    }
    function renderTags() {
        var t = tagList(), box = $("vfTags");
        box.textContent = "";
        t.forEach(function (x) {
            box.appendChild(h("button", { type: "button", "class": "vf-tag", "data-t": x[0], "aria-label": "إزالة الفلتر: " + x[1] },
                [h("span", { text: x[1] }), h("span", { "class": "vf-x", "aria-hidden": "true", text: "×" })]));
        });
        $("vfReset").hidden = !t.length;
        var badge = $("vfBadge");
        badge.hidden = !t.length;
        badge.textContent = String(t.length);
    }

    function refreshUI() {
        if (!catalog || !$("vfSide")) return;
        var tk = tokens();
        renderSide(tk);
        renderTags();
    }

    /* ------------------------------ products render --------------------- */
    function renderPage(page) {
        if (!catalog) return;
        var tk = tokens();
        var all = sorted(catalog.filter(function (n) { return match(n, "", tk); }));
        var total = all.length;
        var pages = Math.max(1, Math.ceil(total / PAGE));
        page = Math.min(Math.max(1, page || 1), pages);

        try {
            currentProductsPage = page;
            totalProductsCount = total;
            totalProductsPages = pages;
            productsCountReady = true;
        } catch (e) { console.warn("volt-filter: could not sync pagination state", e); }

        var cnt = $("vfCount");
        if (cnt) {
            cnt.textContent = "";
            cnt.appendChild(h("strong", { text: S.cat === "all" ? "كل المنتجات" : catLabel(S.cat) }));
            cnt.appendChild(document.createTextNode(" — " + total + " منتج" + (total !== catalog.length ? " من أصل " + catalog.length : "")));
        }

        var grid = $("products");
        if (!total) {
            if (grid) {
                grid.textContent = "";
                var empty = h("div", { "class": "vf-empty", "data-testid": "vf-empty" }, [
                    h("p", { text: "لا توجد منتجات مطابقة لاختياراتك." }),
                    h("button", { type: "button", id: "vfEmptyReset", "class": "vf-empty-btn", "data-testid": "vf-empty-reset", text: "مسح كل الفلاتر" })
                ]);
                grid.appendChild(empty);
            }
        } else {
            var slice = all.slice((page - 1) * PAGE, page * PAGE).map(function (n) { return n.p; });
            if (typeof renderProducts === "function") renderProducts(slice);
        }
        if (typeof renderProductsPagination === "function") renderProductsPagination();
    }

    function renderSoft(page) {
        var grid = $("products");
        if (!grid) return renderPage(page);
        grid.classList.add("vf-busy");
        clearTimeout(fadeTimer);
        fadeTimer = setTimeout(function () {
            renderPage(page);
            grid.classList.remove("vf-busy");
        }, 110);
    }
    function change() { refreshUI(); renderSoft(1); }
    function resetAll() {
        var sort = S.sort;
        S = freshState(); S.sort = sort; S.max = DM; priceTouched = false;
        var q = $("searchInput"); if (q) q.value = "";
        setErr(""); syncPrice(); change();
    }

    /* ----------------------- card decoration (post-render) -------------- */
    function highlight(el, tk) {
        if (!el || !tk.length) return;
        var text = el.textContent;
        var parts = text.split(new RegExp("(" + tk.map(escRe).join("|") + ")", "gi"));
        if (parts.length < 2) return;
        el.textContent = "";
        parts.forEach(function (s, i) {
            if (!s) return;
            if (i % 2) el.appendChild(h("mark", { text: s })); else el.appendChild(document.createTextNode(s));
        });
    }
    function specLine(n) {
        var v = n.f.voltage.map(function (k) { return DISP.voltage[k]; }).join(" / ");
        var c = n.f.connectivity.map(function (k) { return DISP.connectivity[k]; }).join(" + ");
        return [v, c].filter(Boolean).join(" · ");
    }
    function decorate() {
        if (!catalog) return;
        var tk = tokens();
        var cards = document.querySelectorAll("#products .card[data-id]");
        Array.prototype.forEach.call(cards, function (card) {
            var n = byId.get(card.getAttribute("data-id"));
            if (!n || card.querySelector(".vf-meta")) return;
            var nameEl = card.querySelector(".card-name");
            var meta = h("div", { "class": "vf-meta" });
            if (n.model) {
                var m = h("div", { "class": "vf-model", dir: "ltr", "data-testid": "vf-model-" + idKey(n.id), text: n.model });
                highlight(m, tk);
                meta.appendChild(m);
            }
            var sp = specLine(n);
            if (sp) meta.appendChild(h("div", { "class": "vf-specline", text: sp }));
            if (nameEl && nameEl.parentNode) nameEl.parentNode.insertBefore(meta, nameEl.nextSibling);
            highlight(nameEl, tk);
            var foot = card.querySelector(".card-footer");
            if (foot) {
                var a = avail(n);
                var label = a === "in" ? "متوفر" : (a === "low" ? "باقي " + n.stock + " فقط" : "نفدت");
                foot.appendChild(h("span", { "class": "vf-av vf-av--" + a, "data-testid": "vf-avail-" + idKey(n.id), text: label }));
            }
        });
    }

    /* ----------------------- global overrides (by reassignment) ---------- */
    var origRenderProducts = window.renderProducts;
    if (typeof origRenderProducts === "function") {
        window.renderProducts = function () {
            var r = origRenderProducts.apply(this, arguments);
            try { decorate(); } catch (e) { console.warn("volt-filter: decorate failed", e); }
            return r;
        };
    }

    var waitingForFirebase = false;
    window.applyProductFilters = async function () {
        if (!window.voltFirebase || typeof window.voltFirebase.getProducts !== "function") {
            if (typeof window.renderProducts === "function") window.renderProducts([]);
            if (!waitingForFirebase) {
                waitingForFirebase = true;
                window.addEventListener("voltFirebaseReady", function () {
                    waitingForFirebase = false;
                    window.applyProductFilters();
                }, { once: true });
            }
            return;
        }
        build();
        await ensureCatalog();
        refreshUI();
        renderPage(1);
    };

    window.loadProductsPage = async function (page) {
        await ensureCatalog();
        renderPage(page);
    };

    /* --------------------------- cache invalidation ---------------------- */
    function wrapAdminFn(name, afterIfRemoved) {
        var orig = window[name];
        if (typeof orig !== "function") return;
        window[name] = async function () {
            stale = true;
            var args = arguments;
            try { return await orig.apply(this, args); }
            finally {
                if (afterIfRemoved) {
                    var id = args[1];
                    if (id != null && !document.querySelector('#products [data-id="' + idKey(id) + '"]')) {
                        stale = true;
                        try { await window.applyProductFilters(); } catch (e) { }
                    }
                }
            }
        };
    }
    wrapAdminFn("submitNewProduct");
    wrapAdminFn("saveFastStock");
    wrapAdminFn("deleteProduct", true);

    /* ------------------- admin: extra fields on "add product" ------------ */
    function readExtras() {
        var out = {};
        function val(id) { var el = $(id); return el ? el.value.trim() : ""; }
        var model = val("newProdModel");
        if (model) out.model = model;
        var v = splitList(val("newProdVoltage")).map(normVolt); if (v.length) out.voltage = v;
        var k = splitList(val("newProdConnectivity")); if (k.length) out.connectivity = k;
        var t = splitList(val("newProdCompat")); if (t.length) out.compatibility = t;
        return out;
    }
    function clearExtras() {
        ["newProdModel", "newProdVoltage", "newProdConnectivity", "newProdCompat"].forEach(function (id) {
            var el = $(id); if (el) el.value = "";
        });
    }
    function injectAddProductFields() {
        var modal = document.querySelector("#add-product-modal .modal");
        if (!modal || $("newProdModel")) return;
        var submit = modal.querySelector('button[onclick="submitNewProduct()"]');
        if (!submit) return;
        var box = h("div", { "class": "vf-extra-box" });
        [["newProdModel", "admin-prod-model", "الموديل (مثال: HC-SR04)"],
         ["newProdVoltage", "admin-prod-voltage", "الجهد — افصل بفاصلة (مثال: 5V, 3.3V)"],
         ["newProdConnectivity", "admin-prod-connectivity", "نوع الاتصال — افصل بفاصلة (مثال: Wi-Fi, Bluetooth)"],
         ["newProdCompat", "admin-prod-compat", "التوافق — افصل بفاصلة (مثال: Arduino IDE, Raspberry Pi)"]].forEach(function (f) {
            box.appendChild(h("input", { type: "text", id: f[0], "data-testid": f[1], "class": "vf-extra", placeholder: f[2] }));
        });
        modal.insertBefore(box, submit);

        var fb = window.voltFirebase;
        if (fb && typeof fb.addProduct === "function" && !fb.addProduct.__vf) {
            var origAdd = fb.addProduct;
            fb.addProduct = function (data) { return origAdd.call(this, Object.assign({}, data, readExtras())); };
            fb.addProduct.__vf = true;
        }
        var origSubmit = window.submitNewProduct;
        if (typeof origSubmit === "function" && !origSubmit.__vfClear) {
            var wrapped = async function () {
                try { return await origSubmit.apply(this, arguments); }
                finally {
                    var m = $("add-product-modal");
                    if (m && !m.classList.contains("open")) clearExtras();
                }
            };
            wrapped.__vfClear = true;
            window.submitNewProduct = wrapped;
        }
    }

    /* -------------- admin: edit filter data of existing products --------- */
    function isAdmin() { return typeof currentUser !== "undefined" && currentUser && currentUser.role === "admin"; }

    async function openMetaEditor() {
        if (!isAdmin()) return;
        var content = $("admin-content");
        if (!content) return;
        await ensureCatalog();
        content.textContent = "";
        content.appendChild(h("h3", { "class": "vf-admin-title", text: "🧩 بيانات الفلترة للمنتجات" }));
        content.appendChild(h("p", { "class": "vf-muted", text: "افصل القيم المتعددة بفاصلة. الجهد يتحسب تلقائياً من المواصفات لو الحقل فاضي." }));
        var table = h("table", { "class": "vf-admin-table", "data-testid": "vf-meta-table" });
        var head = h("tr");
        ["المنتج", "الموديل", "الجهد", "نوع الاتصال", "التوافق", ""].forEach(function (t) { head.appendChild(h("th", { text: t })); });
        table.appendChild(head);
        catalog.forEach(function (n) {
            var id = n.id, p = n.p;
            var row = h("tr", { "data-testid": "vf-meta-row-" + idKey(id) });
            row.appendChild(h("td", { text: n.name }));
            var inputs = {};
            [["model", String(p.model || "")],
             ["voltage", splitList(p.voltage).join(", ")],
             ["connectivity", splitList(p.connectivity).join(", ")],
             ["compatibility", splitList(p.compatibility).join(", ")]].forEach(function (f) {
                var inp = h("input", { type: "text", "class": "vf-extra vf-extra--cell", "data-testid": "vf-meta-" + f[0] + "-" + idKey(id) });
                inp.value = f[1];
                inputs[f[0]] = inp;
                row.appendChild(h("td", {}, [inp]));
            });
            var btn = h("button", { type: "button", "class": "vf-save", "data-testid": "vf-meta-save-" + idKey(id), text: "حفظ" });
            btn.addEventListener("click", async function () {
                if (!isAdmin() || !window.voltFirebase || typeof window.voltFirebase.updateProduct !== "function") return;
                btn.textContent = "…";
                var fields = {
                    model: inputs.model.value.trim(),
                    voltage: splitList(inputs.voltage.value).map(normVolt),
                    connectivity: splitList(inputs.connectivity.value),
                    compatibility: splitList(inputs.compatibility.value)
                };
                var ok = false;
                try { ok = await window.voltFirebase.updateProduct(String(id), fields); } catch (e) { ok = false; }
                btn.textContent = "حفظ";
                if (!ok) { toast("فشل الحفظ — تحقق من الصلاحيات", "error"); return; }
                stale = true;
                toast("✅ تم حفظ بيانات الفلترة", "green");
                try { await window.applyProductFilters(); } catch (e) { }
            });
            row.appendChild(h("td", {}, [btn]));
            table.appendChild(row);
        });
        var scroller = h("div", { "class": "vf-admin-scroll" }, [table]);
        content.appendChild(scroller);
    }

    function injectAdminButton() {
        var anchor = $("adminPanelBtn");
        if (!anchor || $("vfMetaBtn")) return;
        var btn = h("button", {
            id: "vfMetaBtn", type: "button", "class": "btn-primary admin-action-btn",
            "data-testid": "admin-filter-meta", style: "background:var(--dark); color:var(--green);",
            text: "🧩 بيانات الفلترة"
        });
        btn.addEventListener("click", openMetaEditor);
        anchor.parentNode.appendChild(btn);
    }

    /* ------------------------------ public API --------------------------- */
    window.__volt = window.__volt || {};
    window.__volt.filterV2 = {
        invalidate: function () { stale = true; },
        reset: resetAll,
        getState: function () { return JSON.parse(JSON.stringify(S)); }
    };

    function init() {
        build();
        injectAddProductFields();
        injectAdminButton();
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
    else init();
})();