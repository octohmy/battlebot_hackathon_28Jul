# WRECKED — a BattleBots Pro League card arena

Built at the BattleBots x Bright Data Hack Night, London, 28 July 2026.

Draw two Pro League bots, trump a stat, and let an AI that has actually read
their fight record ruin their day. **Every number on screen is real** — pulled
from BattleBots' own APIs, with the sources listed in-app on `/intel`.

## What it does

- **Top-trumps card arena** — 24 competitors as holographic cards. Each bot's
  photo is rendered as a WebGL point cloud that resolves out of a 3D scatter.
- **Grounded AI** (trash talk / roast / analyse / predict) — every prompt is fed
  the two bots' real stat blocks *and* their fight-by-fight history, and is
  forbidden from inventing figures. Spot-checked: it correctly cites things like
  Copperhead knocking out Bloodsport in 35 seconds in episode 703.
- **Bot Feelings Engine** — bots carry emotional HP alongside combat stats.
  Landed roasts drain it; lopsided stat losses hurt more.
- **The UI takes damage** — cracks spider across the glass, the frame kicks, and
  chromatic fringing creeps in as a duel wears on.
- **AI ring announcer** — ElevenLabs "stadium voice" calls the matchup by name
  with real numbers, stitched live from a pre-generated clip bank.
- **`/intel`** — power rankings and weapon meta for all 24 bots, with full data
  provenance.

## Data sources

| Data | Source |
|---|---|
| Standings, career stats | `battlebots.com/wp-json/bbpl/v1/{standings,robot-stats}` |
| Fight-by-fight history | WC VII match schedule (published Google Sheet on `/match-schedule/`) — 100 matches, each independently confirmed from both bots' rows |
| Weapon types, images, teams | `battlebots.com/robot/<slug>/` and the Pro League roster |

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

### Why snapshot-first?

battlebots.com takes ~5 seconds per request and the roster needs 31 of them —
fetching live on render meant a 7-second page load, and the venue wifi was not
going to make that better. The app serves a committed snapshot by default and
falls back to it even in live mode, so it demos fully offline. `npm run snapshot`
refreshes it in one command.

## Credits

- Sounds: [Kenney Interface Sounds](https://kenney.nl/assets/interface-sounds) (CC0).
- Voice: ElevenLabs. Text generation: Gemini 3.5 Flash Lite via OpenRouter.
- Bot images and all statistics © BattleBots Inc.
