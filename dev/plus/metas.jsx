// Página «Metas»: tus cuatro prioridades en una sola vista, en tu orden.
import TLX, { h, useState, useMemo, isNum, fmt, addDays, daysBetween, dateEs, hms } from "./core.jsx";

const GRADES = ["4", "4+", "5", "5+", "6a", "6a+", "6b", "6b+", "6c", "6c+", "7a", "7a+", "7b", "7b+", "7c", "7c+", "8a"];
const gi = (g) => GRADES.indexOf(String(g || "").trim());
const epley = (kg, reps) => (isNum(kg) ? kg * (1 + (isNum(reps) ? reps : 1) / 30) : null);
const mmss = (s) => (isNum(s) ? `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}` : "–");

function series(logs, type, f) {
  return logs
    .filter((l) => l.type === type && isNum(f(l)))
    .map((l) => ({ date: l.date, v: f(l) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

function Goal({ title, why, value, unit, delta, target, progress, spark, children, empty }) {
  return h(
    "div",
    { className: "card tlx-goal" },
    h("div", { className: "tlx-goal-head" }, h("div", null, h("h3", null, title), h("div", { className: "card-sub" }, why))),
    empty
      ? h("p", { className: "dim small", style: { margin: "8px 0" } }, empty)
      : h(
          "div",
          { className: "tlx-goal-num" },
          h("div", { className: "stat-like" }, h("span", { className: "tlx-big" }, value), unit ? h("small", null, unit) : null),
          spark && spark.length > 1 ? h(TLX.Spark, { vals: spark }) : null,
        ),
    !empty && delta ? h("div", { className: "dim small" }, delta) : null,
    isNum(progress)
      ? h("div", { className: "tlx-bar", role: "img", "aria-label": `Progreso ${Math.round(progress * 100)} %` }, h("i", { style: { width: Math.max(3, Math.min(100, progress * 100)) + "%" } }), h("span", null, target))
      : target
        ? h("div", { className: "dim small", style: { marginTop: 6 } }, target)
        : null,
    children,
  );
}

function QuickAdd({ label, fields, onSave }) {
  const { z } = TLX.ctx.ui;
  const [vals, setVals] = useState({});
  const ok = fields.every((f) => f.optional || isNum(parseFloat(String(vals[f.k] || "").replace(",", "."))));
  return h(
    "form",
    {
      className: "tlx-quick",
      onSubmit: async (e) => {
        e.preventDefault();
        if (!ok) return;
        const out = {};
        for (const f of fields) {
          const n = parseFloat(String(vals[f.k] || "").replace(",", "."));
          if (isNum(n)) out[f.k] = n;
        }
        await onSave(out);
        setVals({});
      },
    },
    fields.map((f) =>
      h("input", { key: f.k, className: "input", inputMode: "decimal", placeholder: f.ph, "aria-label": f.ph, value: vals[f.k] || "", onChange: (e) => setVals({ ...vals, [f.k]: e.target.value }), style: { width: f.w || 90 } }),
    ),
    h(z, { small: true, kind: "primary", type: "submit", disabled: !ok }, label),
  );
}

function Target({ value, unit, onSave, ph }) {
  const [edit, setEdit] = useState(false);
  const [v, setV] = useState(value ?? "");
  if (!edit)
    return h("button", { type: "button", className: "tlx-link", onClick: () => setEdit(true) }, isNum(value) ? `Objetivo: ${fmt(value)} ${unit}` : "Poner objetivo");
  return h(
    "span",
    { className: "row", style: { gap: 6 } },
    h("input", { className: "input", inputMode: "decimal", style: { width: 80 }, value: v, placeholder: ph, onChange: (e) => setV(e.target.value), autoFocus: true }),
    h("button", { type: "button", className: "btn sm primary", onClick: () => (onSave(parseFloat(String(v).replace(",", "."))), setEdit(false)) }, "Guardar"),
  );
}

function MetasPage({ state, actions, today, cfg }) {
  const { wt } = TLX.ctx;
  const T = state.settings.tlxTargets || {};
  const setT = (k) => (v) => actions.setSettings({ ...state.settings, tlxTargets: { ...T, [k]: isNum(v) ? v : null } });
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const save = (type, data, one) => {
    const id = one ? `${type}-${today}` : `${type}-${uid()}`;
    const prev = one ? state.logs.find((l) => l.id === id) : null;
    return actions.saveLog(Object.assign({ id, type, date: today }, prev || {}, data)).then(() => actions.say("Apuntado"));
  };

  // 1. Subir más rápido
  const climb = useMemo(() => (wt ? wt(state.sessions, cfg, today) : null), [state.sessions, cfg, today]);
  const vamNow = climb && climb.now;
  // 2. Ritmo: mejor 5 km de los últimos 90 días
  const best5 = (from, to) =>
    state.sessions
      .filter((s) => s.sport === "run" && s.date >= from && s.date <= to && s.bestDist && s.bestDist["5000"])
      .reduce((m, s) => (!m || s.bestDist["5000"].secs < m.secs ? { secs: s.bestDist["5000"].secs, s } : m), null);
  const k5 = best5(addDays(today, -90), today),
    k5prev = best5(addDays(today, -180), addDays(today, -91));
  // 3. Core
  const waist = series(state.logs, "cuerpo", (l) => l.waist);
  const weight = series(state.logs, "cuerpo", (l) => l.weight);
  // 4. Fuerza
  const pull = series(state.logs, "fuerza", (l) => l.pull_max);
  const bench = series(state.logs, "fuerza", (l) => epley(l.bench_kg, l.bench_reps));
  // 5. Escalada
  const roco = series(state.logs, "roco", (l) => (gi(l.grade) >= 0 ? gi(l.grade) : null));
  const last = (s) => (s.length ? s[s.length - 1] : null);
  const first = (s) => (s.length ? s[0] : null);
  const races = (state.settings.goals || []).filter((g) => g.date && g.date >= today).sort((a, b) => (a.date < b.date ? -1 : 1));

  return h(
    "div",
    { className: "stack" },
    h("div", { className: "page-head" }, h("div", null, h("h1", null, "Metas"), h("div", { className: "sub" }, "En tu orden: correr rápido, core, fuerza y escalada."))),
    races.length
      ? h(
          "div",
          { className: "row" },
          races.map((g) => h("span", { key: g.id || g.name, className: "chip accent" }, `${g.name} · ${dateEs(g.date)} · faltan ${daysBetween(today, g.date)} días`)),
        )
      : null,
    h(
      "div",
      { className: "grid g2" },
      h(Goal, {
        title: "Subir más rápido",
        why: "Índice de subida: metros por hora en cuestas de 8 % o más, a un mismo esfuerzo.",
        value: fmt(vamNow),
        unit: "m/h",
        empty: isNum(vamNow) ? null : "Hacen falta subidas de 3 min o más al 8 %.",
        delta: climb && isNum(climb.change) ? `${climb.change > 0 ? "+" : ""}${fmt(climb.change * 100)} % frente a las 8 semanas anteriores` : null,
        spark: climb ? climb.points.slice(-30).map((p) => p.v) : null,
        progress: isNum(T.vam) && isNum(vamNow) ? vamNow / T.vam : null,
        target: h(Target, { value: T.vam, unit: "m/h", ph: "800", onSave: setT("vam") }),
      }),
      h(Goal, {
        title: "Ritmo en llano",
        why: "Tu mejor 5 km dentro de cualquier salida, últimos 90 días.",
        value: k5 ? mmss(k5.secs) : "–",
        unit: k5 ? `${mmss(k5.secs / 5)} /km` : "",
        empty: k5 ? null : "Sin carreras con 5 km medidos en 90 días.",
        delta: k5 && k5prev ? `${k5.secs < k5prev.secs ? "−" : "+"}${mmss(Math.abs(k5.secs - k5prev.secs))} frente a los 90 días anteriores (${dateEs(k5.s.date)})` : k5 ? `el ${dateEs(k5.s.date)}` : null,
        target: h(Target, { value: T.k5 ? T.k5 / 60 : null, unit: "min", ph: "19,5", onSave: (v) => setT("k5")(isNum(v) ? v * 60 : null) }),
        progress: isNum(T.k5) && k5 ? Math.min(1, T.k5 / k5.secs) : null,
      }),
      h(
        Goal,
        {
          title: "Core y composición",
          why: "Cintura en cm: mídete en ayunas, siempre igual.",
          value: last(waist) ? fmt(last(waist).v, 1) : "–",
          unit: "cm",
          empty: waist.length ? null : "Apunta tu cintura hoy para tener el punto de partida.",
          delta: waist.length > 1 ? `${last(waist).v <= first(waist).v ? "−" : "+"}${fmt(Math.abs(last(waist).v - first(waist).v), 1)} cm desde el ${dateEs(first(waist).date)}${last(weight) ? ` · peso ${fmt(last(weight).v, 1)} kg` : ""}` : null,
          spark: waist.map((p) => p.v),
          target: h(Target, { value: T.waist, unit: "cm", ph: "84", onSave: setT("waist") }),
          progress: isNum(T.waist) && last(waist) && first(waist) && first(waist).v > T.waist ? (first(waist).v - last(waist).v) / (first(waist).v - T.waist) : null,
        },
        h(QuickAdd, { label: "Apuntar", fields: [{ k: "waist", ph: "Cintura cm" }, { k: "weight", ph: "Peso kg", optional: true }], onSave: (d) => save("cuerpo", d, true) }),
      ),
      h(
        Goal,
        {
          title: "Dominadas",
          why: "Máximo de dominadas seguidas.",
          value: last(pull) ? fmt(last(pull).v) : "–",
          unit: "seguidas",
          empty: pull.length ? null : "Apunta tu máximo de hoy y lo seguimos desde ahí.",
          delta: pull.length > 1 ? `Mejor: ${fmt(Math.max(...pull.map((p) => p.v)))} · empezaste en ${fmt(first(pull).v)}` : null,
          spark: pull.map((p) => p.v),
          target: h(Target, { value: T.pull, unit: "seguidas", ph: "15", onSave: setT("pull") }),
          progress: isNum(T.pull) && last(pull) ? last(pull).v / T.pull : null,
        },
        h(QuickAdd, { label: "Apuntar", fields: [{ k: "pull_max", ph: "Máx. seguidas", w: 120 }], onSave: (d) => save("fuerza", d) }),
      ),
      h(
        Goal,
        {
          title: "Press banca",
          why: "1RM estimado a partir del peso y las repeticiones (Epley).",
          value: last(bench) ? fmt(last(bench).v) : "–",
          unit: "kg",
          empty: bench.length ? null : "Apunta una serie: kilos y repeticiones.",
          delta: bench.length > 1 ? `Mejor: ${fmt(Math.max(...bench.map((p) => p.v)))} kg · empezaste en ${fmt(first(bench).v)} kg` : null,
          spark: bench.map((p) => p.v),
          target: h(Target, { value: T.bench, unit: "kg", ph: "80", onSave: setT("bench") }),
          progress: isNum(T.bench) && last(bench) ? last(bench).v / T.bench : null,
        },
        h(QuickAdd, { label: "Apuntar", fields: [{ k: "bench_kg", ph: "kg" }, { k: "bench_reps", ph: "reps" }], onSave: (d) => save("fuerza", d) }),
      ),
      h(Goal, {
        title: "Escalada",
        why: "Grado máximo encadenado en los últimos 60 días (se apunta en Registro → Rocódromo).",
        value: (() => {
          const r = roco.filter((p) => p.date >= addDays(today, -60));
          return r.length ? GRADES[Math.max(...r.map((p) => p.v))] : "–";
        })(),
        empty: roco.length ? null : "Sin registros de rocódromo todavía.",
        spark: roco.map((p) => p.v),
        delta: roco.length ? `Mejor de siempre: ${GRADES[Math.max(...roco.map((p) => p.v))]}` : null,
        target: h("span", { className: "dim small" }, "Objetivo: 7a"),
      }),
    ),
  );
}
TLX.pages.metas = function MetasSafe(p) {
  return h(TLX.ErrorBox, null, h(MetasPage, p));
};
