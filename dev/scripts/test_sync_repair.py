"""Copia de GitHub que llega a medias (como la que dio «Unexpected end of JSON input»)."""
import json, os, re, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from test_beta import tile_png
URL = "http://127.0.0.1:8099/"
ok = lambda c, m: print(("OK   " if c else "FALLA") + " · " + m)
G = {}
MODE = {"raw": True}
BUDGET = 1_000_000  # la API corta el contenido cuando el gist es grande

def view(g):
    out = {"id": g["id"], "description": g["description"], "files": {}}
    used = 0
    for k in sorted(g["files"]):
        c = g["files"][k]
        if used + len(c) <= BUDGET or k.endswith(".json"):
            out["files"][k] = {"content": c, "raw_url": f"https://gist.githubusercontent.com/raw/{k}"}
            used += len(c)
        else:  # como el fallo real: sin contenido y sin marca de cortado
            out["files"][k] = {"content": "", "raw_url": f"https://gist.githubusercontent.com/raw/{k}"}
    return out

def github(route, req):
    u, m = req.url, req.method
    if u.endswith("/user"):
        return route.fulfill(status=200, headers={"X-OAuth-Scopes": "gist", "Access-Control-Expose-Headers": "ETag, X-OAuth-Scopes"}, json={"login": "jorge"})
    if "/gists?" in u:
        return route.fulfill(status=200, json=[{"id": k, "description": v["description"]} for k, v in G.items()])
    if u.endswith("/gists") and m == "POST":
        b = json.loads(req.post_data)
        G["g1"] = {"id": "g1", "description": b["description"], "files": {k: v["content"] for k, v in b["files"].items() if v}, "v": 1}
        return route.fulfill(status=201, headers={"ETag": '"v1"'}, json=view(G["g1"]))
    mm = re.search(r"/gists/(\w+)$", u)
    if mm and mm.group(1) in G:
        g = G[mm.group(1)]
        if m == "PATCH":
            b = json.loads(req.post_data)
            for k, v in b["files"].items():
                if v is None: g["files"].pop(k, None)
                else: g["files"][k] = v["content"]
            g["v"] += 1
        return route.fulfill(status=200, headers={"ETag": f'"v{g["v"]}"'}, json=view(g))
    route.fulfill(status=404, json={})

def raw(route, req):
    if not MODE["raw"]:
        return route.abort()
    name = req.url.rsplit("/", 1)[1]
    route.fulfill(status=200, headers={"Access-Control-Allow-Origin": "*"}, body=G["g1"]["files"][name])

def device(p, path, w=1300):
    os.system(f"rm -rf {path}")
    c = p.chromium.launch_persistent_context(path, executable_path="/usr/bin/google-chrome", headless=True, viewport={"width": w, "height": 900}, locale="es-ES", timezone_id="Europe/Madrid")
    c.route(re.compile(r"https://api\.github\.com/.*"), github)
    c.route(re.compile(r"https://gist\.githubusercontent\.com/.*"), raw)
    c.route(re.compile(r"https://(www\.ign\.es|.*open-meteo\.com|intervals\.icu)/.*"), lambda r, q: r.fulfill(status=200, body=b""))
    pg = c.pages[0]
    pg.goto(URL); pg.wait_for_selector(".sidenav, .bottomnav", state="attached"); pg.wait_for_timeout(800)
    return c, pg

def connect(pg):
    pg.evaluate("location.hash='#ajustes'"); pg.wait_for_timeout(1200)
    pg.fill(".card:has-text('Sincronizar entre dispositivos') input", "ghp_" + "b" * 36)
    pg.click("button:has-text('Conectar')"); pg.wait_for_timeout(10000)

with sync_playwright() as p:
    # móvil con los datos: sube una copia en el formato antiguo (trozos de 900 000), como la de Jorge
    A, a = device(p, "/tmp/tl-rA", 390)
    a.set_input_files('input[accept^=".fit"]', "/home/claude/datos/backup.json"); a.wait_for_timeout(7000)
    a.click(".overlay button:has-text('Cerrar')")
    a.evaluate("TLX.ctx.actions.saveLog({id:'cuerpo-'+TLX.ctx.today,type:'cuerpo',date:TLX.ctx.today,waist:88})"); a.wait_for_timeout(300)
    payload = a.evaluate("TLX.ctx.ao(TLX.ctx.state)")
    parts = [payload[i:i + 900000] for i in range(0, len(payload), 900000)]
    G["g1"] = {"id": "g1", "description": "TrailLog Pro · sincronización (no borrar)", "v": 1, "files": {
        "traillog-sync.json": json.dumps({"app": "TrailLogPro", "v": 1, "parts": len(parts), "savedAt": 1, "device": "movil", "bytes": len(payload)}),
        **{f"traillog-sync-{i+1}.txt": c for i, c in enumerate(parts)}}}

    # 1. PC con el enlace directo disponible: lee la copia entera
    B, b = device(p, "/tmp/tl-rB")
    b.set_input_files('input[accept^=".fit"]', "/home/claude/datos/backup.json"); b.wait_for_timeout(7000)
    b.click(".overlay button:has-text('Cerrar')")
    connect(b)
    err = b.locator("text=Unexpected end of JSON").count()
    w = b.evaluate("(TLX.ctx.state.logs.find(l=>l.type==='cuerpo')||{}).waist")
    ok(err == 0 and w == 88, f"PC lee la copia cortada por el enlace directo (cintura del móvil: {w})")
    B.close()

    # 2. Sin enlace directo: el PC rehace la copia con lo suyo y el móvil lo junta sin perder nada
    MODE["raw"] = False
    B, b = device(p, "/tmp/tl-rB2")
    b.set_input_files('input[accept^=".fit"]', "/home/claude/datos/backup.json"); b.wait_for_timeout(7000)
    b.click(".overlay button:has-text('Cerrar')")
    b.evaluate("TLX.ctx.actions.saveLog({id:'fuerza-pc',type:'fuerza',date:TLX.ctx.today,pull_max:9})"); b.wait_for_timeout(300)
    connect(b)
    man = json.loads(G["g1"]["files"]["traillog-sync.json"])
    note = b.locator("text=rehecha con los datos de este dispositivo").count()
    ok(man.get("v") == 2 and len(G["g1"]["files"]) - 1 == man["parts"] and note == 1, f"PC rehace la copia (formato nuevo, {man['parts']} trozos de ≤400 000) y lo avisa")
    ok(b.locator("text=Unexpected end of JSON").count() == 0, "sin el error de antes")
    MODE["raw"] = True
    a.evaluate("localStorage.setItem('tlx-sync', JSON.stringify({token:'ghp_x',user:'jorge',gistId:'g1',etag:null,lastPull:0,lastPush:0}))")
    a.reload(); a.wait_for_timeout(2500)
    a.evaluate("TLX.sync.syncNow()"); a.wait_for_timeout(9000)
    st = a.evaluate("[ (TLX.ctx.state.logs.find(l=>l.type==='cuerpo')||{}).waist, (TLX.ctx.state.logs.find(l=>l.id==='fuerza-pc')||{}).pull_max ]")
    ok(st == [88, 9], f"el móvil conserva lo suyo y recibe lo del PC: cintura {st[0]}, dominadas {st[1]}")
    b.evaluate("TLX.sync.syncNow()"); b.wait_for_timeout(9000)
    w = b.evaluate("(TLX.ctx.state.logs.find(l=>l.type==='cuerpo')||{}).waist")
    ok(w == 88, f"y el PC recibe después lo del móvil: cintura {w}")
    A.close(); B.close()
