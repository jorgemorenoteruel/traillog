// Tiempo real de cada salida (Open-Meteo, gratis y sin clave). Sustituye a «°C en el reloj».
import TLX, { h, useState, useEffect, lsGet, lsSet, isNum, fmt, addDays } from "./core.jsx";

const VARS = "temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code";
export function wxText(code) {
  if (!isNum(code)) return "";
  if (code === 0) return "despejado";
  if (code <= 2) return "algo nuboso";
  if (code === 3) return "nublado";
  if (code === 45 || code === 48) return "niebla";
  if (code >= 51 && code <= 57) return "llovizna";
  if (code >= 61 && code <= 67) return "lluvia";
  if (code >= 71 && code <= 77) return "nieve";
  if (code >= 80 && code <= 82) return "chubascos";
  if (code >= 85 && code <= 86) return "nieve";
  if (code >= 95) return "tormenta";
  return "";
}
const ICON = (code) => (!isNum(code) ? "cloud" : code === 0 ? "sun" : code >= 51 ? "drop" : "cloud");

export async function fetchWeather(lat, lon, date, h0, h1) {
  const today = new Date().toISOString().slice(0, 10);
  const recent = date >= addDays(today, -80);
  const base = recent ? "https://api.open-meteo.com/v1/forecast" : "https://archive-api.open-meteo.com/v1/archive";
  const url = `${base}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}&start_date=${date}&end_date=${date}&hourly=${VARS}&timezone=auto`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("open-meteo " + r.status);
  const j = await r.json();
  const H = j.hourly;
  const pick = (k) => H[k].slice(h0, h1 + 1).filter(isNum);
  const t = pick("temperature_2m"),
    w = pick("wind_speed_10m"),
    p = pick("precipitation"),
    hu = pick("relative_humidity_2m"),
    c = pick("weather_code");
  if (!t.length) return null;
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return {
    temp: Math.round(avg(t)),
    tmin: Math.round(Math.min(...t)),
    tmax: Math.round(Math.max(...t)),
    wind: Math.round(Math.max(...w)),
    rain: Math.round(p.reduce((x, y) => x + y, 0) * 10) / 10,
    hum: Math.round(avg(hu)),
    code: c.length ? Math.max(...c) : null,
  };
}

function sessionHours(s) {
  const local = new Date(s.startMs + (s.tzOffsetMin || 0) * 60000);
  const h0 = local.getUTCHours();
  const h1 = Math.min(23, h0 + Math.ceil((s.elapsed || s.dur || 3600) / 3600));
  return [h0, h1];
}

TLX.WeatherChip = function WeatherChip({ session: s }) {
  const key = "tlx-wx:" + s.id;
  const [wx, setWx] = useState(lsGet(key, null));
  useEffect(() => {
    if (wx || !isNum(s.startLat) || !s.date) return;
    let alive = true;
    const [h0, h1] = sessionHours(s);
    fetchWeather(s.startLat, s.startLon, s.date, h0, h1)
      .then((r) => {
        if (r && alive) {
          setWx(r);
          lsSet(key, r);
        }
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [s.id]);
  const { ge } = TLX.ctx.ui;
  const watch = isNum(s.temp) ? `El reloj marcó ${fmt(s.temp)} °C en la muñeca (más que el aire).` : "";
  if (!wx) return isNum(s.temp) ? h("span", { className: "chip", title: watch }, fmt(s.temp), " °C en el reloj") : null;
  return h(
    "span",
    { className: "chip tlx-wx", title: `Tiempo real en la zona (Open-Meteo): ${wx.tmin}–${wx.tmax} °C, humedad ${wx.hum} %. ${watch}` },
    h(ge, { name: ICON(wx.code), size: 14 }),
    `${wx.temp} °C`,
    wxText(wx.code) ? ` · ${wxText(wx.code)}` : "",
    wx.wind >= 15 ? ` · viento ${wx.wind} km/h` : "",
    wx.rain >= 0.5 ? ` · ${fmt(wx.rain, 1)} mm` : "",
  );
};
TLX.fetchWeather = fetchWeather;
