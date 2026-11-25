// Inicio: ritmo de subida de forma (en lugar del ACWR), aviso de salida larga y test del mes.
import TLX, { h, useState, registerSlot, isNum, addDays, daysBetween, hms, fmt, dateEs, lsGet, lsSet, median } from "./core.jsx";
import { findClimbs } from "./map.jsx";

export function rampOf(model, date) {
  if (!model || !model.days) return null;
  const days = model.days;
  let i = days.findIndex((d) => d.date === date);
  if (i < 0) i = days.length - 1;
  if (i < 7) return null;
  return { now: days[i].ctl, prev: days[i - 7].ctl, ramp: days[i].ctl - days[i - 7].ctl };
}

TLX.RampStat = function RampStat({ model, today }) {
  const { J } = TLX.ctx.ui;
  const r = rampOf(model, today);
  if (!r) return h(J, { label: "Subida de forma", value: "–", delta: "falta historial" });
  const v = r.ramp;
  const txt = v > 7 ? "muy rápido: vigila" : v >= 2 ? "buen ritmo" : v > -2 ? "estable" : "bajando";
  return h(J, { label: "Subida de forma", value: (v > 0 ? "+" : "") + fmt(v, 1), unit: "/sem", delta: txt });
};

export function nextGoal(state, today) {
  const goals = (state.settings.goals || []).filter((g) => g.date && g.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));
  return goals[0] || null;
}

// tiempo aproximado de carrera con tu ritmo por km-esfuerzo (km + desnivel/100) de las últimas 8 semanas
export function raceEstimate(state, today, goal) {
  const from = addDays(today, -56);
  const rates = state.sessions
    .filter((s) => s.sport === "run" && s.date >= from && s.dur >= 2700 && s.dist > 3000)
    .map((s) => s.dur / (s.dist / 1000 + (s.ascent || 0) / 100));
  const rate = median(rates);
  if (!rate || !goal.km) return null;
  return rate * (goal.km + (goal.dplus || 0) / 100) * 1.05;
}

function LongRun({ state, today }) {
  const { ue } = TLX.ctx.ui;
  const g = nextGoal(state, today);
  if (!g) return null;
  const days = daysBetween(today, g.date);
  if (days > 84 || days < 10) return null;
  const est = raceEstimate(state, today, g);
  if (!est || est < 5400) return null;
  const from = addDays(today, -21);
  const longest = state.sessions.filter((s) => (s.sport === "run" || s.sport === "hike") && s.date >= from).reduce((m, s) => Math.max(m, s.dur || 0), 0);
  const need = Math.round((est * 0.65) / 900) * 900;
  if (longest >= need) return null;
  return h(
    "div",
    { className: "card tlx-tight" },
    h(ue, { level: "warning", title: `Falta una salida larga para ${g.name}` }, `Tu más larga en 3 semanas: ${hms(longest)}. La carrera te llevará unas ${hms(est)}: mete una de ${hms(need)} antes del ${dateEs(addDays(g.date, -14))}.`),
  );
}

function TestReminder({ state, today, go }) {
  const { z } = TLX.ctx.ui;
  const [hid, setHid] = useState(lsGet("tlx-test-hidden", ""));
  const month = today.slice(0, 7);
  if (hid === month) return null;
  const recentTest = state.sessions.some(
    (s) => s.date >= addDays(today, -30) && (/test/i.test(s.name || "") || s.kindOverride === "test"),
  );
  if (recentTest) return null;
  const climbs = findClimbs(state.sessions, state.settings.tlxClimbNames).filter((g) => g.best.dur >= 300 && g.best.dur <= 1800);
  if (!climbs.length) return null;
  const c = climbs[0];
  return h(
    "div",
    { className: "banner tlx-test" },
    h(TLX.ctx.ui.ge, { name: "target", size: 18 }),
    h(
      "span",
      null,
      h("b", null, "Test del mes: "),
      `sube ${c.name.split(" · ")[0]} a tope (unos ${Math.round(c.best.dur / 60)} min). Tu mejor: ${fmt(c.best.vam)} m/h. `,
      h(z, { small: true, onClick: () => go("mapa") }, "Ver la subida"),
      " ",
      h(z, { small: true, kind: "ghost", onClick: () => (lsSet("tlx-test-hidden", month), setHid(month)) }, "Este mes no"),
    ),
  );
}

registerSlot("inicio", LongRun, 20);
registerSlot("inicio", TestReminder, 30);

// ---------- parte semanal: tres líneas los lunes y martes ----------
function mondayOf(iso) {
  const d = new Date(iso + "T12:00:00");
  const k = (d.getDay() + 6) % 7;
  return addDays(iso, -k);
}
function WeekReport({ state, today, model }) {
  const { z } = TLX.ctx.ui;
  const mon = mondayOf(today);
  const [hid, setHid] = useState(lsGet("tlx-week-hidden", ""));
  const dow = (new Date(today + "T12:00:00").getDay() + 6) % 7; // 0 = lunes
  if (dow > 1 || hid === mon) return null;
  const from = addDays(mon, -7),
    to = addDays(mon, -1);
  const inWeek = (s, a, b) => s.date >= a && s.date <= b;
  const sum = (a, b) => state.sessions.filter((s) => inWeek(s, a, b)).reduce((m, s) => ((m.n += 1), (m.secs += s.dur || 0), (m.up += s.ascent || 0), m), { n: 0, secs: 0, up: 0 });
  const w = sum(from, to);
  const prev = [1, 2, 3, 4].map((k) => sum(addDays(from, -7 * k), addDays(to, -7 * k)));
  const avg = prev.reduce((a, x) => a + x.secs, 0) / 4;
  const r = rampOf(model, to);
  // una sola cosa a mejorar, por tus prioridades
  const climbs = state.sessions.filter((s) => inWeek(s, from, to)).some((s) => (s.climbs || []).some((c) => c.grade >= 8 && c.dur >= 180));
  const strength = state.logs.some((l) => l.type === "fuerza" && l.date >= from && l.date <= to) || state.sessions.some((s) => inWeek(s, from, to) && s.sport === "fuerza");
  const painDays = {};
  for (const l of state.logs) if (l.type === "diario" && l.date >= from && l.date <= to && l.pain) for (const [k, v] of Object.entries(l.pain)) if (v > 0) painDays[k] = (painDays[k] || 0) + 1;
  const worst = Object.entries(painDays).sort((a, b) => b[1] - a[1])[0];
  const sleeps = state.logs.filter((l) => l.type === "diario" && l.date >= from && l.date <= to && isNum(l.sleep)).map((l) => l.sleep);
  const sleepAvg = sleeps.length >= 3 ? sleeps.reduce((a, b) => a + b, 0) / sleeps.length : null;
  let tip;
  if (worst && worst[1] >= 3) tip = `Vigila ${TLX.painText({ [worst[0]]: 1 }).replace(/ \(leve\)$/, "").toLowerCase()}: ${worst[1]} días con molestias.`;
  else if (isNum(sleepAvg) && sleepAvg < 6.5) tip = `Duermes ${fmt(sleepAvg, 1)} h de media: si hace falta, cambia intensidad por rodaje.`;
  else if (!climbs) tip = "Mete una sesión de cuestas a tope: subir más rápido es tu prioridad.";
  else if (!strength) tip = "Haz 20 minutos de fuerza con el chaleco.";
  else tip = "Sigue así: semana completa.";
  return h(
    "div",
    { className: "card tlx-week" },
    h("div", { className: "card-head" }, h("div", null, h("h3", null, "La semana pasada")), h("div", { className: "tools" }, h(z, { small: true, kind: "ghost", icon: "x", title: "Cerrar", onClick: () => (lsSet("tlx-week-hidden", mon), setHid(mon)) }))),
    h(
      "ul",
      { className: "tlx-week-list" },
      h("li", null, h("b", null, "Hecho: "), w.n ? `${w.n} ${w.n === 1 ? "sesión" : "sesiones"}, ${hms(w.secs)} y ${fmt(w.up)} m+${avg > 0 ? ` (${w.secs >= avg ? "+" : "−"}${fmt(Math.abs(w.secs / avg - 1) * 100)} % sobre tu media)` : ""}.` : "sin entrenos."),
      r ? h("li", null, h("b", null, "Forma: "), `${r.ramp >= 0 ? "sube" : "baja"} ${fmt(Math.abs(r.ramp), 1)} puntos (${fmt(r.now)}).`) : null,
      h("li", null, h("b", null, "Esta semana: "), tip),
    ),
  );
}
registerSlot("inicio", WeekReport, 5);
