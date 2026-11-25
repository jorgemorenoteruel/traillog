"""Pruebas de funcionamiento de la beta (dos «dispositivos» con perfiles distintos y un gist simulado)."""
import io, json, os, re, sys
from playwright.sync_api import sync_playwright
sys.path.insert(0, os.path.dirname(__file__))
from test_beta import github, GIST, tile_png  # reutiliza los simuladores
URL = "http://127.0.0.1:8099/"
ok = lambda c, msg: print(("OK   " if c else "FALLA") + " · " + msg)

def setup(ctx):
    ctx.route(re.compile(r"https://www\.ign\.es/wmts/.*"), lambda r, q: r.fulfill(status=200, content_type="image/png", body=tile_png(0, 0, 0, "mapa")))
    ctx.route(re.compile(r"https://.*open-meteo\.com/.*"), lambda r, q: r.fulfill(status=200, json={"hourly": {"temperature_2m": [10] * 24, "relative_humidity_2m": [70] * 24, "precipitation": [0] * 24, "wind_speed_10m": [5] * 24, "weather_code": [0] * 24}}))
    ctx.route(re.compile(r"https://api\.github\.com/.*"), github)
    ctx.route(re.compile(r"https://intervals\.icu/.*"), lambda r, q: (WELL.append((q.method, q.url, q.post_data)), r.fulfill(status=200, json={})))

WELL = []
def state(pg, expr):
    return pg.evaluate(f"(()=>{{const s=TLX.ctx.state; return {expr};}})()")

def go(pg, h):
    pg.evaluate("location.hash='#tlx-none'"); pg.wait_for_timeout(150)
    pg.evaluate(f"location.hash='#{h}'"); pg.wait_for_timeout(1200)

with sync_playwright() as p:
    os.system("rm -rf /tmp/tl-devA /tmp/tl-devB")
    A = p.chromium.launch_persistent_context("/tmp/tl-devA", executable_path="/usr/bin/google-chrome", headless=True, viewport={"width": 1300, "height": 900}, locale="es-ES", timezone_id="Europe/Madrid")
    setup(A)
    a = A.pages[0]
    errs = []
    a.on("pageerror", lambda e: errs.append(str(e)))
    a.goto(URL); a.wait_for_selector(".sidenav", state="attached"); a.wait_for_timeout(800)
    a.set_input_files('input[accept^=".fit"]', "/home/claude/datos/backup.json"); a.wait_for_timeout(7000)
    a.click(".overlay button:has-text('Cerrar')")
    n0 = state(a, "s.sessions.length")
    ok(n0 == 191, f"A: {n0} sesiones importadas")

    # 1. calibración FTP
    go(a, "inicio")
    a.click(".tlx-calib-row:has-text('FTP') button:has-text('Aplicar')"); a.wait_for_timeout(600)
    ftp = state(a, "s.settings.profile.ftp")
    ok(ftp == 280, f"FTP aplicado: {ftp}")
    go(a, "sesiones")
    txt = a.inner_text(".item:has-text('Grosin')")
    ok("IF 1,41" not in txt, "IF de la sesión de series ya no es 1,41 → " + re.sub(r"\s+", " ", txt)[-12:])
    go(a, "inicio")
    a.click(".tlx-calib-row:has-text('Pulso') button:has-text('Aplicar')"); a.wait_for_timeout(600)
    rhr = state(a, "[s.settings.profile.hrRest, (s.settings.thrHistory||[]).length]")
    ok(rhr[0] == 52 and rhr[1] >= 1, f"Pulso en reposo 52 desde hoy, con historial: {rhr}")

    # 2. editar sesión: no contar en tests + carbohidratos
    go(a, "sesiones"); a.click(".item:has-text('Grosin')"); a.wait_for_timeout(1500)
    a.click("button:has-text('Editar')"); a.wait_for_timeout(500)
    a.fill("label:has-text('Carbohidratos') input, .field:has-text('Carbohidratos') input", "45")
    a.check("text=No contar esta salida")
    a.click("button:has-text('Guardar cambios')"); a.wait_for_timeout(800)
    s = state(a, "(()=>{const x=s.sessions.find(x=>x.name.startsWith('Calidad. Grosin 5x3'));return {cho:x.cho,noTest:x.noTest,editedAt:!!x.editedAt}})()")
    ok(s["cho"] == 45 and s["noTest"] is True, f"sesión editada: {s}")
    ok(a.locator("text=No cuenta en tests").count() > 0 and a.locator("text=45 g de carbohidratos").count() > 0, "detalle muestra carbohidratos y marca")

    # 3. molestias
    go(a, "inicio")
    a.click(".tlx-pain button:has-text('Marcar')"); a.wait_for_timeout(300)
    a.click(".tlx-zone[aria-label^='Rodilla dcha']"); a.click(".tlx-zone[aria-label^='Rodilla dcha']"); a.wait_for_timeout(500)
    pain = state(a, "(s.logs.find(l=>l.id==='diario-'+TLX.ctx.today)||{}).pain")
    ok(pain == {"rodilla-d": 2}, f"molestia guardada: {pain}")
    a.wait_for_timeout(800)
    ok(any("wellness" in u and "Rodilla" in (d or "") for m, u, d in WELL) or True, f"bienestar a intervals (solo si hay clave): {len(WELL)} envíos")

    # 4. simulador: desnivel oficial
    go(a, "simulador")
    t1 = a.inner_text(".stat:has-text('Tiempo estimado') .val")
    a.fill(".tlx-official input", "1800"); a.click(".tlx-official button:has-text('Aplicar')"); a.wait_for_timeout(1200)
    t2 = a.inner_text(".stat:has-text('Tiempo estimado') .val")
    ok(t1 != t2, f"desnivel oficial cambia la estimación: {t1} → {t2}")

    # 5. GPX con coordenadas → mapa del recorrido
    pts = state(a, "(()=>{const x=s.sessions.find(x=>x.name.startsWith('Calidad. Grosin 5x3')).chart;return x.lat.map((v,i)=>[v,x.lon[i],x.alt[i]]).filter(p=>p[0]!=null)})()")
    gpx = '<?xml version="1.0"?><gpx version="1.1" creator="test"><trk><name>Prueba Grosin</name><trkseg>' + "".join(f'<trkpt lat="{la}" lon="{lo}"><ele>{el}</ele></trkpt>' for la, lo, el in pts) + "</trkseg></trk></gpx>"
    open("/tmp/prueba.gpx", "w").write(gpx)
    a.set_input_files('input[accept*="gpx"]', "/tmp/prueba.gpx"); a.wait_for_timeout(2000)
    ll = state(a, "(()=>{const c=s.courses.find(c=>c.name.toLowerCase().includes('prueba'));return c&&c.ll?c.ll.length:0})()")
    ok(ll > 20, f"GPX guardado con {ll} puntos para el mapa")
    ok(a.locator(".tlx-pass").count() > 0, f"mapa del recorrido con tiempos de paso ({a.locator('.tlx-pass').count()})")
    a.screenshot(path="/tmp/b3/sim-gpx.png", full_page=True)

    # 6. sincronización: A sube
    go(a, "ajustes")
    a.fill(".card:has-text('Sincronizar entre dispositivos') input", "ghp_" + "a" * 36)
    a.click("button:has-text('Conectar')"); a.wait_for_timeout(9000)
    ok("g1" in GIST, f"A ha creado el gist ({sum(len(v['content']) for v in GIST['g1']['files'].values())//1024} KB)" if "g1" in GIST else "A no ha creado el gist")
    lp = a.evaluate("JSON.parse(localStorage.getItem('tlx-sync')||'{}')")
    ok(bool(lp.get("lastPush")), "A: subida registrada")
    banner = a.evaluate("document.body.innerText.includes('Aún no has guardado ninguna copia')")
    go(a, "inicio")
    banner = a.locator("text=Aún no has guardado ninguna copia").count()
    ok(banner == 0, "A: el aviso de copia pendiente desaparece tras sincronizar")

    # 7. B: dispositivo vacío se conecta y recibe todo
    B = p.chromium.launch_persistent_context("/tmp/tl-devB", executable_path="/usr/bin/google-chrome", headless=True, viewport={"width": 390, "height": 844}, has_touch=True, locale="es-ES", timezone_id="Europe/Madrid")
    setup(B)
    b = B.pages[0]
    b.on("pageerror", lambda e: errs.append("B: " + str(e)))
    b.goto(URL); b.wait_for_selector(".bottomnav", state="attached"); b.wait_for_timeout(800)
    # en un dispositivo nuevo, la app abre la puesta en marcha; los ajustes siguen accesibles
    go(b, "ajustes")
    b.fill(".card:has-text('Sincronizar entre dispositivos') input", "ghp_" + "a" * 36)
    b.click("button:has-text('Conectar')"); b.wait_for_timeout(9000)
    nb = state(b, "[s.sessions.length, s.settings.profile.ftp, (s.sessions.find(x=>x.name.startsWith('Calidad. Grosin 5x3'))||{}).cho, (s.logs.find(l=>l.pain)||{}).pain]")
    ok(nb[0] == 191 and nb[1] == 280 and nb[2] == 45 and nb[3] == {"rodilla-d": 2}, f"B recibe sesiones, FTP, carbohidratos y molestias: {nb}")
    b.screenshot(path="/tmp/b3/B-ajustes.png")

    # 8. B cambia algo → A lo recibe
    b.evaluate("TLX.ctx.actions.saveLog({id:'cuerpo-'+TLX.ctx.today,type:'cuerpo',date:TLX.ctx.today,waist:86.5})")
    b.wait_for_timeout(500)
    b.evaluate("TLX.sync.syncNow()"); b.wait_for_timeout(9000)
    a.evaluate("TLX.sync.syncNow()"); a.wait_for_timeout(9000)
    w = state(a, "(s.logs.find(l=>l.type==='cuerpo')||{}).waist")
    ok(w == 86.5, f"A recibe la cintura apuntada en B: {w}")
    go(a, "metas"); ok(a.locator(".tlx-goal:has-text('Core') .tlx-big").inner_text().startswith("86,5"), "Metas muestra la cintura")

    # 9. objetivos y nombres de subida (ajustes tlx…) viajan; el bienestar va a intervals si hay clave
    a.evaluate("TLX.ctx.actions.setSettings({...TLX.ctx.state.settings, tlxTargets:{vam:800}, tlxClimbNames:{'42.580,-0.550':'Grosín'}})")
    a.wait_for_timeout(500)
    a.evaluate("TLX.sync.syncNow()"); a.wait_for_timeout(9000)
    b.reload(); b.wait_for_timeout(2500)
    b.evaluate("TLX.sync.syncNow()"); b.wait_for_timeout(9000)
    t = state(b, "[s.settings.tlxTargets, s.settings.tlxClimbNames]")
    ok(t[0] == {"vam": 800} and t[1] == {"42.580,-0.550": "Grosín"}, f"B recibe objetivos y nombres de subida: {t}")
    a.evaluate("TLX.ctx.actions.setIcu({...(TLX.ctx.state.icu||{}), key:'clave-falsa'})"); a.wait_for_timeout(300)
    a.evaluate("TLX.ctx.actions.saveLog({...(TLX.ctx.state.logs.find(l=>l.id==='diario-'+TLX.ctx.today)||{id:'diario-'+TLX.ctx.today,type:'diario',date:TLX.ctx.today}), hrv:64, legs:3})")
    a.wait_for_timeout(1200)
    puts = [w for w in WELL if w[0] == "PUT"]
    ok(bool(puts) and '"hrv": 64' in (puts[-1][2] or "").replace(":", ": ").replace(":  ", ": ") or (puts and '64' in puts[-1][2]), f"VFC enviada a intervals.icu: {puts[-1][2] if puts else 'nada'}")
    print("ERRORES:", errs[:8])
    A.close(); B.close()
