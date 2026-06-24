const DATASET_ID = document.body.dataset.datasetId;

function cleanPhone(raw) {
    if (!raw) return "";
    let s = String(raw).trim();
    s = s.replace(/\.0+$/, "");
    const hasPlus = s.startsWith("+");
    s = s.replace(/\D/g, "");
    return hasPlus ? "+" + s : s;
}

let leads = [];
let dataset = null;
let currentLead = null;
let currentFilter = "all";

const STATUSES = [
    { key: "pending",        label: "Pending" },
    { key: "interested",     label: "Interested" },
    { key: "not_interested", label: "Not Interested" },
    { key: "callback",       label: "Callback" },
    { key: "converted",      label: "Converted" }
];

// ── Init ──────────────────────────────────────────────
async function init() {
    try {
        const res = await fetch(`/dataset/${DATASET_ID}`);
        if (!res.ok) throw new Error("Failed to load dataset");
        const json = await res.json();

        dataset = json.dataset;
        leads = json.leads;

        document.getElementById("nav-dataset-name").textContent = dataset.filename;
        document.getElementById("nav-reports").href = `/reports/${DATASET_ID}`;
        document.getElementById("nav-reports").textContent = "Reports →";

        // Show auto-dial button once leads are loaded
        document.getElementById("nav-autodial").style.display = "";
        const bnavAd = document.getElementById("bnav-autodial");
        if (bnavAd) bnavAd.style.display = "";

        // Prefill "to" field with total leads count
        const adTo = document.getElementById("ad-to");
        if (adTo) adTo.value = leads.length;
        updateRangeInfo();

        renderList();
        updateProgress();
    } catch (e) {
        document.getElementById("lead-list").innerHTML =
            `<div style="padding:20px;color:var(--red);font-size:13px">Couldn't load this dataset.</div>`;
    } finally {
        hidePageLoader();
    }
}

function hidePageLoader() {
    const loader = document.getElementById("page-loader");
    if (loader) loader.classList.add("hidden");
}

function updateProgress() {
    const called = leads.filter(l => l.status !== "pending").length;
    document.getElementById("nav-progress").textContent = `${called} / ${leads.length} called`;
}

// ── Lead List ─────────────────────────────────────────
function renderList() {
    const q = document.getElementById("search").value.toLowerCase();
    const list = document.getElementById("lead-list");

    const filtered = leads.filter(l => {
        const matchFilter = currentFilter === "all" || l.status === currentFilter;
        const matchSearch = !q || JSON.stringify(l.data).toLowerCase().includes(q)
                             || l.phone.includes(q);
        return matchFilter && matchSearch;
    });

    if (!filtered.length) {
        list.innerHTML = `<div style="padding:20px;color:var(--muted);font-size:13px">No leads match.</div>`;
        return;
    }

    list.innerHTML = filtered.map(l => {
        const visibleCols = dataset.visible_columns || [];
        const nameCol = visibleCols.find(c =>
            c.toLowerCase().includes("name") || c.toLowerCase().includes("naam")
        );
        const displayName = nameCol ? (l.data[nameCol] || "—") : l.phone;
        const isDialing = autoDialState.active && autoDialState.queue[autoDialState.index]?.id === l.id;

        return `
            <div class="lead-item ${currentLead?.id === l.id ? "active" : ""} ${isDialing ? "ad-dialing-item" : ""}"
                 onclick="selectLead('${l.id}')">
                <div class="lead-name">${displayName}</div>
                <div class="lead-phone">${cleanPhone(l.phone)}</div>
                <div class="lead-status">${badge(l.status)}</div>
            </div>
        `;
    }).join("");
}

function setFilter(f, btn) {
    currentFilter = f;
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    renderList();
}

function filterLeads() { renderList(); }

// ── Lead Detail ───────────────────────────────────────
function selectLead(id) {
    currentLead = leads.find(l => l.id === id);
    renderList();
    renderDetail();
}

function renderDetail() {
    const l = currentLead;
    const detail = document.getElementById("lead-detail");
    const visibleCols = dataset.visible_columns || Object.keys(l.data);

    const nameCol = visibleCols.find(c =>
        c.toLowerCase().includes("name") || c.toLowerCase().includes("naam")
    );
    const displayName = nameCol ? (l.data[nameCol] || "Lead") : "Lead";

    const fieldCards = visibleCols
        .filter(c => c !== dataset.phone_column)
        .map(c => `
            <div class="detail-field">
                <div class="detail-field-label">${c}</div>
                <div class="detail-field-value">${l.data[c] ?? "—"}</div>
            </div>
        `).join("");

    const statusBtns = STATUSES.map(s => `
        <button class="status-btn status-${s.key} ${l.status === s.key ? "selected" : ""}"
                onclick="selectStatus('${s.key}', this)">
            ${s.label}
        </button>
    `).join("");

    const callHref = `tel:${cleanPhone(l.phone)}`;

    const sidebar = document.getElementById("sidebar");
    if (window.innerWidth <= 1024) {
        sidebar.classList.add("slide-out");
        detail.classList.add("slide-in");
        const bnav = document.getElementById("bnav-leads");
        if (bnav) bnav.classList.remove("active");
    }

    // Auto-dial banner if this lead is the current dial target
    const isAutoDialTarget = autoDialState.active &&
        autoDialState.queue[autoDialState.index]?.id === l.id;
    const autoDialBanner = isAutoDialTarget ? `
        <div class="ad-detail-banner">
            <span class="ad-detail-badge">⚡ AUTO-DIAL</span>
            <span class="ad-detail-info">
                Call ${autoDialState.index + 1} of ${autoDialState.queue.length}
                · Save to auto-advance
            </span>
        </div>
    ` : "";

    detail.innerHTML = `
        <button class="mobile-back-btn" onclick="mobileBack()">
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
            All Leads
        </button>
        ${autoDialBanner}
        <div class="detail-header">
            <div>
                <div class="detail-name">${displayName}</div>
                <a class="detail-phone" href="${callHref}">${cleanPhone(l.phone)}</a>
            </div>
            <a href="${callHref}" class="btn-primary call-btn" id="detail-call-btn" style="text-decoration:none">☎ Call</a>
        </div>

        <div class="detail-grid">${fieldCards}</div>

        <div class="call-panel">
            <div class="call-panel-title">Log this call</div>

            <div class="status-grid" id="status-grid">
                ${statusBtns}
            </div>

            <textarea class="notes-area" id="notes-input"
                placeholder="Notes from this call…">${l.notes || ""}</textarea>

            <div class="followup-row">
                <span class="followup-label">Follow-up date:</span>
                <input type="date" class="date-input" id="followup-date"
                       value="${l.followup_date ? l.followup_date.split("T")[0] : ""}">
            </div>

            <div class="save-row">
                <button class="btn-primary" onclick="saveLead()">Save</button>
                <button class="btn-ghost" onclick="nextLead()">Next Lead →</button>
                <span class="save-feedback" id="save-feedback">Saved ✓</span>
            </div>
        </div>
    `;
}

function selectStatus(key, btn) {
    currentLead.status = key;
    document.querySelectorAll(".status-btn").forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
}

async function saveLead() {
    const notes = document.getElementById("notes-input").value;
    const followup = document.getElementById("followup-date").value;
    const status = currentLead.status;

    const res = await fetch(`/lead/${currentLead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, notes, followup_date: followup || null })
    });

    const updated = await res.json();

    const idx = leads.findIndex(l => l.id === currentLead.id);
    leads[idx] = { ...leads[idx], ...updated };
    currentLead = leads[idx];

    const fb = document.getElementById("save-feedback");
    fb.classList.add("show");
    setTimeout(() => fb.classList.remove("show"), 1800);

    renderList();
    updateProgress();

    // If auto-dial is active and we're on the current target → advance
    if (autoDialState.active && !autoDialState.paused) {
        const target = autoDialState.queue[autoDialState.index];
        if (target && target.id === currentLead.id) {
            scheduleNextDial();
        }
    }
}

function nextLead() {
    const idx = leads.findIndex(l => l.id === currentLead.id);
    const pending = leads.slice(idx + 1).find(l => l.status === "pending")
                 || leads.find(l => l.status === "pending");
    if (pending) selectLead(pending.id);
}

function badge(status) {
    const labels = {
        pending: "Pending",
        interested: "Interested",
        not_interested: "Not Interested",
        callback: "Callback",
        converted: "Converted"
    };
    return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}

// ═══════════════════════════════════════════════════════
//  AUTO-DIALER ENGINE
// ═══════════════════════════════════════════════════════

const autoDialState = {
    active: false,
    paused: false,
    queue: [],        // subset of leads to dial
    index: 0,         // current position in queue
    delay: 5,         // seconds between calls
    countdownTimer: null,
    countdownVal: 0,
    countdownInterval: null
};

init();

function mobileBack() {
    const sidebar = document.getElementById("sidebar");
    const detail = document.getElementById("lead-detail");
    sidebar.classList.remove("slide-out");
    detail.classList.remove("slide-in");
    const bnav = document.getElementById("bnav-leads");
    if (bnav) bnav.classList.add("active");
}

// ── Modal open/close ──────────────────────────────────
function openAutoDialModal() {
    if (autoDialState.active) return; // don't open if already running
    updateRangeInfo();
    document.getElementById("autodial-modal").classList.remove("hidden");
}

function closeAutoDialModal() {
    document.getElementById("autodial-modal").classList.add("hidden");
}

function updateDelayLabel() {
    const v = document.getElementById("ad-delay").value;
    document.getElementById("ad-delay-val").textContent = v + "s";
}

function updateRangeInfo() {
    const from = parseInt(document.getElementById("ad-from")?.value) || 1;
    const to = parseInt(document.getElementById("ad-to")?.value) || leads.length;
    const count = Math.max(0, to - from + 1);
    const el = document.getElementById("ad-range-info");
    if (el) el.textContent = `${count} lead${count !== 1 ? "s" : ""} in range`;
}

// Listen for range input changes
document.addEventListener("input", e => {
    if (e.target.id === "ad-from" || e.target.id === "ad-to") updateRangeInfo();
});

// ── Start ─────────────────────────────────────────────
function startAutoDial() {
    const from = Math.max(1, parseInt(document.getElementById("ad-from").value) || 1);
    const to = Math.min(leads.length, parseInt(document.getElementById("ad-to").value) || leads.length);
    const delay = parseInt(document.getElementById("ad-delay").value) || 5;

    if (from > to) {
        alert("'From' must be less than or equal to 'To'.");
        return;
    }

    // Build queue: leads[from-1 .. to-1], skip blank phones
    const slice = leads.slice(from - 1, to);
    const queue = slice.filter(l => cleanPhone(l.phone).length >= 5);
    const skipped = slice.length - queue.length;

    if (!queue.length) {
        alert("No leads with valid phone numbers in that range.");
        return;
    }

    closeAutoDialModal();

    autoDialState.active = true;
    autoDialState.paused = false;
    autoDialState.queue = queue;
    autoDialState.index = 0;
    autoDialState.delay = delay;

    showHUD();
    dialCurrent();

    if (skipped > 0) {
        console.log(`Auto-dial: skipped ${skipped} leads with no phone number`);
    }
}

// ── Dial current lead ─────────────────────────────────
function dialCurrent() {
    if (!autoDialState.active) return;
    if (autoDialState.index >= autoDialState.queue.length) {
        finishAutoDial();
        return;
    }

    clearCountdown();

    const lead = autoDialState.queue[autoDialState.index];

    // Select lead in sidebar + detail pane
    selectLead(lead.id);

    // Update HUD
    updateHUD();

    // Open tel: link — triggers native phone dialer
    const phone = cleanPhone(lead.phone);
    if (phone) {
        window.location.href = `tel:${phone}`;
    }
}

// ── Schedule next call after delay ───────────────────
function scheduleNextDial() {
    if (!autoDialState.active || autoDialState.paused) return;

    autoDialState.index++;

    if (autoDialState.index >= autoDialState.queue.length) {
        finishAutoDial();
        return;
    }

    // Show countdown
    startCountdown(autoDialState.delay, () => {
        if (autoDialState.active && !autoDialState.paused) {
            dialCurrent();
        }
    });
}

// ── Countdown ring ────────────────────────────────────
function startCountdown(seconds, onDone) {
    clearCountdown();

    autoDialState.countdownVal = seconds;

    const el = document.getElementById("ad-hud-countdown");
    const numEl = document.getElementById("ad-countdown-num");
    const ring = document.getElementById("ad-ring-fill");
    const circumference = 2 * Math.PI * 16; // r=16

    el.classList.remove("hidden");
    numEl.textContent = seconds;
    ring.style.strokeDasharray = `${circumference} ${circumference}`;
    ring.style.strokeDashoffset = "0";

    updateHUDBadge("NEXT IN " + seconds + "s");

    autoDialState.countdownInterval = setInterval(() => {
        autoDialState.countdownVal--;
        if (autoDialState.countdownVal <= 0) {
            clearCountdown();
            el.classList.add("hidden");
            onDone();
            return;
        }
        const pct = autoDialState.countdownVal / seconds;
        ring.style.strokeDashoffset = circumference * (1 - pct);
        numEl.textContent = autoDialState.countdownVal;
        updateHUDBadge("NEXT IN " + autoDialState.countdownVal + "s");
    }, 1000);
}

function clearCountdown() {
    if (autoDialState.countdownInterval) {
        clearInterval(autoDialState.countdownInterval);
        autoDialState.countdownInterval = null;
    }
    const el = document.getElementById("ad-hud-countdown");
    if (el) el.classList.add("hidden");
}

// ── Pause / Resume ────────────────────────────────────
function pauseAutoDial() {
    if (!autoDialState.active) return;

    if (autoDialState.paused) {
        // Resume
        autoDialState.paused = false;
        const btn = document.getElementById("ad-btn-pause");
        btn.innerHTML = `<svg viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause`;
        btn.classList.remove("ad-btn-resume");
        updateHUDBadge("DIALING");
        dialCurrent(); // re-dial current (we haven't advanced index yet)
    } else {
        // Pause
        autoDialState.paused = true;
        clearCountdown();
        const btn = document.getElementById("ad-btn-pause");
        btn.innerHTML = `<svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg> Resume`;
        btn.classList.add("ad-btn-resume");
        updateHUDBadge("PAUSED");
    }
}

// ── Skip ─────────────────────────────────────────────
function skipAutoDial() {
    if (!autoDialState.active) return;
    clearCountdown();

    autoDialState.index++;
    if (autoDialState.index >= autoDialState.queue.length) {
        finishAutoDial();
        return;
    }

    if (autoDialState.paused) {
        // Just advance, don't dial — show the next lead
        const lead = autoDialState.queue[autoDialState.index];
        selectLead(lead.id);
        updateHUD();
    } else {
        dialCurrent();
    }
}

// ── Stop ─────────────────────────────────────────────
function stopAutoDial() {
    clearCountdown();
    autoDialState.active = false;
    autoDialState.paused = false;
    autoDialState.queue = [];
    autoDialState.index = 0;
    hideHUD();
    renderList(); // remove dialing highlights
}

// ── Finish ────────────────────────────────────────────
function finishAutoDial() {
    clearCountdown();
    autoDialState.active = false;
    autoDialState.paused = false;
    hideHUD();
    renderList();

    // Show done toast in detail pane
    const fb = document.querySelector(".save-feedback");
    if (fb) {
        fb.textContent = "✓ Auto-dial complete!";
        fb.classList.add("show");
        setTimeout(() => { fb.classList.remove("show"); fb.textContent = "Saved ✓"; }, 3000);
    }
}

// ── HUD helpers ───────────────────────────────────────
function showHUD() {
    document.getElementById("autodial-hud").classList.remove("hidden");
}

function hideHUD() {
    document.getElementById("autodial-hud").classList.add("hidden");
}

function updateHUD() {
    const lead = autoDialState.queue[autoDialState.index];
    if (!lead) return;

    const visibleCols = dataset?.visible_columns || [];
    const nameCol = visibleCols.find(c =>
        c.toLowerCase().includes("name") || c.toLowerCase().includes("naam")
    );
    const name = nameCol ? (lead.data[nameCol] || "—") : "Lead";

    document.getElementById("ad-hud-name").textContent = name;
    document.getElementById("ad-hud-meta").textContent = cleanPhone(lead.phone);
    document.getElementById("ad-hud-progress").textContent =
        `${autoDialState.index + 1} / ${autoDialState.queue.length}`;
    updateHUDBadge("DIALING");
}

function updateHUDBadge(text) {
    const el = document.getElementById("ad-hud-badge");
    if (el) el.textContent = text;
}