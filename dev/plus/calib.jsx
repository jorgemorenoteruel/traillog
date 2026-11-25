// Punto 1: calibración. Propone, con un toque, el FTP y el pulso en reposo que salen de tus datos.
import TLX, { h, useState, registerSlot, isNum, median, addDays, lsGet, lsSet } from "./core.jsx";

export function estimateFtp(sessions, today) {
  const from = addDays(today, -90);
  let best = null;
  for (const s of sessions) {
    if (s.date < from || !s.hasPower || !(s.sport === "run" || s.sport === "hike")) continue;
    const p20 = s.mmp && s.mmp["1200"];
    if (isNum(p20) && (!best || p20 > best.w)) best = { w: p20, s };
  }
  if (!best) return null;
  return { ftp: Math.round((best.w * 0.95) / 5) * 5, p20: Math.round(best.w), session: best.s };
}

export function estimateRhr(logs, today) {
  const from = addDays(today, -30);
  const vals = logs.filter((l) => l.type === "diario" && l.date >= from && l.date <= today).map((l) => l.rhr);
  const n = vals.filter(isNum).length;
  if (n < 10) return null;
  return { rhr: Math.round(median(vals)), n };
}

function Calibration({ state, actions, today }) {
  const { z } = TLX.ctx.ui;
  const [dismissed, setDismissed] = useState(lsGet("tlx-calib-dismissed", {}));
  const p = state.settings.profile;
  const ftp = estimateFtp(state.sessions, today);
  const rhr = estimateRhr(state.logs, today);
  const items = [];
  if (ftp && isNum(p.ftp) && Math.abs(ftp.ftp - p.ftp) / ftp.ftp > 0.1 && dismissed.ftp !== ftp.ftp)
    items.push({
      key: "ftp",
      value: ftp.ftp,
      title: `FTP: ${p.ftp} → ${ftp.ftp} W`,
      text: `Tu mejor 20 min de los últimos 90 días es ${ftp.p20} W. Con ${p.ftp} W, el IF y las zonas de potencia salen mal.`,
      apply: async () => {
        // El FTP antiguo era un error de configuración: se corrige para todo el historial.
        await actions.setSettings({ ...state.settings, profile: { ...p, ftp: ftp.ftp } });
        actions.say(`FTP: ${ftp.ftp} W`);
      },
    });
  if (rhr && isNum(p.hrRest) && Math.abs(rhr.rhr - p.hrRest) >= 4 && dismissed.rhr !== rhr.rhr)
    items.push({
      key: "rhr",
      value: rhr.rhr,
      title: `Pulso en reposo: ${p.hrRest} → ${rhr.rhr} ppm`,
      text: `Es tu mediana de los últimos 30 días. Las zonas y la carga por pulso dependen de él.`,
      apply: async () => {
        // El pulso en reposo sí cambia con el tiempo: el valor anterior se guarda para las sesiones pasadas.
        const { yn } = TLX.ctx;
        const s = { ...state.settings, profile: { ...p, hrRest: rhr.rhr } };
        if (yn && state.sessions.some((x) => x.date < today)) s.thrHistory = yn(state.settings.thrHistory, p, today);
        await actions.setSettings(s);
        actions.say(`Pulso en reposo: ${rhr.rhr} ppm desde hoy`);
      },
    });
  if (!items.length) return null;
  const dismiss = (it) => {
    const d = { ...dismissed, [it.key]: it.value };
    setDismissed(d);
    lsSet("tlx-calib-dismissed", d);
  };
  return h(
    "div",
    { className: "card tlx-calib" },
    h("div", { className: "card-head" }, h("div", null, h("h3", null, "Ajusta tus umbrales"))),
    h(
      "div",
      { className: "stack", style: { gap: 10 } },
      items.map((it) =>
        h(
          "div",
          { key: it.key, className: "tlx-calib-row" },
          h("div", null, h("b", null, it.title), h("div", { className: "dim small" }, it.text)),
          h(
            "div",
            { className: "row" },
            h(z, { small: true, kind: "primary", onClick: it.apply }, "Aplicar"),
            h(z, { small: true, kind: "ghost", onClick: () => dismiss(it) }, "Ahora no"),
          ),
        ),
      ),
    ),
  );
}

registerSlot("inicio", Calibration, 10);
