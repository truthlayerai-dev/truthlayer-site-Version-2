/* ========= TruthLayer v1 — Static-site logic ========= */

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
year.textContent = String(new Date().getFullYear());

/* ---------- daily limit ---------- */
const todayKey = () => new Date().toISOString().slice(0, 10);

function getLimitState(){
  try{
    const raw = localStorage.getItem(LIMIT_KEY);
    const st = raw ? JSON.parse(raw) : null;
    const day = todayKey();
    if(!st || st.day !== day){
      const fresh = { day, used: 0 };
      localStorage.setItem(LIMIT_KEY, JSON.stringify(fresh));
      return fresh;
    }
    return st;
  }catch{
    return { day: todayKey(), used: 0 };
  }
}

function setUsed(used){
  const st = { day: todayKey(), used };
  localStorage.setItem(LIMIT_KEY, JSON.stringify(st));
  renderLimit();
}

function renderLimit(){
  const st = getLimitState();
  const remaining = Math.max(0, FREE_PER_DAY - (st.used || 0));
  limitRemaining.textContent = String(remaining);
  return remaining;
}

/* ---------- history ---------- */
function loadHistory(){
  try{
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  }catch{
    return [];
  }
}
function saveToHistory(item){
  const prev = loadHistory();
  const next = [item, ...prev].slice(0, 20);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  renderHistory();
}
function clearHistory(){
  localStorage.removeItem(HISTORY_KEY);
  renderHistory();
}
function renderHistory(){
  const items = loadHistory();
  historyList.innerHTML = "";

  if(items.length === 0){
    historyList.innerHTML = `<div class="muted">No saved Truth Cards yet.</div>`;
    return;
  }

  items.forEach((h) => {
    const div = document.createElement("div");
    div.className = "historyItem";
    div.innerHTML = `
      <div class="historyItem__claim">“${escapeHTML(h.claim)}”</div>
      <div class="historyItem__meta">${escapeHTML(h.verdict)} • ${h.score}/100 • ${new Date(h.checkedAtISO).toLocaleString()}</div>
    `;
    div.addEventListener("click", () => {
      renderTruthCard(h);
      window.scrollTo({ top: resultMount.offsetTop - 80, behavior: "smooth" });
    });
    historyList.appendChild(div);
  });
}

/* ---------- messages ---------- */
function setStatus(msg, type){
  statusEl.classList.remove("status--error", "status--ok");
  if(type === "error") statusEl.classList.add("status--error");
  if(type === "ok") statusEl.classList.add("status--ok");
  statusEl.textContent = msg || "";
}

function setPricingMsg(msg, type){
  if(!pricingMsg) return;
  pricingMsg.classList.remove("status--error", "status--ok");
  if(type === "error") pricingMsg.classList.add("status--error");
  if(type === "ok") pricingMsg.classList.add("status--ok");
  pricingMsg.textContent = msg || "";
}

function escapeHTML(str){
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function isValidEmail(email){
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

/* ---------- verification (v1 stub) ----------
   Replace verifyClaim() later with a real API call.
*/
function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

function heuristicScore(claim){
  const c = claim.toLowerCase();
  let score = 55;

  if(c.includes("always") || c.includes("never")) score -= 10;
  if(c.includes("guaranteed") || c.includes("100%")) score -= 12;
  if(c.includes("i heard") || c.includes("someone said") || c.includes("they say")) score -= 8;

  if(c.includes("cdc") || c.includes("who") || c.includes("nasa") || c.includes("nih")) score += 8;

  score = clamp(score, 0, 100);

  let verdict = "Mixed";
  if(score >= 85) verdict = "True";
  else if(score >= 70) verdict = "Mostly True";
  else if(score >= 55) verdict = "Mixed";
  else if(score >= 40) verdict = "Mostly False";
  else if(score >= 25) verdict = "False";
  else verdict = "Unclear";

  let confidence = "Medium";
  if(score >= 75 || score <= 25) confidence = "High";
  else if(score >= 60 || score <= 40) confidence = "Medium";
  else confidence = "Low";

  return { score, verdict, confidence };
}

async function verifyClaim(claim){
  // v1: structured stub
  const { score, verdict, confidence } = heuristicScore(claim);

  return {
    claim,
    score,
    verdict,
    confidence,
    summary:
      "This is a v1 Truth Card format. Right now the engine is a structured stub so the UI is perfect first. Next step is real retrieval + source-grounded scoring.",
    supports: [
      "Claim is specific enough to evaluate.",
      "Output separates supporting evidence from conflicts/caveats."
    ],
    conflicts: [
      "Scoring is currently heuristic (not yet grounded in retrieved sources).",
      "Real verification should weight primary sources higher than random blogs."
    ],
    sources: [
      { title: "Encyclopaedia Britannica (example)", url: "https://www.britannica.com/" },
      { title: "Wikipedia (example)", url: "https://en.wikipedia.org/wiki/Main_Page" }
    ],
    checkedAtISO: new Date().toISOString(),
    methodNote: "UI-first build • Sources open in new tab • Replace stub with real retrieval next."
  };
}

/* ---------- Truth Card rendering ---------- */
function renderTruthCard(r){
  resultMount.innerHTML = `
    <section class="truthCard">
      <div class="truthCard__top">
        <div class="truthCard__kicker">Claim</div>
        <div class="truthCard__claim">“${escapeHTML(r.claim)}”</div>

        <div class="metaRow">
          <div class="pill">Score: <b>${r.score}</b>/100</div>
          <div class="pill">Verdict: <b>${escapeHTML(r.verdict)}</b></div>
          <div class="pill">Confidence: <b>${escapeHTML(r.confidence)}</b></div>
          <div class="pill">Checked: <b>${new Date(r.checkedAtISO).toLocaleString()}</b></div>
        </div>
      </div>

      <div class="truthCard__body">
        <div>
          <div class="sectionTitle">What we found</div>
          <div class="summary">${escapeHTML(r.summary)}</div>
          <div class="tiny muted" style="margin-top:8px;">${escapeHTML(r.methodNote || "")}</div>
        </div>

        <div class="cols">
          <div class="box">
            <div class="sectionTitle">Supports</div>
            <ul class="ul">
              ${(r.supports || []).map(x => `<li>${escapeHTML(x)}</li>`).join("")}
            </ul>
          </div>

          <div class="box">
            <div class="sectionTitle">Conflicts / caveats</div>
            <ul class="ul">
              ${(r.conflicts || []).map(x => `<li>${escapeHTML(x)}</li>`).join("")}
            </ul>
          </div>
        </div>

        <div class="box">
          <div class="sectionTitle">Sources</div>
          <div class="sources">
            ${(r.sources || []).map(s => `
              <a class="source" href="${escapeHTML(s.url)}" target="_blank" rel="noreferrer">
                <div class="source__title">${escapeHTML(s.title)}</div>
                <div class="source__url">${escapeHTML(s.url)}</div>
              </a>
            `).join("")}
          </div>
          <div class="tiny muted" style="margin-top:10px;">
            Sources open in a new tab to prevent embedded-page errors.
          </div>
        </div>
      </div>
    </section>
  `;
}

/* ---------- Examples ---------- */
const EXAMPLES = [
  {
    claim: "The Great Wall of China is visible from space with the naked eye.",
    score: 25,
    verdict: "Mostly False",
    confidence: "High",
    summary:
      "Astronaut accounts and major space agencies generally report it is not easily visible to the naked eye from low Earth orbit; the claim is often repeated but overstated.",
    supports: [
      "Visibility of ground features from orbit depends on contrast, lighting, and atmosphere.",
      "Many human structures are hard to see unaided from orbit."
    ],
    conflicts: [
      "The claim is popular in culture but not consistently supported by astronaut reports.",
      "Photos from orbit do not prove naked-eye visibility."
    ],
    sources: [
      { title: "NASA (site)", url: "https://www.nasa.gov/" },
      { title: "ESA (site)", url: "https://www.esa.int/" }
    ],
    checkedAtISO: new Date().toISOString(),
    methodNote: "Example output • Format matches real Truth Cards."
  },
  {
    claim: "Humans use only 10% of their brain.",
    score: 15,
    verdict: "False",
    confidence: "High",
    summary:
      "Neuroscience evidence shows many brain regions have activity and function across daily life; the “10%” claim is a myth.",
    supports: [
      "Brain imaging shows widespread activity during many tasks.",
      "Damage to different areas can impair different functions."
    ],
    conflicts: [
      "The claim is a persistent myth but lacks scientific support."
    ],
    sources: [
      { title: "NIH (site)", url: "https://www.nih.gov/" },
      { title: "Scientific American (site)", url: "https://www.scientificamerican.com/" }
    ],
    checkedAtISO: new Date().toISOString(),
    methodNote: "Example output • Format matches real Truth Cards."
  },
  {
    claim: "Vitamin C prevents the common cold.",
    score: 45,
    verdict: "Mostly False",
    confidence: "Medium",
    summary:
      "Evidence suggests vitamin C does not reliably prevent colds for most people, though it may slightly reduce duration in some cases and may help under extreme physical stress.",
    supports: [
      "Some studies find modest reduction in duration/severity.",
      "Certain high-stress groups may see more benefit."
    ],
    conflicts: [
      "For the general population, prevention effects are not consistent.",
      "Dose and study quality vary widely."
    ],
    sources: [
      { title: "Cochrane Library (site)", url: "https://www.cochranelibrary.com/" },
      { title: "CDC (site)", url: "https://www.cdc.gov/" }
    ],
    checkedAtISO: new Date().toISOString(),
    methodNote: "Example output • Format matches real Truth Cards."
  }
];

/* ---------- events ---------- */
verifyBtn.addEventListener("click", async () => {
  const claim = String(claimInput.value || "").trim();
  if(!claim){
    setStatus("Enter a claim first.", "error");
    return;
  }

  const remaining = renderLimit();
  if(remaining <= 0){
    setStatus("Daily free limit reached.", "error");
    setPricingMsg("Daily free limit reached. Upgrade to Pro for higher limits.", "error");
    window.location.hash = "#pricing";
    return;
  }

  // consume a use
  const st = getLimitState();
  setUsed((st.used || 0) + 1);

  setStatus("Analyzing… building Truth Card…", "");
  setPricingMsg("", "");
  verifyBtn.disabled = true;

  try{
    const r = await verifyClaim(claim);
    renderTruthCard(r);
    saveToHistory(r);
    setStatus("Truth Card generated.", "ok");
    window.scrollTo({ top: resultMount.offsetTop - 80, behavior: "smooth" });
  }catch(e){
    setStatus("Something went wrong while verifying.", "error");
  }finally{
    verifyBtn.disabled = false;
  }
});

clearBtn.addEventListener("click", () => {
  claimInput.value = "";
  resultMount.innerHTML = "";
  setStatus("", "");
});

clearHistoryBtn.addEventListener("click", () => {
  clearHistory();
  setStatus("History cleared.", "ok");
});

/* example buttons */
document.querySelectorAll(".exampleBtn").forEach(btn => {
  btn.addEventListener("click", () => {
    const idx = Number(btn.getAttribute("data-example"));
    const r = EXAMPLES[idx];
    renderTruthCard(r);
    saveToHistory(r);
    setStatus("Loaded example Truth Card.", "ok");
    setPricingMsg("", "");
    window.scrollTo({ top: resultMount.offsetTop - 80, behavior: "smooth" });
  });
});

/* pro email capture */
try{
  const saved = localStorage.getItem(PRO_EMAIL_KEY);
  if(saved && proEmail) proEmail.value = saved;
}catch{}

if(proBtn){
  proBtn.addEventListener("click", () => {
    const email = (proEmail?.value || "").trim();

    if(!isValidEmail(email)){
      proMsg.textContent = "Enter a valid email to get early access.";
      proMsg.style.color = "rgba(255, 170, 170, 0.95)";
      return;
    }

    localStorage.setItem(PRO_EMAIL_KEY, email);
    proMsg.textContent = "Saved. You’re on the early access list.";
    proMsg.style.color = "rgba(180, 255, 220, 0.95)";
  });
}

/* ---------- init ---------- */
renderLimit();
renderHistory();
setStatus("", "");
setPricingMsg("", "");
const FREE_PER_DAY = 1;
