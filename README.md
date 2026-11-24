# Jahresplan Apotheke

A year view for planning a pharmacy's holidays, night shifts and events.
One row per week (Monday to Sunday), like the hand-made yearly PDF.

- Data comes from the owner's **Google Calendars** (read-only). He keeps entering
  everything in Google Calendar as before, also on his phone.
- The page is static (plain HTML/JS) and runs on **GitHub Pages**. No server, no database.
- Nothing personal is stored in this repository. The only thing the browser remembers is
  which calendars are switched on and how each is displayed.
- Brandenburg public holidays and school holidays are built in (`holidays.js`).
- **Drucken / PDF** prints the year on three A4 pages.

Setup: see [SETUP.md](SETUP.md). User guide (German): [ANLEITUNG.md](ANLEITUNG.md).

## Files

| File | Purpose |
|---|---|
| `index.html`, `style.css`, `app.js` | The page |
| `holidays.js` | Public holidays (computed) and school holidays (listed, update yearly) |
| `config.js` | Google OAuth client ID (public, not a secret) |
| `.github/workflows/pages.yml` | Deploys to GitHub Pages on every push to `main` |

## Run locally

```sh
python3 -m http.server 8000
```

Open http://localhost:8000 (add `http://localhost:8000` as an authorized origin in the
Google client to sign in locally).

## Next step: more secure storage

v1 stores nothing sensitive: Google holds the data, the page only gets a one-hour,
read-only token after the owner signs in. If staff should ever see the plan, the next
version would share the calendars with their Google accounts (read-only) and add them as
test users, so each person signs in with their own account. No code change is needed for that.
