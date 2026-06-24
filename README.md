# LeadFlow ⚡

A mobile-first sales CRM for call teams. Upload an Excel sheet of leads, work through them call by call, log outcomes, and track campaign performance — all in real time.

---

## Features

- **Excel import** — drag and drop `.xlsx` / `.xls`, pick your phone column and which fields to show
- **Live CRM** — search, filter by status, tap to call via native dialer
- **Call logging** — mark each lead as Pending / Interested / Not Interested / Callback / Converted, add notes and a follow-up date
- **Auto-dialer** — set a row range and delay, steps through leads automatically with a countdown between calls. Pause, resume, skip, or stop at any time
- **Reports** — stat cards, status bar chart, and a follow-up schedule, all pulled live from the database
- **Dark / light theme** — persisted per device
- **Fully responsive** — slide-panel CRM on mobile, bottom nav on tablet

---

## Stack

| Layer | Tech |
|---|---|
| Backend | FastAPI (Python) |
| Database | Supabase (Postgres) |
| Templates | Jinja2 |
| Frontend | Vanilla JS, CSS custom properties |
| Hosting | Render |

---

## Project Structure

```
leadflow/
├── main.py              # FastAPI app — all routes
├── database.py          # Supabase client
├── static/
│   ├── css/style.css    # Single stylesheet (dark + light theme)
│   ├── js/
│   │   ├── crm.js       # CRM + auto-dialer engine
│   │   ├── upload.js    # Excel upload + dataset management
│   │   └── reports.js   # Reports page
│   └── images/
│       └── favicon.png
├── templates/
│   ├── index.html       # Upload page
│   ├── crm.html         # CRM page
│   └── reports.html     # Reports page
├── requirements.txt
├── .gitignore
└── README.md
```

---

## Local Setup

**1. Clone the repo**
```bash
git clone https://github.com/YOUR_USERNAME/leadflow.git
cd leadflow
```

**2. Create and activate a virtual environment**
```bash
python -m venv venv

# Windows
venv\Scripts\activate

# macOS / Linux
source venv/bin/activate
```

**3. Install dependencies**
```bash
pip install -r requirements.txt
```

**4. Set up environment variables**

Create a `.env` file in the project root:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_KEY=your-anon-or-service-role-key
```

**5. Set up Supabase tables**

Run this SQL in your Supabase SQL editor:

```sql
create table datasets (
  id uuid primary key default gen_random_uuid(),
  filename text,
  phone_column text,
  visible_columns jsonb,
  total_leads int4,
  created_at timestamptz default now()
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid references datasets(id),
  phone text,
  data jsonb,
  status text default 'pending',
  notes text,
  followup_date date,
  last_called_at timestamptz,
  created_at timestamptz default now()
);
```

**6. Run the server**
```bash
uvicorn main:app --reload
```

Open [http://localhost:8000](http://localhost:8000)

---

## Deploying to Render

1. Push your repo to GitHub
2. Go to [render.com](https://render.com) → New → Web Service
3. Connect your GitHub repo
4. Set the following:

| Field | Value |
|---|---|
| Environment | Python |
| Build Command | `pip install -r requirements.txt` |
| Start Command | `uvicorn main:app --host 0.0.0.0 --port 10000` |

5. Add environment variables in the Render dashboard:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`

---

## How the Auto-Dialer Works

1. Click **⚡ Auto-Dial** in the nav
2. Set a row range (e.g. rows 1–50) and delay between calls (3–30 seconds)
3. Hit **Start** — the first lead loads and your phone dialer opens
4. After the call, log the status and hit **Save**
5. The countdown starts automatically → next number dials when it hits zero
6. Use **Pause**, **Skip**, or **Stop** from the HUD bar at any time

Leads with no phone number are skipped automatically.

---

## Environment Variables

| Variable | Description |
|---|---|
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | Supabase anon or service role key |
