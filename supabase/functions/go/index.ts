// Well Go API: the only thing that talks to Notion (and to the chat tables).
// The phone app calls this function; the Notion secret never leaves the server.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   NOTION_TOKEN   the Internal Integration Secret from the Notion workspace owner
// Supabase supplies SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY by itself.
//
// Written as plain JavaScript inside a .ts file so it can be pasted into the
// Supabase editor without a type-check step.

const NOTION = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const TOKEN = Deno.env.get("NOTION_TOKEN") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SB_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const TZ = "America/Chicago";

// Database IDs under the "Well Go: Home Base" page. Not secret.
const DB = {
  teams: "10cf5cddca8d4d939e7372e0d7139b44",
  players: "6d147b47eb434def99df6e1b5a725d21",
  challenges: "57dd528dacd64cfc8aa7021e0f809dc7",
  interactions: "dc713fa7c347482686f36ad1547dec84",
};

// First day of the current season. Update this when a new season starts.
const SEASON_START = "2026-09-01";
const SESSION_DAYS = 90;
const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
const POINTS_PER_LEVEL = 300;
const NEW_STAMP_BONUS = 10;
const STREAK_DAYS_FOR_BONUS = 3;
const STREAK_MULTIPLIER = 1.25;
const GENERIC_CONVERSATION_POINTS = 10;
const GENERIC_CONVERSATION_PER_DAY = 5;

// Only the published app may call this from a browser. If the app ever moves,
// change this to its new address (scheme and host only, no path).
const APP_ORIGIN = "https://jtliner925.github.io";

const cors = {
  "Access-Control-Allow-Origin": APP_ORIGIN,
  "Vary": "Origin",
  "Access-Control-Allow-Headers": "content-type, x-session, authorization, apikey",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

// ---------- Notion helpers ----------

async function notion(path, method = "GET", body) {
  const res = await fetch(NOTION + path, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error("Notion error", res.status, JSON.stringify(data));
    throw new HttpError(502, data?.message ?? "Notion did not accept the request.");
  }
  return data;
}

async function query(db, body, max = 500) {
  const out = [];
  let cursor;
  do {
    const page = await notion(`/databases/${db}/query`, "POST", {
      page_size: Math.min(100, max - out.length),
      ...body,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    out.push(...page.results);
    cursor = page.has_more ? page.next_cursor : undefined;
  } while (cursor && out.length < max);
  return out;
}

const plain = (rt) => (rt ?? []).map((t) => t.plain_text).join("");
const P = {
  title: (p, n) => plain(p.properties[n]?.title),
  text: (p, n) => plain(p.properties[n]?.rich_text),
  select: (p, n) => p.properties[n]?.select?.name ?? "",
  multi: (p, n) => (p.properties[n]?.multi_select ?? []).map((o) => o.name),
  date: (p, n) => p.properties[n]?.date?.start ?? "",
  rel: (p, n) => (p.properties[n]?.relation ?? []).map((r) => r.id),
  check: (p, n) => !!p.properties[n]?.checkbox,
  num: (p, n) => p.properties[n]?.number ?? 0,
  phone: (p, n) => p.properties[n]?.phone_number ?? "",
  url: (p, n) => p.properties[n]?.url ?? "",
  files: (p, n) => (p.properties[n]?.files ?? []).map((f) => f.file?.url || f.external?.url).filter(Boolean),
};

const W = {
  title: (s) => ({ title: [{ text: { content: s.slice(0, 200) } }] }),
  text: (s) => ({ rich_text: (s.match(/[\s\S]{1,1900}/g) ?? []).map((c) => ({ text: { content: c } })) }),
  select: (s) => ({ select: s ? { name: s } : null }),
  date: (s) => ({ date: s ? { start: s } : null }),
  rel: (ids) => ({ relation: ids.map((id) => ({ id })) }),
  check: (b) => ({ checkbox: !!b }),
  num: (n) => ({ number: n }),
  phone: (s) => ({ phone_number: s || null }),
  url: (s) => ({ url: s || null }),
};

const clean = (id) => (id ?? "").replace(/-/g, "");
const str = (v, max = 4000) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const isId = (s) => typeof s === "string" && /^[0-9a-f-]{32,36}$/i.test(s);
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}
function addDays(ymd, n) {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function daysBetween(a, b) {
  return Math.round((new Date(b + "T12:00:00Z") - new Date(a + "T12:00:00Z")) / 86400000);
}
function weekStart(ymd) {
  const d = new Date(ymd + "T12:00:00Z");
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDays(ymd, -dow);
}

// ---------- Chat and small-state storage (Supabase tables) ----------

async function sb(path, method = "GET", body, extra = {}) {
  const res = await fetch(`${SB_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SB_KEY,
      Authorization: `Bearer ${SB_KEY}`,
      "Content-Type": "application/json",
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    console.error("Supabase error", res.status, text);
    throw new HttpError(502, "The chat store did not accept the request. Has schema.sql been run?");
  }
  return text ? JSON.parse(text) : null;
}

async function kvGet(owner, key, fallback = null) {
  const rows = await sb(`go_kv?owner=eq.${owner}&key=eq.${encodeURIComponent(key)}&select=value`);
  return rows?.[0]?.value ?? fallback;
}
async function kvSet(owner, key, value) {
  await sb("go_kv", "POST", { owner, key, value, updated_at: new Date().toISOString() }, {
    Prefer: "resolution=merge-duplicates",
  });
}

async function postMessage(thread, sender, body) {
  await sb("go_messages", "POST", {
    thread,
    sender_id: sender?.id ?? "system",
    sender_name: sender?.name ?? "Well Go",
    body: body.slice(0, 2000),
  });
}

// ---------- Sessions ----------
// A signed token, so no session table is needed. The signing key is derived
// from the Notion secret; rotating that secret signs everyone out.

const enc = new TextEncoder();
async function hmac(message) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode("well-go-session:" + TOKEN),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function makeSession(id) {
  const payload = `${clean(id)}.${Date.now() + SESSION_DAYS * 86400000}`;
  return `${payload}.${await hmac(payload)}`;
}

// ---------- Loading players, teams, challenges ----------

async function loadTeams() {
  const rows = await query(DB.teams, {}, 100);
  return rows.map((r) => ({ id: clean(r.id), name: P.title(r, "Name"), active: P.check(r, "Active") }));
}

function shapePlayer(r, teams) {
  const teamId = clean(P.rel(r, "Team")[0] ?? "");
  return {
    id: clean(r.id),
    name: P.title(r, "Name"),
    role: P.select(r, "Role") || "Player",
    active: P.check(r, "Active"),
    teamId,
    teamName: teams.find((t) => t.id === teamId)?.name ?? "",
    solo: P.check(r, "Solo player"),
    points: P.num(r, "Season points"),
    streak: P.num(r, "Streak (days)"),
    lastActive: P.date(r, "Last active"),
    checkin: P.select(r, "Check-in"),
    nations: P.num(r, "Nations stamped"),
    places: P.num(r, "Places stamped"),
    code: P.text(r, "App Code").trim(),
    failures: P.num(r, "Failed Sign-ins"),
    lockedUntil: P.date(r, "Locked Until"),
  };
}

async function loadPlayers(teams) {
  const rows = await query(DB.players, {}, 300);
  return rows.map((r) => shapePlayer(r, teams));
}

async function loadChallenges() {
  const rows = await query(DB.challenges, { filter: { property: "Active", checkbox: { equals: true } } }, 200);
  return rows.map((r) => ({
    id: clean(r.id),
    title: P.title(r, "Challenge"),
    tier: P.select(r, "Tier"),
    points: P.num(r, "Points"),
    proof: P.select(r, "Proof"),
    limit: P.text(r, "Limit"),
    team: P.check(r, "Team challenge"),
    gift: P.select(r, "Gift"),
    passport: P.select(r, "Passport"),
    description: P.text(r, "Description"),
  }));
}

async function requireUser(req) {
  const token = req.headers.get("x-session") ?? "";
  const [id, exp, sig] = token.split(".");
  if (!id || !exp || !sig) throw new HttpError(401, "Please sign in.");
  if ((await hmac(`${id}.${exp}`)) !== sig || Number(exp) < Date.now()) {
    throw new HttpError(401, "Please sign in again.");
  }
  const teams = await loadTeams();
  const players = await loadPlayers(teams);
  // Checked against Notion on every request, so unticking Active removes access at once.
  const me = players.find((p) => p.id === id && p.active);
  if (!me) throw new HttpError(401, "Your access has been turned off.");
  return { me, players, teams };
}

const isAdmin = (m) => m.role === "Admin";
const isLeader = (m) => m.role === "Team leader" || m.role === "Admin";

// ---------- Interactions ----------

function shapeInteraction(r) {
  return {
    id: clean(r.id),
    summary: P.title(r, "Summary"),
    playerId: clean(P.rel(r, "Player")[0] ?? ""),
    challengeId: clean(P.rel(r, "Challenge")[0] ?? ""),
    when: P.date(r, "When"),
    status: P.select(r, "Status"),
    points: P.num(r, "Points"),
    photos: P.files(r, "Photo"),
    contactName: P.text(r, "Contact first name"),
    contactPhone: P.phone(r, "Contact phone"),
    nation: P.text(r, "Background / nation"),
    place: P.select(r, "Place type"),
    outcome: P.select(r, "Outcome"),
    light: P.select(r, "Light"),
    need: P.text(r, "Need / prayer request"),
    followUp: P.check(r, "Needs follow-up"),
    fuStatus: P.select(r, "Follow-up status"),
    assignedTo: clean(P.rel(r, "Assigned to")[0] ?? ""),
    fuNotes: P.text(r, "Follow-up notes"),
    lat: r.properties["Latitude"]?.number ?? null,
    lng: r.properties["Longitude"]?.number ?? null,
    stamp: P.text(r, "Passport stamp"),
    reviewNote: P.text(r, "Review note"),
    loggedAt: r.created_time,
  };
}

// Who may see a contact's details and photos: the person who logged it, the
// leader of that person's team, admins, and whoever the follow-up is assigned to.
function canSeeContact(me, i, playersById) {
  if (i.playerId === me.id || i.assignedTo === me.id || isAdmin(me)) return true;
  if (me.role === "Team leader") {
    const owner = playersById.get(i.playerId);
    return !!owner && owner.teamId && owner.teamId === me.teamId;
  }
  return false;
}

function redact(i) {
  return {
    ...i,
    contactName: "",
    contactPhone: "",
    need: "",
    fuNotes: "",
    photos: [],
    reviewNote: "",
  };
}

async function myInteractions(playerId, since = SEASON_START) {
  const rows = await query(DB.interactions, {
    filter: {
      and: [
        { property: "Player", relation: { contains: playerId } },
        { property: "When", date: { on_or_after: since } },
      ],
    },
    sorts: [{ property: "When", direction: "descending" }],
  }, 1000);
  return rows.map(shapeInteraction).filter((i) => i.status !== "Sent back");
}

// "3×/day", "2×/week", "Once per contact", "Each nation once per season", ...
function parseLimit(text) {
  const t = (text || "").toLowerCase();
  let m = t.match(/(\d+)\s*[×x]\s*\/\s*(day|week)/);
  if (m) return { n: Number(m[1]), per: m[2] };
  if (t.includes("language")) return { n: 1, per: "nation" };
  if (t.includes("nation") && t.includes("once")) return { n: 1, per: "nation" };
  if (t.includes("place") && t.includes("once")) return { n: 1, per: "place" };
  if (t.includes("contact") || t.includes("person")) return { n: 1, per: "contact" };
  if (t.includes("once")) return { n: 1, per: "season" };
  return null;
}

function limitReached(limit, prior, input, now) {
  if (!limit) return false;
  if (limit.per === "day") return prior.filter((i) => i.when.slice(0, 10) === now).length >= limit.n;
  if (limit.per === "week") return prior.filter((i) => i.when.slice(0, 10) >= weekStart(now)).length >= limit.n;
  const key = { nation: "nation", place: "place", contact: "contactName" }[limit.per];
  if (key) {
    const v = (input[key] ?? "").toLowerCase();
    if (!v) return false;
    return prior.filter((i) => (i[key] ?? "").toLowerCase() === v).length >= limit.n;
  }
  return prior.length >= limit.n; // once per season
}

function streakOf(dates, now) {
  const days = new Set(dates.map((d) => d.slice(0, 10)));
  let day = days.has(now) ? now : addDays(now, -1);
  let n = 0;
  while (days.has(day)) {
    n++;
    day = addDays(day, -1);
  }
  return n;
}

const levelOf = (points) => Math.floor(points / POINTS_PER_LEVEL) + 1;

async function uploadPhoto(photo) {
  const bytes = Uint8Array.from(atob(photo.data), (c) => c.charCodeAt(0));
  if (bytes.length > 8_000_000) throw new HttpError(400, "That photo is too large.");
  const type = ["image/jpeg", "image/png", "image/webp"].includes(photo.type) ? photo.type : "image/jpeg";
  const name = (str(photo.name, 80) || "photo.jpg").replace(/[^\w.\-]/g, "_");
  const created = await notion("/file_uploads", "POST", { filename: name, content_type: type });
  const form = new FormData();
  form.append("file", new Blob([bytes], { type }), name);
  const res = await fetch(`${NOTION}/file_uploads/${created.id}/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Notion-Version": NOTION_VERSION },
    body: form,
  });
  if (!res.ok) {
    console.error("Photo upload failed", res.status, await res.text());
    throw new HttpError(502, "Notion did not accept the photo.");
  }
  return { name, id: created.id };
}

async function patchPlayer(id, props) {
  await notion(`/pages/${id}`, "PATCH", { properties: props });
}

// ---------- Countries ----------
// Same list as countries.js in the app. Typed names are matched to it so
// "USA" and "United States" can't become two different stamps.
const COUNTRY_RAW = `AF|Afghanistan
AL|Albania
DZ|Algeria
AD|Andorra
AO|Angola
AG|Antigua and Barbuda
AR|Argentina
AM|Armenia
AU|Australia
AT|Austria
AZ|Azerbaijan
BS|Bahamas|The Bahamas
BH|Bahrain
BD|Bangladesh
BB|Barbados
BY|Belarus
BE|Belgium
BZ|Belize
BJ|Benin
BT|Bhutan
BO|Bolivia
BA|Bosnia and Herzegovina
BW|Botswana
BR|Brazil
BN|Brunei
BG|Bulgaria
BF|Burkina Faso
BI|Burundi
CV|Cabo Verde|Cape Verde
KH|Cambodia
CM|Cameroon
CA|Canada
CF|Central African Republic
TD|Chad
CL|Chile
CN|China
CO|Colombia
KM|Comoros
CG|Congo (Republic)|Congo-Brazzaville,Republic of the Congo
CD|Congo (DR)|DRC,Democratic Republic of the Congo,Zaire,Congo-Kinshasa
CR|Costa Rica
CI|Côte d'Ivoire|Ivory Coast
HR|Croatia
CU|Cuba
CY|Cyprus
CZ|Czechia|Czech Republic
DK|Denmark
DJ|Djibouti
DM|Dominica
DO|Dominican Republic
EC|Ecuador
EG|Egypt
SV|El Salvador
GQ|Equatorial Guinea
ER|Eritrea
EE|Estonia
SZ|Eswatini|Swaziland
ET|Ethiopia
FJ|Fiji
FI|Finland
FR|France
GA|Gabon
GM|Gambia
GE|Georgia
DE|Germany
GH|Ghana
GR|Greece
GD|Grenada
GT|Guatemala
GN|Guinea
GW|Guinea-Bissau
GY|Guyana
HT|Haiti
HN|Honduras
HK|Hong Kong
HU|Hungary
IS|Iceland
IN|India
ID|Indonesia
IR|Iran|Persia
IQ|Iraq
IE|Ireland
IL|Israel
IT|Italy
JM|Jamaica
JP|Japan
JO|Jordan
KZ|Kazakhstan
KE|Kenya
KI|Kiribati
XK|Kosovo
KW|Kuwait
KG|Kyrgyzstan
LA|Laos
LV|Latvia
LB|Lebanon
LS|Lesotho
LR|Liberia
LY|Libya
LI|Liechtenstein
LT|Lithuania
LU|Luxembourg
MO|Macao|Macau
MG|Madagascar
MW|Malawi
MY|Malaysia
MV|Maldives
ML|Mali
MT|Malta
MH|Marshall Islands
MR|Mauritania
MU|Mauritius
MX|Mexico
FM|Micronesia
MD|Moldova
MC|Monaco
MN|Mongolia
ME|Montenegro
MA|Morocco
MZ|Mozambique
MM|Myanmar|Burma
NA|Namibia
NR|Nauru
NP|Nepal
NL|Netherlands|Holland
NZ|New Zealand
NI|Nicaragua
NE|Niger
NG|Nigeria
KP|North Korea
MK|North Macedonia|Macedonia
NO|Norway
OM|Oman
PK|Pakistan
PW|Palau
PS|Palestine|Gaza,West Bank
PA|Panama
PG|Papua New Guinea
PY|Paraguay
PE|Peru
PH|Philippines
PL|Poland
PT|Portugal
PR|Puerto Rico
QA|Qatar
RO|Romania
RU|Russia
RW|Rwanda
KN|Saint Kitts and Nevis
LC|Saint Lucia
VC|Saint Vincent and the Grenadines
WS|Samoa
SM|San Marino
ST|São Tomé and Príncipe|Sao Tome
SA|Saudi Arabia
SN|Senegal
RS|Serbia|Republic of Serbia
SC|Seychelles
SL|Sierra Leone
SG|Singapore
SK|Slovakia
SI|Slovenia
SB|Solomon Islands
SO|Somalia
ZA|South Africa
KR|South Korea
SS|South Sudan
ES|Spain
LK|Sri Lanka
SD|Sudan
SR|Suriname
SE|Sweden
CH|Switzerland
SY|Syria
TW|Taiwan
TJ|Tajikistan
TZ|Tanzania|United Republic of Tanzania
TH|Thailand
TL|Timor-Leste|East Timor
TG|Togo
TO|Tonga
TT|Trinidad and Tobago
TN|Tunisia
TR|Türkiye|Turkey
TM|Turkmenistan
TV|Tuvalu
UG|Uganda
UA|Ukraine
AE|United Arab Emirates|UAE,Emirates
GB|United Kingdom|UK,England,Scotland,Wales,Britain,Great Britain,Northern Ireland
US|United States|USA,America,United States of America,US
UY|Uruguay
UZ|Uzbekistan
VU|Vanuatu
VA|Vatican City|Vatican,Holy See
VE|Venezuela
VN|Vietnam
YE|Yemen
ZM|Zambia
ZW|Zimbabwe
x-kurdish|Kurdish|Kurd,Kurdistan|☀️
x-tibetan|Tibetan|Tibet|🏔️
x-uyghur|Uyghur|Uighur|🌙
x-native-american|Native American|American Indian,Indigenous American,First Nations,Navajo,Cherokee,Lakota,Apache|🪶
x-alaska-native|Alaska Native|Inupiat,Yupik|🐻‍❄️
x-native-hawaiian|Native Hawaiian|Hawaiian,Pacific Islander|🌺
x-aboriginal-australian|Aboriginal Australian|Aboriginal,Torres Strait Islander|🪃
x-maori|Māori|Maori|🌿
x-inuit|Inuit|Eskimo|🧊
x-sami|Sámi|Sami,Lapp|🦌
x-romani|Romani|Roma,Gypsy,Traveller|🎻
x-hmong|Hmong|Mong|🧵
x-karen|Karen|Kayin|🐘
x-rohingya|Rohingya||🤲
x-amazigh|Amazigh|Berber,Tuareg|🏜️
x-assyrian|Assyrian|Chaldean,Syriac|🕊️
x-yazidi|Yazidi|Yezidi|🌅
x-bedouin|Bedouin|Beduin|🐪
x-pashtun|Pashtun|Pathan,Pakhtun|⛰️
x-hazara|Hazara||⛰️
x-basque|Basque|Euskal|🧩
x-maasai|Maasai|Masai|🦁
x-tamil|Tamil|Tamil Eelam|🪔
x-diaspora|Mixed or multiple backgrounds|Mixed,Multiracial,Not sure|🌐`;
const plainName = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
const COUNTRIES = COUNTRY_RAW.split("\n").map((line) => {
  const [code, name, aliases = ""] = line.split("|");
  return { name, terms: [name, ...(aliases ? aliases.split(",") : [])].map(plainName) };
});
function canonicalCountry(text) {
  const t = plainName(text);
  if (!t) return "";
  return COUNTRIES.find((c) => c.terms.includes(t))?.name ?? text;
}

// ---------- Actions ----------

const actions = {
  // The countries and people groups the whole team has talked to, with how many conversations
  // each. Country names and counts only: no people, no notes, no photos. The Notion tracker page
  // embeds a map built from this.
  async teamCountries() {
    const rows = await query(DB.interactions, { filter: { property: "Background / nation", rich_text: { is_not_empty: true } } }, 2000);
    const counts = new Map();
    for (const r of rows) {
      if (P.select(r, "Status") === "Sent back") continue;
      const name = canonicalCountry(P.text(r, "Background / nation").trim());
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return { countries: [...counts].map(([name, count]) => ({ name, count })).sort((x, y) => y.count - x.count) };
  },

  // Names for the sign-in screen. Only names and teams; never codes.
  async players() {
    const teams = await loadTeams();
    const players = await loadPlayers(teams);
    return { players: players.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, team: p.teamName })) };
  },

  async login(_req, body) {
    const teams = await loadTeams();
    const players = await loadPlayers(teams);
    const p = players.find((x) => x.id === clean(str(body.id, 40)) && x.active);
    const fail = () => new HttpError(401, "That name and code didn't match.");
    if (!p || !p.code) throw fail();
    if (p.lockedUntil && new Date(p.lockedUntil) > new Date()) {
      throw new HttpError(429, "Too many tries. Please wait a few minutes.");
    }
    if (str(body.code, 40) !== p.code) {
      const failures = p.failures + 1;
      await patchPlayer(p.id, {
        "Failed Sign-ins": W.num(failures),
        "Locked Until": W.date(
          failures >= LOCK_AFTER ? new Date(Date.now() + LOCK_MINUTES * 60000).toISOString() : "",
        ),
      });
      throw fail();
    }
    if (p.failures) await patchPlayer(p.id, { "Failed Sign-ins": W.num(0), "Locked Until": W.date("") });
    return { token: await makeSession(p.id), me: publicMe(p) };
  },

  async bootstrap(req) {
    const { me, players, teams } = await requireUser(req);
    const challenges = await loadChallenges();
    return {
      me: publicMe(me),
      challenges,
      players: players.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, team: p.teamName, teamId: p.teamId })),
      teams: teams.filter((t) => t.active),
      seasonStart: SEASON_START,
    };
  },

  async home(req) {
    const { me, players, teams } = await requireUser(req);
    const challenges = await loadChallenges();
    const mine = await myInteractions(me.id);
    const prayerOutcomes = ["Prayed together", "Healing reported", "Said yes to Jesus"];
    const nations = [...new Set(mine.map((i) => i.nation.trim()).filter(Boolean).map((s) => s.toLowerCase()))];
    const places = [...new Set(mine.map((i) => i.place).filter(Boolean))];
    const giftCounts = {};
    for (const i of mine) {
      if (i.status === "Pending") continue;
      const g = challenges.find((c) => c.id === i.challengeId)?.gift;
      if (g) giftCounts[g] = (giftCounts[g] ?? 0) + 1;
    }
    const out = {
      me: publicMe(me),
      points: me.points,
      level: levelOf(me.points),
      toNext: POINTS_PER_LEVEL - (me.points % POINTS_PER_LEVEL),
      streak: streakOf(mine.map((i) => i.when), today()),
      conversations: mine.length,
      prayedFor: mine.filter((i) => prayerOutcomes.includes(i.outcome)).length,
      needFollowUp: mine.filter((i) => i.followUp && i.fuStatus !== "Done").length,
      pending: mine.filter((i) => i.status === "Pending").length,
      nations: mine.filter((i) => i.stamp.includes("nation")).map((i) => i.nation),
      places: mine.filter((i) => i.stamp.includes("place")).map((i) => i.place),
      nationCount: nations.length,
      placeCount: places.length,
      gifts: giftCounts,
      done: [...new Set(mine.map((i) => i.challengeId).filter(Boolean))],
    };
    if (isLeader(me)) out.quiet = (await quietPlayers(me, players, 7)).length;
    return out;
  },

  async log(req, body) {
    const { me, players, teams } = await requireUser(req);
    const now = today();
    const challenges = await loadChallenges();
    const ch = body.challengeId ? challenges.find((c) => c.id === clean(str(body.challengeId, 40))) : null;
    if (body.challengeId && !ch) throw new HttpError(400, "That challenge isn't available.");

    const input = {
      contactName: str(body.contactName, 80),
      contactPhone: str(body.contactPhone, 40),
      nation: canonicalCountry(str(body.nation, 80)),
      place: str(body.place, 40),
      outcome: str(body.outcome, 40),
      light: str(body.light, 20),
      need: str(body.need, 2000),
      followUp: !!body.followUp,
    };
    if (ch?.passport === "Nations" && !input.nation) throw new HttpError(400, "Pick the person's country for the passport.");
    if (ch?.passport === "Places" && !input.place) throw new HttpError(400, "Pick the kind of place for the passport.");
    const needsPhoto = ch && ch.proof === "Photo";
    if (needsPhoto && !body.photo?.data) throw new HttpError(400, "This challenge needs a photo.");

    const prior = await myInteractions(me.id);
    const forThis = ch ? prior.filter((i) => i.challengeId === ch.id) : prior.filter((i) => !i.challengeId);
    const limit = ch ? parseLimit(ch.limit) : { n: GENERIC_CONVERSATION_PER_DAY, per: "day" };
    const capped = limitReached(limit, forThis, input, now);

    // Passport stamps: first time this season for a background / kind of place.
    const sameNation = input.nation && prior.some((i) => i.nation.toLowerCase() === input.nation.toLowerCase());
    const samePlace = input.place && prior.some((i) => i.place === input.place);
    const newNation = !!input.nation && !sameNation;
    const newPlace = !!input.place && !samePlace;

    const streak = streakOf(prior.map((i) => i.when), now) + 1;
    let base = capped ? 0 : ch ? ch.points : GENERIC_CONVERSATION_POINTS;
    if (base && streak >= STREAK_DAYS_FOR_BONUS) base = Math.round(base * STREAK_MULTIPLIER);
    const bonus = (newNation ? NEW_STAMP_BONUS : 0) + (newPlace ? NEW_STAMP_BONUS : 0);
    const total = base + bonus;
    const pending = ch?.proof === "Leader approval";
    const status = pending ? "Pending" : "Auto-approved";

    const photo = body.photo?.data ? await uploadPhoto(body.photo) : null;
    const lat = num(body.lat);
    const lng = num(body.lng);
    const stampWords = [newNation ? "nation" : "", newPlace ? "place" : ""].filter(Boolean).join(",");

    const props = {
      Summary: W.title(`${me.name}: ${ch?.title ?? "Conversation"}`),
      Player: W.rel([me.id]),
      When: W.date(now),
      Status: W.select(status),
      Points: W.num(total),
      "Contact first name": W.text(input.contactName),
      "Contact phone": W.phone(input.contactPhone),
      "Background / nation": W.text(input.nation),
      "Place type": W.select(input.place),
      Outcome: W.select(input.outcome),
      Light: W.select(input.light),
      "Need / prayer request": W.text(input.need),
      "Needs follow-up": W.check(input.followUp),
      "Follow-up status": W.select(input.followUp ? "Open" : ""),
      "Passport stamp": W.text(stampWords),
      ...(ch ? { Challenge: W.rel([ch.id]) } : {}),
      ...(photo ? { Photo: { files: [{ name: photo.name, type: "file_upload", file_upload: { id: photo.id } }] } } : {}),
      ...(lat != null && lng != null
        ? {
          Latitude: W.num(lat),
          Longitude: W.num(lng),
          "Map link": W.url(`https://www.google.com/maps?q=${lat},${lng}`),
        }
        : {}),
    };
    await notion("/pages", "POST", { parent: { database_id: DB.interactions }, properties: props });

    const award = pending ? 0 : total;
    await patchPlayer(me.id, {
      "Season points": W.num(me.points + award),
      "Streak (days)": W.num(streak),
      "Last active": W.date(now),
      "Check-in": W.select("Doing great"),
      ...(newNation ? { "Nations stamped": W.num(me.nations + 1) } : {}),
      ...(newPlace ? { "Places stamped": W.num(me.places + 1) } : {}),
    });

    // A short, private-by-design note for the team feed: no names of contacts.
    if (me.teamId && !pending && total > 0) {
      const what = ch ? ch.title : "a conversation";
      await postMessage(`team:${me.teamId}`, null, `${me.name} earned +${total} · ${what}`).catch(() => {});
    }
    return {
      points: award,
      pending,
      capped,
      bonus,
      newNation,
      newPlace,
      streak,
      message: pending
        ? "Sent to your leader. Points are added when it's approved."
        : capped
          ? `Logged. You've reached the limit for this challenge, so no challenge points this time${bonus ? `, but +${bonus} for the passport` : ""}.`
          : `+${total} points!`,
    };
  },

  async interactions(req, body) {
    const { me, players } = await requireUser(req);
    const byId = new Map(players.map((p) => [p.id, p]));
    const scope = body.scope === "me" ? "me" : "team";
    const days = Math.min(Math.max(Number(body.days) || 30, 1), 365);
    const since = addDays(today(), -days);
    const filters = [{ property: "When", date: { on_or_after: since } }];
    if (scope === "me") filters.push({ property: "Player", relation: { contains: me.id } });
    const rows = (await query(DB.interactions, { filter: { and: filters }, sorts: [{ property: "When", direction: "descending" }] }, 600))
      .map(shapeInteraction)
      .filter((i) => i.status !== "Sent back");
    const visibleToTeam = (i) => {
      if (isAdmin(me)) return true;
      const owner = byId.get(i.playerId);
      return owner && (owner.teamId === me.teamId || owner.id === me.id);
    };
    const mapped = rows.filter(visibleToTeam).map((i) => {
      const full = canSeeContact(me, i, byId);
      const i2 = full ? i : redact(i);
      return { ...i2, playerName: byId.get(i.playerId)?.name ?? "", canSee: full };
    });
    return { interactions: mapped };
  },

  async followups(req) {
    const { me, players } = await requireUser(req);
    const byId = new Map(players.map((p) => [p.id, p]));
    const rows = (await query(DB.interactions, { filter: { property: "Needs follow-up", checkbox: { equals: true } }, sorts: [{ property: "When", direction: "descending" }] }, 300))
      .map(shapeInteraction)
      .filter((i) => canSeeContact(me, i, byId));
    return {
      followups: rows.map((i) => ({ ...i, playerName: byId.get(i.playerId)?.name ?? "", assignedName: byId.get(i.assignedTo)?.name ?? "" })),
    };
  },

  async updateFollowup(req, body) {
    const { me, players } = await requireUser(req);
    const byId = new Map(players.map((p) => [p.id, p]));
    if (!isId(body.id)) throw new HttpError(400, "Missing follow-up.");
    const page = await notion(`/pages/${body.id}`);
    const i = shapeInteraction(page);
    if (!canSeeContact(me, i, byId)) throw new HttpError(403, "That one isn't yours to change.");
    const props = {};
    if (["Open", "In progress", "Done"].includes(body.status)) props["Follow-up status"] = W.select(body.status);
    if (body.assignedTo !== undefined) {
      if (!isLeader(me)) throw new HttpError(403, "Only leaders can assign follow-ups.");
      props["Assigned to"] = W.rel(isId(body.assignedTo) ? [body.assignedTo] : []);
    }
    if (typeof body.notes === "string") props["Follow-up notes"] = W.text(str(body.notes, 3000));
    await notion(`/pages/${body.id}`, "PATCH", { properties: props });
    return { ok: true };
  },

  async approvals(req) {
    const { me, players } = await requireUser(req);
    if (!isLeader(me)) throw new HttpError(403, "Leaders only.");
    const byId = new Map(players.map((p) => [p.id, p]));
    const rows = (await query(DB.interactions, { filter: { property: "Status", select: { equals: "Pending" } }, sorts: [{ property: "When", direction: "descending" }] }, 100))
      .map(shapeInteraction)
      .filter((i) => isAdmin(me) || byId.get(i.playerId)?.teamId === me.teamId);
    const challenges = await loadChallenges();
    return {
      approvals: rows.map((i) => ({
        ...i,
        playerName: byId.get(i.playerId)?.name ?? "",
        challengeTitle: challenges.find((c) => c.id === i.challengeId)?.title ?? "",
      })),
    };
  },

  async review(req, body) {
    const { me, players } = await requireUser(req);
    if (!isLeader(me)) throw new HttpError(403, "Leaders only.");
    if (!isId(body.id)) throw new HttpError(400, "Missing item.");
    const byId = new Map(players.map((p) => [p.id, p]));
    const i = shapeInteraction(await notion(`/pages/${body.id}`));
    const owner = byId.get(i.playerId);
    if (!owner || (!isAdmin(me) && owner.teamId !== me.teamId)) throw new HttpError(403, "That one is on another team.");
    if (i.status !== "Pending") throw new HttpError(409, "That was already reviewed.");
    const approve = body.decision === "approve";
    await notion(`/pages/${body.id}`, "PATCH", {
      properties: { Status: W.select(approve ? "Approved" : "Sent back"), "Review note": W.text(str(body.note, 1000)) },
    });
    if (approve) {
      await patchPlayer(owner.id, { "Season points": W.num(owner.points + i.points) });
      if (owner.teamId) await postMessage(`team:${owner.teamId}`, null, `${owner.name} earned +${i.points} · approved ✓`).catch(() => {});
    } else {
      await postMessage(`dm:${[me.id, owner.id].sort().join(":")}`, me, str(body.note, 500) || "I sent one of your logs back. Let's talk about it!").catch(() => {});
    }
    return { ok: true };
  },

  async leaderboard(req) {
    const { me, players, teams } = await requireUser(req);
    const active = players.filter((p) => p.active);
    const people = active
      .map((p) => ({ id: p.id, name: p.name, team: p.teamName, points: p.points, level: levelOf(p.points), you: p.id === me.id }))
      .sort((a, b) => b.points - a.points);
    const teamRows = teams
      .filter((t) => t.active)
      .map((t) => {
        const members = active.filter((p) => p.teamId === t.id);
        return { id: t.id, name: t.name, members: members.length, points: members.reduce((s, p) => s + p.points, 0), yours: t.id === me.teamId };
      })
      .sort((a, b) => b.points - a.points);
    return { people, teams: teamRows };
  },

  // ----- Leader check-ins -----
  async nudges(req, body) {
    const { me, players } = await requireUser(req);
    if (!isLeader(me)) throw new HttpError(403, "Leaders only.");
    let days = Number(body.days);
    if (body.days === undefined) days = Number(await kvGet(me.id, "nudgeDays", 7));
    else await kvSet(me.id, "nudgeDays", [3, 5, 7, 14].includes(days) ? days : 7);
    if (![3, 5, 7, 14].includes(days)) days = 7;
    const quiet = await quietPlayers(me, players, days);
    // Keep the Notion "Check-ins" view current.
    for (const q of quiet) {
      if (!q.checkin || q.checkin === "Doing great") await patchPlayer(q.id, { "Check-in": W.select("Quiet 7+ days") }).catch(() => {});
    }
    return { days, quiet: quiet.map((q) => ({ id: q.id, name: q.name, team: q.teamName, lastActive: q.lastActive, daysQuiet: q.daysQuiet })) };
  },

  async nudgeAction(req, body) {
    const { me, players } = await requireUser(req);
    if (!isLeader(me)) throw new HttpError(403, "Leaders only.");
    const target = players.find((p) => p.id === clean(str(body.id, 40)));
    if (!target || (!isAdmin(me) && target.teamId !== me.teamId)) throw new HttpError(403, "That player isn't on your team.");
    const action = body.action;
    if (action === "encourage") {
      const text = str(body.text, 500) || `Hey ${target.name.split(" ")[0]}, thinking of you! No pressure, just checking in.`;
      await postMessage(`dm:${[me.id, target.id].sort().join(":")}`, me, text);
      await patchPlayer(target.id, { "Check-in": W.select("Reached out") });
    } else if (action === "pray") {
      await patchPlayer(target.id, { "Check-in": W.select("Reached out") });
    } else if (action === "snooze") {
      await patchPlayer(target.id, { "Check-in": W.select("Snoozed") });
    } else throw new HttpError(400, "Unknown action.");
    return { ok: true };
  },

  // ----- Journey: personal goals, bests, buddy, cheers -----
  async journey(req) {
    const { me, players } = await requireUser(req);
    const now = today();
    const mine = await myInteractions(me.id);
    const wk = weekStart(now);
    const goals = await kvGet(me.id, "goals", [
      { metric: "conversations", target: 10 },
      { metric: "prayers", target: 5 },
      { metric: "nations", target: 2 },
    ]);
    const progress = goals.map((g) => ({ ...g, done: metricCount(g.metric, mine.filter((i) => i.when.slice(0, 10) >= wk)) }));
    // Personal bests
    const byWeek = {};
    const byDay = {};
    for (const i of mine) {
      if (i.status === "Pending") continue;
      const w = weekStart(i.when.slice(0, 10));
      byWeek[w] = (byWeek[w] ?? 0) + i.points;
      const d = i.when.slice(0, 10);
      byDay[d] = (byDay[d] ?? 0) + 1;
    }
    const thisWeek = byWeek[wk] ?? 0;
    const bestWeek = Math.max(0, ...Object.values(byWeek));
    const bests = { bestWeek, thisWeek, bestDay: Math.max(0, ...Object.values(byDay)), streak: streakOf(mine.map((i) => i.when), now) };
    // Buddy
    let buddy = await kvGet(me.id, "buddy", null);
    let buddyOut = null;
    if (buddy && buddy.end >= now) {
      const other = players.find((p) => p.id === buddy.buddyId);
      const theirs = await myInteractions(buddy.buddyId, buddy.start);
      const mineSince = mine.filter((i) => i.when.slice(0, 10) >= buddy.start);
      const a = metricCount(buddy.metric, mineSince);
      const b = metricCount(buddy.metric, theirs);
      buddyOut = { ...buddy, buddyName: other?.name ?? "Your buddy", me: a, them: b, total: a + b };
    } else if (buddy) buddy = null;
    const invite = await kvGet(me.id, "buddyInvite", null);
    const cheers = await kvGet(me.id, "cheers", []);
    return { goals: progress, bests, buddy: buddyOut, invite, cheers: cheers.slice(0, 10) };
  },

  async setGoals(req, body) {
    const { me } = await requireUser(req);
    const metrics = ["conversations", "prayers", "nations", "places", "points"];
    const goals = (Array.isArray(body.goals) ? body.goals : [])
      .filter((g) => metrics.includes(g.metric))
      .slice(0, 5)
      .map((g) => ({ metric: g.metric, target: Math.min(Math.max(Math.round(Number(g.target) || 1), 1), 500) }));
    await kvSet(me.id, "goals", goals);
    return { ok: true };
  },

  async inviteBuddy(req, body) {
    const { me, players } = await requireUser(req);
    const other = players.find((p) => p.id === clean(str(body.buddyId, 40)) && p.active && p.id !== me.id);
    if (!other) throw new HttpError(400, "Pick a teammate.");
    const days = Math.min(Math.max(Number(body.days) || 7, 1), 60);
    const metric = ["conversations", "prayers", "nations", "places", "points"].includes(body.metric) ? body.metric : "conversations";
    const target = Math.min(Math.max(Math.round(Number(body.target) || 20), 1), 1000);
    await kvSet(other.id, "buddyInvite", {
      fromId: me.id,
      fromName: me.name,
      metric,
      target,
      days,
      celebrate: str(body.celebrate, 100),
    });
    return { ok: true };
  },

  async answerBuddy(req, body) {
    const { me, players } = await requireUser(req);
    const invite = await kvGet(me.id, "buddyInvite", null);
    if (!invite) throw new HttpError(404, "No invite.");
    await kvSet(me.id, "buddyInvite", null);
    if (body.accept) {
      const start = today();
      const end = addDays(start, invite.days);
      await kvSet(me.id, "buddy", { buddyId: invite.fromId, metric: invite.metric, target: invite.target, start, end, celebrate: invite.celebrate });
      await kvSet(invite.fromId, "buddy", { buddyId: me.id, metric: invite.metric, target: invite.target, start, end, celebrate: invite.celebrate });
    }
    return { ok: true };
  },

  async cheer(req, body) {
    const { me, players } = await requireUser(req);
    const to = players.find((p) => p.id === clean(str(body.toId, 40)) && p.active);
    if (!to) throw new HttpError(400, "Pick someone to cheer.");
    const kind = ["cheer", "pray"].includes(body.kind) ? body.kind : "cheer";
    const text = str(body.text, 140) || (kind === "pray" ? "is praying for you 🙏" : "is cheering you on 👏");
    const list = await kvGet(to.id, "cheers", []);
    list.unshift({ from: me.name, kind, text, at: new Date().toISOString() });
    await kvSet(to.id, "cheers", list.slice(0, 30));
    return { ok: true };
  },

  // ----- Chat -----
  async threads(req) {
    const { me, players } = await requireUser(req);
    const rows = await sb(
      `go_messages?or=(thread.eq.all,thread.eq.team:${me.teamId || "none"},thread.like.dm:*${me.id}*)&order=created_at.desc&limit=300&select=thread,sender_name,body,created_at`,
    );
    const last = {};
    for (const r of rows ?? []) if (!last[r.thread]) last[r.thread] = r;
    const threads = [];
    const add = (id, title, kind) => threads.push({ id, title, kind, last: last[id] ?? null });
    if (me.teamId) add(`team:${me.teamId}`, me.teamName, "team");
    add("all", "Everyone · Announcements", "all");
    for (const id of Object.keys(last)) {
      if (!id.startsWith("dm:")) continue;
      const otherId = id.slice(3).split(":").find((x) => x !== me.id);
      add(id, players.find((p) => p.id === otherId)?.name ?? "Teammate", "dm");
    }
    threads.sort((a, b) => (b.last?.created_at ?? "").localeCompare(a.last?.created_at ?? ""));
    return { threads };
  },

  async messages(req, body) {
    const { me } = await requireUser(req);
    const thread = canUseThread(me, str(body.thread, 120));
    const after = Number(body.after) || 0;
    const rows = await sb(
      `go_messages?thread=eq.${encodeURIComponent(thread)}&id=gt.${after}&order=id.asc&limit=100&select=id,sender_id,sender_name,body,created_at`,
    );
    return { messages: rows ?? [] };
  },

  async send(req, body) {
    const { me } = await requireUser(req);
    const thread = canUseThread(me, str(body.thread, 120));
    const text = str(body.text, 2000);
    if (!text) throw new HttpError(400, "Write something first.");
    if (thread === "all" && !isLeader(me)) throw new HttpError(403, "Only leaders post to Announcements.");
    await postMessage(thread, me, text);
    return { ok: true };
  },

  async startDm(req, body) {
    const { me, players } = await requireUser(req);
    const other = players.find((p) => p.id === clean(str(body.id, 40)) && p.active && p.id !== me.id);
    if (!other) throw new HttpError(400, "Pick someone.");
    return { thread: `dm:${[me.id, other.id].sort().join(":")}`, title: other.name };
  },
};

function canUseThread(me, thread) {
  if (thread === "all") return thread;
  if (thread === `team:${me.teamId}` && me.teamId) return thread;
  if (thread.startsWith("dm:") && thread.slice(3).split(":").includes(me.id)) return thread;
  throw new HttpError(403, "That chat isn't yours.");
}

function metricCount(metric, items) {
  const ok = items.filter((i) => i.status !== "Pending");
  if (metric === "conversations") return ok.length;
  if (metric === "prayers") return ok.filter((i) => ["Prayed together", "Healing reported", "Said yes to Jesus"].includes(i.outcome)).length;
  if (metric === "nations") return ok.filter((i) => i.stamp.includes("nation")).length;
  if (metric === "places") return ok.filter((i) => i.stamp.includes("place")).length;
  if (metric === "points") return ok.reduce((s, i) => s + i.points, 0);
  return 0;
}

async function quietPlayers(me, players, days) {
  const now = today();
  return players
    .filter((p) => p.active && p.id !== me.id && (isAdmin(me) || p.teamId === me.teamId))
    .map((p) => ({ ...p, daysQuiet: p.lastActive ? daysBetween(p.lastActive.slice(0, 10), now) : 999 }))
    .filter((p) => p.daysQuiet >= days && !["Snoozed", "Reached out"].includes(p.checkin))
    .sort((a, b) => b.daysQuiet - a.daysQuiet);
}

function publicMe(p) {
  return { id: p.id, name: p.name, role: p.role, teamId: p.teamId, teamName: p.teamName, solo: p.solo };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  try {
    if (!TOKEN) throw new HttpError(500, "The Notion secret isn't set on the server yet.");
    const body = await req.json().catch(() => ({}));
    const handler = Object.prototype.hasOwnProperty.call(actions, body.action) ? actions[body.action] : null;
    if (!handler) throw new HttpError(400, "Unknown action.");
    return json(await handler(req, body));
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status);
    console.error(e);
    return json({ error: "Something went wrong on the server." }, 500);
  }
});
