# TCB FotoGastos **Lite** — Plan de Implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (o subagent-driven-development) para ejecutar este plan tarea por tarea. Los pasos usan checkboxes (`- [ ]`).
>
> **Contexto imprescindible:** la app completa vive en `../TCB-FotoGastos/` (mismo directorio padre). Este plan COPIA módulos de ahí; ese repo es la referencia canónica. Leer su memoria de proyecto (`fotogastos-proyecto.md` en la memoria del agente) antes de empezar.

**Goal:** App PWA "alimentadora" para empleados/terceros: fotografiar o importar facturas, recortarlas (auto + manual) y aplicar filtro, y subirlas a la carpeta de Drive elegida (propia o compartida) — SIN Gastos, SIN lectura de datos, SIN generación de documentos. La versión Full las verá como **"Pendiente de revisión"** y su dueño les leerá los datos.

**Architecture:** Reutilización máxima: ~85% de los módulos se copian VERBATIM de la Full (cámara, detección clásica+IA, editor de esquinas con lupa, ortofoto/filtros, importación en lote, cola offline, Drive con selector de carpeta, credenciales integradas). Lo nuevo es un `main.js` reducido (sin tarjeta de datos, sin Gemini/OCR, sin Gastos) y una pantalla de Revisión que termina en un solo botón «Subir a Drive». La subida escribe la `description` v:1 mínima para que la conciliación de la Full la reconozca como pendiente.

**Tech Stack:** PWA estática sin build (ES modules), OpenCV.js y U²-Net-p/ONNX vendorizados, Google Identity Services + Drive API v3 (scope `auth/drive`), IndexedDB, GitHub Pages.

## Global Constraints

- Carpeta del proyecto: `TCB-FotoScan/TCB-FotoGastos-Lite/` (esta). Repo GitHub propio: `ariesteban/TCB-FotoGastos-Lite`.
- Commits en español con `git commit -F archivo` (evita problemas de tildes en el shell). Sin datos de BIMCANA en el repo público (ejemplos: CLIENTE SRL, RNC 000-0000-00).
- **`.nojekyll` va en el PRIMER commit** (lección aprendida: sin él, Pages procesa 30 MB con Jekyll y las publicaciones tardan horas o se atascan).
- **Un push por publicación**: nunca encadenar pushes sin esperar a que la construcción de Pages termine (los pushes nuevos CANCELAN la construcción en curso — así se congeló la Full 3 días).
- Nombres de subida: `Pendiente_AAAAMMDD-HHMMSS.jpg` (formato exacto de la Full — su revisor los renombra a `Compra_DDN.jpg` al leer la fecha).
- `description` de cada subida: JSON `{"v":1,"archivo":"<nombre>","estado":"pendiente","origen":"lite","subidoEn":"<ISO>"}` — compatible con `entradaDeDesc` de la Full (exige `v===1` y `archivo`).
- Tests con `node --test tests/*.test.js`; verdes antes de cada commit.
- Client ID: el MISMO de la Full (`src/config.js` se copia tal cual). GitHub Pages sirve todos los repos del usuario bajo el MISMO origen `https://ariesteban.github.io` → **no hay que tocar nada en Google Cloud** (origen ya autorizado, scope ya consentido, app OAuth ya publicada).

## Mapa de archivos

| Destino en Lite | Acción | Fuente / contenido |
|---|---|---|
| `src/camera.js, cvready.js, detect.js, detectia.js, esquinas.js, process.js, enhance.js, importar.js, queue.js, settings.js, carga.js, naming.js, config.js` | **COPIAR VERBATIM** | `../TCB-FotoGastos/src/` |
| `src/drive.js` | **COPIAR VERBATIM** | ídem (ya trae picker: `listarCarpetas`, `carpetasCompartidas`, `crearCarpeta`, token persistente, `alDesconectar`, scopeV) |
| `vendor/opencv.js`, `vendor/ort/**`, `vendor/modelos/**` | **COPIAR** | ídem (NO copiar `vendor/tesseract`, `vendor/pdf-lib`, `vendor/sheetjs`) |
| `styles.css` | COPIAR y recortar | quitar bloques: revisar-panel de datos, acordeón, chips de estado (conservar: base, cámara, revisión, filtros, editor esquinas, visor, cola, picker carpeta, toast, temas) |
| `icons/**`, `manifest.webmanifest` | COPIAR y ADAPTAR | name «TCB FotoGastos Lite», short_name «FotoGastos Lite» |
| `tests/naming.test.js`, `tests/detect.test.js`, `tests/settings.test.js`, `tests/enhance.test.js` | COPIAR VERBATIM | cubren los módulos copiados |
| `index.html` | **NUEVO** (base: el de la Full, recortado) | 2 pestañas (Cámara/Ajustes); Revisión sin tarjeta de datos |
| `src/main.js` | **NUEVO** (composición) | Task 3 |
| `sw.js` | **NUEVO** | Task 4 |
| `package.json`, `README.md`, `.gitattributes`, `.nojekyll` | NUEVOS | Tasks 1 y 5 |

---

### Task 1: Esqueleto del proyecto + módulos copiados

- [ ] **Step 1:** `git init` en esta carpeta. Crear `.nojekyll` (vacío), `package.json`:

```json
{
  "name": "tcb-fotogastos-lite",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test tests/*.test.js" }
}
```

`.gitattributes`:

```
vendor/opencv.js binary
vendor/ort/** binary
vendor/modelos/** binary
```

- [ ] **Step 2:** Copiar de `../TCB-FotoGastos/` los archivos marcados COPIAR en el mapa (src, vendor, icons, tests). Verificar tamaños: `vendor` ≈ 30 MB (opencv ~11 + ort ~13.5 + modelo ~4.6).
- [ ] **Step 3:** `manifest.webmanifest`: cambiar `name` → «TCB FotoGastos Lite», `short_name` → «FotoGastos Lite»; el resto igual.
- [ ] **Step 4:** `npm test` → PASS (los tests copiados corren contra los módulos copiados).
- [ ] **Step 5:** Commit inicial: `Lite: esqueleto con modulos compartidos de la app completa (+.nojekyll desde el dia uno)`.

### Task 2: `index.html` de la Lite

Partir del `index.html` de la Full y QUITAR: pestaña y pantalla Gastos, tarjeta «Datos de la factura» completa (campos, chips, toggle IA/OCR, dup-banner, nota-verificar), panel `revisar-panel`, tarjeta Gemini de Ajustes, tarjeta Empresa. CONSERVAR: pantalla Cámara íntegra (video, overlay, shutter, btn-importar/file-import, btn-cola+badge, lote-bar), pantalla Revisión reducida, overlay-proc, editor `esq-editor`, visor (con `visor-recortar`), panel `cola-panel`, panel `carpeta-panel`, Ajustes con: tema, Google Drive (Conectar + «Carpeta de gastos vinculada» + Elegir carpeta…), «Otros ajustes» con PIN conteniendo SOLO el Client ID. Barra inferior: 2 tabs (`tab-camara`, `tab-ajustes`).

- [ ] **Step 1:** La pantalla Revisión queda así (reemplaza la tarjeta de datos por la nota + botón):

```html
<section class="screen" id="scr-revision">
  <div class="head" style="padding-top:12px">
    <button class="btn-back" onclick="cancelarLoteYVolver()" aria-label="Volver">‹</button>
    <div><h2>Revisar foto</h2><div class="hsub" id="rev-file">—</div></div>
  </div>
  <div class="scroll">
    <div id="lote-bar" hidden><div id="lote-txt"></div><div id="lote-dots"></div></div>
    <div class="filtros" id="filtros">
      <button class="filtro on" data-modo="color">Auto-color</button>
      <button class="filtro" data-modo="byn">Blanco y negro</button>
      <button class="filtro" data-modo="grises">Grises</button>
      <button class="filtro" data-modo="original">Original</button>
    </div>
    <div class="seg" role="tablist" style="margin:10px 0">
      <button class="on" id="seg-proc">Procesada · se guarda así</button>
      <button id="seg-orig">Original de cámara</button>
    </div>
    <div class="stage" style="position:relative; text-align:center">
      <canvas id="rev-canvas" title="Toca para ver en pantalla completa" style="max-width:100%; max-height:60vh; border-radius:4px; cursor:zoom-in"></canvas>
    </div>
    <div class="gem-note" style="margin-top:10px">La foto sube tal como se ve. Quien tenga la versión completa le leerá los datos.</div>
    <button class="btn btn-ghost" id="btn-esquinas" style="margin-top:10px; width:100%">Ajustar esquinas manualmente</button>
    <button class="btn btn-primary" id="confirm-btn" style="margin-top:10px; width:100%">Subir a Drive</button>
  </div>
</section>
```

(Los ids son LOS MISMOS de la Full a propósito: el código copiado de main.js funciona sin cambios.)

- [ ] **Step 2:** Conservar en Ajustes el bloque de tema, el de Drive (con `#carpeta-ruta`, `#btn-carpeta`, `#btn-conectar`, `#drive-estado`) y `#btn-otros`/`#otros-ajustes` con SOLO `#inp-clientid` dentro. Footer con logo TCB.
- [ ] **Step 3:** Abrir con un servidor local (`npx -y http-server -p 8137 -c-1 .`) y verificar en consola que no hay ids rotos (los listeners se cablean en Task 3; por ahora solo el HTML carga limpio).
- [ ] **Step 4:** Commit: `Lite: index.html (camara + revision minima + ajustes)`.

### Task 3: `src/main.js` de la Lite

Composición: copiar de `../TCB-FotoGastos/src/main.js` estos bloques POR NOMBRE, sin cambios salvo lo indicado:

`show/toast/setTheme` · `conOverlay` · `modo/intensidad` + `actualizarUIFiltros/cambiarModo/reprocesarRealce` (quitar `filtrosDefEl`: la Lite no tiene selector por defecto en Ajustes; dejar solo `filtrosEl`) · cámara (`iniciarCamara` wiring, visibilitychange, `buclDeteccion` estricto con `tocaBorde`) · shutter (con `detectarDocumento(canvas,1200) || detectarConIAConOverlay`) · `pintarEnRevision/procesarYRevisar` (QUITAR la llamada a `leerDatosDeFactura` y todo lo de `window.__datos`; `procesarYRevisar` termina tras `actualizarUIFiltros()`) · `detectarConIAConOverlay/ajustarEsquinas` + editor + visor con `visor-recortar` · importación en lote íntegra (`archivoACanvas/importarLote/cargarSiguienteDelLote/avanzarLoteOIr/cancelarLoteYVolver/actualizarBarraLote`) · cola offline (`encolar/pendientes/eliminar/cuenta`, `actualizarBadge`, `procesarCola`, panel `abrirCola/cerrarCola` + listeners) · conexión (`clientIdActivo/postConexion/mostrarAvisoReconectar/reconectarSilencioso` + botones; en `postConexion` QUITAR `refrescarGastos()`, `revisarPendientes()` y el bloque de `_empresa.json` — queda: validar/crear carpeta, `pintarRutaCarpeta`, `procesarCola()`) · selector de carpeta íntegro (`pintarRutaCarpeta/renderPicker/abrirPicker` + listeners) · PIN «Otros ajustes» (solo Client ID dentro).

- [ ] **Step 1:** Lo NUEVO — la subida Lite (reemplaza a `subirFactura` y al confirm handler de la Full):

```js
import { nombreCarpetaMes, hoyISO, nombreProvisional, nombreUnico } from './naming.js';
import { conectado, asegurarCarpeta, listarNombres, subirJPEG } from './drive.js'; // (mas los imports del picker/conexion)
import { encolar } from './queue.js';
import { canvasAJpeg } from './process.js';

// La entrada minima que la version FULL reconoce (entradaDeDesc exige v:1 y archivo):
// al listar, su conciliacion la restaura como "Pendiente de revision" y la IA del dueno
// le lee los datos. La Lite NO escribe _gastos.json (cero conflictos multi-usuario).
function descLite(nombre){
  return JSON.stringify({ v: 1, archivo: nombre, estado: 'pendiente', origen: 'lite',
                          subidoEn: new Date().toISOString() });
}

async function subirLite(blob){
  const raizId = get('carpetaRaizId');
  if (!conectado() || !raizId) throw new Error('sin-conexion');
  const mesId = await asegurarCarpeta(nombreCarpetaMes(hoyISO()), raizId);
  const nombre = nombreUnico(nombreProvisional(), await listarNombres(mesId));
  await subirJPEG(blob, nombre, mesId, descLite(nombre));
  return nombre;
}

document.getElementById('confirm-btn').addEventListener('click', async () => {
  const res = window.__resultado;
  if (!res) return;
  const canvas = res.canvasFinal || res.canvasOriginal;
  const btn = document.getElementById('confirm-btn');
  btn.disabled = true; btn.textContent = 'Subiendo…';
  let blob;
  try {
    blob = await canvasAJpeg(canvas);
    const nombre = await subirLite(blob);
    toast(`Subida ✓ (${nombre})`);
    avanzarLoteOIr('camara');
  } catch(e){
    console.error(e);
    if (e.message === 'sin-conexion'){
      await encolar({ blob, datos: {} }); // la cola Lite guarda solo la imagen
      toast('Sin conexión — en cola; se subirá al reconectar');
      actualizarBadge();
      avanzarLoteOIr('camara');
    } else {
      toast('Error al subir: ' + e.message);
    }
  } finally {
    btn.disabled = false; btn.textContent = 'Subir a Drive';
  }
});
```

- [ ] **Step 2:** `procesarCola` de la Lite (adaptación del de la Full — sube con `subirLite`, sin índice ni duplicados):

```js
let colaEnProceso = false;
async function procesarCola(){
  if (colaEnProceso || !conectado()) return;
  colaEnProceso = true;
  try {
    for (const item of await pendientes()){
      try { const n = await subirLite(item.blob); await eliminar(item.id); toast(`Cola: ${n} subida ✓`); }
      catch(e){ break; }
    }
  } finally { colaEnProceso = false; actualizarBadge(); }
}
window.addEventListener('online', procesarCola);
```

- [ ] **Step 3:** `node --check src/main.js` → OK. Servidor local: flujo E2E SIN conexión — importar 2 imágenes de `../Facturas de prueba/` → editor precargado → Aplicar → filtros → «Subir a Drive» → cola (badge 2) → panel de cola las muestra. (En pestaña oculta del Browser pane: shim `window.requestAnimationFrame = cb => setTimeout(cb, 16)` antes de probar — los rAF no corren en pestañas hidden.)
- [ ] **Step 4:** `npm test` → PASS. Commit: `Lite: main.js (captura, recorte, filtros, lote, cola y subida a Drive)`.

### Task 4: Service worker + README

- [ ] **Step 1:** `sw.js` (calcado del patrón Full):

```js
const VERSION = 'lite-v1';
const PRECACHE = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest',
  'src/main.js', 'src/camera.js', 'src/detect.js', 'src/cvready.js', 'src/config.js',
  'src/process.js', 'src/enhance.js', 'src/naming.js', 'src/settings.js', 'src/drive.js',
  'src/queue.js', 'src/importar.js', 'src/esquinas.js', 'src/detectia.js', 'src/carga.js',
  'vendor/opencv.js', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys =>
    Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || !e.request.url.startsWith(self.location.origin)) return;
  if (/\/vendor\/(ort|modelos)\//.test(e.request.url)){ // motor IA: cache al primer uso
    e.respondWith(caches.open(VERSION).then(cache =>
      cache.match(e.request).then(hit => hit || fetch(e.request).then(resp => {
        if (resp.ok) cache.put(e.request, resp.clone());
        return resp;
      }))));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit => hit || fetch(e.request)));
});
```

Regla de mantenimiento (heredada): **subir `VERSION` en cada despliegue**.

- [ ] **Step 2:** `README.md`: qué es la Lite (alimentadora), enlace a la Full, cómo instalar en iPhone (Add to Home Screen), nota del rol: «las facturas subidas aparecen como Pendiente de revisión en la versión completa».
- [ ] **Step 3:** Commit: `Lite: service worker lite-v1 y README`.

### Task 5: Publicación — GitHub Pages

- [ ] **Step 1:** Crear el repo (con `gh` si está instalado, si no: github.com → New repository → `TCB-FotoGastos-Lite`, público, vacío):

```bash
git remote add origin https://github.com/ariesteban/TCB-FotoGastos-Lite.git
git push -u origin main
git branch gh-pages main && git push origin gh-pages
```

- [ ] **Step 2:** GitHub → repo → **Settings → Pages** → Source: *Deploy from a branch* → Branch: `gh-pages` / `/ (root)` → Save. (Paso del dueño si el agente no tiene sesión de GitHub.)
- [ ] **Step 3:** Esperar UNA construcción (Actions → «pages build and deployment»). **No empujar nada más mientras corre.** Verificar:

```bash
curl -s https://ariesteban.github.io/TCB-FotoGastos-Lite/sw.js | head -1   # → const VERSION = 'lite-v1';
```

- [ ] **Step 4:** Abrir `https://ariesteban.github.io/TCB-FotoGastos-Lite/` y verificar carga sin errores de consola.

### Task 6: Publicación — Google (verificación de que NO hay nada que hacer)

- [ ] **Step 1:** Confirmar que el origen del sitio Lite es el MISMO que el de la Full: ambos son `https://ariesteban.github.io` (los repos son rutas, no orígenes). Como ese origen ya está en «Orígenes autorizados de JavaScript» del Client ID compartido, y la app OAuth ya está publicada («In production»), **la Lite no requiere ningún cambio en Google Cloud**. Si algún día la Lite se sirviera desde OTRO dominio (p. ej. dominio propio), habría que añadir ese origen al Client ID — anotarlo en el README.
- [ ] **Step 2:** Prueba real: en el navegador, Ajustes → Conectar Google Drive → consentir → **Elegir carpeta…** → navegar a una carpeta compartida o a `Gastos_NCF` → vincular → subir una foto de prueba → confirmarla en Drive con nombre `Pendiente_…` y verificar en la app FULL que aparece como **«Pendiente de revisión»** (la conciliación la restaura del `description`).

### Task 7: Prueba de campo (dueño)

- [ ] iPhone del empleado tipo: instalar desde el enlace, conectar SU cuenta de Google, vincular la carpeta COMPARTIDA de la empresa (el dueño debe compartirla con permiso de editor), capturar 2-3 facturas reales + importar 1 de la fototeca, verificar cola sin conexión (modo avión) y subida al reconectar.
- [ ] iPhone del dueño (app Full): ver las subidas de la Lite como «Pendiente de revisión», tocar «Leer con IA», validar, y generar el mes con ellas incluidas.

---

## Self-review (hecho al escribir)

- **Cobertura:** cámara/recortes/filtros → módulos copiados + Task 3; lote → Task 3; cola → Tasks 2-3; Drive a carpeta elegida/compartida → drive.js copiado + picker + Task 6; publicación GitHub → Task 5 (con las 2 lecciones aprendidas: `.nojekyll` día uno y un-push-por-publicación); Google → Task 6 (mismo origen = nada que configurar); integración con la Full → formato `Pendiente_` + description v:1 (constraints) + prueba cruzada en Task 6/7.
- **Consistencia:** ids del HTML (Task 2) = los que usa el código copiado (Task 3); `subirJPEG(blob, nombre, carpetaId, description)` es la firma real de la Full; `descLite` produce exactamente lo que `entradaDeDesc` de la Full acepta (`v:1` + `archivo`).
- **Sin placeholders:** todo lo nuevo lleva código; lo copiado lleva ruta exacta y lista de funciones por nombre con sus adaptaciones puntuales.
