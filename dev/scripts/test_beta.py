"""Prueba de la beta con los datos reales de Jorge, sin red externa: IGN, Open-Meteo, Nominatim y
la API de GitHub se simulan dentro del navegador.
Uso: python3 -I scripts/test_beta.py <carpeta-capturas> [--fresh] [--dark] [--mobile] [páginas...]"""
import io, json, os, re, sys, time, base64
from playwright.sync_api import sync_playwright
from PIL import Image, ImageDraw

# tesela falsa: papel claro con cuadrícula (para ver que el mapa pinta el fondo)
def tile_png(z, x, y, kind):
    im = Image.new("RGB", (256, 256), (236, 233, 222) if kind == "mapa" else (120, 138, 110))
    d = ImageDraw.Draw(im)
    for i in range(0, 256, 32):
        d.line([(i, 0), (i, 256)], fill=(220, 214, 200) if kind == "mapa" else (100, 118, 92))
        d.line([(0, i), (256, i)], fill=(220, 214, 200) if kind == "mapa" else (100, 118, 92))
    b = io.BytesIO(); im.save(b, "PNG"); return b.getvalue()

GIST = {}
def github(route, req):
    u = req.url
    m = req.method
    if u.endswith("/user"):
        return route.fulfill(status=200, headers={"X-OAuth-Scopes": "gist", "Access-Control-Allow-Origin": "*", "Access-Control-Expose-Headers": "ETag, X-OAuth-Scopes"}, json={"login": "jorgemorenoteruel"})
    if "/gists?" in u and m == "GET":
        return route.fulfill(status=200, json=[{"id": k, "description": v["description"]} for k, v in GIST.items()])
    if u.endswith("/gists") and m == "POST":
        body = json.loads(req.post_data); gid = "g1"
        GIST[gid] = {"id": gid, "description": body["description"], "files": {k: {"content": v["content"]} for k, v in body["files"].items() if v}, "v": 1}
        return route.fulfill(status=201, headers={"ETag": '"v1"', "Access-Control-Expose-Headers": "ETag"}, json=GIST[gid])
    mm = re.search(r"/gists/(\w+)$", u)
    if mm:
        g = GIST.get(mm.group(1))
        if not g: return route.fulfill(status=404, json={})
        if m == "PATCH":
            body = json.loads(req.post_data)
            for k, v in body["files"].items():
                if v is None: g["files"].pop(k, None)
                else: g["files"][k] = {"content": v["content"]}
            g["v"] += 1
        et = f'"v{g["v"]}"'
        if m == "GET" and req.headers.get("if-none-match") == et:
            return route.fulfill(status=304, headers={"ETag": et})
        return route.fulfill(status=200, headers={"ETag": et, "Access-Control-Expose-Headers": "ETag"}, json=g)
    route.fulfill(status=404, json={})

if __name__ == "__main__":
    out = sys.argv[1]
    os.makedirs(out, exist_ok=True)
    fresh = "--fresh" in sys.argv
    dark = "--dark" in sys.argv
    mobile = "--mobile" in sys.argv
    pages = [a for a in sys.argv[2:] if not a.startswith("--")]
    URL = "http://127.0.0.1:8099/"
    PROFILE = "/tmp/tl-beta-profile" + ("-m" if mobile else "")
    if fresh:
        os.system(f"rm -rf {PROFILE}")

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            PROFILE, executable_path="/usr/bin/google-chrome", headless=True,
            viewport={"width": 390, "height": 844} if mobile else {"width": 1400, "height": 900},
            device_scale_factor=1, has_touch=mobile, locale="es-ES", timezone_id="Europe/Madrid",
            color_scheme="dark" if dark else "light")
        ctx.route(re.compile(r"https://www\.ign\.es/wmts/.*"), lambda r, q: r.fulfill(status=200, content_type="image/png", body=tile_png(0, 0, 0, "orto" if "pnoa" in q.url else "mapa")))
        ctx.route(re.compile(r"https://.*open-meteo\.com/.*"), lambda r, q: r.fulfill(status=200, json={"hourly": {
            "temperature_2m": [8 + i * 0.5 for i in range(24)], "relative_humidity_2m": [70] * 24, "precipitation": [0] * 24,
            "wind_speed_10m": [12] * 24, "weather_code": [2] * 24}}))
        ctx.route(re.compile(r"https://nominatim\.openstreetmap\.org/.*"), lambda r, q: r.fulfill(status=200, json={"address": {"peak": "Peña Oroel"} if "42.5" in q.url else {"village": "Villanúa"}}))
        ctx.route(re.compile(r"https://api\.github\.com/.*"), github)
        ctx.route(re.compile(r"https://intervals\.icu/.*"), lambda r, q: r.fulfill(status=200, json={}))
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        errs = []
        page.on("pageerror", lambda e: errs.append("pageerror: " + str(e)))
        page.on("console", lambda m: m.type in ("error", "warning") and errs.append(f"{m.type}: {m.text[:200]}"))
        page.goto(URL)
        page.evaluate(f"localStorage.setItem('traillog-theme','{'dark' if dark else 'light'}')")
        page.reload()
        page.wait_for_selector(".sidenav, .bottomnav", state="attached", timeout=20000)
        page.wait_for_timeout((1.2)*1000)
        if fresh:
            page.set_input_files('input[accept^=".fit"]', "/home/claude/datos/backup.json")
            page.wait_for_timeout((8)*1000)
            page.click(".overlay button:has-text('Cerrar')")
            page.wait_for_timeout((0.8)*1000)
        tag = ("m-" if mobile else "") + ("dark-" if dark else "")

        def shot(name, full=False):
            page.screenshot(path=f"{out}/{tag}{name}.png", full_page=full)

        def nav(hashname):
            page.evaluate("location.hash='#tlx-none'")
            page.wait_for_timeout((0.2)*1000)
            page.evaluate(f"location.hash='#{hashname}'")
            page.wait_for_timeout((1.6)*1000)

        for name in pages or ["inicio", "sesiones", "detalle", "mapa", "metas", "simulador", "zapatillas", "ajustes", "carga", "tendencias", "registro"]:
            if name == "detalle":
                nav("sesiones")
                page.click(".item:has-text('Grosin')")
                page.wait_for_timeout((2.5)*1000)
                shot("detalle")
                page.mouse.wheel(0, 700); page.wait_for_timeout((0.8)*1000)
                shot("detalle2")
                continue
            if name == "editar":
                nav("sesiones"); page.click(".item:has-text('Grosin')"); page.wait_for_timeout((1.5)*1000)
                page.click("button:has-text('Editar')"); page.wait_for_timeout((1)*1000)
                shot("editar", True)
                continue
            if name == "sync":
                nav("ajustes")
                page.fill(".card:has-text('Sincronizar entre dispositivos') input", "ghp_" + "x" * 36)
                page.click("button:has-text('Conectar')")
                page.wait_for_timeout((6)*1000)
                shot("sync")
                print("gist files:", {k: len(v["content"]) for k, v in GIST.get("g1", {}).get("files", {}).items()})
                continue
            if name == "nombres":
                nav("sesiones")
                page.click("button:has-text('Proponer nombres')")
                page.wait_for_timeout((4)*1000)
                shot("nombres")
                continue
            if name == "simulador":
                nav("simulador")
                shot("simulador", True)
                continue
            nav(name)
            shot(name)
            shot(name + "-full", True)
        print("ERRORES:", json.dumps(errs[:15], ensure_ascii=False, indent=1))
        ctx.close()
