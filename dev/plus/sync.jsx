// Sincronización automática entre dispositivos a través de un gist privado de GitHub.
// Usa el mismo formato y la misma lógica de fusión que «Pasar al otro dispositivo»:
// cada lado conserva lo suyo y, si algo se cambió en los dos, gana lo último.
import TLX, { h, useState, useEffect, registerSlot, onBind, lsGet, lsSet, isNum } from "./core.jsx";

const CFG_KEY = "tlx-sync";
const DESC = "TrailLog Pro · sincronización (no borrar)";
const MANIFEST = "traillog-sync.json";
const PART = 900000; // por debajo del megabyte que la API devuelve entero por archivo
const api = () => lsGet("tlx-sync-api", "https://api.github.com");

let cfg = lsGet(CFG_KEY, null);
const save = (c) => {
  cfg = c;
  lsSet(CFG_KEY, c);
  emit();
};
const subs = new Set();
const emit = () => subs.forEach((f) => f());
let status = { busy: false, error: null, last: null, note: "" };
const setStatus = (s) => {
  status = { ...status, ...s };
  emit();
};

async function gh(path, { method = "GET", body, etag, token } = {}) {
  const r = await fetch(api() + path, {
    method,
    cache: "no-store",
    headers: {
      Authorization: "Bearer " + (token || cfg.token),
      Accept: "application/vnd.github+json",
      ...(etag ? { "If-None-Match": etag } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (r.status === 401) throw new Error("GitHub no acepta el código. Crea uno nuevo con el permiso «gist» y pégalo otra vez.");
  if (r.status === 403 || r.status === 429) throw new Error("GitHub pide esperar un poco. Lo intento más tarde.");
  return r;
}

function device() {
  const m = TLX.ctx && TLX.ctx.state.syncMeta;
  return (m && m.device) || "este";
}

async function buildFiles(old) {
  const { ao, state } = TLX.ctx;
  const s = await ao(state);
  const parts = [];
  for (let i = 0; i < s.length; i += PART) parts.push(s.slice(i, i + PART));
  const savedAt = Date.now();
  const files = {
    [MANIFEST]: { content: JSON.stringify({ app: "TrailLogPro", v: 1, parts: parts.length, savedAt, device: device(), bytes: s.length }) },
  };
  parts.forEach((c, i) => (files[`traillog-sync-${i + 1}.txt`] = { content: c }));
  for (const name of Object.keys(old || {}))
    if (name !== MANIFEST && !files[name] && /^traillog-sync-\d+\.txt$/.test(name)) files[name] = null;
  return { files, savedAt };
}

async function readGist(json) {
  const man = JSON.parse(json.files[MANIFEST].content);
  let s = "";
  for (let i = 1; i <= man.parts; i++) {
    const f = json.files[`traillog-sync-${i}.txt`];
    if (!f) throw new Error("La copia en GitHub está incompleta.");
    s += f.truncated ? await (await fetch(f.raw_url, { cache: "no-store" })).text() : f.content;
  }
  return { man, text: s };
}

let ignoreNext = false;
async function applyRemote(text) {
  const { rt, lt, actions } = TLX.ctx;
  const u = await rt(JSON.parse(text));
  const t = await lt(u, "merge", TLX.ctx.state);
  const rep = t._report || {};
  delete t._report;
  ignoreNext = true;
  actions.replaceState({
    sessions: t.sessions,
    logs: t.logs,
    shoes: t.shoes,
    plan: t.plan,
    planMarks: t.planMarks,
    courses: t.courses,
    settings: t.settings,
    syncMeta: t.syncMeta,
  });
  const n = (rep.added || 0) + (rep.updated || 0) + (rep.logsAdded || 0) + (rep.logsUpdated || 0) + (rep.shoes || 0) + (rep.removed || 0) + (rep.settings ? 1 : 0) + (rep.plan ? 1 : 0);
  return n;
}

let lastGistFiles = null;
export async function pull({ quiet = true } = {}) {
  if (!cfg || !cfg.token || !cfg.gistId || !TLX.ctx) return;
  const r = await gh(`/gists/${cfg.gistId}`, { etag: cfg.etag });
  if (r.status === 304) {
    save({ ...cfg, lastPull: Date.now() });
    return 0;
  }
  if (r.status === 404) {
    save({ ...cfg, gistId: null, etag: null });
    dirty = true;
    return 0;
  }
  if (!r.ok) throw new Error("GitHub ha respondido " + r.status);
  const json = await r.json();
  lastGistFiles = json.files;
  const etag = r.headers.get("ETag");
  const { man, text } = await readGist(json);
  let n = 0;
  if (!(man.device === device() && man.savedAt === cfg.lastPush)) n = await applyRemote(text);
  save({ ...cfg, etag, lastPull: Date.now(), remoteSavedAt: man.savedAt, remoteDevice: man.device });
  if (n && !quiet) TLX.ctx.actions.say("Datos del otro dispositivo al día");
  else if (n) TLX.ctx.actions.say(`${n} ${n === 1 ? "cambio" : "cambios"} de tu otro dispositivo`);
  return n;
}

export async function push() {
  if (!cfg || !cfg.token || !TLX.ctx) return;
  if (cfg.gistId) await pull(); // primero, lo que haya cambiado fuera
  const { files, savedAt } = await buildFiles(lastGistFiles);
  let r;
  if (cfg.gistId) r = await gh(`/gists/${cfg.gistId}`, { method: "PATCH", body: { files } });
  else r = await gh(`/gists`, { method: "POST", body: { description: DESC, public: false, files } });
  if (!r.ok) throw new Error("GitHub no ha guardado los datos (" + r.status + ").");
  const json = await r.json();
  lastGistFiles = json.files;
  save({ ...cfg, gistId: json.id, etag: r.headers.get("ETag"), lastPush: savedAt, lastPull: Date.now() });
  dirty = false;
  const { so, actions, state } = TLX.ctx;
  ignoreNext = true;
  actions.replaceState(await so(state)); // marca «pasado» y quita los avisos de copia pendiente
}

let running = null;
export function syncNow(opts = {}) {
  if (running) return running;
  running = (async () => {
    setStatus({ busy: true, error: null });
    try {
      await pull(opts);
      if (dirty || !cfg.gistId) await push();
      setStatus({ busy: false, last: Date.now() });
    } catch (e) {
      setStatus({ busy: false, error: e && e.message ? e.message : String(e) });
    } finally {
      running = null;
    }
  })();
  return running;
}

// ---------- cambios locales → subir ----------
let dirty = false;
let refs = null;
let timer = null;
const TRACK = ["sessions", "logs", "shoes", "plan", "planMarks", "courses", "settings"];
function schedule(ms = 20000) {
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), ms);
}
onBind((ctx, first) => {
  const st = ctx.state;
  const now = TRACK.map((k) => st[k]);
  if (refs && now.some((v, i) => v !== refs[i])) {
    if (ignoreNext) ignoreNext = false;
    else if (cfg && cfg.token) {
      dirty = true;
      schedule();
    }
  }
  refs = now;
  if (first && cfg && cfg.token) {
    if (ctx.ws && ctx.ws(st) > 0) dirty = true;
    setTimeout(() => syncNow(), 1500);
  }
});
document.addEventListener("visibilitychange", () => {
  if (!cfg || !cfg.token) return;
  if (document.visibilityState === "hidden") {
    if (dirty) syncNow();
  } else if (!cfg.lastPull || Date.now() - cfg.lastPull > 60000) syncNow();
});
setInterval(() => {
  if (cfg && cfg.token && document.visibilityState === "visible") syncNow();
}, 5 * 60000);

// ---------- registro diario → intervals.icu (bienestar) ----------
TLX.onLogSaved = async (log) => {
  try {
    const icu = TLX.ctx && TLX.ctx.state.icu;
    if (!icu || !icu.key || !log || log.type !== "diario") return;
    const auto = log.auto || [];
    const body = {};
    if (isNum(log.hrv) && !auto.includes("hrv")) body.hrv = log.hrv;
    if (isNum(log.legs)) body.soreness = [1, 1, 1, 2, 3, 4][Math.round(log.legs)] || null;
    const notes = [log.notes, log.pain && Object.keys(log.pain).length ? "Molestias: " + TLX.painText(log.pain) : ""].filter(Boolean).join(" · ");
    if (notes) body.comments = notes;
    if (!Object.keys(body).length) return;
    await fetch(`https://intervals.icu/api/v1/athlete/0/wellness/${log.date}`, {
      method: "PUT",
      headers: { Authorization: "Basic " + btoa("API_KEY:" + String(icu.key).trim()), "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (e) {
    console.warn("[TLX] wellness", e);
  }
};

// ---------- tarjeta en Ajustes ----------
function ago(ms) {
  if (!ms) return "nunca";
  const m = Math.round((Date.now() - ms) / 60000);
  if (m < 1) return "ahora mismo";
  if (m < 60) return `hace ${m} min`;
  const hh = Math.round(m / 60);
  return hh < 24 ? `hace ${hh} h` : new Date(ms).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

function SyncCard() {
  const { z, ue } = TLX.ctx.ui;
  const [, force] = useState(0);
  const [token, setToken] = useState("");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const f = () => force((x) => x + 1);
    subs.add(f);
    return () => subs.delete(f);
  }, []);

  const connect = async () => {
    setErr(null);
    setBusy(true);
    try {
      const tk = token.trim();
      const u = await gh("/user", { token: tk });
      if (!u.ok) throw new Error("GitHub no acepta el código. Revisa que lo has copiado entero.");
      const user = (await u.json()).login;
      const scopes = u.headers.get("X-OAuth-Scopes");
      if (scopes !== null && !/\bgist\b/.test(scopes)) throw new Error("A ese código le falta el permiso «gist». Crea otro marcando solo «gist».");
      const g = await gh("/gists?per_page=100", { token: tk });
      const list = g.ok ? await g.json() : [];
      const found = Array.isArray(list) ? list.find((x) => x.description === DESC) : null;
      save({ token: tk, user, gistId: found ? found.id : null, etag: null, lastPull: 0, lastPush: 0 });
      dirty = !found;
      setToken("");
      await syncNow({ quiet: false });
    } catch (e) {
      setErr(e.message || String(e));
    }
    setBusy(false);
  };

  if (!cfg || !cfg.token)
    return h(
      "div",
      { className: "card" },
      h("div", { className: "card-head" }, h("div", null, h("h3", null, "Sincronizar entre dispositivos"), h("div", { className: "card-sub" }, "Móvil, PC y tablet con los mismos datos, sin pasar archivos. Se guardan en un gist privado de tu GitHub."))),
      h(
        "ol",
        { className: "tlx-steps" },
        h("li", null, "Abre ", h("a", { href: "https://github.com/settings/tokens/new?scopes=gist&description=TrailLog%20Pro", target: "_blank", rel: "noopener noreferrer" }, "esta página de GitHub"), ". Ya viene marcado el permiso «gist»."),
        h("li", null, "En «Expiration» elige «No expiration». Baja del todo y pulsa «Generate token»."),
        h("li", null, "Copia el código (empieza por ghp_) y pégalo aquí. En cada dispositivo, una sola vez."),
      ),
      h(
        "div",
        { className: "row", style: { marginTop: 8 } },
        h("input", { className: "input", type: "password", placeholder: "ghp_…", value: token, autoComplete: "off", onChange: (e) => setToken(e.target.value), style: { flex: "1 1 220px" } }),
        h(z, { kind: "primary", icon: "sync", onClick: connect, disabled: busy || token.trim().length < 20 }, busy ? "Conectando…" : "Conectar"),
      ),
      err ? h("div", { style: { marginTop: 10 } }, h(ue, { level: "critical", title: "No se ha podido conectar" }, err)) : null,
      h("p", { className: "hint" }, "El código solo da permiso para gists: no puede tocar tus repositorios. La clave de intervals.icu no viaja en la copia."),
    );

  const st = status;
  return h(
    "div",
    { className: "card" },
    h(
      "div",
      { className: "card-head" },
      h("div", null, h("h3", null, "Sincronización"), h("div", { className: "card-sub" }, st.busy ? "Sincronizando…" : st.error ? "Hay un problema" : `Al día · ${ago(Math.max(cfg.lastPull || 0, cfg.lastPush || 0))}`)),
      h("div", { className: "tools" }, h(z, { small: true, icon: "sync", onClick: () => syncNow({ quiet: false }), disabled: st.busy }, "Sincronizar ahora")),
    ),
    st.error ? h(ue, { level: "warning", title: "No se ha podido sincronizar" }, st.error) : null,
    h("p", { className: "dim small", style: { margin: "6px 0 0" } }, `Cuenta de GitHub: ${cfg.user || "–"}. Se sube sola 20 s después de cada cambio y al cerrar la app; al abrirla, baja lo nuevo.`),
    h(
      "div",
      { className: "row", style: { marginTop: 10 } },
      h(z, { small: true, kind: "ghost", onClick: () => confirm("¿Desconectar este dispositivo? Tus datos se quedan aquí y en GitHub.") && save(null) }, "Desconectar este dispositivo"),
    ),
  );
}

TLX.sync = { pull, push, syncNow, status: () => status, config: () => cfg };
registerSlot("ajustes-sync", SyncCard, 10);
