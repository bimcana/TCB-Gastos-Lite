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

1. Subir `VERSION` de `sw.js` en cada despliegue (`lite-vN`).
2. Mismo Client ID que la Full (`config.js`) y mismo origen `ariesteban.github.io` →
   **nada que configurar en Google** al publicar o mover de repo bajo ese origen.
3. Ajustes tiene: tema, Cámara (toggle «Iniciar al abrir / Solo al tocar», clave
   `tcb:camaraAuto`), Drive (Conectar + Elegir carpeta…), «Otros ajustes» con PIN (solo
   Client ID). No agregar campos de datos: la Lite no procesa.
4. Un push por publicación + `.nojekyll` intocable (mismas lecciones de la Full).

## 5. Publicación (pendiente al escribir esto)

1. Crear repo vacío `ariesteban/TCB-Gastos-Lite` en github.com (dueño).
2. `git remote add origin https://github.com/ariesteban/TCB-Gastos-Lite.git`
   `git push -u origin main && git branch gh-pages main && git push origin gh-pages`
3. Settings → Pages → Deploy from branch → `gh-pages` / root.
4. Esperar UNA construcción; verificar:
   `curl -s https://ariesteban.github.io/TCB-Gastos-Lite/sw.js | head -1` → `lite-v1`.
5. Prueba cruzada: subir una foto desde la Lite y verla «Pendiente de revisión» en la Full.

## 6. Pruebas

`npm test` (tests puros copiados: naming, detect, settings, enhance). E2E en navegador:
mismo procedimiento que la Full (puerto nuevo si el SW molesta; shim de rAF en el Browser
pane del agente). Flujo mínimo: importar 2 fotos de `../Facturas de prueba/` → editor →
subir sin conexión → cola con badge → panel de cola.
