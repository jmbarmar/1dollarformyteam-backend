const express = require("express");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 3000;

const KOFI_TOKEN = process.env.KOFI_TOKEN || "";
const SUPABASE_URL = process.env.SUPABASE_URL || "";
const SUPABASE_KEY = process.env.SUPABASE_KEY || "";

app.use(cors());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ── Supabase REST helpers ──
async function dbGet() {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/state?id=eq.1`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
    },
  });
  const rows = await res.json();
  return rows[0] || { total_raised: 0, total_donors: 0, countries: {}, donations: [] };
}

async function dbSave(data) {
  await fetch(`${SUPABASE_URL}/rest/v1/state?id=eq.1`, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({
      total_raised: data.total_raised,
      total_donors: data.total_donors,
      countries: data.countries,
      donations: data.donations,
    }),
  });
}

// ── GET /api/data ──
app.get("/api/data", async (req, res) => {
  try {
    const data = await dbGet();
    res.json({
      total_raised: data.total_raised,
      total_donors: data.total_donors,
      countries: data.countries,
      last_updated: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── POST /webhook ── receives Ko-fi payments
app.post("/webhook", async (req, res) => {
  try {
    const payload = JSON.parse(req.body.data || "{}");

    if (KOFI_TOKEN && payload.verification_token !== KOFI_TOKEN) {
      return res.status(403).json({ error: "Invalid token" });
    }

    if (payload.type !== "Donation") {
      return res.status(200).json({ ok: true, skipped: true });
    }

    const amount = parseFloat(payload.amount) || 1;
    const country = (payload.message || "").trim() || "Unknown";

    const data = await dbGet();
    data.total_raised = Math.round((data.total_raised + amount) * 100) / 100;
    data.total_donors += 1;

    if (!data.countries[country]) data.countries[country] = { raised: 0, donors: 0 };
    data.countries[country].raised = Math.round((data.countries[country].raised + amount) * 100) / 100;
    data.countries[country].donors += 1;

    data.donations.push({
      from: payload.from_name,
      country,
      amount,
      currency: payload.currency,
      ts: new Date().toISOString(),
    });

    await dbSave(data);
    console.log(`✅ ${payload.from_name} → ${country} ($${amount})`);
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Webhook error:", err.message);
    res.status(400).json({ error: "Bad request" });
  }
});

// ── GET /api/donations ──
app.get("/api/donations", async (req, res) => {
  try {
    const data = await dbGet();
    res.json(data.donations.slice(-100));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
