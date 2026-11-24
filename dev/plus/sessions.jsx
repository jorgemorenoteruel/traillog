// Sesiones: buscador, nombres automáticos, campos nuevos (no contar en tests, carbohidratos), fotos
// y asignación de zapatillas en bloque. Además, tablas largas plegadas.
import TLX, { h, useState, useEffect, useMemo, registerSlot, isNum, fmt, dateEs, hms, lsGet, lsSet } from "./core.jsx";
import { findClimbs, dist } from "./map.jsx";

// ---------- buscador ----------
let query = "";
const qsubs = new Set();
TLX.sessionQuery = () => query;
TLX.matchSession = (s) => {
  if (!query) return true;
  const q = query
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  const hay = [s.name, s.notes, s.date, s.sport === "run" ? "carrera" : s.sport === "hike" ? "monte senderismo" : s.sport === "bike" ? "bici" : s.sport, s.kindOverride]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  return q.split(/\s+/).every((w) => hay.includes(w));
};
function SearchBox() {
  const [q, setQ] = useState(query);
  const { ge } = TLX.ctx.ui;
  useEffect(() => {
    const t = setTimeout(() => {
      query = q.trim();
      qsubs.forEach((f) => f());
      TLX.ctx && TLX.ctx.actions.replaceState({ tlxQuery: query }); // fuerza a repintar la lista
    }, 180);
    return () => clearTimeout(t);
  }, [q]);
  return h(
    "label",
    { className: "tlx-search" },
    h(ge, { name: "search", size: 18 }),
    h("input", { type: "search", placeholder: "Buscar: Grosín, larga, octubre…", value: q, onChange: (e) => setQ(e.target.value), "aria-label": "Buscar sesiones" }),
  );
}

// ---------- nombres automáticos ----------
const GENERIC = [/^(morning|lunch|afternoon|evening|night)\b/i, /^[0-9a-f]{10,}$/i, /^\d{6,}$/, /^(carrera|running|trail run|caminata|hike|ride|run|walk)$/i, /^actividad\b/i];
export const isGeneric = (s) => s.nameSrc !== "user" && GENERIC.some((r) => r.test(String(s.name || "").trim()));
const TYPE = (s) => (s.sport === "run" ? ((s.dur || 0) >= 6300 ? "Larga" : s.trail ? "Trail" : "Carrera") : s.sport === "hike" ? "Monte" : s.sport === "bike" ? "Bici" : s.sport === "ski" ? "Esquí" : s.sport === "roco" ? "Rocódromo" : "Sesión");

async function placeName(lat, lon) {
  const key = `tlx-place:${lat.toFixed(3)},${lon.toFixed(3)}`;
  const c = lsGet(key, null);
  if (c) return c;
  const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&accept-language=es&lat=${lat}&lon=${lon}`);
  if (!r.ok) return null;
  const j = await r.json();
  const a = j.address || {};
  const n = a.peak || a.natural || a.hamlet || a.village || a.locality || a.town || a.city || a.municipality || j.name || null;
  if (n) lsSet(key, n);
  return n;
}
function highPoint(s) {
  const c = s.chart;
  if (!c || !c.alt || !c.lat) return null;
  let bi = -1,
    best = -1e9;
  for (let i = 0; i < c.alt.length; i++) if (isNum(c.alt[i]) && isNum(c.lat[i]) && c.alt[i] > best) (best = c.alt[i]), (bi = i);
  return bi >= 0 ? [c.lat[bi], c.lon[bi]] : null;
}

function AutoNames({ state, actions }) {
  const { z, ue } = TLX.ctx.ui;
  const generic = useMemo(() => state.sessions.filter(isGeneric), [state.sessions]);
  const [props, setProps] = useState(null);
  const [busy, setBusy] = useState(false);
  const [hidden, setHidden] = useState(lsGet("tlx-names-hidden", 0));
  if (!generic.length || (hidden && hidden >= generic.length && !props)) return null;
  const propose = async () => {
    setBusy(true);
    const climbs = findClimbs(state.sessions, state.settings.tlxClimbNames);
    const out = [];
    for (const s of generic) {
      let place = null;
      const g = climbs.find((g) => g.items.some((c) => c.s === s) && !/^Subida/.test(g.name));
      if (g) place = g.name.split(" · ")[0];
      if (!place) {
        const hp = highPoint(s) || (isNum(s.startLat) ? [s.startLat, s.startLon] : null);
        if (hp) {
          try {
            place = await placeName(hp[0], hp[1]);
            await new Promise((r) => setTimeout(r, 1100)); // normas de uso de Nominatim: 1 petición por segundo
          } catch {}
        }
      }
      out.push({ s, name: `${TYPE(s)}${place ? " · " + place : ""}`, on: true });
      setProps(out.slice());
    }
    setBusy(false);
  };
  const saveAll = async () => {
    let n = 0;
    for (const p of props.filter((p) => p.on)) {
      await actions.saveSession({ ...p.s, name: p.name, nameSrc: "user" });
      n++;
    }
    actions.say(`${n} ${n === 1 ? "sesión renombrada" : "sesiones renombradas"}`);
    setProps(null);
  };
  if (!props)
    return h(
      "div",
      { className: "banner" },
      h(TLX.ctx.ui.ge, { name: "edit", size: 18 }),
      h(
        "span",
        null,
        `${generic.length} sesiones tienen un nombre que no dice nada («${generic[0].name}»). `,
        h(z, { small: true, onClick: propose, disabled: busy }, busy ? "Buscando lugares…" : "Proponer nombres"),
        " ",
        h(z, { small: true, kind: "ghost", onClick: () => (lsSet("tlx-names-hidden", generic.length), setHidden(generic.length)) }, "Ahora no"),
      ),
    );
  return h(
    "div",
    { className: "card" },
    h("div", { className: "card-head" }, h("div", null, h("h3", null, "Nombres propuestos"), h("div", { className: "card-sub" }, busy ? `Buscando lugares… ${props.length} de ${generic.length}` : "Por la subida que repites o el punto más alto (OpenStreetMap). Quita los que no quieras."))),
    h(
      "div",
      { className: "tlx-names" },
      props.map((p, i) =>
        h(
          "label",
          { key: p.s.id, className: "tlx-name-row" },
          h("input", { type: "checkbox", checked: p.on, onChange: () => setProps(props.map((x, j) => (j === i ? { ...x, on: !x.on } : x))) }),
          h("span", { className: "dim small", style: { width: 82 } }, dateEs(p.s.date, true)),
          h("input", { className: "input", value: p.name, onChange: (e) => setProps(props.map((x, j) => (j === i ? { ...x, name: e.target.value } : x))) }),
        ),
      ),
    ),
    h("div", { className: "row", style: { marginTop: 10 } }, h(z, { kind: "primary", onClick: saveAll, disabled: busy }, (() => { const n = props.filter((p) => p.on).length; return `Guardar ${n} ${n === 1 ? "nombre" : "nombres"}`; })()), h(z, { kind: "ghost", onClick: () => setProps(null) }, "Cancelar")),
  );
}

function SesionesTop(p) {
  return h("div", { className: "stack", style: { gap: 10 } }, h(SearchBox), h(AutoNames, p));
}
registerSlot("sesiones-top", SesionesTop, 10);

// ---------- campos nuevos en «Editar sesión» ----------
function EditExtras({ draft, setDraft, session }) {
  const { H } = TLX.ctx.ui;
  const get = (k) => (draft[k] !== undefined ? draft[k] : session[k]);
  const run = session.sport === "run" || session.sport === "hike";
  return h(
    React.Fragment,
    null,
    run
      ? h(
          H,
          { label: "Carbohidratos tomados (g)" },
          h("input", { className: "input", inputMode: "numeric", value: get("cho") ?? "", placeholder: "p. ej. 60", onChange: (e) => setDraft({ ...draft, cho: e.target.value === "" ? null : Number(e.target.value) }) }),
        )
      : null,
    run
      ? h(
          H,
          { label: "Líquido (ml)" },
          h("input", { className: "input", inputMode: "numeric", value: get("fluid") ?? "", placeholder: "p. ej. 500", onChange: (e) => setDraft({ ...draft, fluid: e.target.value === "" ? null : Number(e.target.value) }) }),
        )
      : null,
    h(
      H,
      { label: "Tests y comparaciones", className: "wide" },
      h(
        "label",
        { className: "tlx-check" },
        h("input", { type: "checkbox", checked: !!get("noTest"), onChange: (e) => setDraft({ ...draft, noTest: e.target.checked }) }),
        " No contar esta salida (paradas, Onso tirando, terreno raro…)",
      ),
    ),
  );
}
registerSlot("session-edit", EditExtras, 10);

// ---------- detalle de sesión: alimentación y fotos ----------
function FuelLine({ session: s }) {
  if (!isNum(s.cho) && !isNum(s.fluid) && !s.noTest) return null;
  const hrs = (s.dur || 0) / 3600;
  return h(
    "div",
    { className: "row" },
    isNum(s.cho) ? h("span", { className: "chip" }, h(TLX.ctx.ui.ge, { name: "bolt", size: 14 }), `${fmt(s.cho)} g de carbohidratos${hrs > 0.5 ? ` · ${fmt(s.cho / hrs)} g/h` : ""}`) : null,
    isNum(s.fluid) ? h("span", { className: "chip" }, h(TLX.ctx.ui.ge, { name: "drop", size: 14 }), `${fmt(s.fluid)} ml${hrs > 0.5 ? ` · ${fmt(s.fluid / hrs)} ml/h` : ""}`) : null,
    s.noTest ? h("span", { className: "chip" }, "No cuenta en tests") : null,
  );
}

// Fotos: se guardan en este dispositivo (no viajan en la sincronización, pesan demasiado).
const photoKey = (id) => "photos:" + id;
async function resize(file, max = 1600) {
  const img = await createImageBitmap(file);
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement("canvas");
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}
function Photos({ session: s }) {
  const { z, ge } = TLX.ctx.ui;
  const { X } = TLX.ctx;
  const [list, setList] = useState(null);
  const [big, setBig] = useState(null);
  const inp = React.useRef(null);
  useEffect(() => {
    let a = true;
    X.getKV(photoKey(s.id), []).then((v) => a && setList(v || []));
    return () => (a = false);
  }, [s.id]);
  const add = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    const out = (list || []).slice();
    for (const f of files) {
      try {
        out.push({ t: Date.now(), src: await resize(f) });
      } catch {}
    }
    await X.setKV(photoKey(s.id), out);
    setList(out);
  };
  const del = async (i) => {
    const out = list.filter((_, j) => j !== i);
    await X.setKV(photoKey(s.id), out);
    setList(out);
    setBig(null);
  };
  if (list === null) return null;
  return h(
    "div",
    { className: "card" },
    h(
      "div",
      { className: "card-head" },
      h("div", null, h("h3", null, "Fotos"), h("div", { className: "card-sub" }, list.length ? "Se guardan en este dispositivo." : "Añade fotos de la salida: se guardan en este dispositivo.")),
      h("div", { className: "tools" }, h(z, { small: true, icon: "camera", onClick: () => inp.current && inp.current.click() }, "Añadir")),
    ),
    h("input", { ref: inp, type: "file", accept: "image/*", multiple: true, hidden: true, onChange: add }),
    list.length
      ? h(
          "div",
          { className: "tlx-photos" },
          list.map((p, i) => h("button", { key: p.t + "-" + i, type: "button", className: "tlx-photo", onClick: () => setBig(i) }, h("img", { src: p.src, alt: `Foto ${i + 1} de la salida`, loading: "lazy" }))),
        )
      : null,
    big !== null
      ? h(
          "div",
          { className: "tlx-lightbox", onClick: () => setBig(null), role: "dialog", "aria-label": "Foto" },
          h("img", { src: list[big].src, alt: "" }),
          h("div", { className: "row", onClick: (e) => e.stopPropagation() }, h(z, { small: true, onClick: () => setBig(null) }, "Cerrar"), h(z, { small: true, kind: "ghost danger", icon: "trash", onClick: () => del(big) }, "Borrar")),
        )
      : null,
  );
}
registerSlot("session-detail", FuelLine, 10);
registerSlot("session-detail-end", Photos, 10);

// ---------- zapatillas en bloque ----------
function ShoesBulk({ state, actions }) {
  const { z } = TLX.ctx.ui;
  const none = state.sessions.filter((s) => (s.sport === "run" || s.sport === "hike") && !s.shoeId);
  const shoes = state.shoes.filter((s) => !s.retired);
  const [shoe, setShoe] = useState(shoes[0] ? shoes[0].id : "");
  const [from, setFrom] = useState(none.length ? none[none.length - 1].date : "");
  const [to, setTo] = useState(none.length ? none[0].date : "");
  if (!none.length || !shoes.length) return null;
  const sel = none.filter((s) => (!from || s.date >= from) && (!to || s.date <= to));
  const apply = async () => {
    for (const s of sel) await actions.saveSession({ ...s, shoeId: shoe });
    actions.say(`${sel.length} sesiones asignadas`);
  };
  return h(
    "div",
    { className: "card" },
    h("div", { className: "card-head" }, h("div", null, h("h3", null, "Asignar en bloque"), h("div", { className: "card-sub" }, `${none.length} salidas a pie no tienen zapatilla. Elige cuáles y con qué zapatilla las hiciste.`))),
    h(
      "div",
      { className: "row tlx-bulk" },
      h("select", { value: shoe, onChange: (e) => setShoe(e.target.value), "aria-label": "Zapatilla" }, shoes.map((s) => h("option", { key: s.id, value: s.id }, s.name))),
      h("label", { className: "dim small" }, "Desde ", h("input", { className: "input", type: "date", value: from, onChange: (e) => setFrom(e.target.value) })),
      h("label", { className: "dim small" }, "Hasta ", h("input", { className: "input", type: "date", value: to, onChange: (e) => setTo(e.target.value) })),
      h(z, { kind: "primary", small: true, onClick: apply, disabled: !sel.length || !shoe }, `Asignar ${sel.length}`),
    ),
  );
}
registerSlot("zapatillas", ShoesBulk, 10);

// ---------- tablas largas: se muestran 10 filas y un botón ----------
TLX.LongTable = function LongTable(p) {
  const [all, setAll] = useState(false);
  const Inner = p.Inner;
  const rows = p.rows || [];
  if (rows.length <= 14 || all) return h(Inner, p);
  return h(
    "div",
    null,
    h(Inner, { ...p, rows: rows.slice(0, 10) }),
    h("button", { type: "button", className: "btn sm ghost tlx-more", onClick: () => setAll(true) }, `Ver las ${rows.length} filas`),
  );
};
