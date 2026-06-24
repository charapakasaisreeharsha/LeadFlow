let uploadedData = null;
let selectedVisibleCols = [];
let allRows = [];  // stores ALL rows from the file

// ── Drag & Drop ───────────────────────────────────────
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("excelFile");
const uploadBtn = document.getElementById("uploadBtn");

dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", e => {
    e.preventDefault();
    dropZone.classList.add("dragover");
});

dropZone.addEventListener("dragleave", () => dropZone.classList.remove("dragover"));

dropZone.addEventListener("drop", e => {
    e.preventDefault();
    dropZone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file) setFile(file);
});

fileInput.addEventListener("change", () => {
    if (fileInput.files[0]) setFile(fileInput.files[0]);
});

function setFile(file) {
    fileInput._file = file;
    const fn = document.getElementById("file-name");
    fn.textContent = `📄 ${file.name}`;
    fn.classList.remove("hidden");
    uploadBtn.disabled = false;
}


// ── Upload ────────────────────────────────────────────
async function uploadFile() {
    const file = fileInput._file || fileInput.files[0];
    if (!file) { alert("Select a file first."); return; }

    uploadBtn.disabled = true;
    uploadBtn.textContent = "Reading…";

    const formData = new FormData();
    formData.append("file", file);

    try {
        const res = await fetch("/upload", { method: "POST", body: formData });

        if (!res.ok) {
            const err = await res.json();
            alert("Upload failed: " + (err.detail || res.status));
            uploadBtn.disabled = false;
            uploadBtn.textContent = "Read Sheet";
            return;
        }

        const data = await res.json();

        uploadBtn.disabled = false;
        uploadBtn.textContent = "Read Sheet";

        uploadedData = data;
        allRows = data.all_rows || data.preview;  // use all_rows if backend sends it
        selectedVisibleCols = [...data.columns];

        renderResult(data);

    } catch (e) {
        alert("Network error: " + e.message);
        uploadBtn.disabled = false;
        uploadBtn.textContent = "Read Sheet";
    }
}

function renderResult(data) {
    const panel = document.getElementById("result");
    panel.classList.remove("hidden");

    const phoneOpts = data.columns.map(c =>
        `<option value="${c}">${c}</option>`
    ).join("");

    const colTags = data.columns.map(c =>
        `<div class="col-tag selected" data-col="${c}" onclick="toggleCol(this)">${c}</div>`
    ).join("");

    const previewRows = data.preview.map(row =>
        `<tr>${data.columns.map(c => `<td>${row[c] ?? ""}</td>`).join("")}</tr>`
    ).join("");

    panel.innerHTML = `
        <div class="section-label">File: ${data.filename} · ${data.rows} rows · ${data.columns.length} columns</div>

        <div class="section-block">
            <div class="section-label">Phone Number Column</div>
            <select id="phoneColumn" class="select-input">
                ${phoneOpts}
            </select>
        </div>

        <div class="section-block">
            <div class="section-label">Columns to Show in CRM
                <span style="color:var(--muted);font-weight:400;text-transform:none;letter-spacing:0"> — click to toggle</span>
            </div>
            <div class="col-grid" id="col-tags">${colTags}</div>
        </div>

        <div class="section-block">
            <div class="section-label">Preview (first 5 rows)</div>
            <div class="preview-table-wrap">
                <table class="preview-table">
                    <thead>
                        <tr>${data.columns.map(c => `<th>${c}</th>`).join("")}</tr>
                    </thead>
                    <tbody>${previewRows}</tbody>
                </table>
            </div>
        </div>

        <div class="action-row">
            <button class="btn-primary" onclick="saveDataset()">Save & Open CRM →</button>
            <span class="action-info" id="action-info">${data.rows} leads ready</span>
        </div>
    `;
}

function toggleCol(el) {
    const col = el.dataset.col;
    el.classList.toggle("selected");
    if (el.classList.contains("selected")) {
        selectedVisibleCols.push(col);
    } else {
        selectedVisibleCols = selectedVisibleCols.filter(c => c !== col);
    }
}

async function saveDataset() {
    if (!uploadedData) return;

    const phoneColumn = document.getElementById("phoneColumn").value;
    const visibleCols = selectedVisibleCols.length
        ? selectedVisibleCols
        : uploadedData.columns;

    const info = document.getElementById("action-info");
    info.textContent = "Saving…";

    // Sanitize rows — remove NaN/undefined values that break JSON
    const cleanRows = allRows.map(row => {
        const clean = {};
        for (const [k, v] of Object.entries(row)) {
            if (v === null || v === undefined || (typeof v === "number" && isNaN(v))) {
                clean[k] = "";
            } else {
                clean[k] = String(v);
            }
        }
        return clean;
    });

    try {
        const res = await fetch("/dataset/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                filename: uploadedData.filename,
                phone_column: phoneColumn,
                visible_columns: visibleCols,
                rows: cleanRows
            })
        });

        if (!res.ok) {
            const err = await res.json();
            info.textContent = "Save failed.";
            alert("Error saving: " + JSON.stringify(err.detail || err));
            return;
        }

        const saved = await res.json();

        if (!saved.dataset_id) {
            info.textContent = "Save failed — no dataset_id returned.";
            console.error("Server response:", saved);
            alert("Unexpected response: " + JSON.stringify(saved));
            return;
        }

        showPageLoader();
        window.location.href = `/crm/${saved.dataset_id}`;

    } catch (e) {
        info.textContent = "Network error.";
        alert("Network error: " + e.message);
    }
}


// ── Datasets modal ────────────────────────────────────
document.getElementById("nav-datasets").addEventListener("click", loadDatasets);

async function loadDatasets() {
    document.getElementById("datasets-modal").classList.remove("hidden");
    const list = document.getElementById("datasets-list");
    list.innerHTML = `<div style="display:flex;justify-content:center;padding:24px"><div class="spinner"></div></div>`;

    const res = await fetch("/datasets");
    const data = await res.json();

    if (!data.length) {
        list.innerHTML = `<p style="color:var(--muted)">No datasets yet.</p>`;
        return;
    }

    list.innerHTML = data.map(d => `
        <div class="dataset-card" data-id="${d.id}" onclick="goToDataset('${d.id}')">
            <div>
                <div class="dataset-card-name">${d.filename}</div>
                <div class="dataset-card-meta">${d.total_leads} leads · ${new Date(d.created_at).toLocaleDateString()}</div>
            </div>
            <div class="dataset-card-right">
                <span class="dataset-card-btn">Open →</span>
                <button class="dataset-delete-btn" onclick="event.stopPropagation(); askDeleteDataset('${d.id}', '${escapeForAttr(d.filename)}')">Delete</button>
            </div>
        </div>
    `).join("");
}

function escapeForAttr(str) {
    return String(str).replace(/'/g, "\\'");
}

function goToDataset(id) {
    showPageLoader();
    window.location.href = `/crm/${id}`;
}

function closeModal() {
    document.getElementById("datasets-modal").classList.add("hidden");
}

// ── Delete confirmation ───────────────────────────────
let pendingDeleteId = null;

function askDeleteDataset(id, filename) {
    pendingDeleteId = id;
    document.getElementById("confirm-text").innerHTML =
        `This will permanently delete <b>${filename}</b> and all of its leads. This can't be undone.`;
    const btn = document.getElementById("confirm-delete-btn");
    btn.disabled = false;
    btn.textContent = "Delete";
    btn.onclick = confirmDeleteDataset;
    document.getElementById("confirm-modal").classList.remove("hidden");
}

function closeConfirmModal() {
    pendingDeleteId = null;
    document.getElementById("confirm-modal").classList.add("hidden");
}

async function confirmDeleteDataset() {
    if (!pendingDeleteId) return;
    const id = pendingDeleteId;
    const btn = document.getElementById("confirm-delete-btn");
    btn.disabled = true;
    btn.textContent = "Deleting…";

    try {
        const res = await fetch(`/dataset/${id}`, { method: "DELETE" });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            alert("Delete failed: " + (err.detail || res.status));
            btn.disabled = false;
            btn.textContent = "Delete";
            return;
        }

        closeConfirmModal();
        loadDatasets();  // refresh list

    } catch (e) {
        alert("Network error: " + e.message);
        btn.disabled = false;
        btn.textContent = "Delete";
    }
}

// ── Page loader (shown briefly on navigation) ────────
function showPageLoader() {
    const loader = document.getElementById("page-loader");
    if (loader) loader.classList.remove("hidden");
}