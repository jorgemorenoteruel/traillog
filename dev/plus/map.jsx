// Mapas: IGN (mapa topográfico y ortofoto PNOA) con Leaflet.
import L from "leaflet";
import TLX, { h, useState, useEffect, useRef, useMemo, lsGet, lsSet, cssVar, fmt, dateEs, isNum, hms } from "./core.jsx";

const WMTS = (base, layer, fmtImg) =>
  `${base}?service=WMTS&request=GetTile&version=1.0.0&layer=${layer}&style=default&tilematrixset=GoogleMapsCompatible&format=${fmtImg}&TileMatrix={z}&TileCol={x}&TileRow={y}`;

export const BASES = {
  mapa: {
    label: "Mapa",
    url: WMTS("https://www.ign.es/wmts/mapa-raster", "MTN", "image/jpeg"),
    attribution: '© <a href="https://www.ign.es" target="_blank" rel="noopener">IGN</a> · CC BY 4.0 scne.es',
    maxNativeZoom: 17,
  },
  orto: {
    label: "Ortofoto",
    url: WMTS("https://www.ign.es/wmts/pnoa-ma", "OI.OrthoimageCoverage", "image/jpeg"),
    attribution: 'PNOA cedido por © <a href="https://www.ign.es" target="_blank" rel="noopener">IGN</a>',
    maxNativeZoom: 19,
  },
  topo: {
    label: "Fuera de España",
    url: "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png",
    attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> · © OpenTopoMap (CC-BY-SA)',
    maxNativeZoom: 17,
  },
};
const inSpain = (lat, lon) => lat > 27 && lat < 44.2 && lon > -18.5 && lon < 4.6;

export function makeMap(el, { lat, lon, interactive = true } = {}) {
  const touch = matchMedia("(pointer: coarse)").matches;
  const map = L.map(el, {
    zoomControl: interactive,
    attributionControl: true,
    scrollWheelZoom: false,
    dragging: interactive && !touch,
    touchZoom: interactive,
    doubleClickZoom: interactive,
    boxZoom: false,
    keyboard: interactive,
    tap: false,
    preferCanvas: true,
    zoomSnap: 0.25,
    fadeAnimation: false,
  });
  map.attributionControl.setPrefix("");
  (TLX._maps = TLX._maps || []).push(map);
  const pref = lsGet("tlx-base", "mapa");
  const key = isNum(lat) && !inSpain(lat, lon) ? "topo" : pref;
  setBase(map, key);
  return map;
}
export function setBase(map, key) {
  const b = BASES[key] || BASES.mapa;
  if (map._tlxBase) map.removeLayer(map._tlxBase);
  map._tlxBase = L.tileLayer(b.url, { attribution: b.attribution, maxZoom: 19, maxNativeZoom: b.maxNativeZoom, crossOrigin: false, subdomains: "abc" }).addTo(map);
  map._tlxBase.bringToBack();
  map._tlxKey = key;
}

function BaseSwitch({ map, value, onChange }) {
  const { xe } = TLX.ctx.ui;
  return h(xe, {
    value,
    label: "Fondo del mapa",
    options: [
      ["mapa", "Mapa"],
      ["orto", "Ortofoto"],
    ],
    onChange: (k) => {
      lsSet("tlx-base", k);
      if (map) setBase(map, k);
      onChange(k);
    },
  });
}

const cat = (g) => (g >= 3 ? "up" : g <= -3 ? "down" : "flat");
const catColor = () => ({ up: cssVar("--s2"), down: cssVar("--s1"), flat: cssVar("--ink-3") });

function drawTrack(map, { lat, lon, grd, km }) {
  const col = catColor();
  const group = L.featureGroup().addTo(map);
  let run = [],
    cur = null;
  const flush = () => {
    if (run.length > 1) L.polyline(run, { color: col[cur], weight: 4.5, opacity: 0.95, lineCap: "round", lineJoin: "round" }).addTo(group);
  };
  // halo para que la traza se lea sobre cualquier fondo
  const all = [];
  for (let i = 0; i < lat.length; i++) if (isNum(lat[i]) && isNum(lon[i])) all.push([lat[i], lon[i]]);
  L.polyline(all, { color: "#fff", weight: 8, opacity: 0.75, lineCap: "round", lineJoin: "round" }).addTo(group);
  for (let i = 0; i < lat.length; i++) {
    if (!isNum(lat[i]) || !isNum(lon[i])) continue;
    const c = cat(grd ? grd[i] : 0);
    if (c !== cur) {
      if (run.length) {
        const last = run[run.length - 1];
        flush();
        run = [last];
      }
      cur = c;
    }
    run.push([lat[i], lon[i]]);
  }
  flush();
  if (all.length) {
    L.circleMarker(all[0], { radius: 7, color: "#fff", weight: 2.5, fillColor: "#22a06b", fillOpacity: 1 }).addTo(group);
    L.circleMarker(all[all.length - 1], { radius: 7, color: "#fff", weight: 2.5, fillColor: cssVar("--ink"), fillOpacity: 1 }).addTo(group);
  }
  if (km) {
    const total = km[km.length - 1] || 0;
    const step = total > 30 ? 5 : total > 12 ? 2 : 1;
    let next = step;
    for (let i = 0; i < km.length; i++) {
      if (km[i] >= next && isNum(lat[i])) {
        L.marker([lat[i], lon[i]], { icon: L.divIcon({ className: "tlx-km", html: String(next), iconSize: [20, 20] }), interactive: false, keyboard: false }).addTo(group);
        next += step;
      }
    }
  }
  return group;
}

// ---------- mapa de una sesión (sustituye al dibujo sin fondo) ----------
export function RouteMap(props) {
  const { lat, lon, grd, km, cursor, height } = props;
  const el = useRef(null);
  const mapRef = useRef(null);
  const curRef = useRef(null);
  const [base, setBaseKey] = useState(lsGet("tlx-base", "mapa"));
  const [full, setFull] = useState(false);
  useEffect(() => {
    if (!el.current || !lat || !lat.length) return;
    const map = makeMap(el.current, { lat: lat.find(isNum), lon: lon.find(isNum) });
    const g = drawTrack(map, { lat, lon, grd, km });
    map.fitBounds(g.getBounds(), { padding: [18, 18] });
    mapRef.current = map;
    setBaseKey(map._tlxKey);
    return () => {
      map.remove();
      mapRef.current = null;
      curRef.current = null;
    };
  }, [lat, lon, full]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (isNum(cursor) && isNum(lat[cursor])) {
      const p = [lat[cursor], lon[cursor]];
      if (!curRef.current) curRef.current = L.circleMarker(p, { radius: 8, color: "#fff", weight: 3, fillColor: cssVar("--accent"), fillOpacity: 1 }).addTo(map);
      else curRef.current.setLatLng(p);
    } else if (curRef.current) {
      map.removeLayer(curRef.current);
      curRef.current = null;
    }
  }, [cursor]);
  const legend = h(
    "div",
    { className: "tlx-legend" },
    h("span", null, h("i", { style: { background: "var(--s2)" } }), "Subida"),
    h("span", null, h("i", { style: { background: "var(--s1)" } }), "Bajada"),
    h("span", null, h("i", { style: { background: "var(--ink-3)" } }), "Llano"),
    h("span", null, h("i", { className: "dot", style: { background: "#22a06b" } }), "Salida"),
    h("span", null, h("i", { className: "dot", style: { background: "var(--ink)" } }), "Llegada"),
  );
  const { z } = TLX.ctx.ui;
  const tools = h(
    "div",
    { className: "tlx-maptools" },
    h(BaseSwitch, { map: mapRef.current, value: base, onChange: setBaseKey }),
    h(z, { small: true, kind: "ghost", icon: full ? "x" : "layers", onClick: () => setFull(!full) }, full ? "Cerrar" : "Pantalla completa"),
  );
  const mapDiv = h("div", { ref: el, className: "tlx-map", style: { height: full ? "100%" : height || 340 } });
  if (full)
    return h(
      "div",
      { className: "tlx-full" },
      h("div", { className: "tlx-full-bar" }, tools),
      mapDiv,
      legend,
    );
  return h("div", null, tools, mapDiv, legend);
}
TLX.RouteMap = function RouteMapSafe(props) {
  // si Leaflet o los datos fallan, se queda el dibujo original
  if (!props.lat || !props.lat.some(isNum)) return props.fallback ? h(props.fallback, props) : null;
  return h(TLX.ErrorBox, null, h(RouteMap, props));
};

// ---------- miniatura de recorrido para listas ----------
const thumbCache = new WeakMap();
export function thumbPath(s, size = 44, pad = 4) {
  if (thumbCache.has(s)) return thumbCache.get(s);
  const c = s.chart;
  let d = null;
  if (c && c.lat && c.lat.length > 3) {
    const pts = [];
    const step = Math.max(1, Math.floor(c.lat.length / 120));
    for (let i = 0; i < c.lat.length; i += step) if (isNum(c.lat[i]) && isNum(c.lon[i])) pts.push([c.lat[i], c.lon[i]]);
    if (pts.length > 3) {
      const k = Math.cos((pts[0][0] * Math.PI) / 180);
      const xs = pts.map((p) => p[1] * k),
        ys = pts.map((p) => -p[0]);
      const minx = Math.min(...xs),
        maxx = Math.max(...xs),
        miny = Math.min(...ys),
        maxy = Math.max(...ys);
      const sc = (size - pad * 2) / Math.max(maxx - minx, maxy - miny, 1e-6);
      const ox = (size - (maxx - minx) * sc) / 2,
        oy = (size - (maxy - miny) * sc) / 2;
      d = "M" + pts.map((p, i) => `${((xs[i] - minx) * sc + ox).toFixed(1)} ${((ys[i] - miny) * sc + oy).toFixed(1)}`).join("L");
    }
  }
  thumbCache.set(s, d);
  return d;
}
const SPORT_VAR = { run: "--s2", hike: "--s3", bike: "--s1", ski: "--s4", roco: "--ink-3", fuerza: "--ink-3", otro: "--ink-3" };
TLX.Thumb = function Thumb({ session, fallback }) {
  const d = thumbPath(session);
  if (!d) return fallback || null;
  return h(
    "span",
    { className: "ico tlx-thumb", "aria-hidden": "true" },
    h("svg", { viewBox: "0 0 44 44", width: 44, height: 44 }, h("path", { d, fill: "none", stroke: `var(${SPORT_VAR[session.sport] || "--accent"})`, strokeWidth: 2.2, strokeLinecap: "round", strokeLinejoin: "round" })),
  );
};

// ---------- recorridos repetidos: «Mis subidas» ----------
const R = 6371000;
export const dist = (a, b, c, d) => {
  const x = ((d - b) * Math.PI) / 180 * Math.cos((((a + c) / 2) * Math.PI) / 180);
  const y = ((c - a) * Math.PI) / 180;
  return Math.sqrt(x * x + y * y) * R;
};
export const climbKey = (g) => `${g.lat.toFixed(3)},${g.lon.toFixed(3)}`;
export function findClimbs(sessions, names) {
  const all = [];
  for (const s of sessions)
    for (const c of s.climbs || [])
      if (isNum(c.lat) && isNum(c.vam) && c.gain >= 60 && (s.sport === "run" || s.sport === "hike")) all.push({ ...c, s });
  const groups = [];
  for (const c of all.sort((a, b) => b.gain - a.gain)) {
    const g = groups.find((g) => dist(g.lat, g.lon, c.lat, c.lon) < 150 && Math.abs(c.gain - g.gain) / g.gain < 0.25 && Math.abs(c.dist - g.dist) / g.dist < 0.3);
    if (g) g.items.push(c);
    else groups.push({ lat: c.lat, lon: c.lon, gain: c.gain, dist: c.dist, grade: c.grade, items: [c] });
  }
  return groups
    .filter((g) => g.items.length >= 3)
    .map((g) => {
      g.items.sort((a, b) => a.s.startMs - b.s.startMs);
      const run = g.items.filter((c) => c.s.sport === "run");
      const ref = run.length >= 2 ? run : g.items;
      g.best = ref.reduce((m, c) => (c.vam > m.vam ? c : m), ref[0]);
      g.last = ref[ref.length - 1];
      g.name = climbName(g);
      const own = names && (names[climbKey(g)] || Object.entries(names).find(([k]) => {
        const [a, b] = k.split(",").map(Number);
        return dist(a, b, g.lat, g.lon) < 150;
      })?.[1]);
      if (own) g.name = `${own} · ${fmt(g.gain)} m al ${fmt(g.grade)} %`;
      return g;
    })
    .sort((a, b) => b.items.length - a.items.length);
}
function climbName(g) {
  // el nombre de sesión más repetido que no sea genérico
  const counts = {};
  for (const c of g.items) {
    const n = (c.s.name || "").replace(/^(Morning|Lunch|Afternoon|Evening|Night)\b.*$/i, "").replace(/^[0-9a-f]{8,}$/i, "").trim();
    const w = n.match(/(Grosin|Grosín|Castiello|Oroel|Beica|Rapitán|Rapitan|Collarada|Canal|Guasa|Estiviellas|Carretón|Claraco|Santiago|Bergosa|Ascara|Fuerte)/i);
    if (w) counts[w[1]] = (counts[w[1]] || 0) + 1;
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return `${best ? best[0][0].toUpperCase() + best[0].slice(1) : "Subida"} · ${fmt(g.gain)} m al ${fmt(g.grade)} %`;
}
function climbLatLng(c) {
  const ch = c.s.chart;
  if (!ch || !ch.lat) return null;
  const i0 = Math.max(0, Math.floor(c.t0 / ch.step)),
    i1 = Math.min(ch.lat.length - 1, Math.ceil(c.t1 / ch.step));
  const pts = [];
  for (let i = i0; i <= i1; i++) if (isNum(ch.lat[i])) pts.push([ch.lat[i], ch.lon[i]]);
  return pts.length > 1 ? pts : null;
}

// ---------- página «Mapa» ----------
const SPORTS = { run: "Carrera", hike: "Monte", bike: "Bici", ski: "Esquí" };
function MapaPage({ state, go, setSessionId }) {
  const { xe, z, J } = TLX.ctx.ui;
  const el = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const climbRef = useRef(null);
  const years = useMemo(() => [...new Set(state.sessions.map((s) => s.date.slice(0, 4)))].sort().reverse(), [state.sessions]);
  const [year, setYear] = useState(lsGet("tlx-map-year", "todo"));
  const [sport, setSport] = useState(lsGet("tlx-map-sport", "todo"));
  const [base, setBaseKey] = useState(lsGet("tlx-base", "mapa"));
  const [sel, setSel] = useState(null);
  const [climbSel, setClimbSel] = useState(null);
  const list = useMemo(
    () =>
      state.sessions.filter(
        (s) => s.chart && s.chart.lat && s.chart.lat.some(isNum) && (year === "todo" || s.date.startsWith(year)) && (sport === "todo" || s.sport === sport),
      ),
    [state.sessions, year, sport],
  );
  const cnames = state.settings.tlxClimbNames || {};
  const climbs = useMemo(() => findClimbs(state.sessions, cnames), [state.sessions, state.settings.tlxClimbNames]);
  const rename = (g) => {
    const cur = g.name.split(" · ")[0];
    const n = prompt("Nombre de esta subida", /^Subida$/.test(cur) ? "" : cur);
    if (n === null) return;
    const next = { ...cnames, [climbKey(g)]: n.trim() || undefined };
    if (!n.trim()) delete next[climbKey(g)];
    TLX.ctx.actions.setSettings({ ...state.settings, tlxClimbNames: next });
  };
  useEffect(() => {
    const map = makeMap(el.current, {});
    map.setView([42.57, -0.55], 11, { animate: false });
    map.dragging.enable();
    mapRef.current = map;
    setBaseKey(map._tlxKey);
    return () => map.remove();
  }, []);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (layerRef.current) map.removeLayer(layerRef.current);
    const g = L.featureGroup();
    for (const s of list) {
      const c = s.chart,
        pts = [];
      const step = Math.max(1, Math.floor(c.lat.length / 220));
      for (let i = 0; i < c.lat.length; i += step) if (isNum(c.lat[i])) pts.push([c.lat[i], c.lon[i]]);
      if (pts.length < 2) continue;
      const line = L.polyline(pts, { color: cssVar(SPORT_VAR[s.sport] || "--accent"), weight: 3, opacity: 0.42, lineCap: "round", lineJoin: "round" });
      line.on("click", () => setSel(s));
      line.addTo(g);
    }
    g.addTo(map);
    layerRef.current = g;
    // encuadre: la zona donde más sales (las salidas lejanas se ven al alejar el mapa)
    const st = list.filter((s) => isNum(s.startLat));
    if (st.length) {
      const med = (a) => a.slice().sort((x, y) => x - y)[a.length >> 1];
      const mlat = med(st.map((s) => s.startLat)),
        mlon = med(st.map((s) => s.startLon));
      const near = L.featureGroup();
      g.eachLayer((ly) => {
        const c = ly.getBounds().getCenter();
        if (dist(mlat, mlon, c.lat, c.lng) < 60000) near.addLayer(L.polyline(ly.getLatLngs()));
      });
      map.fitBounds((near.getLayers().length ? near : g).getBounds(), { padding: [20, 20], maxZoom: 14, animate: false });
    }
  }, [list]);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (climbRef.current) map.removeLayer(climbRef.current);
    climbRef.current = null;
    if (!climbSel) return;
    const pts = climbLatLng(climbSel.best) || climbLatLng(climbSel.last);
    if (!pts) return;
    climbRef.current = L.featureGroup([
      L.polyline(pts, { color: "#fff", weight: 10, opacity: 0.9 }),
      L.polyline(pts, { color: cssVar("--gr-red") || "#d7312b", weight: 5, opacity: 1 }),
    ]).addTo(map);
    map.fitBounds(climbRef.current.getBounds(), { padding: [40, 40], maxZoom: 15, animate: false });
  }, [climbSel]);

  const totals = list.reduce((a, s) => ((a.km += (s.dist || 0) / 1000), (a.up += s.ascent || 0), a), { km: 0, up: 0 });
  const open = (s) => {
    setSessionId ? (go("sesiones", s.id)) : go("sesiones", s.id);
  };
  return h(
    "div",
    { className: "stack" },
    h("div", { className: "page-head" }, h("div", null, h("h1", null, "Mapa"), h("div", { className: "sub" }, "Todas tus salidas sobre el mapa del IGN. Toca una línea para ver cuál fue."))),
    h(
      "div",
      { className: "row tlx-filters" },
      h(xe, { value: year, label: "Año", options: [["todo", "Todo"], ...years.slice(0, 4).map((y) => [y, y])], onChange: (v) => (setYear(v), lsSet("tlx-map-year", v)) }),
      h(xe, { value: sport, label: "Tipo", options: [["todo", "Todo"], ...Object.entries(SPORTS).filter(([k]) => state.sessions.some((s) => s.sport === k))], onChange: (v) => (setSport(v), lsSet("tlx-map-sport", v)) }),
      h(BaseSwitch, { map: mapRef.current, value: base, onChange: setBaseKey }),
    ),
    h(
      "div",
      { className: "card tlx-mapcard" },
      h("div", { ref: el, className: "tlx-map tlx-map-big" }),
      sel
        ? h(
            "div",
            { className: "tlx-pop" },
            h("div", null, h("b", null, sel.name), h("div", { className: "dim small" }, `${dateEs(sel.date, true)} · ${fmt((sel.dist || 0) / 1000, 1)} km · ${fmt(sel.ascent || 0)} m+ · ${hms(sel.dur)}`)),
            h("div", { className: "row" }, h(z, { small: true, kind: "primary", onClick: () => open(sel) }, "Abrir"), h(z, { small: true, kind: "ghost", icon: "x", title: "Cerrar", onClick: () => setSel(null) })),
          )
        : null,
    ),
    h(
      "div",
      { className: "stats" },
      h(J, { label: "Salidas", value: fmt(list.length) }),
      h(J, { label: "Distancia", value: fmt(totals.km), unit: "km" }),
      h(J, { label: "Desnivel", value: fmt(totals.up), unit: "m" }),
    ),
    climbs.length
      ? h(
          "div",
          { className: "card" },
          h("div", { className: "card-head" }, h("div", null, h("h3", null, "Mis subidas"), h("div", { className: "card-sub" }, "Subidas que has repetido 3 veces o más. Comparar la misma subida es el test de forma más limpio. Toca una para verla."))),
          h(
            "div",
            { className: "tlx-climbs" },
            climbs.slice(0, 12).map((g, i) =>
              h(
                "div",
                { key: i, role: "button", tabIndex: 0, className: "tlx-climb" + (climbSel === g ? " on" : ""), onClick: () => setClimbSel(climbSel === g ? null : g), onKeyDown: (e) => e.key === "Enter" && setClimbSel(climbSel === g ? null : g) },
                h("div", { className: "tlx-climb-head" }, h("b", null, g.name), h("button", { type: "button", className: "tlx-link", onClick: (e) => (e.stopPropagation(), rename(g)) }, "Nombre")),
                h(Spark, { vals: g.items.filter((c) => c.s.sport === g.best.s.sport).map((c) => c.vam) }),
                h("span", { className: "dim small" }, `${g.items.length} veces · mejor ${fmt(g.best.vam)} m/h (${dateEs(g.best.s.date)}) · última ${fmt(g.last.vam)} m/h`),
              ),
            ),
          ),
        )
      : null,
  );
}
function Spark({ vals }) {
  if (vals.length < 2) return null;
  const w = 120,
    hgt = 26;
  const mn = Math.min(...vals),
    mx = Math.max(...vals);
  const d = vals.map((v, i) => `${i ? "L" : "M"}${((i / (vals.length - 1)) * (w - 4) + 2).toFixed(1)} ${(hgt - 3 - ((v - mn) / Math.max(mx - mn, 1)) * (hgt - 6)).toFixed(1)}`).join("");
  const last = vals[vals.length - 1];
  return h(
    "svg",
    { width: w, height: hgt, viewBox: `0 0 ${w} ${hgt}`, className: "tlx-spark", "aria-hidden": "true" },
    h("path", { d, fill: "none", stroke: "var(--accent)", strokeWidth: 1.8, strokeLinejoin: "round", strokeLinecap: "round" }),
    h("circle", { cx: w - 2, cy: hgt - 3 - ((last - mn) / Math.max(mx - mn, 1)) * (hgt - 6), r: 2.6, fill: "var(--accent)" }),
  );
}
TLX.Spark = Spark;
TLX.pages.mapa = function MapaSafe(p) {
  return h(TLX.ErrorBox, null, h(MapaPage, p));
};
TLX.L = L;
