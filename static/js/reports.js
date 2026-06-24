const DATASET_ID = document.body.dataset.datasetId;

const STATUS_COLORS = {
    pending:        "#7a8099",
    interested:     "#34c78b",
    not_interested: "#f05a5a",
    callback:       "#f5a623",
    converted:      "#4f7cff"
};

async function init() {
    document.getElementById("back-crm").href = `/crm/${DATASET_ID}`;
    document.getElementById("back-crm").textContent = "← Back to CRM";

    try {
        // Dataset meta for subtitle
        const dsRes = await fetch(`/dataset/${DATASET_ID}`);
        if (!dsRes.ok) throw new Error("Failed to load dataset");
        const dsJson = await dsRes.json();
        document.getElementById("reports-sub").textContent = dsJson.dataset.filename;

        // Report data
        const res = await fetch(`/reports/data/${DATASET_ID}`);
        if (!res.ok) throw new Error("Failed to load report data");
        const data = await res.json();

        document.getElementById("stat-total").textContent = data.total;
        document.getElementById("stat-called").textContent = data.called;
        document.getElementById("stat-pending").textContent = data.pending;
        document.getElementById("stat-followups").textContent = data.followups;

        renderBarChart(data.status_counts, data.total);
        renderFollowups(dsJson.leads);
    } catch (e) {
        document.getElementById("reports-sub").textContent = "Couldn't load this report.";
    } finally {
        hidePageLoader();
    }
}

function hidePageLoader() {
    const loader = document.getElementById("page-loader");
    if (loader) loader.classList.add("hidden");
}

function renderBarChart(counts, total) {
    const chart = document.getElementById("bar-chart");
    const labels = {
        interested:     "Interested",
        converted:      "Converted",
        callback:       "Callback",
        not_interested: "Not Interested",
        pending:        "Pending"
    };

    chart.innerHTML = Object.entries(labels).map(([key, label]) => {
        const count = counts[key] || 0;
        const pct = total ? Math.round((count / total) * 100) : 0;
        const color = STATUS_COLORS[key];
        return `
            <div class="bar-row">
                <div class="bar-name">${label}</div>
                <div class="bar-track">
                    <div class="bar-fill" style="width:${pct}%;background:${color}">
                        ${pct > 8 ? pct + "%" : ""}
                    </div>
                </div>
                <div class="bar-count">${count}</div>
            </div>
        `;
    }).join("");
}

function renderFollowups(leads) {
    const list = document.getElementById("followup-list");
    const fu = (leads || []).filter(l => l.followup_date);

    if (!fu.length) {
        list.innerHTML = `<p style="color:var(--muted);font-size:13px">No follow-ups scheduled.</p>`;
        return;
    }

    fu.sort((a, b) => new Date(a.followup_date) - new Date(b.followup_date));

    list.innerHTML = fu.map(l => {
        const nameCol = Object.keys(l.data || {}).find(k =>
            k.toLowerCase().includes("name")
        );
        const name = nameCol ? l.data[nameCol] : l.phone;
        const date = new Date(l.followup_date).toLocaleDateString("en-IN", {
            day: "numeric", month: "short", year: "numeric"
        });
        return `
            <div class="followup-card">
                <div>
                    <div class="followup-name">${name}</div>
                    <div class="followup-phone">${l.phone}</div>
                </div>
                <div class="followup-date">📅 ${date}</div>
            </div>
        `;
    }).join("");
}

init();