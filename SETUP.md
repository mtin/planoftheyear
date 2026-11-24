# Setup (one time, about 15 minutes)

You need two things: the page hosted on GitHub Pages, and a Google "OAuth client ID"
so the page may ask Google for read-only access to the owner's calendars.
Nothing secret goes into the repository. The client ID is public by design.

The page URL will be: **https://mtin.github.io/planoftheyear/**

---

## 1. Turn on GitHub Pages

1. Open the repo on GitHub → **Settings** → **Pages**.
2. Under **Build and deployment** → **Source**, choose **GitHub Actions**.
3. After the first merge to `main`, the workflow "Deploy to GitHub Pages" publishes the site.
   You can watch it under the **Actions** tab.

> If the repository is private, GitHub Pages needs a paid GitHub plan (Pro/Team).
> The repository holds no personal data, so making it public is fine.

---

## 2. Create the Google Cloud project

Do this while signed in with **the owner's Google account** (the one with the calendars).

1. Go to <https://console.cloud.google.com/>.
2. Top bar: project picker → **New project**. Name it e.g. `Apotheke Jahresplan` → **Create**.
   Make sure the new project is selected in the top bar.

## 3. Enable the Google Calendar API

1. Go to <https://console.cloud.google.com/apis/library/calendar-json.googleapis.com>.
2. Click **Enable**.

## 4. Set up the consent screen ("Google Auth Platform")

1. Go to <https://console.cloud.google.com/auth/overview> and click **Get started**.
2. **App information**: App name `Apotheke Jahresplan`, user support email = the owner's email. **Next**.
3. **Audience**: choose **External**. **Next**.
4. **Contact information**: the owner's email. **Next**.
5. Accept the policy → **Create**.
6. Open **Audience** (left menu). Leave the publishing status on **Testing**.
   Under **Test users** click **Add users** and add the owner's Gmail address. **Save**.
7. Open **Data Access** (left menu) → **Add or remove scopes**.
   Filter for `calendar.readonly`, tick
   `https://www.googleapis.com/auth/calendar.readonly` → **Update** → **Save**.

## 5. Create the OAuth client ID

1. Open **Clients** (left menu) → **Create client**.
2. Application type: **Web application**. Name: `Jahresplan Web`.
3. **Authorized JavaScript origins** → **Add URI**:
   - `https://mtin.github.io`
   - (optional, for local testing) `http://localhost:8000`
4. Leave "Authorized redirect URIs" empty. Click **Create**.
5. Copy the **Client ID** (looks like `1234567890-abc...apps.googleusercontent.com`).
   You do **not** need the client secret.

## 6. Put the client ID into the page

Edit `config.js` in the repository (on GitHub: open the file → pencil icon) and paste it:

```js
window.APP_CONFIG = {
  googleClientId: "1234567890-abc...apps.googleusercontent.com",
};
```

Commit to `main`. The Pages workflow redeploys in about a minute.

## 7. First login

1. Open https://mtin.github.io/planoftheyear/ and click **Mit Google anmelden**.
2. Google shows **"Google hasn't verified this app"**. That is expected for a private app in
   testing mode. Click **Continue** (sometimes behind **Advanced**).
3. Allow "See your calendars". The calendar list appears on the left; tick the ones to show.

The login lasts about an hour. After that, click **Anmelden** again (one click, no password
when already signed in to Google).

---

## How to organise the calendars in Google Calendar

Create these calendars in Google Calendar (left side → **Other calendars** → **+** → **Create new calendar**).
The calendar colour in Google is the colour in the year view.

| Calendar | What to enter | Shown as |
|---|---|---|
| `Urlaub Apotheke 1` | All-day event, title = initials only, e.g. `Mi` or `Mi Kr`, spanning the whole holiday | Initials in each day |
| `Urlaub Apotheke 2` | same | Initials in each day |
| `Urlaub Inhaber` | same | Initials in each day |
| `Notdienst` (or one per pharmacy) | One event on the day, title e.g. `ND LöW` / `ND AIG` | Framed label at the date |
| `Events` / `Fortbildung` | Any event, title = what it is | Coloured bar across the days |

The page guesses the display style from the calendar name (contains "Urlaub" → initials,
"Notdienst" or "ND" → frame, anything else → bar). It can be changed per calendar in the
list on the left. A single event can get its own colour in Google (event → colour), and
the bar uses that colour.

German public holidays (Brandenburg) and Brandenburg school holidays are built in.
