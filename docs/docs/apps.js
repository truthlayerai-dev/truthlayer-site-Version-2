/* =========================================================
   TruthLayer — docs/app.js
   Frontend logic for GitHub Pages (static) that calls a
   Cloudflare Worker backend for /api/check.

   REQUIRED FILES:
   - docs/index.html   (must include <script src="./app.js"></script>)
   - docs/styles.css
   - docs/app.js       (this file)

   WORKER REQUIREMENTS:
   - Worker must accept POST /api/check
   - Must return JSON
========================================================= */

/** ✅ PASTE YOUR WORKER BASE URL HERE (no trailing slash) */
const WORKER_BASE = "https://rapid-flower-be72truthlayer.truthlayer-ai.workers.dev";

/** API endpoint the Worker exposes */
const CHECK_ENDPOINT = "/api/check";

/** Timeouts keep fetch from hanging forever */
const FETCH_TIMEOUT_MS = 20000;

/** Basic URL parsing for evidence lines */
function extractUrls(text) {
  if (!text) return [];
  const lines = text
    .split("\n")
    .map(l => l.trim())
    .filter(Boolean);

  // Accept raw URLs or plain text that contains a URL
  const urls = [];
  for (const line of lines) {
    const match = line.match(/https?:\/\/[^\s]+/i);
    if (match) urls.push(match[0]);
  }
  // de-dupe
  return [...new Set(urls)];
}

/** Small helper to safely set text */
function setText(el, text) {
  if (!el) return;
  el.textContent = String(text ?? "");
}

/** Small helper to set HTML safely from known strings */
function setHTML(el, html) {
  if (!el) return;
  el.innerHTML = html;
}

/** Timeout wrapper */
async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(id);
  }
}

/** Pretty verdict logic if backend doesn’t provide one */
function verdictFromScore(score) {
  if (score >= 85) return { label: "Likely true", badge: "Strong support" };
  if (score >= 65) return { label: "Mixed / uncertain", badge: "Some support" };
  if (score >= 40) return { label: "Unclear", badge: "Weak support" };
  return { label: "Unclear / likely false", badge: "Low support" };
}

/** Build citations list into HTML */
function renderCitations(citations) {
  if (!citations || !citations.length) return `<div class="muted">None</div>`;

  const items = citations
    .map((c, i) => {
      const title = (c.title || `Source ${i + 1}`).replace(/</g, "&lt;");
      const url = (c.url || "").replace(/</g, "&lt;");
      const snippet = (c.snippet || "").replace(/</g, "&lt;");
      const host = (() => {
        try { return new URL(c.url).hostname; } catch { return ""; }
      })();

      return `
        <div class="citation">
          <div class="citation-title">
            <a href="${url}" target="_blank" rel="noopener noreferrer">${title}</a>
            ${host ? `<span class="citation-host">${host}</span>` : ""}
          </div>
          ${snippet ? `<div class="citation-snippet">${snippet}</div>` : ""}
        </div>
      `;
    })
    .join("");

  return `<div class="citations">${items}</div>`;
}

/** Update the UI state */
function setStatus(statusEl, pillEl, state, detail = "") {
  // state: "idle" | "checking" | "ok" | "error"
  if (pillEl) {
    pillEl.classList.remove("ok", "error", "checking");
    if (state === "ok") pillEl.classList.add("ok");
    if (state === "error") pillEl.classList.add("error");
    if (state === "checking") pillEl.classList.add("checking");
  }
  if (statusEl) {
    statusEl.classList.remove("ok", "error", "checking");
    if (state === "ok") statusEl.classList.add("ok");
    if (state === "error") statusEl.classList.add("error");
    if (state === "checking") statusEl.classList.add("checking");
    setText(statusEl, detail || state);
  }
}

/** Try calling Worker root to confirm it’s reachable */
async function pingWorker() {
  const url = `${WORKER_BASE}/`;
  const res = await fetchWithTimeout(url, { method: "GET" }, 8000);
  const text = await res.text().catch(() => "");
  return { ok: res.ok, status: res.status, text };
}

/** Calls the Worker /api/check */
async function checkClaim({ claim, evidenceUrls }) {
  const url = `${WORKER_BASE}${CHECK_ENDPOINT}`;

  const payload = {
    claim,
    evidence_urls: evidenceUrls,
    // optional: send timestamp
    client_ts: new Date().toISOString()
  };

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  // handle non-JSON responses gracefully
  const raw = await res.text();
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = { error: "Bad response (not JSON)", raw };
  }

  return { res, data, raw };
}

/** Main */
function boot() {
  // ---- Grab DOM elements (match these IDs in your HTML) ----
  const els = {
    claimInput: document.getElementById("claimInput"),
    evidenceInput: document.getElementById("evidenceInput"),
    checkBtn: document.getElementById("checkBtn"),
    clearBtn: document.getElementById("clearBtn"),

    apiPill: document.getElementById("apiPill"),
    apiStatus: document.getElementById("apiStatus"),

    resultTitle: document.getElementById("resultTitle"),
    resultBadge: document.getElementById("resultBadge"),

    scoreLabel: document.getElementById("scoreLabel"),
    scoreBar: document.getElementById("scoreBar"),
    scorePct: document.getElementById("scorePct"),

    whyList: document.getElementById("whyList"),
    citationsBox: document.getElementById("citationsBox"),

    debugBox: document.getElementById("debugBox"),
    debugToggle: document.getElementById("debugToggle"),

    examples: document.querySelectorAll("[data-example]")
  };

  // ---- Basic guards ----
  if (!els.checkBtn || !els.claimInput) {
    console.warn("[TruthLayer] Missing expected HTML IDs. app.js loaded, but UI not wired.");
    return;
  }

  // ---- Debug toggle ----
  if (els.debugToggle && els.debugBox) {
    els.debugToggle.addEventListener("click", () => {
      const open = els.debugBox.getAttribute("data-open") === "true";
      els.debugBox.setAttribute("data-open", open ? "false" : "true");
      els.debugBox.style.display = open ? "none" : "block";
    });
  }

  // ---- Example buttons ----
  if (els.examples && els.examples.length) {
    els.examples.forEach(btn => {
      btn.addEventListener("click", () => {
        const example = btn.getAttribute("data-example") || "";
        // Examples can include evidence after a pipe: "claim | url1,url2"
        const [c, urls] = example.split("|").map(s => (s || "").trim());
        if (c) els.claimInput.value = c;
        if (urls) {
          const list = urls.split(",").map(s => s.trim()).filter(Boolean);
          els.evidenceInput.value = list.join("\n");
        }
        els.claimInput.focus();
      });
    });
  }

  // ---- Clear ----
  if (els.clearBtn) {
    els.clearBtn.addEventListener("click", () => {
      els.claimInput.value = "";
      if (els.evidenceInput) els.evidenceInput.value = "";
      setText(els.resultTitle, "—");
      setText(els.resultBadge, "");
      setText(els.scoreLabel, "Confidence");
      if (els.scoreBar) els.scoreBar.style.width = "0%";
      if (els.scorePct) setText(els.scorePct, "0%");
      if (els.whyList) setHTML(els.whyList, "");
      if (els.citationsBox) setHTML(els.citationsBox, `<div class="muted">None</div>`);
      if (els.debugBox) setText(els.debugBox, "");
      setStatus(els.apiStatus, els.apiPill, "idle", "API: not checked");
      els.claimInput.focus();
    });
  }

  // ---- On load: ping worker ----
  (async () => {
    try {
      setStatus(els.apiStatus, els.apiPill, "checking", "API: checking…");
      const ping = await pingWorker();
      if (ping.ok) {
        setStatus(els.apiStatus, els.apiPill, "ok", "API: reachable");
      } else {
        setStatus(
          els.apiStatus,
          els.apiPill,
          "error",
          `API: unreachable (${ping.status})`
        );
        if (els.debugBox) {
          setText(els.debugBox, `[PING] ${ping.status}\n${ping.text?.slice(0, 800) || ""}`);
        }
      }
    } catch (e) {
      setStatus(els.apiStatus, els.apiPill, "error", "API: unreachable");
      if (els.debugBox) setText(els.debugBox, `[PING ERROR]\n${String(e)}`);
    }
  })();

  // ---- Check claim handler ----
  els.checkBtn.addEventListener("click", async () => {
    const claim = (els.claimInput.value || "").trim();
    const evidenceUrls = extractUrls(els.evidenceInput ? els.evidenceInput.value : "");

    if (!claim) {
      setStatus(els.apiStatus, els.apiPill, "error", "Enter a claim first.");
      return;
    }

    // UI: checking state
    setStatus(els.apiStatus, els.apiPill, "checking", "Checking…");
    setText(els.resultTitle, "Checking…");
    setText(els.resultBadge, "");
    if (els.scoreBar) els.scoreBar.style.width = "0%";
    if (els.scorePct) setText(els.scorePct, "—");
    if (els.whyList) setHTML(els.whyList, `<li class="muted">Working…</li>`);
    if (els.citationsBox) setHTML(els.citationsBox, `<div class="muted">Loading…</div>`);
    if (els.debugBox) setText(els.debugBox, "");

    try {
      const { res, data, raw } = await checkClaim({ claim, evidenceUrls });

      // If Worker returns HTML error pages, show it clearly
      if (!res.ok) {
        setStatus(els.apiStatus, els.apiPill, "error", `API error (${res.status})`);
        setText(els.resultTitle, "Error");
        setText(els.resultBadge, `HTTP ${res.status}`);

        if (els.whyList) {
          setHTML(
            els.whyList,
            `<li>Backend returned HTTP ${res.status}.</li>
             <li>Most common cause: wrong route or method (needs <b>POST ${CHECK_ENDPOINT}</b>).</li>`
          );
        }

        if (els.citationsBox) setHTML(els.citationsBox, `<div class="muted">None</div>`);

        if (els.debugBox) {
          setText(
            els.debugBox,
            `[HTTP ${res.status}] ${res.statusText}\n\nRAW:\n${raw.slice(0, 2000)}`
          );
        }
        return;
      }

      // If JSON includes error
      if (data?.error) {
        setStatus(els.apiStatus, els.apiPill, "error", "Bad response");
        setText(els.resultTitle, "Error");
        setText(els.resultBadge, "Bad response");

        if (els.whyList) {
          setHTML(
            els.whyList,
            `<li>Backend responded, but payload wasn’t usable JSON.</li>
             <li>See Debug for raw response.</li>`
          );
        }
        if (els.citationsBox) setHTML(els.citationsBox, `<div class="muted">None</div>`);
        if (els.debugBox) setText(els.debugBox, `[BAD JSON]\n${String(data?.raw || raw).slice(0, 2000)}`);
        return;
      }

      // Expecting: { verdict, score, why[], citations[] }
      const score = Number(data?.score ?? data?.confidence ?? 0);
      const v = data?.verdict ? { label: data.verdict, badge: data.badge || "" } : verdictFromScore(score);

      setStatus(els.apiStatus, els.apiPill, "ok", "Checked ✅");
      setText(els.resultTitle, v.label);
      setText(els.resultBadge, v.badge || "");

      const pct = Math.max(0, Math.min(100, Math.round(score)));
      if (els.scoreBar) els.scoreBar.style.width = `${pct}%`;
      if (els.scorePct) setText(els.scorePct, `${pct}%`);
      if (els.scoreLabel) setText(els.scoreLabel, "Confidence");

      // why list
      const why = Array.isArray(data?.why) ? data.why : [];
      if (els.whyList) {
        if (!why.length) {
          // fall back suggestions
          const hints = [];
          if (!evidenceUrls.length) hints.push("No evidence links provided — add 1–2 credible sources.");
          if (claim.length < 12) hints.push("Claim is short — add who/what/when/where details.");
          if (!hints.length) hints.push("No explanation returned — backend may be in minimal mode.");
          setHTML(els.whyList, hints.map(x => `<li>${x}</li>`).join(""));
        } else {
          setHTML(els.whyList, why.map(x => `<li>${String(x).replace(/</g, "&lt;")}</li>`).join(""));
        }
      }

      // citations
      const citations = Array.isArray(data?.citations) ? data.citations : [];
      if (els.citationsBox) setHTML(els.citationsBox, renderCitations(citations));

      // debug
      if (els.debugBox) {
        const dbg = {
          endpoint: `${WORKER_BASE}${CHECK_ENDPOINT}`,
          sent: { claim, evidenceUrls },
          received: data
        };
        setText(els.debugBox, JSON.stringify(dbg, null, 2));
      }
    } catch (e) {
      const msg = (e && e.name === "AbortError")
        ? "Request timed out"
        : "Failed to fetch";

      setStatus(els.apiStatus, els.apiPill, "error", msg);
      setText(els.resultTitle, "Error");
      setText(els.resultBadge, msg);

      if (els.whyList) {
        setHTML(
          els.whyList,
          `<li>Frontend couldn’t reach the Worker.</li>
           <li>Check WORKER_BASE in <code>docs/app.js</code>.</li>
           <li>Confirm Worker is deployed + route <b>POST ${CHECK_ENDPOINT}</b> exists.</li>`
        );
      }

      if (els.citationsBox) setHTML(els.citationsBox, `<div class="muted">None</div>`);

      if (els.debugBox) {
        setText(els.debugBox, `[FETCH ERROR]\n${String(e)}\n\nWORKER_BASE=${WORKER_BASE}`);
      }
    }
  });
}

// Boot when DOM is ready
document.addEventListener("DOMContentLoaded", boot);
