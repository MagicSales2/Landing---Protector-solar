// ============================================================================
//  MagicSync — espejo editable de la base de datos en Google Sheets.
//
//  CÓMO INSTALARLO (una sola vez):
//    1. En tu hoja: menú "Extensiones" -> "Apps Script".
//    2. Borra lo que haya y pega TODO este código. Clic en el icono de
//       guardar (💾) y escribe un nombre al proyecto.
//    3. Arriba, en la barra, abre el selector de funciones y elige
//       `instalarDisparador`, luego clic en "Ejecutar". Acepta los permisos
//       que pida (es tu propia hoja, no hay riesgo).
//    4. Ve a "Implementar" (botón azul arriba a la derecha) ->
//       "Nueva implementación" -> tipo: "Aplicación web".
//       - "Ejecutar como": tú.
//       - "Acceso": "Cualquier persona".
//       - Clic en "Implementar", acepta "Autorizar acceso".
//    5. Copia la URL tipo ".../exec" que te da y ENVÍAMELA. Con eso activo
//       la conexión y queda todo sincronizado.
//
//  QUÉ HACE:
//    - DETECTA las ediciones a mano (estado, dirección, celular...) y las
//      manda a la base + al embudo de Kommo.
//    - Recibe cada pedido del sistema y lo crea/actualiza en la pestaña
//      "Pedidos" (identificado por su ID).
//
//  IMPORTANTE: no modifiques TOKEN: debe ser IGUAL al que ya está guardado
//  en el sistema (es la "llave" que los une).
// ============================================================================

var CONFIG = {
  webhook: 'https://drzbxmajsbkdkydsbjzj.supabase.co/functions/v1/webhook-sheets',
  token: 'be1f6036b9724acb9497a5110f4b1d6f',
  hoja: 'Pedidos',
};

// Columnas que el sistema conoce y mantiene sincronizadas.
var CABECERAS = [
  'ID', 'Numero', 'Fecha', 'Cliente', 'Celular', 'Correo', 'Documento',
  'Departamento', 'Ciudad', 'Direccion', 'Direccion 2', 'Notas', 'Oferta',
  'Cantidad', 'Total', 'Medio de pago', 'Estado', 'Lead Kommo',
  'Guia num', 'Guia link', 'Guia carrier', 'Guia estado', 'Guia error',
];

// Columna(es) que, si el dueño las edita a mano, se propagan a la base y a Kommo.
var EDITABLES = ['Estado', 'Celular', 'Ciudad', 'Departamento', 'Direccion', 'Direccion 2'];

function onOpen() {
  var ui = SpreadsheetApp.getUi();
  ui.createMenu('🪄 Magic Sync')
    .addItem('1) Crear pestaña y cabeceras', 'setupCabeceras')
    .addItem('2) Instalar disparador de ediciones', 'instalarDisparador')
    .addToUi();
}

function obtenerHoja_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hoja = ss.getSheetByName(CONFIG.hoja);
  if (!hoja) {
    hoja = ss.insertSheet(CONFIG.hoja);
  }
  return hoja;
}

// Crea (si faltan) las cabeceras en la fila 1 de la pestaña "Pedidos".
function setupCabeceras() {
  var hoja = obtenerHoja_();
  var fila1 = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  var porAgregar = [];
  for (var i = 0; i < CABECERAS.length; i++) {
    var nombre = CABECERAS[i];
    var existe = fila1.indexOf(nombre) !== -1;
    if (!existe) porAgregar.push(nombre);
  }
  if (porAgregar.length) {
    hoja.getRange(1, hoja.getLastColumn() + 1, 1, porAgregar.length).setValues([porAgregar]);
  }
  SpreadsheetApp.getActiveSpreadsheet().toast('Cabeceras listas en la pestaña «' + CONFIG.hoja + '»', 'Magic Sync');
}

// Índice de cada cabecera (columna) dentro de la pestaña.
function indiceColumnas_() {
  var hoja = obtenerHoja_();
  setupCabeceras();
  var fila1 = hoja.getRange(1, 1, 1, hoja.getLastColumn()).getValues()[0];
  var idx = {};
  for (var c = 0; c < fila1.length; c++) idx[String(fila1[c]).trim()] = c;
  return idx;
}

// Instala el disparador (trigger) que detecta las ediciones a mano.
// Debe ser un disparador "instalable" para poder llamar a Internet.
function instalarDisparador() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var existentes = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existentes.length; i++) {
    if (existentes[i].getHandlerFunction() === 'onEdit') {
      SpreadsheetApp.getActiveSpreadsheet().toast('El disparador ya está instalado ✅', 'Magic Sync');
      return;
    }
  }
  ScriptApp.newTrigger('onEdit').forSpreadsheet(ss).onEdit().create();
  SpreadsheetApp.getActiveSpreadsheet().toast('Disparador instalado ✅ Ya puedes cambiar estados a mano.', 'Magic Sync');
}

// ── Dirección: HOJA (edición manual) → SISTEMA ──────────────────────────────
// Detecta el cambio en una celda y, si es una columna "editable", avisa al
// sistema para que actualice la base de datos y el embudo de Kommo.
function onEdit(e) {
  try {
    var range = e.range;
    var hoja = range.getSheet();
    if (hoja.getName() !== CONFIG.hoja) return;
    if (range.getRow() < 2) return;

    var idx = indiceColumnas_();
    var colNombre = String(hoja.getRange(1, range.getColumn()).getValue()).trim();
    if (EDITABLES.indexOf(colNombre) === -1) return;

    var colId = idx['ID'];
    if (colId === undefined) return;
    var orderId = String(hoja.getRange(range.getRow(), colId + 1).getValue()).trim();
    if (!orderId) return;

    var valor = String(range.getValue()).trim();
    var cambios = [{ columna: colNombre, valor: valor }];

    var respuesta = enviarCambio_(orderId, cambios);
    if (respuesta && respuesta.cambiado === false) return;
    hoja.getRange(range.getRow(), range.getColumn()).setNote(valor ? 'Sincronizado con el sistema ✅' : 'Sincronizado (vacío) ✅');
  } catch (err) {
    try {
      SpreadsheetApp.getUi().alert('No se pudo sincronizar con el sistema:\n' + err.message);
    } catch (e2) { }
  }
}

function enviarCambio_(orderId, cambios) {
  var options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ token: CONFIG.token, orderId: orderId, cambios: cambios }),
    muteHttpExceptions: true,
  };
  var resp = UrlFetchApp.fetch(CONFIG.webhook, options);
  if (resp.getResponseCode() !== 200) {
    throw new Error('El sistema respondió ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 200));
  }
  return JSON.parse(resp.getContentText());
}

// ── Dirección: SISTEMA → HOJA ───────────────────────────────────────────────
// Recibe cada pedido (POST desde el sistema) y crea o actualiza su fila.
// Un cambio hecho aquí NO vuelve a disparar onEdit, así que no hay ciclos.
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    if (!body || body.token !== CONFIG.token) {
      return respuesta_(403, { ok: false, error: 'No autorizado' });
    }
    var pedido = body.pedido || {};
    var orderId = String(pedido.ID || '').trim();
    if (!orderId) return respuesta_(400, { ok: false, error: 'Falta el ID' });

    var hoja = obtenerHoja_();
    var idx = indiceColumnas_();
    var fila = buscarFilaPorId_(hoja, idx, orderId);

    for (var nombre in pedido) {
      if (idx[nombre] === undefined) continue;
      var columna = idx[nombre] + 1;
      var valor = pedido[nombre];
      if (nombre === 'Fecha' && valor) {
        var d = new Date(valor);
        if (!isNaN(d.getTime())) { hoja.getRange(fila, columna).setValue(d); continue; }
      }
      hoja.getRange(fila, columna).setValue(valor == null ? '' : valor);
    }
    return respuesta_(200, { ok: true, fila: fila });
  } catch (err) {
    return respuesta_(500, { ok: false, error: String(err) });
  }
}

function buscarFilaPorId_(hoja, idx, orderId) {
  var colId = idx['ID'] + 1;
  var ultima = Math.max(hoja.getLastRow(), 2);
  if (ultima >= 2) {
    var datos = hoja.getRange(2, colId, ultima - 1, 1).getValues();
    for (var i = 0; i < datos.length; i++) {
      if (String(datos[i][0]).trim() === orderId) return i + 2;
    }
  }
  hoja.getRange(ultima + 1, colId).setValue(orderId);
  return ultima + 1;
}

function respuesta_(codigo, obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}