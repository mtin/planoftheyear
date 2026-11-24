// Jahresplan: year view of Google Calendar data, one row per week.
// Plain JS, no build step. Reads calendars read-only via the Google Calendar API.
(function () {
  "use strict";

  const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";
  const API = "https://www.googleapis.com/calendar/v3";
  const SETTINGS_KEY = "jahresplan.settings.v1";
  const TOKEN_KEY = "jahresplan.token";
  const MONTHS = ["Jan", "Feb", "Mrz", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  // Display modes per calendar.
  //  initials:   title written into every day (holiday initials)
  //  frame-day:  like initials, but each title in a small frame
  //  bar-day:    one bar per day, title on every day
  //  bar-span / frame-span: one bar / frame from the exact start to the exact end time
  //  list:       small "09:30 Title" lines under each other, for a busy private calendar
  const MODES = {
    "initials": "Kürzel",
    "frame-day": "Rahmen täglich",
    "bar-day": "Balken täglich",
    "bar-span": "Balken Zeitspanne",
    "frame-span": "Rahmen Zeitspanne",
    "list": "Liste mit Uhrzeit",
  };
  const OLD_MODES = { bar: "bar-span", frame: "frame-span" }; // values saved by earlier versions

  const $ = (id) => document.getElementById(id);

  // ---------- settings (only on/off choices, stored in this browser) ----------
  function loadSettings() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return { enabled: s.enabled || {}, mode: s.mode || {}, holidays: s.holidays !== false, school: s.school !== false };
    } catch (e) {
      return { enabled: {}, mode: {}, holidays: true, school: true };
    }
  }
  function saveSettings() {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* private mode */ }
  }

  const settings = loadSettings();
  const state = {
    year: new Date().getFullYear(), // year currently in view
    years: [],            // years rendered so far (sorted)
    token: null,
    calendars: [],        // from calendarList
    eventColors: {},      // colorId -> hex
    events: {},           // "calId|year" -> [events]
  };

  // ---------- dates ----------
  function ymd(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function addDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }
  function parseYmd(s) { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
  function mondayOnOrBefore(d) { return addDays(d, -((d.getDay() + 6) % 7)); }
  function isoWeek(d) {
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return Math.ceil(((t - y0) / 86400000 + 1) / 7);
  }
  // A year block is its ISO calendar weeks (KW 1 to KW 52/53), so blocks follow each other
  // without gaps or overlaps. KW 1 always contains 4 January.
  function yearRange(year) {
    return { start: mondayOnOrBefore(new Date(year, 0, 4)), end: mondayOnOrBefore(new Date(year + 1, 0, 4)) };
  }

  // ---------- colours ----------
  function lum(hex) {
    const n = parseInt((hex || "#888888").slice(1), 16);
    const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
      v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function textOn(hex) { return lum(hex) > 0.4 ? "#1a1a1a" : "#ffffff"; }
  function readable(hex) {
    // Darken light colours so they work as text on white.
    if (lum(hex) < 0.3) return hex;
    const n = parseInt(hex.slice(1), 16);
    const f = 0.55;
    const r = Math.round(((n >> 16) & 255) * f), g = Math.round(((n >> 8) & 255) * f), b = Math.round((n & 255) * f);
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }

  // ---------- Google auth ----------
  let tokenClient = null;

  function cfgClientId() { return (window.APP_CONFIG && window.APP_CONFIG.googleClientId) || ""; }

  function restoreToken() {
    try {
      const t = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || "null");
      if (t && t.exp > Date.now() + 60000) state.token = t.token;
    } catch (e) { /* ignore */ }
  }

  // Called by the Google Identity Services library once it has loaded.
  window.onGoogleLibraryLoad = function () {
    if (!cfgClientId() || tokenClient) return;
    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: cfgClientId(),
      scope: SCOPE,
      callback: (resp) => {
        if (resp.error) { setStatus("Anmeldung fehlgeschlagen: " + resp.error); return; }
        state.token = resp.access_token;
        try {
          sessionStorage.setItem(TOKEN_KEY, JSON.stringify({ token: resp.access_token, exp: Date.now() + resp.expires_in * 1000 }));
        } catch (e) { /* ignore */ }
        afterSignIn();
      },
    });
    $("signIn").disabled = false;
  };

  function signIn() {
    if (!cfgClientId()) { setStatus("Keine Google Client-ID in config.js (siehe SETUP.md)."); return; }
    if (!tokenClient) { setStatus("Google-Anmeldung lädt noch …"); return; }
    tokenClient.requestAccessToken({ prompt: "" });
  }

  function signOut() {
    if (state.token && window.google) google.accounts.oauth2.revoke(state.token, () => {});
    clearToken();
    state.calendars = [];
    state.events = {};
    renderCalendarList();
    render();
  }

  function clearToken() {
    state.token = null;
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) { /* ignore */ }
    updateAuthButtons();
  }

  function updateAuthButtons() {
    $("signIn").hidden = !!state.token;
    $("signOut").hidden = !state.token;
  }

  async function api(path) {
    const r = await fetch(API + path, { headers: { Authorization: "Bearer " + state.token } });
    if (r.status === 401) { clearToken(); throw new Error("Anmeldung abgelaufen, bitte neu anmelden."); }
    if (!r.ok) throw new Error("Google API Fehler " + r.status);
    return r.json();
  }

  async function afterSignIn() {
    updateAuthButtons();
    try {
      setStatus("Lade Kalender …");
      const [list, colors] = await Promise.all([
        api("/users/me/calendarList?maxResults=250"),
        api("/colors"),
      ]);
      state.calendars = (list.items || []).sort((a, b) =>
        (b.primary ? 1 : 0) - (a.primary ? 1 : 0) || (a.summaryOverride || a.summary).localeCompare(b.summaryOverride || b.summary, "de"));
      for (const [id, c] of Object.entries(colors.event || {})) state.eventColors[id] = c.background;
      renderCalendarList();
      await loadEvents();
    } catch (e) {
      setStatus(e.message);
    }
  }

  // ---------- events ----------
  function calName(cal) { return cal.summaryOverride || cal.summary; }

  function guessMode(name) {
    const n = name.toLowerCase();
    if (/urlaub|abwesen|krank/.test(n)) return "initials";
    if (/notdienst|\bnd\b/.test(n)) return "frame-span";
    return "bar-span";
  }
  function modeOf(cal) {
    const m = settings.mode[cal.id];
    return MODES[m] ? m : OLD_MODES[m] || guessMode(calName(cal));
  }

  async function fetchEvents(cal, year) {
    const { start, end } = yearRange(year);
    const items = [];
    let pageToken = "";
    do {
      const q = new URLSearchParams({
        timeMin: start.toISOString(), timeMax: end.toISOString(),
        singleEvents: "true", maxResults: "2500",
        fields: "items(id,summary,start,end,colorId,status),nextPageToken",
      });
      if (pageToken) q.set("pageToken", pageToken);
      const res = await api("/calendars/" + encodeURIComponent(cal.id) + "/events?" + q);
      items.push(...(res.items || []));
      pageToken = res.nextPageToken || "";
    } while (pageToken);
    return items.filter((e) => e.status !== "cancelled").map((e) => normalize(e, cal));
  }

  // Turn a Google event into { title, color, first, last, start, end }.
  // first/last are the covered days (inclusive), start/end the exact times (end exclusive).
  function normalize(e, cal) {
    let start, end;
    if (e.start.date) {
      start = parseYmd(e.start.date);
      end = parseYmd(e.end.date);
    } else {
      start = new Date(e.start.dateTime);
      end = new Date(e.end.dateTime);
    }
    const lastMoment = new Date(Math.max(start.getTime(), end.getTime() - 1));
    return {
      title: (e.summary || "").trim(),
      color: (e.colorId && state.eventColors[e.colorId]) || cal.backgroundColor,
      first: startOfDay(start), last: startOfDay(lastMoment),
      start, end, timed: !e.start.date,
    };
  }

  function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
  function hhmm(d) { return String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }

  // Fetch whatever is missing for the given years, then redraw them.
  async function loadEvents(years = state.years) {
    if (!state.token) { render(years); return; }
    const wanted = state.calendars.filter((c) => settings.enabled[c.id]);
    const jobs = [];
    for (const y of years) for (const c of wanted) if (!state.events[c.id + "|" + y]) jobs.push([c, y]);
    try {
      if (jobs.length) setStatus("Lade Termine …");
      await Promise.all(jobs.map(async ([c, y]) => {
        state.events[c.id + "|" + y] = await fetchEvents(c, y);
      }));
      setStatus("");
    } catch (e) {
      setStatus(e.message);
    }
    render(years);
  }

  // ---------- sidebar ----------
  function renderCalendarList() {
    const ul = $("calList");
    ul.innerHTML = "";
    $("calHint").hidden = state.calendars.length > 0;
    for (const cal of state.calendars) {
      const li = document.createElement("li");
      const label = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = !!settings.enabled[cal.id];
      cb.addEventListener("change", () => {
        settings.enabled[cal.id] = cb.checked;
        if (!cb.checked) delete settings.enabled[cal.id];
        saveSettings();
        loadEvents();
      });
      const sw = document.createElement("span");
      sw.className = "swatch";
      sw.style.background = cal.backgroundColor;
      label.append(cb, " ", sw, " ", calName(cal));

      const sel = document.createElement("select");
      sel.title = "Anzeige";
      for (const [k, v] of Object.entries(MODES)) sel.add(new Option(v, k, false, k === modeOf(cal)));
      sel.addEventListener("change", () => {
        settings.mode[cal.id] = sel.value;
        saveSettings();
        // Mode affects how timed events are normalised, so refetch this calendar.
        for (const k of Object.keys(state.events)) if (k.startsWith(cal.id + "|")) delete state.events[k];
        loadEvents();
      });
      li.append(label, sel);
      ul.append(li);
    }
  }

  function setStatus(msg) { $("status").textContent = msg; }

  // ---------- year grid ----------
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // Redraw the given year blocks, keeping the week at the top of the screen in place.
  function render(years = state.years) {
    const anchor = topVisibleWeek();
    const anchorTop = anchor && anchor.getBoundingClientRect().top;
    const table = $("year");
    for (const y of years) {
      const fresh = renderYear(y);
      const old = table.querySelector('tbody[data-year="' + y + '"]');
      if (old) old.replaceWith(fresh);
      else {
        const next = [...table.tBodies].find((b) => +b.dataset.year > y);
        table.insertBefore(fresh, next || null);
      }
    }
    if (anchor) {
      const now = table.querySelector('tr[data-week="' + anchor.dataset.week + '"]');
      if (now) window.scrollBy(0, now.getBoundingClientRect().top - anchorTop);
    }
    renderLegend(enabledCalendars());
    updateYearInView();
  }

  function enabledCalendars() {
    return state.token ? state.calendars.filter((c) => settings.enabled[c.id]) : [];
  }

  function headerBottom() {
    return $("yearHead").getBoundingClientRect().bottom; // the sticky cell, not the row
  }

  function topVisibleWeek() {
    const line = headerBottom() + 4; // small tolerance for rounding
    for (const tr of document.querySelectorAll("tr.week")) {
      if (tr.getBoundingClientRect().bottom > line) return tr;
    }
    return null;
  }

  function updateYearInView() {
    const tr = topVisibleWeek();
    const year = tr ? +tr.parentElement.dataset.year : state.years[0];
    if (!year) return;
    state.year = year;
    $("yearLabel").textContent = year;
    $("yearHead").textContent = year;
    document.title = "Jahresplan " + year;
  }

  // Make sure a year block exists (and every year between it and the rendered ones).
  function ensureYear(y) {
    if (state.years.includes(y)) return;
    const add = [];
    if (!state.years.length) add.push(y);
    for (let i = state.years[0] - 1; i >= y; i--) add.push(i);
    for (let i = state.years[state.years.length - 1] + 1; i <= y; i++) add.push(i);
    state.years = state.years.concat(add).sort((a, b) => a - b);
    render(add);
    loadEvents(add);
  }

  function scrollToYear(y) {
    ensureYear(y);
    const tb = $("year").querySelector('tbody[data-year="' + y + '"]');
    window.scrollBy(0, tb.getBoundingClientRect().top - headerBottom());
  }

  function renderYear(year) {
    const { start, end } = yearRange(year);
    const pub = settings.holidays ? Object.assign({}, Holidays.publicHolidays(year - 1), Holidays.publicHolidays(year), Holidays.publicHolidays(year + 1)) : {};
    const school = settings.school ? Holidays.schoolHolidays(year) : {};
    const todayKey = ymd(new Date());

    const cals = enabledCalendars();
    // Kürzel and Rahmen täglich go into the top line of each day, Liste below it,
    // everything else into bar lanes.
    const inlineByDay = {}, listByDay = {}, barEvents = [];
    const addTo = (map, d, item) => (map[ymd(d)] = map[ymd(d)] || []).push(item);
    for (const c of cals) {
      const mode = modeOf(c);
      for (const raw of state.events[c.id + "|" + year] || []) {
        const ev = Object.assign({ cal: c, mode }, raw);
        if (mode === "initials" || mode === "frame-day") {
          for (let d = ev.first; d <= ev.last; d = addDays(d, 1)) addTo(inlineByDay, d, ev);
        } else if (mode === "list") {
          for (let d = ev.first; d <= ev.last; d = addDays(d, 1)) addTo(listByDay, d, { ev, firstDay: d.getTime() === ev.first.getTime() });
        } else {
          barEvents.push(ev);
        }
      }
    }
    // Liste: all-day entries first, then by start time.
    for (const k in listByDay) {
      listByDay[k].sort((x, y) => (x.ev.timed - y.ev.timed) || (x.ev.start - y.ev.start));
    }

    const tbody = el("tbody", "yearblock");
    tbody.dataset.year = year;

    for (let wk = start; wk < end; wk = addDays(wk, 7)) {
      const days = [...Array(7)].map((_, i) => addDays(wk, i));
      const weekEnd = days[6];

      // Bars in this week, in day units from Monday 0:00 (0) to next Monday 0:00 (7).
      // "täglich" gives one piece per covered day; "Zeitspanne" one piece placed by the
      // exact start and end time, so a night shift 18:00-08:00 runs from 3/4 of one day
      // into the next.
      const dayIdx = (d) => Math.round((startOfDay(d) - wk) / 86400000);
      const dayPos = (t) => dayIdx(t) + (t.getHours() * 60 + t.getMinutes()) / 1440;
      const items = [];
      for (const ev of barEvents) {
        if (ev.last < wk || ev.first > weekEnd) continue;
        const frame = ev.mode.startsWith("frame");
        if (ev.mode.endsWith("-day")) {
          for (let i = Math.max(0, dayIdx(ev.first)); i <= Math.min(6, dayIdx(ev.last)); i++) {
            items.push({ ev, a: i, b: i + 1, frame, daily: true });
          }
        } else {
          const a = ev.timed ? dayPos(ev.start) : dayIdx(ev.first);
          const b = ev.timed ? dayPos(ev.end) : dayIdx(ev.last) + 1;
          if (b > 0 && a < 7) items.push({ ev, a, b: Math.max(b, a + 0.15), frame });
        }
      }
      items.sort((x, y) => x.a - y.a || (y.b - y.a) - (x.b - x.a));

      // Assign lanes so bars don't overlap.
      const lanes = [];
      const bars = [];
      for (const it of items) {
        const c0 = Math.max(0, it.a), c1 = Math.min(7, it.b);
        let lane = lanes.findIndex((usedTo) => usedTo <= c0 + 1e-6);
        if (lane === -1) { lane = lanes.length; lanes.push(0); }
        lanes[lane] = c1;
        bars.push(Object.assign(it, { c0, c1, lane, contL: it.a < 0, contR: it.b > 7 }));
      }

      const tr = el("tr", "week");
      tr.dataset.week = ymd(wk);
      const firstOfMonth = days.find((d) => d.getDate() === 1);
      // The first row of a year block names the year, later rows name a month starting in that week.
      const label = wk.getTime() === start.getTime() ? String(year) : firstOfMonth ? MONTHS[firstOfMonth.getMonth()] : "";
      const monthCell = el("th", "month" + (wk.getTime() === start.getTime() ? " yearlabel" : ""), label);
      tr.append(monthCell, el("th", "kw", String(isoWeek(wk))));

      const td = el("td", "days");
      const grid = el("div", "dgrid");
      grid.style.setProperty("--lanes", Math.max(1, lanes.length));

      days.forEach((d, i) => {
        const k = ymd(d);
        const col = String(i + 1);
        const bg = el("div", "bg");
        bg.style.gridColumn = col;
        if (d.getMonth() % 2 === 1) bg.classList.add("alt");
        if (i >= 5) bg.classList.add("weekend");
        if (school[k]) bg.classList.add("school");
        if (pub[k]) bg.classList.add("holiday");
        if (k === todayKey) bg.classList.add("today");
        if (d.getDate() === 1) bg.classList.add("first");
        bg.title = [pub[k], school[k]].filter(Boolean).join(" · ");
        grid.append(bg);

        const ini = el("div", "initials");
        ini.style.gridColumn = col;
        for (const ev of inlineByDay[k] || []) {
          const s = el("span", ev.mode === "frame-day" ? "chip" : null, ev.title);
          s.style.color = readable(ev.color);
          if (ev.mode === "frame-day") s.style.borderColor = ev.color;
          s.title = calName(ev.cal) + ": " + ev.title;
          ini.append(s, " ");
        }
        grid.append(ini);

        if (listByDay[k]) {
          const list = el("div", "daylist");
          list.style.gridColumn = col;
          for (const { ev, firstDay } of listByDay[k]) {
            const line = el("div", "li");
            line.style.borderLeftColor = ev.color;
            if (ev.timed && firstDay) line.append(el("span", "t", hhmm(ev.start)), " ");
            line.append(ev.title || "(ohne Titel)");
            line.title = calName(ev.cal) + ": " + ev.title + (ev.timed ? " (" + hhmm(ev.start) + "–" + hhmm(ev.end) + ")" : "");
            list.append(line);
          }
          grid.append(list);
        }

        const foot = el("div", "foot");
        foot.style.gridColumn = col;
        if (pub[k]) foot.append(el("span", "hname", pub[k]));
        const dn = el("span", "dnum", d.getDate() + "." + (d.getMonth() + 1));
        if (d.getDate() === 1) dn.classList.add("dfirst");
        foot.append(dn);
        grid.append(foot);
      });

      const laneEls = lanes.map((_, i) => {
        const ln = el("div", "lane");
        ln.style.gridRow = String(i + 3); // after the initials and list rows
        grid.append(ln);
        return ln;
      });
      for (const b of bars) {
        const bar = el("div", "bar" + (b.frame ? " framebar" : "") + (b.contL ? " contL" : "") + (b.contR ? " contR" : ""), b.ev.title || calName(b.ev.cal));
        // Daily pieces get a small gap on both sides so the days stay apart; spans sit
        // exactly on their times, and whole-day bars get a gap only at their real ends.
        const span = !b.daily;
        const gapL = b.daily ? 2 : span && b.frame || b.contL ? 0 : 2;
        const gapR = b.daily ? 2 : span && b.frame || b.contR ? 0 : 2;
        bar.style.left = "calc(" + (b.c0 / 7 * 100) + "% + " + gapL + "px)";
        bar.style.width = "calc(" + ((b.c1 - b.c0) / 7 * 100) + "% - " + (gapL + gapR) + "px)";
        if (b.frame) {
          bar.style.borderColor = b.ev.color;
          bar.style.color = readable(b.ev.color);
        } else {
          bar.style.background = b.ev.color;
          bar.style.color = textOn(b.ev.color);
        }
        bar.title = calName(b.ev.cal) + ": " + b.ev.title + (b.ev.timed ? " (" + hhmm(b.ev.start) + "–" + hhmm(b.ev.end) + ")" : "");
        laneEls[b.lane].append(bar);
      }

      td.append(grid);
      tr.append(td);
      tbody.append(tr);
    }
    return tbody;
  }

  function renderLegend(cals) {
    const lg = $("legend");
    lg.innerHTML = "";
    const add = (cls, color, text, mode) => {
      const item = el("span", "lg");
      const sw = el("span", "swatch " + (cls || ""));
      if (color) {
        if (mode.startsWith("frame")) { sw.style.borderColor = color; sw.classList.add("framed"); }
        else sw.style.background = color;
      }
      item.append(sw, " " + text);
      lg.append(item);
    };
    if (settings.holidays) add("holiday", null, "Feiertag");
    if (settings.school) add("school", null, "Schulferien Brandenburg");
    for (const c of cals) add("", c.backgroundColor, calName(c), modeOf(c));
  }

  // ---------- wiring ----------
  function init() {
    restoreToken();
    updateAuthButtons();
    $("signIn").disabled = !cfgClientId();
    if (!cfgClientId()) setStatus("Noch keine Google Client-ID eingetragen (siehe SETUP.md).");

    $("showHolidays").checked = settings.holidays;
    $("showSchool").checked = settings.school;
    $("showHolidays").addEventListener("change", (e) => { settings.holidays = e.target.checked; saveSettings(); render(); });
    $("showSchool").addEventListener("change", (e) => { settings.school = e.target.checked; saveSettings(); render(); });

    $("prevYear").addEventListener("click", () => scrollToYear(state.year - 1));
    $("nextYear").addEventListener("click", () => scrollToYear(state.year + 1));
    $("signIn").addEventListener("click", signIn);
    $("signOut").addEventListener("click", signOut);
    $("print").addEventListener("click", () => window.print());

    // Print only the year in view.
    window.addEventListener("beforeprint", () => {
      for (const b of $("year").tBodies) b.classList.toggle("noprint", +b.dataset.year !== state.year);
    });
    window.addEventListener("afterprint", () => {
      for (const b of $("year").tBodies) b.classList.remove("noprint");
    });

    // Endless scroll: add the next year when the end of the page comes close.
    const more = new IntersectionObserver((entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      ensureYear(state.years[state.years.length - 1] + 1);
      more.unobserve($("more")); // re-observe so it fires again if still close
      more.observe($("more"));
    }, { rootMargin: "1500px 0px" });

    let ticking = false;
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => { ticking = false; updateYearInView(); });
    }, { passive: true });

    ensureYear(new Date().getFullYear());
    more.observe($("more"));
    if (state.token) afterSignIn();
  }

  init();
})();
