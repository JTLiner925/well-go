# Well Go

An encouraging evangelism game for The Well's missions teams. Phone-first web app.
Players log conversations, earn points from easy-to-hard challenges, stamp a Nations and
a Places Passport, discover spiritual gifts, cheer each other on, and give leaders a
follow-up list they can act on.

Standalone: it has its own sign-in codes and its own data. It does not share anything
with Gospel Tracker.

## How it fits together

| Piece | Where | What it does |
| --- | --- | --- |
| `index.html`, `app.js`, `styles.css` | GitHub Pages (static) | The screens. Holds no data and no secrets. |
| `supabase/functions/go/index.ts` | Supabase Edge Function | The only thing that talks to Notion. Holds the Notion secret. |
| Teams, Players, Challenges, Interactions | Notion (**Well Go: Home Base**) | People, interactions, follow-ups, photos, approvals, the challenge list. |
| `go_messages`, `go_kv` | Supabase tables (`supabase/schema.sql`) | Chat, and tiny per-person settings (weekly goals, buddy, cheers). |

With `API_URL` empty in `config.js` the app runs in **demo mode** with made-up people.
The code for everyone in demo mode is `1234`.

## What's in it

- **Challenges** (46 to start) from Easy to Legendary. Easy is instant, Medium needs a photo,
  Hard and Legendary need a leader to approve. Every challenge has a limit (for example 3 a day)
  so points can't be spammed. Edit them in the Notion **Challenges** database.
- **Passports**: a new nation or a new kind of place earns a stamp and +10.
- **Spiritual gifts**: gift challenges and a Gifts Discovery card.
- **Log**: one form records the person, their need, a photo, GPS, and a follow-up flag.
  If there's no signal the log is saved on the phone and sent later.
- **Map** of the team's interactions (OpenStreetMap), with follow-ups and "said yes" pins.
- **Ranks**: people and team leaderboards, plus **My Journey** (weekly goals, personal bests,
  a cooperative buddy goal, cheers). There are no head-to-head duels.
- **Chat**: team chat, an announcements channel (leaders post), and direct messages.
- **Leader tools**: check-in nudges when someone has been quiet, photo and approval queue,
  assign follow-ups.

## Who can see what

- A contact's name, phone, need, and photo are visible to: the person who logged it, the leader
  of their team, admins, and whoever the follow-up is assigned to. Teammates see only points,
  pins on the map, and the short "earned +N" line in the team chat.
- Roles are set in the Notion **Players** database: Player, Team leader, Admin.
- Access is checked against Notion on every request. Untick **Active** on a Player and they are out at once.

## Adding someone

In Notion → **Well Go: Home Base** → **Players**, add a row: name, **Role**, **Team**, tick
**Active**, and give them a 6-digit **App Code**. They pick their name in the app and enter the code.
Five wrong codes locks that person out for 15 minutes.

## Going live (one time)

1. **Notion secret.** The Notion workspace owner creates (or shares) an Internal Integration,
   copies its secret (starts with `ntn_`), and under the integration's *Access* tab connects it to
   the **Well Go: Home Base** page. Never paste the secret into this repo.
2. **Lock down the Notion page.** Home Base sits inside The Well Missions Main Page, so it inherits
   that page's access. In Notion, open Home Base → **Share** → restrict it to admins and team leaders
   before any real contact details are added.
3. **Supabase tables.** In the Supabase SQL editor, run `supabase/schema.sql`.
4. **Supabase function.**
   - Edge Functions → **Secrets** → add `NOTION_TOKEN` with the secret from step 1.
   - Edge Functions → **Deploy a new function** → **Via Editor**, name it exactly `go`, paste all of
     `supabase/functions/go/index.ts`, and deploy.
   - Open the `go` function's settings and turn **Verify JWT** off. The app has its own sign-in codes.
5. **Point the app at it.** In `config.js` set `API_URL` to
   `https://<your-project>.supabase.co/functions/v1/go`, then commit and push.
6. **Add your people** in the Notion Players database (above).

Each season, update `SEASON_START` in the function and `SEASON_LABEL` in `config.js`.

## Not built yet

- Team-challenge bonus (+20% to every member) is documented but not calculated.
- Seasons beyond "this season": all-time rankings and event leaderboards.
- Badges are shown as progress (passports, gift bars) but not awarded as separate items.
- Push notifications. Nudges appear in the app (and in the Notion Check-ins view).
- The server function has not yet been run against live Notion; expect small fixes on first connect.
