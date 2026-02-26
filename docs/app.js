document.addEventListener("DOMContentLoaded", () => {
  console.log("[TruthLayer] app.js loaded ✅");

  // ✅ PASTE YOUR CLOUDFLARE WORKER BASE URL HERE (no trailing slash)
  // Example: https://rapid-flower-be72truthlayer.your-account.workers.dev
  const WORKER_BASE_URL = "PASTE_YOUR_WORKER_URL_HERE";

  const FREE_PER_DAY = 5;
  const HISTORY_KEY = "truthlayer.history.v1";
  const LIMIT_KEY = "truthlayer.limit.v1";
  const PRO_EMAIL_KEY = "truthlayer.pro.email.v1";

  const el = (id) => document.getElementById(id);

  const claimInput = el("claimInput");
  const verifyBtn = el("verifyBtn");
  const clearBtn = el("clearBtn");
  const statusEl = el("status");
  const resultMount = el("resultMount");

  const limitRemaining = el("limitRemaining");
  const historyList = el("historyList");
  const clearHistoryBtn = el("clearHistoryBtn");

  const pricingMsg = el("pricingMsg");
  const proEmail = el("proEmail");
  const proBtn = el("proBtn");
  const proMsg = el("proMsg");

  const year = el("year");
  if (year) year.textContent = String(new Date().getFullYear());

  // ---------- helpers ----------
  const todayKey = () => new Date().toISOString().slice(0, 10);

  function escapeHTML(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function setStatus(msg, type) {
    statusEl.classList.remove("status--error", "status--ok");
    if (type === "error") statusEl.classList.add("status--error");
    if (type === "ok") statusEl.classList.add("status--ok");
    statusEl.textContent = msg || "";
  }

  function setPricingMsg(msg, type) {
    if (!pricingMsg) return;
    pricingMsg.classList.remove("status--error", "status--ok");
    if (type === "error") pricingMsg.classList.add("status--error");
    if (type === "ok") pricingMsg.classList.add("status--ok");
    pricingMsg.textContent = msg || "";
  }

  function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
  }

  function titleCase(s) {
    return String(s || "")
      .replaceAll("_", " ")
      .replace(/\b\w/g, (m) => m.toUpperCase());
  }

  function pillClassForStatus(status) {
    const s = String(status || "").toLowerCase();
    if (s === "supported") return "pill--supported";
    if (s === "refuted") return "pill--refuted";
    if (s === "mixed") return "pill--mixed";
    return "pill--unknown";
  }

  // Detect “multi-question” inputs (cheap but useful)
  function looksLikeMultipleQuestions(text) {
    const t = String(text || "").trim();
    if (!t) return false;
    const qMarks = (t.match(/\?/g) || []).length;
    const andCount = (t.toLowerCase().match(/\band\b/g) || []).length;
    return qMarks >= 2 || (qMarks >= 1 && andCount >= 1);
  }

  // ---------- daily limit ----------
  function getLimitState() {
    try {
      const raw = localStorage.getItem(LIMIT_KEY);
      const st = raw ? JSON.parse(raw) : null;
      const day = todayKey();
      if (!st || st.day !== day) {
        const fresh = { day, used: 0 };
        localStorage.setItem(LIMIT_KEY, JSON.stringify(fresh));
        return fresh;
      }
      return st;
    } catch {
      return { day: todayKey(), used: 0 };
    }
  }

  function setUsed(used) {
    localStorage.setItem(LIMIT_KEY, JSON.stringify({ day: todayKey(), used }));
    renderLimit();
  }

  function renderLimit() {
    const st = getLimitState();
    const remaining = Math.max(0, FREE_PER_DAY - (st.used || 0));
    limitRemaining.textContent = String(remaining);
    return remaining;
  }

  // ---------- history ----------
  function loadHistory() {
    try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
    catch { return []; }
  }

  function saveToHistory(item) {
    const prev = loadHistory();
    const next = [item, ...prev].slice(0, 20);
    localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
    renderHistory();
  }

  function clearHistory() {
    localStorage.removeItem(HISTORY_KEY);
    renderHistory();
  }

  function renderHistory() {
    const items = loadHistory();
    historyList.innerHTML = "";

    if (items.length === 0) {
      historyList.innerHTML = `<div class="muted">No saved Truth Cards yet.</div>`;
      return;
    }

    items.forEach((h) => {
      const div = document.createElement("div");
      div.className = "historyItem";
      div.innerHTML = `
        <div class="historyItem__claim">“${escapeHTML(h.claim)}”</div>
        <div class="historyItem__meta">${escapeHTML(titleCase(h.status))} • ${h.truth_score}/100 • ${new Date(h.checkedAtISO).toLocaleString()}</div>
      `;
      div.addEventListener("click", () => {
        renderTruthCard(h);
        window.scrollTo({ top: resultMount.offsetTop - 80, behavior: "smooth" });
      });
      historyList.appendChild(div);
    });
  }

  // ---------- API ----------
  async function verifyClaim(claim) {
    if (!WORKER_BASE_URL || WORKER_BASE_URL.includes("PASTE_YOUR_WORKER_URL_HERE")) {
      throw new Error("WORKER_BASE_URL not set in app.js");
    }

    const res = await fetch(`${WORKER_BASE_URL}/api/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ claim })
    });

    if (!res.ok) {
      const t = await res.text();
      throw new Error(t || `API error (${res.status})`);
    }

    return res.json();
  }

  // ---------- Copy / Print ----------
  function buildCopyText(r) {
    const statusLine = `Status: ${titleCase(r.status)} | Score: ${r.truth_score}/100 | Confidence: ${titleCase(r.confidence)}`;
    const topSources = (r.sources || []).slice(0, 3).map((s) => `- ${s.title || s.url}: ${s.url}`).join("\n");
    return [
      `TruthLayer`,
      `Claim: ${r.claim}`,
      statusLine,
      ``,
      `Summary: ${r.summary}`,
      ``,
      `Supports:`,
      ...(r.supports || []).slice(0, 4).map(x => `- ${x.snippet || x}`),
      ``,
      `Conflicts/Caveats:`,
      ...(r.conflicts || []).slice(0, 4).map(x => `- ${x.snippet || x}`),
      ``,
      `Sources:`,
      topSources || "(none)"
    ].join("\n");
  }

  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      setStatus("Copied Truth Card text.", "ok");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setStatus("Copied Truth Card text.", "ok");
    }
  }

  // ---------- Render Truth Card ----------
  function renderTruthCard(r) {
    const statusClass = pillClassForStatus(r.status);

    const supportsHtml = (r.supports || []).slice(0, 4)
      .map(x => `<li>${escapeHTML(x.snippet || String(x))}</li>`).join("");

    const conflictsHtml = (r.conflicts || []).slice(0, 4)
      .map(x => `<li>${escapeHTML(x.snippet || String(x))}</li>`).join("");

    const sourcesHtml = (r.sources || []).slice(0, 3).map(s => `
      <a class="source" href="${escapeHTML(s.url)}" target="_blank" rel="noreferrer">
        <div class="source__title">${escapeHTML(s.title || s.url)}</div>
        <div class="source__url">${escapeHTML((s.publisher ? s.publisher + " • " : "") + s.url)}</div>
      </a>
    `).join("");

    resultMount.innerHTML = `
      <section class="truthCard printKeep">
        <div class="truthCard__top">
          <div class="truthCard__kicker">Claim</div>
          <div class="truthCard__claim">“${escapeHTML(r.claim)}”</div>

          <div class="metaRow">
            <div class="pill">Score: <b>${r.truth_score}</b>/100</div>
            <div class="pill ${statusClass}">Status: <b>${escapeHTML(titleCase(r.status))}</b></div>
            <div class="pill">Confidence: <b>${escapeHTML(titleCase(r.confidence))}</b></div>
            <div class="pill">Checked: <b>${new Date(r.checkedAtISO).toLocaleString()}</b></div>
          </div>
        </div>

        <div class="truthCard__body">
          <div class="cardActions">
            <button id="copyBtn" class="btn btn--ghost btn--mini">Copy</button>
            <button id="printBtn" class="btn btn--ghost btn--mini">Print / PDF</button>
          </div>

          <div>
            <div class="sectionTitle">What we found</div>
            <div class="summary">${escapeHTML(r.summary || "")}</div>
            <div class="tiny muted" style="margin-top:8px;">${escapeHTML(r.methodNote || "")}</div>
          </div>

          <div class="cols">
            <div class="box">
              <div class="sectionTitle">Supports</div>
              <ul class="ul">${supportsHtml || "<li>No strong supporting evidence found.</li>"}</ul>
            </div>

            <div class="box">
              <div class="sectionTitle">Conflicts / caveats</div>
              <ul class="ul">${conflictsHtml || "<li>No strong conflicting evidence found.</li>"}</ul>
            </div>
          </div>

          <div class="box">
            <div class="sectionTitle">Sources</div>
            <div class="sources">${sourcesHtml || "<div class='tiny muted'>No sources returned.</div>"}</div>
            <div class="tiny muted" style="margin-top:10px;">
              Tip: sources open in a new tab to prevent embedded-page errors.
            </div>
          </div>
        </div>
      </section>
    `;

    const copyBtn = document.getElementById("copyBtn");
    const printBtn = document.getElementById("printBtn");
    if (copyBtn) copyBtn.addEventListener("click", () => copyToClipboard(buildCopyText(r)));
    if (printBtn) printBtn.addEventListener("click", () => window.print());
  }

  // ---------- Verify flow ----------
  verifyBtn.addEventListener("click", async () => {
    const claim = String(claimInput.value || "").trim();
    if (!claim) {
      setStatus("Enter a claim first.", "error");
      return;
    }

    if (looksLikeMultipleQuestions(claim)) {
      setStatus("Looks like multiple questions. Rewrite as ONE claim for best results.", "error");
      return;
    }

    const remaining = renderLimit();
    if (remaining <= 0) {
      setStatus("Daily free limit reached.", "error");
      setPricingMsg("Daily free limit reached. Upgrade to Pro for higher limits.", "error");
      window.location.hash = "#pricing";
      return;
    }

    const st = getLimitState();
    setUsed((st.used || 0) + 1);

    setStatus("Retrieving sources… analyzing… building Truth Card…", "");
    setPricingMsg("", "");
    verifyBtn.disabled = true;

    try {
      const r = await verifyClaim(claim);
      renderTruthCard(r);
      saveToHistory(r);
      setStatus("Truth Card generated.", "ok");
      window.scrollTo({ top: resultMount.offsetTop - 80, behavior: "smooth" });
    } catch (e) {
      console.error(e);
      setStatus(`Verification failed: ${String(e?.message || e)}`, "error");
    } finally {
      verifyBtn.disabled = false;
    }
  });

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      claimInput.value = "";
      resultMount.innerHTML = "";
      setStatus("", "");
    });
  }

  if (clearHistoryBtn) {
    clearHistoryBtn.addEventListener("click", () => {
      clearHistory();
      setStatus("History cleared.", "ok");
    });
  }

  // Examples load into box
  document.querySelectorAll(".exampleBtn").forEach(btn => {
    btn.addEventListener("click", () => {
      claimInput.value = btn.getAttribute("data-claim") || "";
      window.scrollTo({ top: 0, behavior: "smooth" });
      setStatus("Example loaded. Click Verify.", "ok");
    });
  });

  // Pro email capture
  try {
    const saved = localStorage.getItem(PRO_EMAIL_KEY);
    if (saved && proEmail) proEmail.value = saved;
  } catch {}

  if (proBtn) {
    proBtn.addEventListener("click", () => {
      const email = (proEmail?.value || "").trim();
      if (!isValidEmail(email)) {
        if (proMsg) {
          proMsg.textContent = "Enter a valid email to get early access.";
          proMsg.style.color = "rgba(255, 170, 170, 0.95)";
        }
        return;
      }
      localStorage.setItem(PRO_EMAIL_KEY, email);
      if (proMsg) {
        proMsg.textContent = "Saved. You’re on the early access list.";
        proMsg.style.color = "rgba(180, 255, 220, 0.95)";
      }
    });
  }

  // init
  renderLimit();
  renderHistory();
  setStatus("", "");
  setPricingMsg("", "");
});
