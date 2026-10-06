// Demo mode: a stand-in for the Edge Function so the app can be tried with made-up
// people. It answers the same requests with the same shapes. Nothing leaves the phone.
import { CHALLENGES } from './mock-data.js';

const KEY = 'wg.mock.v1';
const TODAY = () => new Date().toISOString().slice(0, 10);
const daysAgo = (n) => new Date(Date.now() - n * 864e5).toISOString().slice(0, 10);

const TEAMS = [
  { id: 't1', name: 'Team Austin 🤠', active: true },
  { id: 't2', name: 'Launch Squad 🚀', active: true },
];

function seed() {
  const players = [
    { id: 'p1', name: 'Jordan T.', role: 'Admin', teamId: 't1', points: 1240, streak: 6, lastActive: TODAY(), checkin: 'Doing great', solo: false },
    { id: 'p2', name: 'Mia Torres', role: 'Team leader', teamId: 't1', points: 1810, streak: 9, lastActive: TODAY(), checkin: 'Doing great', solo: false },
    { id: 'p3', name: 'Dan Reyes', role: 'Player', teamId: 't1', points: 1675, streak: 4, lastActive: daysAgo(1), checkin: 'Doing great', solo: false },
    { id: 'p4', name: 'Priya S.', role: 'Team leader', teamId: 't2', points: 1190, streak: 2, lastActive: daysAgo(2), checkin: 'Doing great', solo: false },
    { id: 'p5', name: 'Caleb W.', role: 'Player', teamId: 't2', points: 1020, streak: 0, lastActive: daysAgo(8), checkin: '', solo: false },
    { id: 'p6', name: 'Hannah L.', role: 'Player', teamId: 't1', points: 870, streak: 0, lastActive: daysAgo(9), checkin: '', solo: false },
    { id: 'p7', name: 'Sam O.', role: 'Player', teamId: '', points: 640, streak: 0, lastActive: daysAgo(11), checkin: '', solo: true },
  ];
  const mk = (id, playerId, ch, daysBack, o) => ({
    id, playerId, challengeId: ch, when: daysAgo(daysBack), status: 'Auto-approved', points: 20, photos: [], contactName: '',
    contactPhone: '', nation: '', place: '', outcome: 'Friendly chat', light: '', need: '', followUp: false, fuStatus: '',
    assignedTo: '', fuNotes: '', lat: null, lng: null, stamp: '', reviewNote: '', ...o,
  });
  const interactions = [
    mk('i1', 'p1', '1', 0, { contactName: 'Marcus', outcome: 'Healing reported', light: 'Yellow', need: 'Lower back pain', followUp: true, fuStatus: 'Open', lat: 30.2672, lng: -97.7431, nation: 'Mexican', stamp: 'nation', place: 'Park', points: 45 }),
    mk('i2', 'p1', '', 1, { contactName: 'Amina', outcome: 'Prayed together', light: 'Green', need: 'New in Austin, wants a church', followUp: true, fuStatus: 'Open', lat: 30.2711, lng: -97.7437, nation: 'Somali', stamp: 'nation', points: 20 }),
    mk('i3', 'p2', '8', 1, { contactName: 'Tran', outcome: 'Said yes to Jesus', light: 'Green', need: 'Needs a Bible and a mentor', followUp: true, fuStatus: 'In progress', assignedTo: 'p2', lat: 30.2655, lng: -97.7465, nation: 'Vietnamese', stamp: 'nation', points: 60 }),
    mk('i4', 'p3', '', 2, { contactName: 'Gloria', outcome: 'Prayed together', light: 'Believer', need: "Son's job search", followUp: true, fuStatus: 'Open', lat: 30.2689, lng: -97.7389, points: 10 }),
    mk('i5', 'p3', '', 3, { outcome: 'Not interested', light: 'Red', lat: 30.2640, lng: -97.7412, points: 10 }),
    mk('i6', 'p6', '19', 2, { status: 'Pending', points: 120, outcome: 'Heard the gospel', lat: 30.2701, lng: -97.7501 }),
    mk('i7', 'p5', '10', 3, { status: 'Pending', points: 100, outcome: 'Prayed together', lat: 30.2632, lng: -97.7477 }),
  ];
  const messages = [
    { id: 1, thread: 'team:t1', sender_id: 'p2', sender_name: 'Mia Torres', body: 'Heading out to Congress Ave, who is in?', created_at: new Date(Date.now() - 3 * 3600e3).toISOString() },
    { id: 2, thread: 'team:t1', sender_id: 'p3', sender_name: 'Dan Reyes', body: 'On my way 🙌', created_at: new Date(Date.now() - 2.9 * 3600e3).toISOString() },
    { id: 3, thread: 'team:t1', sender_id: 'system', sender_name: 'Well Go', body: 'Mia Torres earned +50 · Pray for healing', created_at: new Date(Date.now() - 2 * 3600e3).toISOString() },
    { id: 4, thread: 'all', sender_id: 'p2', sender_name: 'Mia Torres', body: 'Blitz starts at 9! Meet at the Well. Bring water bottles.', created_at: new Date(Date.now() - 20 * 3600e3).toISOString() },
  ];
  return { players, interactions, messages, kv: {}, nextId: 100, nextMsg: 10 };
}

let db;
try { db = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { db = null; }
if (!db) db = seed();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* ignore */ } };

const level = (p) => Math.floor(p / 300) + 1;
const teamName = (id) => TEAMS.find((t) => t.id === id)?.name ?? '';
const P = (id) => db.players.find((p) => p.id === id);
const me = (s) => P(s?.me?.id);
const pub = (p) => ({ id: p.id, name: p.name, role: p.role, teamId: p.teamId, teamName: teamName(p.teamId), solo: p.solo });
const isLeader = (m) => m.role !== 'Player';
const kv = (o, k, d) => db.kv[`${o}|${k}`] ?? d;
const setKv = (o, k, v) => { db.kv[`${o}|${k}`] = v; save(); };
const canSee = (m, i) => i.playerId === m.id || i.assignedTo === m.id || m.role === 'Admin' || (m.role === 'Team leader' && P(i.playerId)?.teamId === m.teamId);
const redact = (i) => ({ ...i, contactName: '', contactPhone: '', need: '', fuNotes: '', photos: [], reviewNote: '' });
const weekStart = () => { const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const metric = (m, items) => {
  const ok = items.filter((i) => i.status !== 'Pending');
  if (m === 'conversations') return ok.length;
  if (m === 'prayers') return ok.filter((i) => ['Prayed together', 'Healing reported', 'Said yes to Jesus'].includes(i.outcome)).length;
  if (m === 'nations') return ok.filter((i) => i.stamp.includes('nation')).length;
  if (m === 'places') return ok.filter((i) => i.stamp.includes('place')).length;
  return ok.reduce((s, i) => s + i.points, 0);
};
const quiet = (m, days) => db.players.filter((p) => p.id !== m.id && (m.role === 'Admin' || p.teamId === m.teamId) &&
  (Date.now() - new Date(p.lastActive) > days * 864e5) && !['Snoozed', 'Reached out'].includes(p.checkin))
  .map((p) => ({ id: p.id, name: p.name, team: teamName(p.teamId), lastActive: p.lastActive, daysQuiet: Math.round((Date.now() - new Date(p.lastActive)) / 864e5) }));
const dm = (a, b) => `dm:${[a, b].sort().join(':')}`;

const A = {
  players: () => ({ players: db.players.map((p) => ({ id: p.id, name: p.name, team: teamName(p.teamId) })) }),
  login: (b) => {
    const p = P(b.id);
    if (!p || b.code !== '1234') throw new Error("That name and code didn't match.");
    return { token: 'demo', me: pub(p) };
  },
  bootstrap: (b, s) => ({
    me: pub(me(s)), challenges: CHALLENGES,
    players: db.players.map((p) => ({ id: p.id, name: p.name, team: teamName(p.teamId), teamId: p.teamId })), teams: TEAMS,
  }),
  home: (b, s) => {
    const m = me(s);
    const mine = db.interactions.filter((i) => i.playerId === m.id);
    const out = {
      me: pub(m), points: m.points, level: level(m.points), toNext: 300 - (m.points % 300), streak: m.streak,
      conversations: mine.length, prayedFor: mine.filter((i) => ['Prayed together', 'Healing reported'].includes(i.outcome)).length,
      needFollowUp: mine.filter((i) => i.followUp && i.fuStatus !== 'Done').length, pending: mine.filter((i) => i.status === 'Pending').length,
      nations: mine.filter((i) => i.stamp.includes('nation')).map((i) => i.nation), places: mine.filter((i) => i.stamp.includes('place')).map((i) => i.place),
      gifts: {}, done: [...new Set(mine.map((i) => i.challengeId).filter(Boolean))],
    };
    for (const i of mine) { const g = CHALLENGES.find((c) => c.id === i.challengeId)?.gift; if (g && i.status !== 'Pending') out.gifts[g] = (out.gifts[g] ?? 0) + 1; }
    if (isLeader(m)) out.quiet = quiet(m, 7).length;
    return out;
  },
  log: (b, s) => {
    const m = me(s);
    const ch = b.challengeId ? CHALLENGES.find((c) => c.id === b.challengeId) : null;
    if (ch?.proof === 'Photo' && !b.photo?.data) throw new Error('This challenge needs a photo.');
    if (ch?.passport === 'Nations' && !b.nation) throw new Error("Add the person's background for the passport.");
    if (ch?.passport === 'Places' && !b.place) throw new Error('Pick the kind of place for the passport.');
    const mine = db.interactions.filter((i) => i.playerId === m.id);
    const newNation = !!b.nation && !mine.some((i) => i.nation.toLowerCase() === b.nation.toLowerCase());
    const newPlace = !!b.place && !mine.some((i) => i.place === b.place);
    const todayN = mine.filter((i) => i.when === TODAY() && i.challengeId === (ch?.id ?? '')).length;
    const capped = ch ? false : todayN >= 5;
    const base = capped ? 0 : ch ? ch.points : 10;
    const bonus = (newNation ? 10 : 0) + (newPlace ? 10 : 0);
    const pending = ch?.proof === 'Leader approval';
    db.interactions.unshift({
      id: `i${db.nextId++}`, playerId: m.id, challengeId: ch?.id ?? '', when: TODAY(), status: pending ? 'Pending' : 'Auto-approved',
      points: base + bonus, photos: [], contactName: b.contactName || '', contactPhone: b.contactPhone || '', nation: b.nation || '', place: b.place || '',
      outcome: b.outcome || '', light: b.light || '', need: b.need || '', followUp: !!b.followUp, fuStatus: b.followUp ? 'Open' : '', assignedTo: '', fuNotes: '',
      lat: b.lat ?? null, lng: b.lng ?? null, stamp: [newNation ? 'nation' : '', newPlace ? 'place' : ''].filter(Boolean).join(','), reviewNote: '',
    });
    if (!pending) m.points += base + bonus;
    m.lastActive = TODAY(); m.checkin = 'Doing great'; m.streak = Math.max(m.streak, 1);
    if (!pending && m.teamId) db.messages.push({ id: db.nextMsg++, thread: `team:${m.teamId}`, sender_id: 'system', sender_name: 'Well Go', body: `${m.name} earned +${base + bonus} · ${ch?.title ?? 'a conversation'}`, created_at: new Date().toISOString() });
    save();
    return { points: pending ? 0 : base + bonus, pending, capped, bonus, newNation, newPlace, message: pending ? "Sent to your leader. Points are added when it's approved." : `+${base + bonus} points!` };
  },
  interactions: (b, s) => {
    const m = me(s);
    let list = db.interactions.filter((i) => i.status !== 'Sent back');
    if (b.scope === 'me') list = list.filter((i) => i.playerId === m.id);
    else if (m.role !== 'Admin') list = list.filter((i) => P(i.playerId)?.teamId === m.teamId);
    return { interactions: list.map((i) => ({ ...(canSee(m, i) ? i : redact(i)), playerName: P(i.playerId)?.name ?? '', canSee: canSee(m, i) })) };
  },
  followups: (b, s) => {
    const m = me(s);
    return { followups: db.interactions.filter((i) => i.followUp && canSee(m, i)).map((i) => ({ ...i, playerName: P(i.playerId)?.name ?? '', assignedName: P(i.assignedTo)?.name ?? '' })) };
  },
  updateFollowup: (b) => {
    const i = db.interactions.find((x) => x.id === b.id);
    if (b.status) i.fuStatus = b.status;
    if (b.assignedTo !== undefined) i.assignedTo = b.assignedTo || '';
    if (typeof b.notes === 'string') i.fuNotes = b.notes;
    save(); return { ok: true };
  },
  approvals: (b, s) => {
    const m = me(s);
    return { approvals: db.interactions.filter((i) => i.status === 'Pending' && (m.role === 'Admin' || P(i.playerId)?.teamId === m.teamId))
      .map((i) => ({ ...i, playerName: P(i.playerId)?.name ?? '', challengeTitle: CHALLENGES.find((c) => c.id === i.challengeId)?.title ?? '' })) };
  },
  review: (b) => {
    const i = db.interactions.find((x) => x.id === b.id);
    i.status = b.decision === 'approve' ? 'Approved' : 'Sent back';
    if (b.decision === 'approve') P(i.playerId).points += i.points;
    save(); return { ok: true };
  },
  leaderboard: (b, s) => {
    const m = me(s);
    const people = db.players.map((p) => ({ id: p.id, name: p.name, team: teamName(p.teamId), points: p.points, level: level(p.points), you: p.id === m.id })).sort((a, c) => c.points - a.points);
    const teams = TEAMS.map((t) => { const ms = db.players.filter((p) => p.teamId === t.id); return { id: t.id, name: t.name, members: ms.length, points: ms.reduce((x, p) => x + p.points, 0), yours: t.id === m.teamId }; }).sort((a, c) => c.points - a.points);
    return { people, teams };
  },
  nudges: (b, s) => {
    const m = me(s);
    const days = [3, 5, 7, 14].includes(Number(b.days)) ? Number(b.days) : kv(m.id, 'nudgeDays', 7);
    if (b.days !== undefined) setKv(m.id, 'nudgeDays', days);
    return { days, quiet: quiet(m, days) };
  },
  nudgeAction: (b, s) => {
    const m = me(s); const t = P(b.id);
    if (b.action === 'encourage') {
      db.messages.push({ id: db.nextMsg++, thread: dm(m.id, t.id), sender_id: m.id, sender_name: m.name, body: b.text || `Hey ${t.name.split(' ')[0]}, thinking of you!`, created_at: new Date().toISOString() });
      t.checkin = 'Reached out';
    } else t.checkin = b.action === 'snooze' ? 'Snoozed' : 'Reached out';
    save(); return { ok: true };
  },
  journey: (b, s) => {
    const m = me(s);
    const mine = db.interactions.filter((i) => i.playerId === m.id && i.when >= weekStart());
    const goals = kv(m.id, 'goals', [{ metric: 'conversations', target: 10 }, { metric: 'prayers', target: 5 }, { metric: 'nations', target: 2 }]);
    let buddy = kv(m.id, 'buddy', null);
    if (!buddy && m.id === 'p1') buddy = { buddyId: 'p2', metric: 'conversations', target: 20, start: daysAgo(4), end: daysAgo(-3), celebrate: 'Coffee together ☕' };
    let bo = null;
    if (buddy) {
      const a = metric(buddy.metric, db.interactions.filter((i) => i.playerId === m.id && i.when >= buddy.start));
      const c = metric(buddy.metric, db.interactions.filter((i) => i.playerId === buddy.buddyId && i.when >= buddy.start));
      bo = { ...buddy, buddyName: P(buddy.buddyId)?.name, me: a + 7, them: c + 6, total: a + c + 13 };
    }
    return {
      goals: goals.map((g) => ({ ...g, done: metric(g.metric, mine) })),
      bests: { bestWeek: 410, thisWeek: 380, bestDay: 9, streak: m.streak },
      buddy: bo, invite: kv(m.id, 'buddyInvite', null),
      cheers: kv(m.id, 'cheers', [{ from: 'Mia', kind: 'cheer', text: 'So proud of that healing story! 👏', at: new Date().toISOString() }, { from: 'Dan', kind: 'pray', text: 'is praying for you 🙏', at: new Date().toISOString() }]),
    };
  },
  setGoals: (b, s) => { setKv(me(s).id, 'goals', b.goals); return { ok: true }; },
  inviteBuddy: (b, s) => { setKv(b.buddyId, 'buddyInvite', { fromId: me(s).id, fromName: me(s).name, metric: b.metric, target: b.target, days: b.days, celebrate: b.celebrate }); return { ok: true }; },
  answerBuddy: (b, s) => {
    const m = me(s); const inv = kv(m.id, 'buddyInvite', null);
    setKv(m.id, 'buddyInvite', null);
    if (b.accept && inv) { const x = { metric: inv.metric, target: inv.target, start: TODAY(), end: daysAgo(-inv.days), celebrate: inv.celebrate }; setKv(m.id, 'buddy', { ...x, buddyId: inv.fromId }); setKv(inv.fromId, 'buddy', { ...x, buddyId: m.id }); }
    return { ok: true };
  },
  cheer: (b, s) => { const l = kv(b.toId, 'cheers', []); l.unshift({ from: me(s).name, kind: b.kind, text: b.text || (b.kind === 'pray' ? 'is praying for you 🙏' : 'is cheering you on 👏'), at: new Date().toISOString() }); setKv(b.toId, 'cheers', l); return { ok: true }; },
  threads: (b, s) => {
    const m = me(s);
    const last = {};
    for (const x of db.messages) if (x.thread === 'all' || x.thread === `team:${m.teamId}` || (x.thread.startsWith('dm:') && x.thread.includes(m.id))) last[x.thread] = x;
    const out = [];
    if (m.teamId) out.push({ id: `team:${m.teamId}`, title: teamName(m.teamId), kind: 'team', last: last[`team:${m.teamId}`] ?? null });
    out.push({ id: 'all', title: 'Everyone · Announcements', kind: 'all', last: last.all ?? null });
    for (const id of Object.keys(last)) if (id.startsWith('dm:')) out.push({ id, title: P(id.slice(3).split(':').find((x) => x !== m.id))?.name ?? 'Teammate', kind: 'dm', last: last[id] });
    return { threads: out };
  },
  messages: (b) => ({ messages: db.messages.filter((x) => x.thread === b.thread && x.id > (b.after || 0)) }),
  send: (b, s) => {
    const m = me(s);
    if (b.thread === 'all' && !isLeader(m)) throw new Error('Only leaders post to Announcements.');
    db.messages.push({ id: db.nextMsg++, thread: b.thread, sender_id: m.id, sender_name: m.name, body: b.text, created_at: new Date().toISOString() });
    save(); return { ok: true };
  },
  startDm: (b, s) => ({ thread: dm(me(s).id, b.id), title: P(b.id).name }),
};

export async function mockApi(action, body, session) {
  await new Promise((r) => setTimeout(r, 120));
  if (!A[action]) throw new Error('Unknown action.');
  return JSON.parse(JSON.stringify(A[action](body, session)));
}
export const demoReset = () => { try { localStorage.removeItem(KEY); } catch { /* ignore */ } location.reload(); };
