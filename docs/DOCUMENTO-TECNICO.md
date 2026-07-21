# TCB FotoGastos **Lite** — Documento Técnico

> **Para quien modifique esta app en una sesión futura: lee PRIMERO el documento técnico de
> la versión Full (`../TCB-FotoGastos/docs/DOCUMENTO-TECNICO.md`)** — sus contratos de datos
> y reglas de oro aplican aquí. Este documento cubre solo lo que la Lite tiene de distinto.

## 1. Qué es (y qué NO es)

App "alimentadora" para empleados/terceros: **cámara → recorte (auto clásico+IA y manual con
lupa) → filtro de color → subir a Drive** a la carpeta vinculada (propia o compartida), con
importación en lote desde la fototeca y cola offline. **NO tiene**: Gastos, lectura de datos
(sin Gemini ni Tesseract), generación de PDF/606, perfil de empresa, PIN de Gemini.

## 2. Relación con la Full (el contrato de integración)

- Sube `Pendiente_AAAAMMDD-HHMMSS.jpg` a la carpeta del MES ACTUAL dentro de la matriz,
  con `description` mínima: `{"v":1,"archivo":"<nombre>","estado":"pendiente",
  "origen":"lite","subidoEn":"<ISO>"}` (función `descLite` en `src/main.js`).
- La Full, al listar, **restaura** esa entrada vía `conciliarIndice` y la muestra
  «Pendiente de revisión»; su dueño usa «Leer con IA» y valida. **No cambiar el formato del
  nombre ni de la description sin cambiar la Full a la vez.**
- La Lite NUNCA escribe `_gastos.json` (cero conflictos multi-usuario por diseño).

## 3. Módulos

Copiados VERBATIM de la Full (si se arregla un bug ahí, re-copiar aquí): `camera, cvready,
detect, detectia, esquinas, process, enhance, importar, queue, settings, carga, naming,
config, drive`. Propios de la Lite: `main.js` (orquestación reducida; la subida es
`subirLite`), `index.html` (2 pestañas: Cámara/Ajustes), `sw.js` (`VERSION 'lite-vN'`,
runtime-cache solo `vendor/(ort|modelos)`). Vendor: opencv + ort + modelo (~30 MB; SIN
tesseract/pdf-lib/sheetjs).

## 4. Reglas propias

0. **Token de Drive (Fase 8)**: el token implícito vive 60 min fijos (límite de Google sin
   backend). El listener global de `pointerdown` (capture, throttle 30 s) renueva cuando NO
   hay conexión **y también de forma proactiva cuando al token le quedan <5 min**
   (`porExpirar` en drive.js); estando aún conectado refresca SOLO el token
   (`conectar({silencioso:true})`), sin re-ejecutar `postConexion`. **No quitar ese
   listener.** En la Lite importa más que en la Full: aquí no hay pestaña de Gastos donde
   avisar, y una subida con token vencido manda la foto a la cola en vez de a Drive. Por
   decisión de Ari **la Lite NO lleva botón «Reconectar a Drive»** (ese botón vive en el
   encabezado de Gastos de la Full); aquí el aviso es el texto `drive-estado` de Ajustes.
1. Subir `VERSION` de `sw.js` en cada despliegue (`lite-vN`).
2. Mismo Client ID que la Full (`config.js`) y mismo origen `bimcana.github.io` →
   **nada que configurar en Google** al publicar o mover de repo bajo ese origen.
3. Ajustes tiene: tema, Cámara (toggle «Iniciar al abrir / Solo al tocar», clave
   `tcb:camaraAuto`), Drive (Conectar + Elegir carpeta…), «Otros ajustes» con PIN (solo
   Client ID). No agregar campos de datos: la Lite no procesa.
4. Un push por publicación + `.nojekyll` intocable (mismas lecciones de la Full).

## 5b. Rama que publica (verificado 2026-07-21)

La **Lite publica desde `gh-pages`**; la **Full publica desde `main`**. No son iguales —
no asumir la configuración de una al tocar la otra. Funcionalmente no hay diferencia
(mismo pipeline, misma URL, misma velocidad); la diferencia es operativa.

**INVARIANTE: empujar siempre las dos ramas al mismo commit** — así la publicación sale
bien sea cual sea la configuración de cada repo:

```
git push origin main && git branch -f gh-pages main && git push origin gh-pages
```

Si un push NO dispara construcción (le pasó a la Full en Fase 8), comprobar antes de
re-empujar que no haya nada en vuelo:
`curl -s "https://api.github.com/repos/bimcana/TCB-Gastos-Lite/actions/runs?per_page=3"`
— sin `queued`/`in_progress`, re-disparar con `git commit --allow-empty` es seguro.
Verificar el CONTENIDO publicado, no solo el `sw.js`.

Mejora pendiente de Ari: pasar la Lite a `main` (Settings → Pages) y borrar `gh-pages` en
ambos repos → una sola rama y se acaba el ritual.

## 5. Publicación (pendiente al escribir esto)

1. Crear repo vacío `bimcana/TCB-Gastos-Lite` en github.com (dueño).
2. `git remote add origin https://github.com/bimcana/TCB-Gastos-Lite.git`
   `git push -u origin main && git branch gh-pages main && git push origin gh-pages`
3. Settings → Pages → Deploy from branch → `gh-pages` / root.
4. Esperar UNA construcción; verificar:
   `curl -s https://bimcana.github.io/TCB-Gastos-Lite/sw.js | head -1` → `lite-v1`.
5. Prueba cruzada: subir una foto desde la Lite y verla «Pendiente de revisión» en la Full.

## 6. Pruebas

`npm test` (tests puros copiados: naming, detect, settings, enhance, **esquinas** — este
último cubre los handles laterales de Fase 8: `puntosMedios`/`desplazarLado`). E2E en navegador:
mismo procedimiento que la Full (puerto nuevo si el SW molesta; shim de rAF en el Browser
pane del agente). Flujo mínimo: importar 2 fotos de `../Facturas de prueba/` → editor →
subir sin conexión → cola con badge → panel de cola.
