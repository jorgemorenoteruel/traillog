// Simulador: desnivel oficial, mapa del recorrido, plan de geles y previsión del tiempo.
import L from "leaflet";
import TLX, { h, useState, useEffect, useRef, registerSlot, isNum, fmt, hms, cssVar, lsGet, addDays, daysBetween } from "./core.jsx";
import { makeMap, setBase } from "./map.jsx";
import { fetchWeather, wxText } from "./weather.jsx";

function Official({ course, courses, actions }) {
  const { z } = TLX.ctx.ui;
  const [v, setV] = useState(course.official || "");
  const save = async (val) => {
    const n = parseFloat(String(val).replace(",", "."));
    await actions.setCourses(courses.map((c) => (c.id === course.id ? { ...c, official: isNum(n) && n > 0 ? Math.round(n) : null } : c)));
    actions.say(isNum(n) && n > 0 ? `Desnivel oficial: ${Math.round(n)} m+` : "Desnivel del GPX");
  };
  const diff = course.official ? (course.official - course.up) / course.up : null;
  return h(
    "div",
    { className: "tlx-official" },
    h("div", null, h("b", null, "Desnivel oficial"), h("div", { className: "dim small" }, `El GPX da ${fmt(course.up)} m+. Si la organización dice otra cifra, ponla: las subidas y bajadas se escalan para cuadrar.`)),
    h(
      "div",
      { className: "row" },
      h("input", { className: "input", inputMode: "numeric", style: { width: 100 }, value: v, placeholder: String(course.up), onChange: (e) => setV(e.target.value) }),
      h(z, { small: true, kind: "primary", onClick: () => save(v) }, "Aplicar"),
      course.official ? h(z, { small: true, kind: "ghost", onClick: () => (setV(""), save("")) }, "Usar el del GPX") : null,
      isNum(diff) ? h("span", { className: "dim small" }, `${diff > 0 ? "+" : ""}${fmt(diff * 100)} % sobre el GPX`) : null,
    ),
  );
}

function timeAtKm(marks, km, k) {
  if (!marks || !marks.length) return null;
  let prev = { km: 0, t: 0 };
  for (const m of marks) {
    if (m.km >= km) return (prev.t + ((m.t - prev.t) * (km - prev.km)) / Math.max(1e-6, m.km - prev.km)) * k;
    prev = m;
  }
  return prev.t * k;
}
function kmAtTime(marks, t, k) {
  let prev = { km: 0, t: 0 };
  for (const m of marks) {
    if (m.t * k >= t) return prev.km + ((m.km - prev.km) * (t - prev.t * k)) / Math.max(1e-6, (m.t - prev.t) * k);
    prev = m;
  }
  return prev.km;
}

function fuelPlan(total, marks, k, cho, gel) {
  if (!isNum(total) || total < 3600 * 0.75) return [];
  const every = (gel / cho) * 3600; // segundos entre geles
  const out = [];
  for (let t = Math.max(1500, every * 0.6); t < total - 600; t += every) out.push({ t, km: kmAtTime(marks, t, k) });
  return out;
}

function CourseMap({ course, result, adjust, fuel }) {
  const el = useRef(null);
  useEffect(() => {
    if (!el.current || !course.ll || course.ll.length < 2) return;
    const map = makeMap(el.current, { lat: course.ll[0][0], lon: course.ll[0][1] });
    const col = { up: cssVar("--s2"), down: cssVar("--s1"), flat: cssVar("--ink-3") };
    const g = L.featureGroup().addTo(map);
    L.polyline(course.ll, { color: "#fff", weight: 8, opacity: 0.8 }).addTo(g);
    const step = course.llStep || 2;
    for (let i = 1; i < course.ll.length; i++) {
      const gr = (course.g[i * step] || 0) / 10;
      const c = gr >= 3 ? "up" : gr <= -3 ? "down" : "flat";
      L.polyline([course.ll[i - 1], course.ll[i]], { color: col[c], weight: 4.5, opacity: 0.95, lineCap: "round" }).addTo(g);
    }
    // tiempo de paso cada 2 km (cada 5 si es larga)
    const totalKm = course.dist / 1000;
    const every = totalKm > 30 ? 5 : 2;
    const llAtKm = (km) => course.ll[Math.min(course.ll.length - 1, Math.round((km * 1000) / (course.step * step)))];
    if (result && result.marks)
      for (let km = every; km < totalKm; km += every) {
        const t = timeAtKm(result.marks, km, adjust);
        L.marker(llAtKm(km), { icon: L.divIcon({ className: "tlx-pass", html: `<b>${km}</b>${hms(t).replace(" h ", ":").replace(" min", "′")}`, iconSize: null }), interactive: false }).addTo(g);
      }
    for (const f of fuel || [])
      L.marker(llAtKm(f.km), { icon: L.divIcon({ className: "tlx-gel", html: "G", iconSize: [18, 18] }), interactive: false }).addTo(g);
    L.circleMarker(course.ll[0], { radius: 7, color: "#fff", weight: 2.5, fillColor: "#22a06b", fillOpacity: 1 }).addTo(g);
    L.circleMarker(course.ll[course.ll.length - 1], { radius: 7, color: "#fff", weight: 2.5, fillColor: cssVar("--ink"), fillOpacity: 1 }).addTo(g);
    map.fitBounds(g.getBounds(), { padding: [16, 16] });
    map.dragging.enable();
    return () => map.remove();
  }, [course, result, adjust, fuel && fuel.length]);
  if (!course.ll) return h("p", { className: "dim small" }, "Para ver el recorrido en el mapa, vuelve a importar el GPX: los recorridos guardados antes no tenían coordenadas.");
  return h("div", { ref: el, className: "tlx-map", style: { height: 380 } });
}

function RaceWeather({ course, state }) {
  const goal = (state.settings.goals || []).find((g) => course.name && g.name && course.name.toLowerCase().includes(g.name.toLowerCase().split(" ")[0]));
  const [wx, setWx] = useState(null);
  const today = new Date().toISOString().slice(0, 10);
  const days = goal && goal.date ? daysBetween(today, goal.date) : null;
  useEffect(() => {
    if (!goal || !course.ll || days === null || days < 0 || days > 14) return;
    fetchWeather(course.ll[0][0], course.ll[0][1], goal.date, 8, 13).then(setWx).catch(() => {});
  }, [goal && goal.date, course.id]);
  if (!wx) return null;
  return h("p", { className: "small" }, h("b", null, `Previsión para el ${goal.date.split("-").reverse().slice(0, 2).join("/")}: `), `${wx.tmin}–${wx.tmax} °C, ${wxText(wx.code)}${wx.wind >= 15 ? `, viento ${wx.wind} km/h` : ""}${wx.rain >= 0.5 ? `, ${fmt(wx.rain, 1)} mm` : ""}. Pon la temperatura en «Temperatura prevista».`);
}

function SimExtras({ state, actions, courses, courseKey, segs, result, adjust }) {
  const { H } = TLX.ctx.ui;
  const sim = state.settings.sim || {};
  const [cho, setCho] = useState(isNum(sim.cho) ? sim.cho : 60);
  const [gel, setGel] = useState(isNum(sim.gel) ? sim.gel : 25);
  const course = courseKey && courseKey.startsWith("gpx:") ? courses.find((c) => "gpx:" + c.id === courseKey) : null;
  const total = result && isNum(result.moving) ? result.moving * (adjust || 1) : null;
  const fuel = result && result.marks ? fuelPlan(total, result.marks, adjust || 1, cho, gel) : [];
  const saveFuel = (c, g) => actions.setSettings({ ...state.settings, sim: { ...sim, cho: c, gel: g } });
  if (!segs) return null;
  return h(
    "div",
    { className: "stack" },
    course
      ? h(
          "div",
          { className: "card" },
          h("div", { className: "card-head" }, h("div", null, h("h3", null, "El recorrido"), h("div", { className: "card-sub" }, "Mapa del IGN con tu tiempo de paso previsto y dónde tomar cada gel."))),
          h(Official, { course, courses, actions }),
          h(CourseMap, { course, result, adjust, fuel }),
          h(RaceWeather, { course, state }),
        )
      : null,
    total
      ? h(
          "div",
          { className: "card" },
          h("div", { className: "card-head" }, h("div", null, h("h3", null, "Plan de geles"), h("div", { className: "card-sub" }, total < 2700 ? "Para menos de 45 minutos no hace falta comer." : `Para ${hms(total)} en movimiento: ${fuel.length} ${fuel.length === 1 ? "gel" : "geles"} y unos ${fmt((total / 3600) * 500, 0)} ml de líquido (más si hace calor).`))),
          h(
            "div",
            { className: "row" },
            h(H, { label: "Carbohidratos por hora (g)" }, h("input", { className: "input", inputMode: "numeric", value: cho, onChange: (e) => setCho(Number(e.target.value) || 0), onBlur: () => saveFuel(cho, gel) })),
            h(H, { label: "Gramos por gel" }, h("input", { className: "input", inputMode: "numeric", value: gel, onChange: (e) => setGel(Number(e.target.value) || 0), onBlur: () => saveFuel(cho, gel) })),
          ),
          fuel.length
            ? h(
                "ol",
                { className: "tlx-fuel" },
                fuel.map((f, i) => h("li", { key: i }, h("b", null, hms(f.t)), ` · km ${fmt(f.km, 1)}`, i === fuel.length - 1 && total > 3 * 3600 ? " · el último, mejor con cafeína si la tomas" : "")),
              )
            : null,
          h("p", { className: "hint" }, "Entrena la tripa: toma lo mismo en las tiradas largas. 60 g/h es un buen punto de partida; muchos corredores llegan a 80–90 g/h con práctica."),
        )
      : null,
  );
}
registerSlot("sim", SimExtras, 10);
