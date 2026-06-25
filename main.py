from fastapi import FastAPI, Request, UploadFile, File, HTTPException
from fastapi.responses import HTMLResponse
from fastapi.templating import Jinja2Templates
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from typing import List, Optional
import pandas as pd
import numpy as np
from database import supabase

app = FastAPI()


# ──────────────────────────────────────────────
# Health Check
# ──────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok"}


# ──────────────────────────────────────────────
# Static Files
# ──────────────────────────────────────────────

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


# ──────────────────────────────────────────────
# Pages
# ──────────────────────────────────────────────

@app.get("/", response_class=HTMLResponse)
def home(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

@app.get("/crm/{dataset_id}", response_class=HTMLResponse)
def crm_page(request: Request, dataset_id: str):
    return templates.TemplateResponse(request=request, name="crm.html",
                                      context={"dataset_id": dataset_id})

@app.get("/reports/{dataset_id}", response_class=HTMLResponse)
def reports_page(request: Request, dataset_id: str):
    return templates.TemplateResponse(request=request, name="reports.html",
                                      context={"dataset_id": dataset_id})


# ──────────────────────────────────────────────
# Upload
# ──────────────────────────────────────────────

def clean_value(val):
    """Convert any value to a clean string. Fixes float phone numbers like 9876543210.0"""
    if val is None or (isinstance(val, float) and np.isnan(val)):
        return ""
    if isinstance(val, float) and val.is_integer():
        return str(int(val))   # 9876543210.0 → "9876543210"
    return str(val).strip()


@app.post("/upload")
async def upload_excel(file: UploadFile = File(...)):
    try:
        df = pd.read_excel(file.file)
    except Exception as e:
        raise HTTPException(400, f"Could not parse file: {str(e)}")

    columns = df.columns.tolist()

    # Clean every cell — preserves full phone numbers, strips .0 from floats
    cleaned = df.apply(lambda col: col.map(clean_value))

    preview = cleaned.head(5).to_dict(orient="records")
    all_rows = cleaned.to_dict(orient="records")

    return {
        "filename": file.filename,
        "columns": columns,
        "rows": len(df),
        "preview": preview,
        "all_rows": all_rows
    }


# ──────────────────────────────────────────────
# Dataset
# ──────────────────────────────────────────────

class SaveDatasetRequest(BaseModel):
    filename: str
    phone_column: str
    visible_columns: List[str]
    rows: List[dict]


@app.post("/dataset/save")
async def save_dataset(payload: SaveDatasetRequest):
    try:
        meta = supabase.table("datasets").insert({
            "filename": payload.filename,
            "phone_column": payload.phone_column,
            "visible_columns": payload.visible_columns,
            "total_leads": len(payload.rows)
        }).execute()

        dataset_id = meta.data[0]["id"]

        leads = []
        for row in payload.rows:
            phone = clean_value(row.get(payload.phone_column, ""))
            leads.append({
                "dataset_id": dataset_id,
                "phone": phone,
                "data": row,
                "status": "pending",
                "notes": ""
            })

        batch_size = 500
        for i in range(0, len(leads), batch_size):
            supabase.table("leads").insert(leads[i:i+batch_size]).execute()

        return {"dataset_id": dataset_id}

    except Exception as e:
        raise HTTPException(500, f"Save failed: {str(e)}")


@app.get("/dataset/{dataset_id}")
async def get_dataset(dataset_id: str):
    try:
        meta = supabase.table("datasets").select("*").eq("id", dataset_id).single().execute()
        leads = supabase.table("leads").select("*").eq("dataset_id", dataset_id).execute()
        return {"dataset": meta.data, "leads": leads.data}
    except Exception as e:
        raise HTTPException(404, f"Dataset not found: {str(e)}")


@app.get("/datasets")
async def list_datasets():
    res = supabase.table("datasets").select("*").order("created_at", desc=True).execute()
    return res.data


@app.delete("/dataset/{dataset_id}")
async def delete_dataset(dataset_id: str):
    try:
        supabase.table("leads").delete().eq("dataset_id", dataset_id).execute()
        res = supabase.table("datasets").delete().eq("id", dataset_id).execute()
        if not res.data:
            raise HTTPException(404, "Dataset not found")
        return {"deleted": True, "dataset_id": dataset_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, f"Delete failed: {str(e)}")


# ──────────────────────────────────────────────
# Lead Updates
# ──────────────────────────────────────────────

class UpdateLeadRequest(BaseModel):
    status: str
    notes: Optional[str] = ""
    followup_date: Optional[str] = None


@app.patch("/lead/{lead_id}")
async def update_lead(lead_id: str, payload: UpdateLeadRequest):
    try:
        update_data = {
            "status": payload.status,
            "notes": payload.notes,
            "last_called_at": "now()"
        }
        if payload.followup_date:
            update_data["followup_date"] = payload.followup_date

        res = supabase.table("leads").update(update_data).eq("id", lead_id).execute()
        return res.data[0]
    except Exception as e:
        raise HTTPException(500, f"Update failed: {str(e)}")


# ──────────────────────────────────────────────
# Reports — defined before /reports/{dataset_id} page route
# ──────────────────────────────────────────────

@app.get("/reports/data/{dataset_id}")
async def report_data(dataset_id: str):
    leads = supabase.table("leads").select("status, followup_date, last_called_at") \
        .eq("dataset_id", dataset_id).execute()

    rows = leads.data
    total = len(rows)
    status_counts = {}
    followups = 0

    for r in rows:
        s = r["status"]
        status_counts[s] = status_counts.get(s, 0) + 1
        if r.get("followup_date"):
            followups += 1

    called = total - status_counts.get("pending", 0)

    return {
        "total": total,
        "called": called,
        "pending": status_counts.get("pending", 0),
        "followups": followups,
        "status_counts": status_counts
    }