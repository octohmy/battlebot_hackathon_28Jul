# RED CORNER BLUE BOT — a BattleBots Pro League card arena

Built at the BattleBots x Bright Data Hack Night, London, 28 July 2026.

Two corners, one BattleBox. Make the match between two Pro League machines,
trump a stat, and let an AI that has actually read their fight record ruin
their day. **Every number on screen is real** — pulled
from BattleBots' own APIs, with the sources listed in-app on `/intel`.

## What it does

- **Top-trumps card arena** — 24 competitors as holographic cards, in **1v1 or
  2v2 tag team**. Initiative alternates each round: whoever is on the clock
  picks the stat to fight over, and the turn change gets a full-screen call.
- **Volumetric bot portraits** — each photo is rebuilt as a WebGL point cloud
  with real thickness (a distance transform of the alpha mask drives depth, and
  points are emitted on a front shell, a back shell and through the interior),
  so it survives a slow 360° turn instead of going paper-thin edge-on. Drag to
  orbit, throw it and it coasts, double-click to recentre.
- **Grounded AI** (trash talk / roast / analyse / predict) — every prompt is fed
  the two bots' real stat blocks *and* their fight-by-fight history, and is
  forbidden from inventing figures. Spot-checked: it correctly cites things like
  Copperhead knocking out Bloodsport in 35 seconds in episode 703.
- **Live commentary** — a pre-voiced ElevenLabs reaction fires the instant a
  line lands ("Oh! He did not just say that!"), and the bespoke read of the
  actual sentence follows underneath it, synthesised *as it streams*. Analyse
  and Predict are pre-generated the moment a matchup starts, so they are
  instant.
- **Bot Feelings Engine** — bots carry morale alongside combat stats, shown as a
  segmented meter with a state a commentator would call (Bouncing → Rattled →
  On the ropes → Stopped), and a judges' scorecard scored ten-point-must.
  Landed roasts drain it, lopsided stat losses hurt more, and hits float off the
  card as combat text. Winning earns XP and levels.
- **Broadcast cuts, not page loads** — every screen change is a sports-TV
  stinger: an angled bar wipes across between pages, shutters slam shut on the
  way into a fight, and the swap happens while the screen is fully covered.
  Routes are prefetched and the two fighters' point clouds are sampled inside
  that covered window, so the fight opens with the machines already in memory.
- **The UI takes damage** — cracks spider across the glass, the frame kicks, and
  chromatic fringing creeps in as a duel wears on.
- **AI ring announcer** — ElevenLabs "stadium voice" calls the matchup by name
  with real numbers, stitched live from a pre-generated clip bank.
- **Live data feed** — a drawer with every field held on both machines, ~30 rows
  a side, each tagged with the source it came from. The six trump stats are a
  fraction of what is loaded; this is the rest of it.
- **`/intel`** — power rankings (with each composite score shown being built
  from its three weighted parts), a win-rate-vs-KO-rate scatter sized by sample
  size, and weapon meta for all 24 bots, with full data provenance.

## Data sources

| Data | Source | How |
|---|---|---|
| Standings, career stats | `battlebots.com/wp-json/bbpl/v1/{standings,robot-stats}` | Direct fetch |
| **Fight-by-fight history** | **`battlebots.com/match-schedule/`** | **Bright Data Scraping Browser** |
| Weapon types, images, teams | `battlebots.com/robot/<slug>/`, Pro League roster | Direct fetch |

### Bright Data

Match history is scraped with the **Bright Data Scraping Browser**
(`npm run matches` → [`scripts/matches.mjs`](scripts/matches.mjs)).

This is not decoration — it is the only way to get that data:

- A plain fetch of `battlebots.com/match-schedule/` returns **zero bot names**.
  The page renders nothing useful server-side.
- The schedule is a Google Sheet embedded in a **cross-origin iframe**, drawn
  client-side. `curl` and static HTML parsing both come back empty.
- So it needs a real browser that executes JavaScript and can reach into that
  frame. `puppeteer-core` connects to the Bright Data Scraping Browser over
  websocket, waits for the sheet to paint, and reads the grid out of the frame.

The scraper yields **200 records across 100 matches**. Each match is recorded
independently from both bots' rows, and the script asserts that all 100 pairings
reconcile before it will write anything — so an upstream layout change fails
loudly rather than silently corrupting the data.

That fight history is what makes the AI's trash talk *checkable* rather than
generic: it is why the model can say Copperhead knocked out Bloodsport in 35
seconds in episode 703, and be right.

> Worth noting for anyone extending this: Bright Data **enforces robots.txt**.
> Reddit disallows crawling, so a fan-sentiment scrape was attempted and
> abandoned — the Scraping Browser correctly refuses those URLs. battlebots.com
> permits crawling, which is why the match scrape works.

Career stats are genuinely unavailable at source for **Calypso** (unknown slug)
and **Death Roll** (upstream 502); those cards show `NO DATA` rather than a
fabricated number. Weapon types left blank by battlebots.com are marked `*`
everywhere they appear, and the AI is told to hedge on them.

## Running it

```bash
npm install
cp .env.local.example .env.local   # then fill in your keys
npm run dev
```

| Script | What it does |
|---|---|
| `npm run dev` | Dev server (serves the committed data snapshot — instant) |
| `npm run dev:live` | Dev server fetching the BattleBots API live on render |
| `npm run snapshot` | Refresh the committed snapshot from the API |
| `npm run announcer` | Regenerate the announcer voice bank (`--dry` to preview) |
| `npm run stingers` | Regenerate the commentary reaction bank (`--dry` to preview) |
| `npm run matches` | Re-scrape fight history via the Bright Data Scraping Browser |

### Sound

Three separate layers, for three different reasons:

| Layer | What | Why that way |
|---|---|---|
| Interface one-shots | Kenney CC0 `.ogg` files | Clicks and thuds are generic; a sample is the right tool |
| Broadcast stingers | Synthesised at runtime ([`lib/synth.ts`](src/lib/synth.ts)) | Whooshes, impacts, the bell, the buzzer and the fanfare have to hit the *exact* frame a wipe closes — so their timing is expressed in the same constants as the animation. Zero bytes, no licensing, and they vary slightly each play |
| Voice | ElevenLabs | See below |

### The voice budget

ElevenLabs is metered, so the voice is layered to stay inside a free tier:

- **Pre-generated banks** cover everything reusable — bot names, factual
  nuggets, connectives, and the reaction stingers. Zero latency, zero runtime
  cost, works offline.
- **`/api/say`** covers the one thing a bank cannot: reading a sentence the AI
  wrote two seconds ago. Every read is cached to disk by exact text, so demoing
  the same matchup twice costs once, and the route holds a character reserve
  back and refuses below it — the voice degrades to the bank mid-show rather
  than erroring out on stage.

### Why snapshot-first?

battlebots.com takes ~5 seconds per request and the roster needs 31 of them —
fetching live on render meant a 7-second page load, and the venue wifi was not
going to make that better. The app serves a committed snapshot by default and
falls back to it even in live mode, so it demos fully offline. `npm run snapshot`
refreshes it in one command.

## Credits

- Scraping: **Bright Data** Scraping Browser (hack night sponsor).
- Sounds: [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) (CC0).
- Voice: ElevenLabs. Text generation: Gemini 3.5 Flash Lite via OpenRouter.
- Bot images and all statistics © BattleBots Inc.
