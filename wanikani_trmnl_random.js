// wanikani_trmnl_random.js
const WANIKANI_API_TOKEN = process.env.WANIKANI_API_TOKEN;     // required
const TRMNL_WEBHOOK_URL = process.env.TRMNL_WEBHOOK_URL;       // required

const WK_BASE = "https://api.wanikani.com/v2";
const WK_HEADERS = {
  "Authorization": `Bearer ${WANIKANI_API_TOKEN}`,
  "Wanikani-Revision": "20170710"
};

async function getUserLevel() {
  const res = await fetch(`${WK_BASE}/user`, { headers: WK_HEADERS });
  if (!res.ok) throw new Error(`User fetch failed: ${res.status}`);
  const body = await res.json();
  const level = body?.data?.level ?? 1;
  const maxGranted = body?.data?.subscription?.max_level_granted ?? level;
  return Math.min(level, maxGranted);
}

async function getSubjectsUpToLevel(level) {
  const types = "kanji,vocabulary";
  let url = `${WK_BASE}/subjects?types=${encodeURIComponent(types)}&levels=${Array.from({length: level}, (_, i) => i+1).join(",")}`;
  const all = [];
  while (url) {
    const res = await fetch(url, { headers: WK_HEADERS });
    if (!res.ok) throw new Error(`Subjects fetch failed: ${res.status}`);
    const page = await res.json();
    all.push(...page.data);
    url = page.pages?.next_url;
  }
  return all;
}

function pickRandom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function subjectToMergeVars(s) {
  const t = s.object; // "kanji" or "vocabulary"
  const d = s.data || {};
  const character = d.characters;
  const level = d.level;
  const meaning = (d.meanings || []).find(m => m.primary)?.meaning || d.meanings?.[0]?.meaning || "";
  let reading = "";
  if (t === "kanji") reading = (d.readings || []).find(r => r.primary)?.reading || d.readings?.[0]?.reading || "";
  if (t === "vocabulary") reading = d.readings?.[0]?.reading || "";
  return { character, reading, meaning, level, type: t };
}

async function pushToTrmnl(mergeVars) {
  const res = await fetch(TRMNL_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ merge_variables: mergeVars })
  });
  if (!res.ok) throw new Error(`TRMNL webhook failed: ${res.status}`);
}

(async () => {
  try {
    if (!WANIKANI_API_TOKEN || !TRMNL_WEBHOOK_URL) {
      throw new Error("Set WANIKANI_API_TOKEN and TRMNL_WEBHOOK_URL env vars.");
    }
    const level = await getUserLevel();
    const subjects = await getSubjectsUpToLevel(level);
    const pick = pickRandom(subjects);
    const payload = subjectToMergeVars(pick);
    await pushToTrmnl(payload);
    console.log(`Pushed: ${payload.type} ${payload.character} (${payload.reading}) — ${payload.meaning}`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
})();
