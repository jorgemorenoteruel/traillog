// Mapa del cuerpo para apuntar molestias del día (se guarda en el registro diario).
import TLX, { h, useState, registerSlot, addDays, lsGet } from "./core.jsx";

// zonas: [id, nombre, vista, x, y, rx, ry]  (vista f = delante, b = detrás; coordenadas en 0..120 × 0..250)
const Z = [
  ["hombro-i", "Hombro izq.", "f", 32, 58, 9, 7], ["hombro-d", "Hombro dcho.", "f", 88, 58, 9, 7],
  ["cadera-i", "Cadera izq.", "f", 44, 118, 9, 8], ["cadera-d", "Cadera dcha.", "f", 76, 118, 9, 8],
  ["cuadriceps-i", "Cuádriceps izq.", "f", 46, 146, 8, 15], ["cuadriceps-d", "Cuádriceps dcho.", "f", 74, 146, 8, 15],
  ["rodilla-i", "Rodilla izq.", "f", 47, 172, 7, 7], ["rodilla-d", "Rodilla dcha.", "f", 73, 172, 7, 7],
  ["espinilla-i", "Espinilla izq.", "f", 47, 198, 5, 13], ["espinilla-d", "Espinilla dcha.", "f", 73, 198, 5, 13],
  ["tobillo-i", "Tobillo izq.", "f", 47, 222, 6, 5], ["tobillo-d", "Tobillo dcho.", "f", 73, 222, 6, 5],
  ["pie-i", "Pie izq.", "f", 44, 236, 8, 5], ["pie-d", "Pie dcho.", "f", 76, 236, 8, 5],
  ["lumbar", "Lumbar", "b", 60, 104, 14, 9],
  ["gluteo-i", "Glúteo izq.", "b", 49, 124, 9, 9], ["gluteo-d", "Glúteo dcho.", "b", 71, 124, 9, 9],
  ["isquio-i", "Isquio izq.", "b", 47, 150, 8, 15], ["isquio-d", "Isquio dcho.", "b", 73, 150, 8, 15],
  ["gemelo-i", "Gemelo izq.", "b", 47, 196, 7, 14], ["gemelo-d", "Gemelo dcho.", "b", 73, 196, 7, 14],
  ["aquiles-i", "Aquiles izq.", "b", 47, 222, 4, 6], ["aquiles-d", "Aquiles dcho.", "b", 73, 222, 4, 6],
  ["planta-i", "Planta izq.", "b", 46, 237, 7, 4], ["planta-d", "Planta dcha.", "b", 74, 237, 7, 4],
];
const NAME = Object.fromEntries(Z.map((z) => [z[0], z[1]]));
const LEVEL = ["", "leve", "molesta", "duele"];
TLX.painText = (p) =>
  Object.entries(p || {})
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${NAME[k] || k} (${LEVEL[v]})`)
    .join(", ");

// silueta sencilla
const BODY =
  "M60 8c9 0 15 7 15 16s-6 17-15 17-15-8-15-17 6-16 15-16zM40 48h40c8 0 14 6 15 14l5 46c1 5-6 7-8 2l-6-36-1 34c0 6-1 10-2 14l-2 70c0 6 0 14 1 22l2 10c1 4-1 6-4 6h-8c-3 0-4-2-4-5l-1-22c-1-8-1-14-2-22l-5-46-5 46c-1 8-1 14-2 22l-1 22c0 3-1 5-4 5h-8c-3 0-5-2-4-6l2-10c1-8 1-16 1-22l-2-70c-1-4-2-8-2-14l-1-34-6 36c-2 5-9 3-8-2l5-46c1-8 7-14 15-14z";

function Body({ view, pain, onTap }) {
  return h(
    "svg",
    { viewBox: "0 0 120 250", className: "tlx-body", role: "group", "aria-label": view === "f" ? "Por delante" : "Por detrás" },
    h("path", { d: BODY, className: "tlx-body-fill" }),
    Z.filter((z) => z[2] === view).map(([id, name, , x, y, rx, ry]) =>
      h("ellipse", {
        key: id,
        cx: x,
        cy: y,
        rx,
        ry,
        className: "tlx-zone lv" + (pain[id] || 0),
        tabIndex: 0,
        role: "button",
        "aria-label": `${name}: ${LEVEL[pain[id] || 0] || "sin molestia"}`,
        onClick: () => onTap(id),
        onKeyDown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onTap(id)),
      }, h("title", null, name)),
    ),
  );
}

export function PainPicker({ state, actions, today, compact }) {
  const id = "diario-" + today;
  const log = state.logs.find((l) => l.id === id) || null;
  const [open, setOpen] = useState(false);
  const pain = (log && log.pain) || {};
  const { z } = TLX.ctx.ui;
  const tap = async (zid) => {
    const p = { ...pain, [zid]: ((pain[zid] || 0) + 1) % 4 };
    if (!p[zid]) delete p[zid];
    const next = Object.assign({ id, type: "diario", date: today }, log || {}, { pain: p, painSet: true });
    await actions.saveLog(next);
  };
  const clear = async () => {
    await actions.saveLog(Object.assign({ id, type: "diario", date: today }, log || {}, { pain: {}, painSet: true }));
    setOpen(false);
  };
  const recent = painHistory(state.logs, today);
  const has = Object.keys(pain).length > 0;
  if (compact && !open && log && log.painSet && !has) return null;
  return h(
    "div",
    { className: "card tlx-pain" },
    h(
      "div",
      { className: "card-head" },
      h("div", null, h("h3", null, "Molestias de hoy"), h("div", { className: "card-sub" }, has ? TLX.painText(pain) : "Toca donde te moleste: un toque leve, dos molesta, tres duele.")),
      !open ? h("div", { className: "tools" }, h(z, { small: true, onClick: () => setOpen(true) }, has ? "Cambiar" : "Marcar"), !has && !(log && log.painSet) ? h(z, { small: true, kind: "ghost", onClick: clear }, "Nada") : null) : null,
    ),
    open
      ? h(
          "div",
          null,
          h("div", { className: "tlx-bodies" }, h("div", null, h(Body, { view: "f", pain, onTap: tap }), h("span", { className: "dim small" }, "Delante")), h("div", null, h(Body, { view: "b", pain, onTap: tap }), h("span", { className: "dim small" }, "Detrás"))),
          h("div", { className: "row", style: { marginTop: 8 } }, h(z, { small: true, kind: "primary", onClick: () => setOpen(false) }, "Hecho"), has ? h(z, { small: true, kind: "ghost", onClick: clear }, "Borrar todo") : null),
        )
      : null,
    recent.length ? h("div", { className: "dim small", style: { marginTop: 6 } }, "Últimos 14 días: ", recent.map((r) => `${NAME[r.id]} ${r.n} ${r.n === 1 ? "día" : "días"}`).join(" · ")) : null,
  );
}
export function painHistory(logs, today) {
  const from = addDays(today, -14);
  const c = {};
  for (const l of logs) if (l.type === "diario" && l.date >= from && l.date <= today && l.pain) for (const [k, v] of Object.entries(l.pain)) if (v > 0) c[k] = (c[k] || 0) + 1;
  return Object.entries(c)
    .map(([id, n]) => ({ id, n }))
    .filter((r) => NAME[r.id])
    .sort((a, b) => b.n - a.n)
    .slice(0, 4);
}

registerSlot("inicio", (p) => h(PainPicker, { ...p, compact: true }), 40);
