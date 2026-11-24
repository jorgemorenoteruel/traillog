// TrailLog Pro · capa «Plus»: utilidades comunes y punto de enganche con la app compilada.
// La app llama a TLX.bind(ctx) en cada render con su estado, acciones y funciones internas.

const TLX = (window.TLX = window.TLX || {});
TLX.version = "2026.11.10";
TLX.beta = /\/beta\//.test(location.pathname);
TLX.pages = TLX.pages || {};
TLX.slots = TLX.slots || {};
TLX.ctx = null;

const listeners = new Set();
export const onBind = (fn) => (listeners.add(fn), () => listeners.delete(fn));

export const ICONS = {
  map: "M9 3L3 6v15l6-3 6 3 6-3V3l-6 3zM9 3v15M15 6v15",
  layers: "M12 2l10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM21 21l-4.35-4.35",
  camera: "M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z",
  cloud: "M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z",
  drop: "M12 2.7l5.7 5.6a8 8 0 1 1-11.4 0z",
  target: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20zM12 18a6 6 0 1 0 0-12 6 6 0 0 0 0 12zM12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4z",
  sync: "M21 2v6h-6M3 22v-6h6M3.5 9a9 9 0 0 1 15-3.3L21 8M3 16l2.5 2.3A9 9 0 0 0 20.5 15",
  bolt: "M13 2L3 14h9l-1 8 10-12h-9z",
  image: "M3 3h18v18H3zM8.5 10a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM21 15l-5-5L5 21",
};

TLX.bind = (ctx) => {
  if (!ctx.state) return; // la app aún está cargando la base de datos
  const first = !TLX.ctx;
  TLX.ctx = ctx;
  if (first) Object.assign(ctx.icons, ICONS);
  for (const fn of listeners) {
    try {
      fn(ctx, first);
    } catch (e) {
      console.warn("[TLX]", e);
    }
  }
};

// ---------- utilidades ----------
export const h = (...a) => React.createElement(...a);
export const { useState, useEffect, useMemo, useRef, useCallback, Fragment } = React;
export const ui = () => (TLX.ctx ? TLX.ctx.ui : {});
export const isNum = (x) => typeof x === "number" && Number.isFinite(x);
export const fmt = (x, d = 0) =>
  isNum(x) ? x.toLocaleString("es-ES", { minimumFractionDigits: d, maximumFractionDigits: d }) : "–";
export const median = (a) => {
  const s = a.filter(isNum).slice().sort((x, y) => x - y);
  if (!s.length) return null;
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
export const addDays = (iso, n) => {
  const d = new Date(iso + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a, b) => Math.round((new Date(b + "T12:00:00") - new Date(a + "T12:00:00")) / 864e5);
export const hms = (secs) => {
  if (!isNum(secs)) return "–";
  const hh = Math.floor(secs / 3600),
    mm = Math.floor((secs % 3600) / 60);
  return hh ? `${hh} h ${String(mm).padStart(2, "0")}` : `${mm} min`;
};
export const dateEs = (iso, withYear) =>
  new Date(iso + "T12:00:00").toLocaleDateString("es-ES", {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  });

export const lsGet = (k, d) => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? d : JSON.parse(v);
  } catch {
    return d;
  }
};
export const lsSet = (k, v) => {
  try {
    localStorage.setItem(k, JSON.stringify(v));
  } catch {}
};

export const cssVar = (name) =>
  getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888";

// ---------- huecos donde la app pinta componentes de esta capa ----------
export function registerSlot(name, Comp, order = 50) {
  (TLX.slots[name] = TLX.slots[name] || []).push({ Comp, order });
  TLX.slots[name].sort((a, b) => a.order - b.order);
}
TLX.Slot = function Slot(props) {
  const list = TLX.slots[props.name] || [];
  return h(Fragment, null, ...list.map(({ Comp }, i) => h(ErrorBox, { key: i }, h(Comp, props))));
};

// Si un componente nuevo falla, no tumba la pantalla entera.
class ErrorBox extends React.Component {
  constructor(p) {
    super(p);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err) {
    return { err };
  }
  componentDidCatch(err) {
    console.warn("[TLX]", err);
  }
  render() {
    return this.state.err ? null : this.props.children;
  }
}
TLX.ErrorBox = ErrorBox;
export { ErrorBox };

export default TLX;
