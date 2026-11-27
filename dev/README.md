# TrailLog Pro · capa Plus

> **Desde la versión 2026.11.13 todo esto está dentro de la app normal** (la carpeta `/beta/` solo lleva a ella). Esta carpeta se queda como histórico; ya no se usa para construir nada.


Este directorio guarda **el código de las mejoras de noviembre de 2026** (versión 2026.11.10) y cómo volver a construirlas.
La app original solo existe compilada en `index.html`; las mejoras se aplican encima sin tocar su lógica:

- `scripts/patches.py` — parches pequeños y comprobados sobre el compilado (si uno no encaja, la construcción se para).
- `plus/` — módulos nuevos en JSX (React global + Leaflet): sincronización, mapas, metas, calibración, molestias, etc.
- `assets/` — tema «Pirineo» (CSS, fuente Archivo, curvas de nivel, iconos).
- `scripts/build.py` — junta todo en una sola página.
- `scripts/test_beta.py`, `scripts/test_func.py` — pruebas con datos reales y servicios simulados (IGN, Open-Meteo, GitHub, intervals.icu).

## Construir

```bash
cd dev
npm install                      # esbuild y leaflet
python3 scripts/build.py ../index.html ../beta --beta   # beta en /traillog/beta/
python3 scripts/build.py ../index.html ../dist          # versión normal (para sustituir la raíz)
```

`index.html` de la raíz debe ser la app compilada **sin** las mejoras (el original). Si en el futuro se
genera un compilado nuevo de TrailLog, vuelve a ejecutar `build.py` con él: los parches que ya no encajen
dirán exactamente cuál y habrá que ajustarlos.

## Qué añade

| Área | Dónde |
|---|---|
| Sincronización automática entre dispositivos (gist privado de GitHub, misma fusión que «Pasar al otro dispositivo») | `plus/sync.jsx`, Ajustes |
| Registro diario → bienestar de intervals.icu (VFC, piernas, molestias) | `plus/sync.jsx` |
| Mapas IGN (MTN y ortofoto PNOA), miniaturas, página Mapa, «Mis subidas» | `plus/map.jsx` |
| Tiempo real de cada salida (Open-Meteo) | `plus/weather.jsx` |
| Calibración de FTP y pulso en reposo, parte semanal, test del mes, salida larga, subida de forma | `plus/calib.jsx`, `plus/inicio.jsx` |
| Molestias con mapa del cuerpo | `plus/pain.jsx` |
| Metas (subida, ritmo, cintura, dominadas, banca, escalada) | `plus/metas.jsx` |
| Buscador, nombres automáticos, fotos, carbohidratos, «no contar en tests», zapatillas en bloque, tablas plegadas | `plus/sessions.jsx` |
| Simulador: desnivel oficial, mapa con tiempos de paso, plan de geles, previsión | `plus/sim.jsx` |
| Mensajes más cortos y un nombre por concepto | `scripts/patches.py` |

Datos: todo sigue en la base de datos del navegador (`traillog-pro`). Los campos nuevos de sesión (`noTest`, `cho`,
`fluid`) y de ajustes (`tlx…`) viajan en la sincronización y en «Pasar al otro dispositivo». Las fotos se quedan
en cada dispositivo. La beta comparte datos con la app normal (mismo origen) y usa su propia caché sin conexión.
