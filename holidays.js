// Built-in holidays for Brandenburg.
// Public holidays are computed for any year. School holidays are listed by hand;
// add new school years here when the ministry publishes them.
(function () {
  // Gregorian Easter Sunday (Meeus/Jones/Butcher).
  function easter(year) {
    const a = year % 19, b = Math.floor(year / 100), c = year % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(year, month - 1, day);
  }

  function key(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function plus(d, n) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  }

  // Returns { "YYYY-MM-DD": "Name" } for public holidays in Brandenburg.
  function publicHolidays(year) {
    const e = easter(year);
    const list = [
      [new Date(year, 0, 1), "Neujahr"],
      [plus(e, -2), "Karfreitag"],
      [e, "Ostersonntag"],
      [plus(e, 1), "Ostermontag"],
      [new Date(year, 4, 1), "Tag der Arbeit"],
      [plus(e, 39), "Christi Himmelfahrt"],
      [plus(e, 49), "Pfingstsonntag"],
      [plus(e, 50), "Pfingstmontag"],
      [new Date(year, 9, 3), "Tag der Deutschen Einheit"],
      [new Date(year, 9, 31), "Reformationstag"],
      [new Date(year, 11, 25), "1. Weihnachtstag"],
      [new Date(year, 11, 26), "2. Weihnachtstag"],
    ];
    const out = {};
    for (const [d, name] of list) out[key(d)] = name;
    return out;
  }

  // Brandenburg school holidays [first day, last day, name] (source: MBJS via kalenderpedia.de).
  const SCHOOL = [
    ["2025-07-24", "2025-09-06", "Sommerferien"],
    ["2025-10-20", "2025-11-01", "Herbstferien"],
    ["2025-12-22", "2026-01-02", "Weihnachtsferien"],
    ["2026-02-02", "2026-02-07", "Winterferien"],
    ["2026-03-30", "2026-04-10", "Osterferien"],
    ["2026-05-15", "2026-05-15", "Ferientag"],
    ["2026-05-26", "2026-05-26", "Ferientag"],
    ["2026-07-09", "2026-08-22", "Sommerferien"],
    ["2026-10-19", "2026-10-30", "Herbstferien"],
    ["2026-12-23", "2027-01-02", "Weihnachtsferien"],
    ["2027-02-01", "2027-02-06", "Winterferien"],
    ["2027-03-22", "2027-04-03", "Osterferien"],
    ["2027-05-07", "2027-05-07", "Ferientag"],
    ["2027-05-18", "2027-05-18", "Ferientag"],
    ["2027-07-01", "2027-08-14", "Sommerferien"],
    ["2027-10-11", "2027-10-23", "Herbstferien"],
    ["2027-12-23", "2027-12-31", "Weihnachtsferien"],
    ["2028-01-31", "2028-02-05", "Winterferien"],
    ["2028-04-10", "2028-04-22", "Osterferien"],
    ["2028-05-26", "2028-05-26", "Ferientag"],
    ["2028-06-29", "2028-08-12", "Sommerferien"],
  ];

  // Returns { "YYYY-MM-DD": "Name" } for school holidays touching the given year.
  function schoolHolidays(year) {
    const out = {};
    for (const [from, to, name] of SCHOOL) {
      let d = new Date(from + "T00:00:00");
      const end = new Date(to + "T00:00:00");
      while (d <= end) {
        if (d.getFullYear() >= year - 1 && d.getFullYear() <= year + 1) out[key(d)] = name;
        d = plus(d, 1);
      }
    }
    return out;
  }

  function schoolDataYears() {
    return { first: +SCHOOL[0][0].slice(0, 4), last: +SCHOOL[SCHOOL.length - 1][1].slice(0, 4) };
  }

  window.Holidays = { publicHolidays, schoolHolidays, schoolDataYears };
})();
