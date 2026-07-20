# TCB FotoGastos **Lite**

Versión **alimentadora** de [TCB FotoGastos](https://github.com/ariesteban/TCB-FotoGastos): para que empleados o colaboradores fotografíen facturas NCF, las recorten y las suban a la carpeta de gastos de la empresa en Google Drive — **sin** ver los gastos, **sin** lectura de datos y **sin** generación de documentos. Cada foto sube como `Pendiente_…` y aparece en la versión completa como **«Pendiente de revisión»**, lista para que su dueño le lea los datos con IA y la valide.

**App en vivo:** https://ariesteban.github.io/TCB-Gastos-Lite/

En iPhone: abrir en Safari → Compartir → **Añadir a pantalla de inicio**.

## Qué hace

- **Cámara** con detección de documento y auto-disparo; ortofoto con filtros (auto-color, B/N, grises, original).
- **Recorte automático** (clásico + IA local en el teléfono) y **editor manual a pantalla completa con lupa**.
- **Importación en lote** desde la fototeca.
- **Cola offline**: sin conexión, las fotos esperan y suben solas al reconectar.
- **Google Drive**: se vincula cualquier carpeta — propia o **compartida** por la empresa — navegando como en Drive (el vínculo es por ID: renombrar/mover la carpeta no lo rompe).

## Configuración típica (empleado)

1. Abrir la app → **Ajustes → Conectar Google Drive** (con la cuenta propia; primera vez muestra el aviso de app no verificada: Configuración avanzada → Continuar).
2. **Elegir carpeta…** → Compartidos conmigo → la carpeta de gastos que la empresa compartió (necesita permiso de editor).
3. Listo: fotografiar y **Subir a Drive**.

## Notas técnicas

- El primer uso del recorte con IA descarga ~18 MB (queda cacheado; después funciona offline).
- Mismo Client ID y origen que la app completa → no requiere configuración adicional en Google Cloud. Si algún día se sirve desde otro dominio, añadir ese origen al Client ID.
- Al desplegar cambios, subir la constante `VERSION` de `sw.js`.
- Despliegue: ramas `main` y `gh-pages` idénticas; `.nojekyll` obligatorio; **un push por publicación** (esperar a que la construcción de Pages termine antes de volver a empujar).
