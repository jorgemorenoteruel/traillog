"""Genera un SVG de curvas de nivel (relieve inventado con dos cumbres y un collado)
para el fondo de la barra lateral. Salida: build/contours.svg"""
import numpy as np
from skimage import measure

W, H = 300, 640          # unidades del SVG (la barra mide 224 px de ancho)
rng = np.random.default_rng(1925)  # fijo: siempre el mismo dibujo
y, x = np.mgrid[0:H:2, 0:W:2].astype(float)

def bump(cx, cy, sx, sy, h):
    return h * np.exp(-(((x - cx) / sx) ** 2 + ((y - cy) / sy) ** 2))

z = (bump(70, 470, 95, 120, 1.0) + bump(235, 560, 80, 95, 0.8) + bump(210, 330, 120, 160, 0.45)
     + bump(-40, 640, 140, 110, 0.6))
# rugosidad suave para que las líneas no sean perfectas
for k in range(5):
    fx, fy, ph = rng.uniform(0.01, 0.035), rng.uniform(0.01, 0.035), rng.uniform(0, 6.28)
    z += 0.035 * np.sin(x * fx + ph) * np.cos(y * fy + ph * 0.7)

paths = []
levels = np.linspace(0.08, 0.98, 17)
for i, lv in enumerate(levels):
    for c in measure.find_contours(z, lv):
        if len(c) < 12:
            continue
        pts = c[::2] * 2  # volver a unidades
        d = "M" + " L".join(f"{p[1]:.0f} {p[0]:.0f}" for p in pts)
        major = i % 4 == 0  # curva maestra cada 4, como en los mapas
        paths.append(f'<path d="{d}" stroke-width="{1.3 if major else 0.7}"/>')

for name, color, op in [("light", "#fff", .11), ("dark", "#fff", .07), ("ink", "#15231e", .07)]:
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">'
           f'<g fill="none" stroke="{color}" stroke-opacity="{op}" stroke-linejoin="round" stroke-linecap="round">'
           + "".join(paths) + "</g></svg>")
    open(f"build/contours-{name}.svg", "w").write(svg)
print(len(paths), "curvas,", len(svg) // 1024, "KB")
