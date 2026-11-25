"""Parches sobre el código compilado de TrailLog Pro (index.html de GitHub).

Cada parche es (descripción, buscar, reemplazar, veces). Si «buscar» no aparece exactamente
«veces» veces, la construcción se detiene: así, si cambia el compilado, no se rompe nada en silencio.
Los que empiezan por «re:» son expresiones regulares.
"""

P = []
add = lambda desc, old, new, n=1: P.append((desc, old, new, n))

# ---------------------------------------------------------------- enganche con la capa Plus
add("exponer estado, acciones y funciones internas",
    "B=qs(e);B.current=e;",
    "B=qs(e);B.current=e;window.TLX&&TLX.bind({state:e,actions:M,cfg:O,acts:V,model:G,today:N,go:_,X,Le,ao,rt,lt,so,ws,yn,wt,icons:_t,ui:{ge,z,xe,H,ee,J,ue,Ae,Oe,be}});")

add("navegación: Mapa y Metas",
    'Ls=[["inicio","Inicio","home"],["sesiones","Sesiones","list"],["carga","Carga","pulse"],["registro","Registro","edit"],["plan","Plan","calendar"],["tendencias","Tendencias","trend"],',
    'Ls=[["inicio","Inicio","home"],["sesiones","Sesiones","list"],["mapa","Mapa","map"],["registro","Registro","edit"],["carga","Carga","pulse"],["plan","Plan","calendar"],["metas","Metas","target"],["tendencias","Tendencias","trend"],')
add("páginas nuevas",
    "Bi={inicio:Tt,",
    "Bi={mapa:p=>React.createElement(TLX.pages.mapa,p),metas:p=>React.createElement(TLX.pages.metas,p),inicio:Tt,")

add("campos nuevos de sesión que se sincronizan",
    'Zn=["name","shoeId","rpe","notes",',
    'Zn=["name","shoeId","rpe","notes","noTest","cho","fluid",')
add("índice de subida: no contar sesiones marcadas",
    "function wt(e,a,s,t=365){let o=[];for(let r of e){",
    "function wt(e,a,s,t=365){let o=[];for(let r of e){if(r.noTest)continue;")
add("registro diario → intervals.icu",
    "saveLog:async A=>{let E={...A,editedAt:Date.now(),editedBy:te()};await Le.log(E),a(j=>({...j,logs:Pi(j.logs,E)}))}",
    "saveLog:async A=>{let E={...A,editedAt:Date.now(),editedBy:te()};await Le.log(E),a(j=>({...j,logs:Pi(j.logs,E)})),window.TLX&&TLX.onLogSaved&&TLX.onLogSaved(E)}")

# ---------------------------------------------------------------- Inicio
add("Inicio: tarjetas nuevas bajo «Hoy»",
    "k?React.createElement(wr,{r:f,state:e,actions:n,go:l,today:o}):null",
    'k?React.createElement(wr,{r:f,state:e,actions:n,go:l,today:o}):null,k?React.createElement(TLX.Slot,{name:"inicio",state:e,actions:n,go:l,today:o,model:t,cfg:a}):null')
add("Inicio: frescura con nombre claro",
    'label:"Forma (TSB)",value:$&&$.history>=7?($.tsb>0?"+":"")+v($.tsb,0):"–",delta:$?`CTL ${v($.ctl,0)} · ATL ${v($.atl,0)}`:null',
    'label:"Frescura",value:$&&$.history>=7?($.tsb>0?"+":"")+v($.tsb,0):"–",delta:$?`forma ${v($.ctl,0)} · fatiga ${v($.atl,0)}`:null')
add("Inicio: subida de forma en lugar del ACWR",
    're:React\\.createElement\\(J,\\{label:"ACWR",value:\\$&&\\$\\.acwrReady&&b\\(\\$\\.acwr\\)\\?v\\(\\$\\.acwr,2\\):"–",delta:x\\?S\\[x\\]:\\$\\?\\$\\.acwrReady\\?"sin carga reciente":28-\\$\\.history<=1\\?"falta 1 día de historial":`faltan \\$\\{28-\\$\\.history\\} días de historial`:null\\}\\)',
    "React.createElement(TLX.RampStat,{model:t,today:o})")
add("un nombre por concepto: forma = CTL, fatiga = ATL, frescura = TSB", '"Forma (TSB)"', '"Frescura (TSB)"', 2)
add("un nombre por concepto (Carga)", '"Forma física (CTL)"', '"Forma (CTL)"')

# ---------------------------------------------------------------- Ajustes
add("Ajustes: tarjeta de sincronización",
    "React.createElement(Ur,{state:e,actions:a,today:s})",
    'React.createElement(TLX.Slot,{name:"ajustes-sync",state:e,actions:a,today:s}),React.createElement(Ur,{state:e,actions:a,today:s})')

# ---------------------------------------------------------------- Sesiones
add("Sesiones: buscador (filtro)",
    "m=$s(()=>{let h=[];for(let y of e.sessions){",
    "m=$s(()=>{let h=[];for(let y of e.sessions){if(window.TLX&&!TLX.matchSession(y))continue;")
add("Sesiones: buscador (repintar)", "}return h},[e.sessions])", "}return h},[e.sessions,e.tlxQuery])")
add("Sesiones: buscador y nombres arriba",
    'React.createElement("div",{className:"dropzone"+(c?" over":""),',
    'React.createElement(TLX.Slot,{name:"sesiones-top",state:e,actions:t,go:o}),React.createElement("div",{className:"dropzone"+(c?" over":""),')
add("listas: miniatura del recorrido en lugar del icono",
    're:React\\.createElement\\("span",\\{className:"ico"\\},React\\.createElement\\(ge,\\{name:ya\\[(\\w)\\.sport\\]\\|\\|"pulse",size:18\\}\\)\\)',
    'React.createElement(TLX.Thumb,{session:\\1,fallback:React.createElement("span",{className:"ico"},React.createElement(ge,{name:ya[\\1.sport]||"pulse",size:18}))})', 3)

# ---------------------------------------------------------------- Detalle de sesión
add("sesión: tiempo real en vez de la temperatura de la muñeca",
    're:b\\(e\\.temp\\)\\?React\\.createElement\\("span",\\{className:"chip",title:"[^"]*"\\},ie\\(e\\.temp\\)," °C en el reloj"\\):null',
    "React.createElement(TLX.WeatherChip,{session:e})")
add("sesión: alimentación y marcas bajo los datos",
    ',w?React.createElement("div",{className:"card"},React.createElement("div",{className:"card-head"},React.createElement("div",null,React.createElement("h3",null,"Recorrido")',
    ',React.createElement(TLX.Slot,{name:"session-detail",session:e,state:a,actions:t}),w?React.createElement("div",{className:"card"},React.createElement("div",{className:"card-head"},React.createElement("div",null,React.createElement("h3",null,"Recorrido")')
add("sesión: quitar el enlace a OpenStreetMap (ya hay mapa)",
    're:b\\(e\\.startLat\\)\\?React\\.createElement\\("div",\\{className:"tools"\\},React\\.createElement\\("a",\\{className:"btn sm ghost",href:`https://www\\.openstreetmap\\.org[^`]*`,target:"_blank",rel:"noopener noreferrer"\\},"Ver la zona en un mapa"\\)\\):null',
    "null")
add("sesión: mapa del IGN con la traza",
    "React.createElement(Io,{lat:e.chart.lat,lon:e.chart.lon,grd:e.chart.grd,km:e.chart.km,cursor:p})):null,",
    'React.createElement(TLX.RouteMap,{fallback:Io,session:e,lat:e.chart.lat,lon:e.chart.lon,grd:e.chart.grd,km:e.chart.km,cursor:p})):null,React.createElement(TLX.Slot,{name:"session-detail-end",session:e,state:a,actions:t}),')
add("editar sesión: campos nuevos",
    're:(React\\.createElement\\(H,\\{label:"Notas",className:"wide"\\},React\\.createElement\\("textarea",\\{value:\\$\\.notes,onChange:(\\w)=>k\\(\\{\\.\\.\\.\\$,notes:\\2\\.target\\.value\\}\\)\\}\\)\\))',
    '\\1,React.createElement(TLX.Slot,{name:"session-edit",draft:$,setDraft:k,session:e})')
add("editar sesión: guardar los campos nuevos",
    "tssOverride:$.tssOverride,notes:$.notes}",
    "tssOverride:$.tssOverride,notes:$.notes,noTest:$.noTest!==void 0?!!$.noTest:!!e.noTest,cho:$.cho!==void 0?$.cho:e.cho??null,fluid:$.fluid!==void 0?$.fluid:e.fluid??null}")

# ---------------------------------------------------------------- Simulador
add("GPX: guardar coordenadas para el mapa",
    "up:Math.round(e.up),down:Math.round(e.down)}}function Si(e)",
    "up:Math.round(e.up),down:Math.round(e.down),ll:e.segs.filter((t,i)=>i%2===0&&t.lat!=null).map(t=>[Math.round(t.lat*1e5)/1e5,Math.round(t.lon*1e5)/1e5]),llStep:2}}function Si(e)")
add("recorrido: desnivel oficial",
    "function Si(e){let a=[],s=0,t=e.alt0||0;for(let o of e.g){let n=o/1e3;",
    "function Si(e){let a=[],s=0,t=e.alt0||0,K=e.official&&e.up?e.official/e.up:1,KD=e.official&&e.down&&e.up?Math.max(.2,(e.down+(e.official-e.up))/e.down):1;for(let o of e.g){let n=o/1e3;n=n>0?n*K:n*KD;")
add("simulador: mapa, desnivel oficial y geles",
    'S.quick?null:React.createElement(me,{title:"Perfil del recorrido"',
    'React.createElement(TLX.Slot,{name:"sim",state:e,actions:t,courses:$,courseKey:x,segs:S,result:ne,adjust:oe}),S.quick?null:React.createElement(me,{title:"Perfil del recorrido"')

# ---------------------------------------------------------------- Zapatillas
add("zapatillas: asignar en bloque",
    '" zapatilla asignada. Puedes asignarla desde cada sesión, en Editar."):null,',
    '" zapatilla asignada. Asígnalas de una vez aquí abajo."):null,React.createElement(TLX.Slot,{name:"zapatillas",state:e,actions:a}),')

# ---------------------------------------------------------------- Tablas largas
add("tablas largas plegadas",
    "function be({cols:e,rows:a,onRow:s,empty:t}){",
    "function be(P){return window.TLX&&TLX.LongTable?React.createElement(TLX.LongTable,{...P,Inner:be0}):React.createElement(be0,P)}function be0({cols:e,rows:a,onRow:s,empty:t}){")

# ---------------------------------------------------------------- Mensajes más cortos
T = [
    ("`Llegarías cargado (frescura ${Math.round(t.tsb)}). Quita volumen en los 7–10 días antes de la carrera.`",
     "`Llegarías cargado (frescura ${Math.round(t.tsb)}). Quita volumen los 7–10 días antes.`"),
    ("`Llegarías algo justo de frescura (${Math.round(t.tsb)}). Una semana final algo más suave te dejaría entre +5 y +25.`",
     "`Llegarías justo de frescura (${Math.round(t.tsb)}). Haz más suave la última semana.`"),
    ("`Llegarías muy descansado (frescura ${Math.round(t.tsb)}) pero perdiendo forma: un ${Math.round(r*100)} % menos que en tu mejor momento. Mete algo más de carga entre 3 y 2 semanas antes.`",
     "`Llegas fresco pero con poca forma (−${Math.round(r*100)} %). Sube la carga del ${se(U(a.date,-21))} al ${se(U(a.date,-14))}.`"),
    ("`Bien: llegarías fresco (frescura ${Math.round(t.tsb)}) y con la forma cerca de su máximo.`",
     "`Bien: llegarías fresco (${Math.round(t.tsb)}) y en forma.`"),
    ("`Pulso en reposo ${v(d.delta,0)} ppm por encima de lo habitual (${v(d.value,0)} frente a ${v(d.base,0)}).`",
     "`Pulso en reposo +${v(d.delta,0)} sobre lo normal (${v(d.value,0)}).`"),
    ("`Pulso en reposo algo alto: ${v(d.value,0)} ppm (lo habitual, ${v(d.base,0)}).`",
     "`Pulso en reposo algo alto: ${v(d.value,0)} (normal, ${v(d.base,0)}).`"),
    ("`Fatiga acumulada alta (TSB ${v(f.tsb,0)}).`", "`Mucha fatiga acumulada (frescura ${v(f.tsb,0)}).`"),
    ("`Has subido la carga muy deprisa (ACWR ${v(G,2)}).`", "`Has subido la carga muy deprisa.`"),
    ("`Carga reciente algo alta (ACWR ${v(G,2)}).`", "`Carga reciente algo alta.`"),
    ("`Mucha más bajada de la habitual esta semana (ACWR de bajada ${v(f.acwrB,2)}): cuidado con cuádriceps y rodillas.`",
     "`Mucha bajada esta semana: cuida cuádriceps y rodillas.`"),
    ('"Apunta la VFC, el pulso en reposo, las horas de sueño o cómo tienes las piernas (o sincroniza) para tener una lectura del día."',
     '"Apunta la VFC o cómo tienes las piernas para leer el día."'),
    ('"Deja la intensidad para otro día. Si sales, 30–40 minutos muy fáciles o un paseo."', '"Sin intensidad. Si sales, 30–40 min muy fáciles."'),
    ('"Has hecho todo lo previsto esta semana. Lo que añadas, que sea fácil."', '"Semana cumplida. Lo que añadas, fácil."'),
    ('"Sin plan para esta semana: una sesión intensa como mucho cada dos o tres días."', '"Sin plan: como mucho una sesión intensa cada 2–3 días."'),
    ('"Lectura solo por la carga: hoy no hay VFC, pulso en reposo, sueño ni piernas."', '"Sin datos de hoy: lectura solo por la carga."'),
    ('"Sigue el plan. Si subes, que sea como mucho un 10 % en tiempo o en desnivel, no en los dos a la vez."',
     '"Sigue el plan. Si subes, máximo +10 % en tiempo o en desnivel, no en los dos."'),
    ('"Carga, VFC y desacoplamiento dentro de lo esperado."', '"Todo en orden."'),
    # resumen de la sesión: sin repetir lo que ya dicen las cifras
    ("re:n\\.push\\(`\\$\\{gr\\[i\\]\\|\\|\"Sesión\"\\} de \\$\\{ae\\(e\\.dur\\|\\|0\\)\\}\\$\\{l>=\\.5\\?`, \\$\\{v\\(l,1\\)\\} km`:\"\"\\}\\$\\{e\\.ascent>20\\?` y \\$\\{v\\(e\\.ascent,0\\)\\} m\\+`:\"\"\\}\\.`\\)", "0"),
    ("`Carga: ${v(a.tss,0)} TSS${Math.abs(h)>=.1?`, un ${Math.round(Math.abs(h)*100)} % ${h>0?\"más\":\"menos\"} intensa por hora que tus ${fr[i]||\"sesiones parecidas\"} de los últimos meses`:\", en tu línea habitual por hora\"}.`",
     "`Carga ${v(a.tss,0)}${Math.abs(h)>=.1?`: un ${Math.round(Math.abs(h)*100)} % ${h>0?\"más\":\"menos\"} intensa de lo normal`:\", normal para ti\"}.`"),
    ("`Desacoplamiento del ${v(c,1)} %: el pulso aguantó bien el ritmo de principio a fin.`", "`Pulso estable hasta el final (deriva ${v(c,1)} %).`"),
    ("`Desacoplamiento del ${v(c,1)} %: al final te costaba más mantener el ritmo (calor, poca base a esa intensidad o cansancio).`",
     "`Al final te costó más (deriva ${v(c,1)} %): calor, cansancio o poca base.`"),
    ('"Eficiencia (ritmo ajustado por pendiente a igual pulso) en tu media."', '"Eficiencia en tu media."'),
    ("`A igual pulso fuiste un ${Math.round(Math.abs(m)*100)} % ${m>0?\"más rápido\":\"más lento\"} (ritmo ajustado por pendiente) que en tus rodajes de los últimos meses${m<-.05?\": cansancio, calor o terreno técnico\":\"\"}.`",
     "`A igual pulso, un ${Math.round(Math.abs(m)*100)} % ${m>0?\"más rápido\":\"más lento\"} que tus rodajes${m<-.05?\": cansancio, calor o terreno\":\"\"}.`"),
    ("`Mejor subida: ${v(f.gain,0)} m al ${v(f.grade,0)} % a ${v(f.vam,0)} m/h${b(f.hr)?` con ${v(f.hr,0)} ppm`:\"\"}.`",
     "`Subida clave: ${v(f.vam,0)} m/h (${v(f.gain,0)} m al ${v(f.grade,0)} %${b(f.hr)?`, ${v(f.hr,0)} ppm`:\"\"}).`"),
    ("`Bastante bajada (${v(a.dminus,0)} m${a.dload>a.dminus*1.05?\", mucha empinada\":\"\"}): es normal notar los cuádriceps mañana.`",
     "`Mucha bajada (${v(a.dminus,0)} m): mañana notarás los cuádriceps.`"),
]
for old, new in T:
    add("mensaje corto", old, new)

# ---------------------------------------------------------------- Semáforo, versión y novedades
add("semáforo: la noche interrumpida cuenta",
    "h(1,`Media de sueño de las últimas noches: ${v(u.avg3,1)} h.`);let y=c.date===i?",
    "h(1,`Sueño medio de las últimas noches: ${v(u.avg3,1)} h.`);{let L=a.find(x=>x.id===\"diario-\"+i),HB=L&&L.habits;HB&&HB.noche&&h(1,\"Noche interrumpida.\")}let y=c.date===i?")
add("versión visible", 'React.createElement("span",null,"Versión ",Fa)', 'React.createElement("span",null,"Versión ",window.TLX?TLX.version+(TLX.beta?" · beta":""):Fa)')
add("novedades en Ajustes",
    'var di=[{version:"2026.11.9",',
    'var di=[{version:"2026.11.10",date:"2026-11-24",items:["Sincronización automática entre dispositivos: en Ajustes, conecta tu GitHub una vez en cada uno.","Mapas del IGN (mapa y ortofoto) en cada sesión, miniaturas en la lista y la página Mapa con todas tus salidas y «Mis subidas».","Metas: subida, ritmo, cintura, dominadas, banca y escalada en una sola vista.","Inicio: propuesta de FTP y pulso en reposo a partir de tus datos, parte de la semana, test del mes, aviso de salida larga y molestias del día.","Tiempo real de cada salida (Open-Meteo) en lugar de la temperatura de la muñeca.","Simulador: desnivel oficial, mapa del recorrido con tiempos de paso y plan de geles.","Sesiones: buscador, nombres automáticos, fotos, carbohidratos y «no contar en tests». Zapatillas: asignar en bloque.","Mensajes más cortos. Forma, fatiga y frescura con un solo nombre cada una; en Inicio, la subida de forma sustituye al ACWR.","Tema «Pirineo»."]},{version:"2026.11.9",')
add("ajustes: conservar los campos de la capa Plus (tlx…)",
    "function Na(e){let a=JSON.parse(JSON.stringify(Sl));if(!e)return a;",
    "function Na(e){let a=JSON.parse(JSON.stringify(Sl));if(!e)return a;for(let s of Object.keys(e))s.startsWith(\"tlx\")&&(a[s]=e[s]);")
