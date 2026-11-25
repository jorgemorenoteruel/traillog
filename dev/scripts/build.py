"""Construye TrailLog Pro con la capa Plus y el tema «Pirineo».

Uso: python3 scripts/build.py ruta/al/index.html-original carpeta-de-salida [--beta]

1. Aplica los parches de scripts/patches.py al código compilado (falla si alguno no encaja).
2. Compila plus/ con esbuild (React es global, Leaflet va dentro).
3. Inserta el tema, los estilos de Plus y Leaflet, el icono nuevo y el manifiesto con atajos.
"""
import base64
import json
import os
import re
import shutil
import subprocess
import sys

DEV = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(DEV, "scripts"))
from patches import P  # noqa: E402

src, out = sys.argv[1], sys.argv[2]
beta = "--beta" in sys.argv
os.makedirs(out, exist_ok=True)
html = open(src, encoding="utf-8").read()

# ---------- 1. parches ----------
m = re.search(r"<script>(/\* TrailLog Pro [^*]*\*/.*?)</script>", html, flags=re.S)
app = m.group(1)
for desc, old, new, n in P:
    if old.startswith("re:"):
        pat = old[3:]
        found = len(re.findall(pat, app))
        if found != n:
            sys.exit(f"PARCHE NO ENCAJA ({found}≠{n}): {desc}")
        app = re.sub(pat, new, app)
    else:
        found = app.count(old)
        if found != n:
            sys.exit(f"PARCHE NO ENCAJA ({found}≠{n}): {desc}")
        app = app.replace(old, new)
print(f"  {len(P)} parches aplicados")

# ---------- 2. capa Plus ----------
esb = os.path.join(DEV, "node_modules", ".bin", "esbuild")
subprocess.run([esb, os.path.join(DEV, "plus", "index.jsx"), "--bundle", "--format=iife", "--target=es2019",
                "--minify", "--legal-comments=none", "--loader:.jsx=jsx", "--jsx-factory=React.createElement",
                "--jsx-fragment=React.Fragment", f"--outfile={os.path.join(out, '_plus.js')}"], check=True)
plus = open(os.path.join(out, "_plus.js"), encoding="utf-8").read()
os.remove(os.path.join(out, "_plus.js"))
leaflet_css = open(os.path.join(DEV, "node_modules", "leaflet", "dist", "leaflet.css"), encoding="utf-8").read()
plus_css = open(os.path.join(DEV, "plus", "plus.css"), encoding="utf-8").read()

# ---------- 3. tema ----------
A = os.path.join(DEV, "assets")
b64 = lambda p: base64.b64encode(open(os.path.join(A, p), "rb").read()).decode()
theme = open(os.path.join(A, "theme.src.css"), encoding="utf-8").read()
for key, path in {"ARCHIVO": "archivo.woff2", "ICON": "icon.svg", "CONTOURS_LIGHT": "contours-light.svg",
                  "CONTOURS_DARK": "contours-dark.svg", "CONTOURS_INK": "contours-ink.svg"}.items():
    theme = theme.replace("{{" + key + "}}", b64(path))
assert "{{" not in theme

# ---------- 4. montar la página ----------
app = app.replace("family:'system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif'",
                  "family:'\"Archivo TL\", system-ui, -apple-system, \"Segoe UI\", Roboto, sans-serif'")
html = html[: m.start(1)] + app + html[m.end(1):]
i = html.index("</style>") + len("</style>")
html = html[:i] + "\n<style id=\"tl-theme\">\n" + theme + "\n" + leaflet_css + "\n" + plus_css + "\n</style>" + html[i:]
j = html.index("<script>/* TrailLog Pro ")
html = html[:j] + "<script>/* TrailLog Plus */\n" + plus + "\n</script>\n" + html[j:]
html = re.sub(r'<meta name="theme-color" content="#f4f4f1"[^>]*>', '<meta name="theme-color" content="#15231e" media="(prefers-color-scheme: light)">', html)
html = re.sub(r'<meta name="theme-color" content="#0d0d0d"[^>]*>', '<meta name="theme-color" content="#101a16" media="(prefers-color-scheme: dark)">', html)
html = re.sub(r'<link rel="icon" href="data:image/svg\+xml[^"]*">', '<link rel="icon" type="image/png" href="icon-192.png">', html, count=1)
if beta:
    html = html.replace("<title>TrailLog Pro</title>", "<title>TrailLog Pro · beta</title>")
open(os.path.join(out, "index.html"), "w", encoding="utf-8").write(html)

# ---------- 5. manifiesto, iconos y service worker ----------
orig_dir = os.path.dirname(os.path.abspath(src))
man = json.load(open(os.path.join(orig_dir, "manifest.webmanifest"), encoding="utf-8"))
man["theme_color"] = "#15231e"
man["background_color"] = "#eceeea"
if beta:
    man["name"] = "TrailLog Pro (beta)"
    man["short_name"] = "TrailLog β"
    man["id"] = "./?beta"
man["shortcuts"] = [
    {"name": "Apuntar hoy", "short_name": "Hoy", "url": "./#inicio", "icons": [{"src": "icon-192.png", "sizes": "192x192"}]},
    {"name": "Mapa", "url": "./#mapa", "icons": [{"src": "icon-192.png", "sizes": "192x192"}]},
    {"name": "Sesiones", "url": "./#sesiones", "icons": [{"src": "icon-192.png", "sizes": "192x192"}]},
]
json.dump(man, open(os.path.join(out, "manifest.webmanifest"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
for f in ["icon-180.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png"]:
    shutil.copy(os.path.join(A, "icons", f), os.path.join(out, f))
sw = open(os.path.join(orig_dir, "sw.js"), encoding="utf-8").read()
sw = re.sub(r"const VERSION = '([^']*)';", lambda mm: f"const VERSION = '{mm.group(1)}-plus';", sw)
if beta:  # la beta usa su propia caché y no borra la de la app normal
    sw = sw.replace("const CACHE = 'traillog-pro-' + VERSION;", "const CACHE = 'traillog-beta-' + VERSION;")
    sw = sw.replace("k.startsWith('traillog-pro-')", "k.startsWith('traillog-beta-')")
    assert "traillog-beta-" in sw and "startsWith('traillog-pro-')" not in sw
open(os.path.join(out, "sw.js"), "w", encoding="utf-8").write(sw)
print(f"  OK → {out}/index.html ({len(html)//1024} KB)")
