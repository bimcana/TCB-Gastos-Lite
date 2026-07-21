// TCB FotoGastos LITE — alimentadora de la carpeta de gastos. Captura/importa, recorta
// (auto clasico → IA local → editor manual con lupa), aplica filtro y SUBE a Drive como
// Pendiente_… con description v:1: la version completa la muestra "Pendiente de revision"
// y su dueno le lee los datos. Sin Gastos, sin OCR/IA de datos, sin documentos.
const tabs = ['camara', 'ajustes'];

export function show(nombre){
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById('scr-' + nombre).classList.add('active');
  tabs.forEach(t => document.getElementById('tab-' + t)?.classList.toggle('on',
    t === nombre || (nombre === 'revision' && t === 'camara')));
}

let toastTimer;
export function toast(msg){
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

export function setTheme(t){
  document.documentElement.setAttribute('data-theme', t);
  try { localStorage.setItem('tcb-theme', t); } catch(e){}
  document.getElementById('theme-dark').classList.toggle('on', t === 'dark');
  document.getElementById('theme-light').classList.toggle('on', t === 'light');
}
document.getElementById('theme-dark').addEventListener('click', () => setTheme('dark'));
document.getElementById('theme-light').addEventListener('click', () => setTheme('light'));
setTheme((() => { try { return localStorage.getItem('tcb-theme') || 'dark'; } catch(e){ return 'dark'; } })());

window.show = show;
window.toast = toast;

import { iniciarCamara, capturarFrame } from './camera.js';
import { procesar, aplicarRealce, canvasAJpeg } from './process.js';
import { get, set } from './settings.js';
import { cvReady } from './cvready.js';
import { detectarDocumento, esEstable, nitidezRegion, recorteConfiable,
         rectanguloDePapel, bandaDePapel, fraccionClara,
         papelLlenaLaFoto, marcoCompleto, esCasiElEncuadre } from './detect.js';
import { archivoACanvas } from './importar.js';
import { abrirEditorEsquinas, initEditorEsquinas } from './esquinas.js';
import { detectarConIA } from './detectia.js';
import { nombreCarpetaMes, hoyISO, nombreProvisional, nombreUnico } from './naming.js';
import { encolar, pendientes, eliminar, cuenta } from './queue.js';
import { initAuth, conectar, conectado, asegurarCarpeta, listarNombres, subirJPEG, nombreDe,
         alDesconectar, listarCarpetas, carpetasCompartidas, crearCarpeta, porExpirar } from './drive.js';
import { CLIENT_ID_APP } from './config.js';

initEditorEsquinas();

// Overlay "Procesando…" para trabajo sincrono de OpenCV (doble rAF asegura el paint).
function conOverlay(fn){
  const ov = document.getElementById('overlay-proc');
  ov.hidden = false;
  return new Promise(res => {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      let r; try { r = fn(); } finally { ov.hidden = true; res(r); }
    }));
  });
}

// La IA local tarda 2-4 s por imagen: overlay para que no parezca colgado.
async function detectarConIAConOverlay(canvas){
  const ov = document.getElementById('overlay-proc');
  ov.hidden = false;
  try { return await detectarConIA(canvas); }
  finally { ov.hidden = true; }
}

// ---------- Filtros de color (mismo motor de la Full) ----------
let modo = get('modoImagen', 'color');
const intensidad = 65;
const ETIQUETA_MODO = { color: 'auto-color', byn: 'blanco y negro', grises: 'grises', original: 'original' };
const filtrosEl = document.getElementById('filtros');
const filtrosDefEl = document.getElementById('filtros-def');

function actualizarUIFiltros(){
  [filtrosEl, filtrosDefEl].forEach(cont =>
    cont.querySelectorAll('.filtro').forEach(b => b.classList.toggle('on', b.dataset.modo === modo)));
}
actualizarUIFiltros();

function cambiarModo(nuevo){
  modo = nuevo;
  set('modoImagen', modo);
  actualizarUIFiltros();
  if (window.__resultado && window.__resultado.canvasPlano) reprocesarRealce();
}
[filtrosEl, filtrosDefEl].forEach(cont => cont.addEventListener('click', (ev) => {
  const btn = ev.target.closest('.filtro');
  if (btn) cambiarModo(btn.dataset.modo);
}));

async function reprocesarRealce(){
  const res = window.__resultado;
  if (!res || !res.canvasPlano) return;
  let ok = true;
  const final = await conOverlay(() => {
    try { return aplicarRealce(res.canvasPlano, { modo, intensidad }); }
    catch(e){ console.error(e); toast('No se pudo aplicar el filtro'); ok = false; return res.canvasFinal; }
  });
  res.canvasFinal = final;
  pintarEnRevision(final);
  if (ok){
    res.modo = modo;
    document.getElementById('rev-file').textContent = `Ortofoto · ${ETIQUETA_MODO[modo] || modo}`;
  }
  document.getElementById('seg-proc').classList.add('on');
  document.getElementById('seg-orig').classList.remove('on');
}

// ---------- Camara ----------
const video = document.getElementById('cam-video');
const statusTxt = document.getElementById('cam-status-txt');

// Ajuste "Cámara": con camaraAuto=false la cámara NO se enciende (ni dispara el aviso
// de permiso de iOS) hasta que el usuario toque el estado en pantalla.
function arrancarCamara(){
  statusTxt.textContent = 'Iniciando cámara…';
  iniciarCamara(video)
    .then(() => { statusTxt.textContent = 'Buscando documento…'; })
    .catch(err => {
      statusTxt.textContent = 'Sin acceso a la cámara';
      toast('Permite el acceso a la cámara para capturar facturas');
      console.error(err);
    });
}
if (get('camaraAuto', true)){
  arrancarCamara();
} else {
  statusTxt.textContent = 'Toca aquí para activar la cámara';
}
document.getElementById('cam-status').addEventListener('click', () => {
  const track = video.srcObject && video.srcObject.getVideoTracks()[0];
  if (!track || track.readyState === 'ended') arrancarCamara();
});

function actualizarUICamaraAuto(){
  const auto = get('camaraAuto', true);
  document.getElementById('cam-auto-si').classList.toggle('on', auto);
  document.getElementById('cam-auto-no').classList.toggle('on', !auto);
}
document.getElementById('cam-auto-si').addEventListener('click', () => { set('camaraAuto', true); actualizarUICamaraAuto(); });
document.getElementById('cam-auto-no').addEventListener('click', () => { set('camaraAuto', false); actualizarUICamaraAuto(); toast('La cámara solo se encenderá cuando la toques'); });
actualizarUICamaraAuto();

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  const track = video.srcObject && video.srcObject.getVideoTracks()[0];
  if ((!track || track.readyState === 'ended') && get('camaraAuto', true)){
    iniciarCamara(video).catch(err => {
      statusTxt.textContent = 'Sin acceso a la cámara';
      console.error(err);
    });
  }
  if (!conectado()) reconectarSilencioso();
});

function pintarEnRevision(canvas){
  const rev = document.getElementById('rev-canvas');
  rev.width = canvas.width; rev.height = canvas.height;
  rev.getContext('2d').drawImage(canvas, 0, 0);
}

async function procesarYRevisar(){
  const { canvas, esquinas } = window.__captura;
  show('revision');
  let r = null;
  if (esquinas){
    r = await conOverlay(() => {
      try { return procesar(canvas, esquinas, { modo, intensidad }); }
      catch(e){ console.error(e); toast('No se pudo procesar; ajusta las esquinas'); return null; }
    });
  }
  window.__resultado = {
    canvasPlano: r ? r.plano : null,
    canvasFinal: r ? r.final : null,
    canvasOriginal: canvas,
    esquinas
  };
  pintarEnRevision((r && r.final) || canvas);
  document.getElementById('rev-file').textContent = r ? `Ortofoto · ${ETIQUETA_MODO[modo] || modo}` : 'Sin detección — ajusta las esquinas';
  document.getElementById('seg-proc').classList.toggle('on', !!r);
  document.getElementById('seg-orig').classList.toggle('on', !r);
  actualizarUIFiltros();
}
window.procesarYRevisar = procesarYRevisar;

document.getElementById('seg-proc').addEventListener('click', () => {
  if (!window.__resultado) return;
  if (window.__resultado.canvasFinal){
    pintarEnRevision(window.__resultado.canvasFinal);
    document.getElementById('seg-proc').classList.add('on'); document.getElementById('seg-orig').classList.remove('on');
  } else { toast('Aún no hay versión procesada — aplica las esquinas'); }
});
document.getElementById('seg-orig').addEventListener('click', () => {
  if (!window.__resultado) return;
  pintarEnRevision(window.__resultado.canvasOriginal);
  document.getElementById('seg-orig').classList.add('on'); document.getElementById('seg-proc').classList.remove('on');
});

document.getElementById('shutter').addEventListener('click', async () => {
  if (disparando) return;
  if (!video.videoWidth) return toast('La cámara no está lista');
  const canvas = capturarFrame(video);
  const fx = document.getElementById('flashfx');
  fx.classList.remove('go'); void fx.offsetWidth; fx.classList.add('go');
  // Fase 10: el rectangulo minimo entra antes que la IA (una factura ES un rectangulo).
  let esquinas = ultimasEsquinas
    || detectarDocumento(canvas, 1200)
    || await conOverlay(() => rectanguloDePapel(canvas, 1200))
    || await detectarConIAConOverlay(canvas);
  window.__captura = { canvas, esquinas };
  procesarYRevisar();
});

// ---------- Editor de esquinas y visor ----------
async function ajustarEsquinas(){
  const res = window.__resultado;
  if (!res) return;
  const esq = await abrirEditorEsquinas(res.canvasOriginal, res.esquinas || null);
  if (!esq) return;
  window.__captura = { canvas: res.canvasOriginal, esquinas: esq };
  procesarYRevisar();
}
document.getElementById('btn-esquinas').addEventListener('click', ajustarEsquinas);

const visor = document.getElementById('visor');
const visorImg = document.getElementById('visor-img');
const visorRecortar = document.getElementById('visor-recortar');
function abrirVisor(){
  const rev = document.getElementById('rev-canvas');
  if (!rev.width) return;
  visorImg.src = rev.toDataURL('image/jpeg', 0.92);
  visorRecortar.hidden = false;
  visor.hidden = false;
}
function cerrarVisor(){
  if (visorImg.src.startsWith('blob:')) URL.revokeObjectURL(visorImg.src);
  visor.hidden = true; visorImg.removeAttribute('src');
}
document.getElementById('rev-canvas').addEventListener('click', abrirVisor);
document.getElementById('visor-cerrar').addEventListener('click', cerrarVisor);
visor.addEventListener('click', (ev) => { if (ev.target === visor) cerrarVisor(); });
visorRecortar.addEventListener('click', () => { cerrarVisor(); ajustarEsquinas(); });

// ---------- Deteccion en vivo (criterio estricto, sin falsos positivos) ----------
const overlay = document.getElementById('cam-overlay');
let ultimasEsquinas = null;

function dibujarOverlay(esquinas){
  const ctx = overlay.getContext('2d');
  const cw = overlay.clientWidth, ch = overlay.clientHeight;
  if (overlay.width !== cw || overlay.height !== ch){ overlay.width = cw; overlay.height = ch; }
  ctx.clearRect(0, 0, cw, ch);
  if (!esquinas || !video.videoWidth) return;
  const vw = video.videoWidth, vh = video.videoHeight;
  const s = Math.max(cw / vw, ch / vh);
  const ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2;
  const pts = esquinas.map(p => ({ x: p.x * s + ox, y: p.y * s + oy }));
  ctx.beginPath();
  pts.forEach((p, i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y));
  ctx.closePath();
  ctx.fillStyle = 'rgba(74,143,231,.10)';
  ctx.strokeStyle = '#4E9BEB';
  ctx.lineWidth = cw * 0.006;
  ctx.fill(); ctx.stroke();
}

const UMBRAL_NITIDEZ = 120;
const FRAMES_ESTABLES = 4;
// Fase 9: tolerancia al temblor natural de la mano (2% del ancho); la nitidez dentro
// del papel sigue siendo la guarda anti-foto-movida.
const TOL_ESTABLE = 0.02;
let estables = 0, disparando = false;

async function buclDeteccion(){
  await cvReady();
  const frame = document.createElement('canvas');
  const tick = () => {
    if (video.videoWidth && document.getElementById('scr-camara').classList.contains('active') && !disparando){
      frame.width = video.videoWidth; frame.height = video.videoHeight;
      frame.getContext('2d').drawImage(video, 0, 0);
      // Fase 11 (calibrado con 61 fotos reales — vivo detectaba 2/61): rescate hull
      // habilitado (su solidez >=0.8 filtra texturas) y el veto es "abarca casi todo
      // el encuadre", no "toca borde" (mataba tickets largos legitimos).
      let esquinas = detectarDocumento(frame, 700);
      if (esquinas && esCasiElEncuadre(esquinas, frame.width, frame.height)) esquinas = null;
      dibujarOverlay(esquinas);
      const shutter = document.getElementById('shutter');
      if (esquinas && esEstable(ultimasEsquinas, esquinas, frame.width * TOL_ESTABLE)){
        estables++;
        statusTxt.textContent = 'Documento detectado — mantén firme';
        document.getElementById('cam-status').classList.add('lock');
        shutter.classList.add('arm');
        if (estables >= FRAMES_ESTABLES && nitidezRegion(frame, esquinas) >= UMBRAL_NITIDEZ){
          disparando = true;
          estables = 0;
          shutter.classList.remove('arm');
          const fx = document.getElementById('flashfx');
          fx.classList.remove('go'); void fx.offsetWidth; fx.classList.add('go');
          window.__captura = { canvas: capturarFrame(video), esquinas };
          setTimeout(() => { procesarYRevisar(); disparando = false; }, 350);
        }
      } else {
        // Temblor breve con documento aun detectado: degrada el conteo, no lo reinicia.
        estables = esquinas ? Math.max(0, estables - 1) : 0;
        shutter.classList.remove('arm');
        statusTxt.textContent = esquinas ? 'Documento detectado — mantén firme' : 'Buscando documento…';
        document.getElementById('cam-status').classList.toggle('lock', !!esquinas);
      }
      ultimasEsquinas = esquinas;
    }
    setTimeout(() => requestAnimationFrame(tick), 120);
  };
  tick();
}
buclDeteccion();

// ---------- Importacion en lote ----------
function actualizarBarraLote(){
  const bar = document.getElementById('lote-bar');
  if (!window.__lote){ bar.hidden = true; return; }
  const { files, i } = window.__lote;
  bar.hidden = false;
  document.getElementById('lote-txt').textContent = `Importación en lote — subiendo ${i + 1} de ${files.length}`;
  document.getElementById('lote-dots').innerHTML = files
    .map((_, k) => `<span class="d ${k < i ? 'hecha' : k === i ? 'actual' : ''}"></span>`).join('');
}

// Recorte de una imagen IMPORTADA (Fase 10, mismo criterio que la Full tras el fallo de
// campo del ticket largo sobre granito). Cascada del motor mas preciso al mas tolerante;
// se acepta el primero que convenza por FORMA (recorteConfiable) y por CONTENIDO
// (fraccionClara: casi todo papel dentro). Si ninguno convence, abre el editor — nunca
// se aplica a ciegas un recorte torcido.
const MIN_CLARO = 0.75;

async function recortarImportada(canvas){
  const ok = e => recorteConfiable(e, canvas.width, canvas.height)
                  && fraccionClara(canvas, e) >= MIN_CLARO;
  const clasico = detectarDocumento(canvas, 1200);
  if (ok(clasico)) return clasico;
  // Patron A (Fase 11): el papel llena la foto — el recorte correcto es el marco completo.
  if (papelLlenaLaFoto(canvas)){
    const marco = marcoCompleto(canvas.width, canvas.height);
    if (ok(marco)) return marco;
  }
  const rect = await conOverlay(() => rectanguloDePapel(canvas, 1200));
  if (ok(rect)) return rect;
  const ia = await detectarConIAConOverlay(canvas);
  if (ok(ia)) return ia;
  const banda = await conOverlay(() => bandaDePapel(canvas, 1200));
  if (ok(banda)) return banda;
  return abrirEditorEsquinas(canvas, clasico || rect || ia || banda);
}

async function cargarSiguienteDelLote(){
  const lote = window.__lote;
  if (!lote) return;
  if (lote.i >= lote.files.length){
    window.__lote = null;
    actualizarBarraLote();
    show('camara');
    return;
  }
  actualizarBarraLote();
  try {
    const canvas = await archivoACanvas(lote.files[lote.i]);
    const esquinas = await recortarImportada(canvas);
    window.__captura = { canvas, esquinas };
    procesarYRevisar();
  } catch(e){
    console.error(e);
    toast('No se pudo abrir una imagen; se omite');
    window.__lote.i++;
    cargarSiguienteDelLote();
  }
}

async function importarLote(files){
  if (!files || !files.length) return;
  await cvReady();
  window.__lote = { files, i: 0 };
  cargarSiguienteDelLote();
}

function avanzarLoteOIr(destino){
  if (window.__lote){
    window.__lote.i++;
    cargarSiguienteDelLote();
  } else {
    show(destino);
  }
}

function cancelarLoteYVolver(){
  if (window.__lote){ window.__lote = null; actualizarBarraLote(); }
  show('camara');
}
window.cancelarLoteYVolver = cancelarLoteYVolver;

document.getElementById('btn-importar').addEventListener('click', () => document.getElementById('file-import').click());
document.getElementById('file-import').addEventListener('change', (ev) => {
  const files = [...ev.target.files];
  ev.target.value = '';
  importarLote(files);
});

// ---------- Subida Lite ----------
// La entrada minima que la version FULL reconoce (su entradaDeDesc exige v:1 y archivo):
// al listar, su conciliacion la restaura como "Pendiente de revision" y el dueno le lee
// los datos. La Lite NO escribe _gastos.json (cero conflictos multi-usuario).
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
      await encolar({ blob, datos: {} });
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

// ---------- Cola offline ----------
async function actualizarBadge(){
  const n = await cuenta();
  const b = document.getElementById('cola-badge');
  b.style.display = n ? 'block' : 'none';
  b.textContent = n;
}

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
actualizarBadge();

let colaURLs = [];
async function abrirCola(){
  const lista = document.getElementById('cola-lista');
  colaURLs.forEach(u => URL.revokeObjectURL(u)); colaURLs = [];
  lista.innerHTML = '';
  const items = await pendientes();
  document.getElementById('cola-subir').disabled = !items.length;
  if (!items.length) lista.innerHTML = '<div class="gem-note">Nada en cola — todo está en Drive.</div>';
  for (const it of items){
    const fila = document.createElement('div');
    fila.className = 'cola-item';
    const img = document.createElement('img');
    const u = URL.createObjectURL(it.blob); colaURLs.push(u);
    img.src = u; img.alt = 'Miniatura';
    const info = document.createElement('div');
    info.className = 'cola-info';
    info.innerHTML = '<b>Factura capturada</b><span>Esperando conexión con Drive</span>';
    const del = document.createElement('button');
    del.className = 'cola-borrar'; del.textContent = '🗑';
    del.setAttribute('aria-label', 'Eliminar de la cola');
    del.addEventListener('click', async () => {
      if (!confirm('¿Eliminar esta factura de la cola? La foto se descartará (aún no está en Drive).')) return;
      await eliminar(it.id);
      actualizarBadge();
      abrirCola();
    });
    fila.appendChild(img); fila.appendChild(info); fila.appendChild(del);
    lista.appendChild(fila);
  }
  document.getElementById('cola-panel').hidden = false;
}
function cerrarCola(){
  document.getElementById('cola-panel').hidden = true;
  colaURLs.forEach(u => URL.revokeObjectURL(u)); colaURLs = [];
}
document.getElementById('btn-cola').addEventListener('click', abrirCola);
document.getElementById('cola-cerrar').addEventListener('click', cerrarCola);
document.getElementById('cola-subir').addEventListener('click', async () => {
  if (!conectado()) return toast('Sin conexión con Drive — conéctate en Ajustes');
  cerrarCola();
  await procesarCola();
  toast('Cola procesada');
});

// ---------- Conexion con Google Drive ----------
function clientIdActivo(){
  return get('clientId', '') || CLIENT_ID_APP;
}

function pintarRutaCarpeta(){
  document.getElementById('carpeta-ruta').textContent = get('carpetaRuta', '') || '— sin vincular —';
}
pintarRutaCarpeta();

function mostrarAvisoReconectar(){
  document.getElementById('drive-estado').textContent = 'Desconectado — toca «Conectar Google Drive»';
}
alDesconectar(mostrarAvisoReconectar);

async function postConexion(){
  let raizId = get('carpetaRaizId');
  if (raizId){
    try { await nombreDe(raizId); }
    catch(e){ console.warn('Carpeta vinculada inaccesible; se re-crea la por defecto'); raizId = null; }
  }
  if (!raizId){
    raizId = await asegurarCarpeta(get('carpetaRaiz', 'Gastos_NCF'));
    set('carpetaRuta', 'Mi unidad / ' + get('carpetaRaiz', 'Gastos_NCF'));
  }
  set('carpetaRaizId', raizId);
  set('driveConectadoAntes', true);
  pintarRutaCarpeta();
  document.getElementById('drive-estado').textContent = 'Conectado ✓';
  procesarCola();
}

document.getElementById('btn-conectar').addEventListener('click', async () => {
  const btn = document.getElementById('btn-conectar');
  const clientId = clientIdActivo();
  if (!clientId) return toast('Falta el Client ID (Otros ajustes)');
  btn.disabled = true;
  try {
    initAuth(clientId);
    await conectar();
    await postConexion();
    toast('Google Drive conectado');
  } catch(e){
    console.error(e);
    toast('No se pudo conectar: ' + e.message);
  } finally { btn.disabled = false; }
});

async function reconectarSilencioso(){
  const clientId = clientIdActivo();
  if (!clientId || !get('driveConectadoAntes', false)) return;
  if (conectado()){
    try { if (window.google) initAuth(clientId); } catch(e){ console.warn(e); }
    try { await postConexion(); } catch(e){ console.warn(e); mostrarAvisoReconectar(); }
    return;
  }
  if (!window.google){ mostrarAvisoReconectar(); return; }
  try {
    initAuth(clientId);
    await conectar({ silencioso: true });
    await postConexion();
    toast('Google Drive reconectado ✓');
  } catch(e){
    console.warn('Reconexion silenciosa fallo:', e.message);
    mostrarAvisoReconectar();
  }
}
window.addEventListener('load', () => setTimeout(reconectarSilencioso, 600));

// El token de Google vive 60 min (limite fijo de Google para apps sin servidor). La
// renovacion silenciosa al abrir FALLA en iOS si no hay gesto del usuario (bloqueo de
// popups). Solucion: el PRIMER toque en cualquier parte renueva el token — como el
// consentimiento ya existe, es instantaneo. Throttle de 30 s.
// Fase 8: ademas renueva PROACTIVAMENTE cuando al token le quedan <5 min, para que la
// app casi nunca llegue a estar desconectada mientras se usa. En la Lite esto importa
// mas que en la Full: aqui no hay pestaña de Gastos con aviso, y una subida que falla
// por token vencido manda la foto a la cola en vez de a Drive.
let _ultimoIntentoRenovar = 0;
document.addEventListener('pointerdown', () => {
  const porRenovar = !conectado() || porExpirar();
  if (!porRenovar) return;
  if (!get('driveConectadoAntes', false) || !clientIdActivo() || !window.google) return;
  const ahora = Date.now();
  if (ahora - _ultimoIntentoRenovar < 30000) return;
  _ultimoIntentoRenovar = ahora;
  if (conectado()){
    // Aun conectado: refrescar SOLO el token en silencio, sin re-inicializar la UI.
    try {
      initAuth(clientIdActivo());
      conectar({ silencioso: true }).catch(e => console.warn('Renovacion anticipada fallo:', e.message));
    } catch(e){ console.warn(e); }
  } else {
    reconectarSilencioso();
  }
}, true);

// ---------- Selector de carpeta matriz (vinculo por ID, incluye Compartidos) ----------
let pickerPila = [];
const PICKER_VIRTUALES = new Set(['root', '__compartidos__']);

async function renderPicker(){
  const lista = document.getElementById('carpeta-lista');
  const rutaEl = document.getElementById('carpeta-ruta-actual');
  const tope = pickerPila[pickerPila.length - 1] || null;
  rutaEl.textContent = pickerPila.length ? pickerPila.map(p => p.nombre).join(' / ') : 'Elige dónde vive la carpeta de gastos';
  const virtual = !tope || PICKER_VIRTUALES.has(tope.id);
  document.getElementById('carpeta-usar').disabled = virtual;
  document.getElementById('carpeta-nueva').disabled = !tope || tope.id === '__compartidos__';
  lista.innerHTML = '<div class="gem-note">Cargando…</div>';
  try {
    let carpetas;
    if (!tope){
      carpetas = [{ id: 'root', nombre: 'Mi unidad' }, { id: '__compartidos__', nombre: 'Compartidos conmigo' }];
    } else if (tope.id === '__compartidos__'){
      carpetas = (await carpetasCompartidas()).map(c => ({ id: c.id, nombre: c.name }));
    } else {
      carpetas = (await listarCarpetas(tope.id)).map(c => ({ id: c.id, nombre: c.name }))
        .sort((a, b) => a.nombre.localeCompare(b.nombre));
    }
    lista.innerHTML = '';
    if (pickerPila.length){
      const up = document.createElement('button');
      up.className = 'carpeta-item';
      up.textContent = '‹ Atrás';
      up.addEventListener('click', () => { pickerPila.pop(); renderPicker(); });
      lista.appendChild(up);
    }
    for (const c of carpetas){
      const b = document.createElement('button');
      b.className = 'carpeta-item';
      b.innerHTML = '<span>📁</span><span class="carpeta-nom num"></span><span style="color:var(--dim)">›</span>';
      b.querySelector('.carpeta-nom').textContent = c.nombre;
      b.addEventListener('click', () => { pickerPila.push(c); renderPicker(); });
      lista.appendChild(b);
    }
    if (!carpetas.length) lista.insertAdjacentHTML('beforeend', '<div class="gem-note">Sin subcarpetas aquí.</div>');
  } catch(e){ console.error(e); lista.innerHTML = '<div class="gem-note">No se pudo listar — revisa la conexión.</div>'; }
}

document.getElementById('btn-carpeta').addEventListener('click', () => {
  if (!conectado()) return toast('Conecta Google Drive primero');
  pickerPila = [];
  document.getElementById('carpeta-panel').hidden = false;
  renderPicker();
});
document.getElementById('carpeta-cerrar').addEventListener('click', () => {
  document.getElementById('carpeta-panel').hidden = true;
});
document.getElementById('carpeta-nueva').addEventListener('click', async () => {
  const tope = pickerPila[pickerPila.length - 1];
  if (!tope || tope.id === '__compartidos__') return;
  const nombre = (prompt('Nombre de la carpeta nueva:') || '').trim();
  if (!nombre) return;
  try {
    const id = await crearCarpeta(nombre, tope.id === 'root' ? null : tope.id);
    pickerPila.push({ id, nombre });
    renderPicker();
  } catch(e){ console.error(e); toast('No se pudo crear la carpeta'); }
});
document.getElementById('carpeta-usar').addEventListener('click', () => {
  const tope = pickerPila[pickerPila.length - 1];
  if (!tope || PICKER_VIRTUALES.has(tope.id)) return;
  set('carpetaRaizId', tope.id);
  set('carpetaRaiz', tope.nombre);
  set('carpetaRuta', pickerPila.map(p => p.nombre).join(' / '));
  document.getElementById('carpeta-panel').hidden = true;
  pintarRutaCarpeta();
  toast(`Carpeta «${tope.nombre}» vinculada ✓`);
  procesarCola();
});

// ---------- Otros ajustes (PIN) ----------
const otrosPanel = document.getElementById('otros-ajustes');
document.getElementById('btn-otros').addEventListener('click', () => {
  if (!otrosPanel.hidden){ otrosPanel.hidden = true; return; }
  const pinGuardado = get('pinAjustes', null);
  if (!pinGuardado){
    const nuevo = (prompt('Crea un PIN de 4 números para proteger estos ajustes:') || '').trim();
    if (!/^\d{4}$/.test(nuevo)) return toast('El PIN debe ser de 4 números');
    set('pinAjustes', nuevo);
    toast('PIN creado ✓ — guárdalo bien');
    otrosPanel.hidden = false;
    return;
  }
  const pin = (prompt('PIN de 4 números:') || '').trim();
  if (pin !== pinGuardado) return toast('PIN incorrecto');
  otrosPanel.hidden = false;
});

const inpClient = document.getElementById('inp-clientid');
inpClient.value = get('clientId', '');
inpClient.addEventListener('change', () => set('clientId', inpClient.value.trim()));
