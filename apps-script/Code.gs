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
  hoja1: 'Hoja 1',
};

// Cada vez que publiques una versión nueva, cambia este número por +1
// (v3, v4, ...). Sirve para verificar desde el servidor cuál está activa.
var VERSION = 'v7';

// Columnas que el sistema conoce y mantiene sincronizadas.
var CABECERAS = [
  'ID', 'Numero', 'Fecha', 'Cliente', 'Celular', 'Correo', 'Documento',
  'Departamento', 'Ciudad', 'Direccion', 'Direccion 2', 'Notas', 'Oferta',
  'Cantidad', 'Total', 'Medio de pago', 'Estado', 'Lead Kommo',
  'Guia num', 'Guia link', 'Guia carrier', 'Guia estado', 'Guia error',
  // Ciudad y Departamento juntos en una celda (ej. "Villavicencio, Meta").
  // Va al final a propósito: no mueve ninguna columna que ya uses.
  'Ciudad y Departamento',
];

// Columnas de tu pestaña manual ("Hoja 1"). El sistema también escribe aquí,
// con solo estos datos y el estado en su palabra correcta (nuevo / error / …).
//   F = Ciudad y Departamento juntos en una celda (ej. "Villavicencio, Meta").
//   G = el medio de pago (Wompi o Contra Entrega), con tu encabezado.
var CABECERAS1 = [
  'Lead', 'Producto', 'ID', 'Dirección Entrega', 'Dirección 2',
  'Dpto / Ciudad', 'Contraentrega', 'Nombre Quien Recibe', 'Celular', 'Guia',
  'Transportadora', 'Costo domi', 'Estado',
];

// Columna(es) que, si el dueño las edita a mano, se propagan a la base y a Kommo.
// Admite las variantes con tilde (pestaña manual) y sin tilde (pestaña "Pedidos").
var EDITABLES = ['Estado', 'Celular', 'Ciudad', 'Departamento', 'Direccion', 'Direccion 2', 'Dirección', 'Dirección Entrega', 'Dirección 2'];

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
  var ultima = hoja.getLastColumn();
  var fila1 = ultima > 0 ? hoja.getRange(1, 1, 1, ultima).getValues()[0] : [];
  var porAgregar = [];
  for (var i = 0; i < CABECERAS.length; i++) {
    var nombre = CABECERAS[i];
    var existe = fila1.indexOf(nombre) !== -1;
    if (!existe) porAgregar.push(nombre);
  }
  if (porAgregar.length) {
    var desde = hoja.getLastColumn() > 0 ? hoja.getLastColumn() + 1 : 1;
    hoja.getRange(1, desde, 1, porAgregar.length).setValues([porAgregar]);
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
// Detecta el cambio en una celda de CUALQUIER pestaña con una columna
// "editable". El pedido se localiza buscando su "PED-XXXX-XXXX" en la fila
// (columna "Lead" o "ID"). Si la fila no corresponde a un pedido real del
// sistema, se ignora en silencio (no molesta con alertas en filas viejas).
function onEdit(e) {
  try {
    var range = e.range;
    var hoja = range.getSheet();
    if (range.getRow() < 2) return;

    var colNombre = String(hoja.getRange(1, range.getColumn()).getValue()).trim();
    if (EDITABLES.indexOf(colNombre) === -1) return;

    var filaDatos = hoja.getRange(range.getRow(), 1, 1, Math.max(hoja.getLastColumn(), 1)).getValues()[0];
    var orderId = '';
    for (var i = 0; i < filaDatos.length; i++) {
      var coincide = String(filaDatos[i]).match(/PED-[A-Z0-9]{4}-[A-Z0-9]{4}/);
      if (coincide) { orderId = coincide[0]; break; }
    }
    if (!orderId) return;

    var valor = String(range.getValue()).trim();
    var cambios = [{ columna: colNombre, valor: valor }];

    var respuesta = enviarCambio_(orderId, cambios);
    if (!respuesta || respuesta.cambiado === false) return;
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
  if (resp.getResponseCode() === 404) return null; // fila vieja sin pedido en el sistema
  if (resp.getResponseCode() !== 200) {
    throw new Error('El sistema respondió ' + resp.getResponseCode() + ': ' + resp.getContentText().slice(0, 200));
  }
  return JSON.parse(resp.getContentText());
}

// ── AUTO-INSTALACIÓN ────────────────────────────────────────────────────────
// Al abrir la URL de la aplicación web (https://.../exec) en el navegador se
// ejecuta doGet y, si falta, instala el disparador de ediciones automáticamente.
// Así olvidarse del paso manual de instalar el trigger.
function doGet() {
  try {
    setupCabeceras();
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var existentes = ScriptApp.getProjectTriggers();
    var ya = false;
    for (var i = 0; i < existentes.length; i++) {
      if (existentes[i].getHandlerFunction() === 'onEdit') { ya = true; break; }
    }
    if (!ya) ScriptApp.newTrigger('onEdit').forSpreadsheet(ss).onEdit().create();
    return respuesta_(200, { ok: true, disparador: ya ? 'ya instalado' : 'instalado ahora', ver: VERSION });
  } catch (err) {
    return respuesta_(500, { ok: false, error: String(err) });
  }
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

    escribirHoja1_(pedido, orderId);
    try { hoja.getRange(1, 26).setValue('MagicSync ' + VERSION); } catch (e) { }
    return respuesta_(200, { ok: true, fila: fila, hoja1: true, ver: VERSION });
  } catch (err) {
    return respuesta_(500, { ok: false, error: String(err) });
  }
}

// ── TambiÉN escribe en tu pestaña manual "Hoja 1" (gid 0) ────────────────────
// Usa las columnas que tú tienes ("Lead", "Dirección Entrega", "Estado"…).
// Identifica la fila buscando el PED-XXXX-XXXX en "Lead" o "ID" (así respeta
// las filas que ya tenías escritas a mano).
function obtenerHoja1_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var hojas = ss.getSheets();
  for (var i = 0; i < hojas.length; i++) {
    if (hojas[i].getSheetId() === 0) return hojas[i];
  }
  var porNombre = ss.getSheetByName(CONFIG.hoja1) || ss.getSheetByName('Sheet1');
  if (porNombre) return porNombre;
  return ss.insertSheet(CONFIG.hoja1);
}

function asegurarCabeceras1_(hoja) {
  // IMPORTANTE: la fila 1 SIEMPRE lleva las cabeceras correctas. Se limpia y
  // se escribe el encabezado aunque una prueba vieja haya dejado basura ahí
  // (los datos reales van siempre en filas 2 en adelante).
  var r1 = hoja.getRange(1, 1, 1, CABECERAS1.length);
  r1.clear();
  r1.setValues([CABECERAS1]);
}

// "Estado" como corresponde en tu hoja 1: 'nuevo' cuando llega, y 'error'
// cuando hay algún fallo (p. ej. la guía de Envia sin saldo).
function estadoHoja1_(pedido) {
  var base = String(pedido['Estado'] || '');
  var error = String(pedido['Guia error'] || '');
  if (error && base === 'nuevo') return 'error';
  return base;
}

function escribirHoja1_(pedido, orderId) {
  try {
    var diagn = '';
    var hoja1 = obtenerHoja1_();
    try { asegurarCabeceras1_(hoja1); } catch (e) { diagn += 'H:' + String(e); }
    var fila1 = hoja1.getRange(1, 1, 1, Math.max(hoja1.getLastColumn(), 1)).getValues()[0];
    var idx = {};
    for (var c = 0; c < fila1.length; c++) idx[String(fila1[c]).trim()] = c;

    var fila = buscarFilaHoja1_(hoja1, orderId);

    var cantidad = String(pedido['Cantidad'] || '').trim();
    var ciudad = String(pedido['Ciudad'] || '').trim();
    var departamento = String(pedido['Departamento'] || '').trim();
    var ciudadYDepto = [ciudad, departamento].filter(Boolean).join(', ');
    var unidad = cantidad === '1' ? 'unidad' : 'unidades';
    var etiqueta = 'Landing ' + orderId + ' · ' + cantidad + ' ' + unidad;
    if (ciudad) etiqueta += ' · ' + ciudad;
    var producto = 'Protector solar x' + cantidad;

    var leadId = String(pedido['Lead Kommo'] || '').trim();

    // Campo A (Lead): ENLACE DIRECTO a la venta en Kommo. Se pone primero el
    // enlace "incrustado" (texto azul clickeable) y se verifica; si no quedara,
    // plan B: la URL como texto (Google la convierte en enlace automáticamente).
    var tipoA = 'texto';
    if (idx['Lead'] !== undefined) {
      try {
        var celdaLead = hoja1.getRange(fila, idx['Lead'] + 1);
        if (leadId) {
          var urlLead = 'https://magiapastelerta4.kommo.com/leads/detail/' + leadId;
          celdaLead.setValue(etiqueta);
          celdaLead.setRichTextValue(SpreadsheetApp.newRichTextValue()
            .setText(etiqueta)
            .setLinkUrl(urlLead)
            .build());
          var urlPuesta = null;
          try { urlPuesta = celdaLead.getRichTextValue().getLinkUrl(); } catch (e) { }
          if (urlPuesta) {
            tipoA = 'enlace';
          } else {
            celdaLead.setValue(urlLead); // la URL visible también es clickeable.
            tipoA = 'url';
          }
        } else {
          celdaLead.setValue(etiqueta);
        }
      } catch (e) {
        try { hoja1.getRange(fila, idx['Lead'] + 1).setValue(urlLead || etiqueta); } catch (e2) { }
        tipoA = 'error:' + String(e);
      }
    }

    var p = function (cabecera, valor) {
      if (idx[cabecera] !== undefined && valor != null) hoja1.getRange(fila, idx[cabecera] + 1).setValue(valor);
    };

    // Campo B (Producto): protector solar x1/x2/x3.
    p('Producto', producto);
    p('Dirección Entrega', pedido['Direccion']);
    p('Dirección 2', pedido['Direccion 2']);
    p('Dpto / Ciudad', ciudadYDepto);
    p('Contraentrega', pedido['Medio de pago']);
    p('Nombre Quien Recibe', pedido['Cliente']);
    p('Celular', pedido['Celular']);
    p('Guia', pedido['Guia num']);
    p('Transportadora', pedido['Guia carrier']);
    p('Costo domi', pedido['Total']);

    // Campo C (ID): el nombre del lead.
    if (idx['ID'] !== undefined) {
      hoja1.getRange(fila, idx['ID'] + 1).setValue(etiqueta);
    }

    if (idx['Estado'] !== undefined) hoja1.getRange(fila, idx['Estado'] + 1).setValue(estadoHoja1_(pedido));

    // Limpia filas duplicadas del mismo pedido que hayan quedado de pruebas
    // viejas: deja solo UNA fila (la de arriba, que acabamos de escribir).
    limpiarDuplicadosHoja1_(hoja1, fila, orderId);

    try { hoja1.getRange(1, 26).setValue((diagn ? diagn + ' | ' : '') + 'A:' + tipoA + ' | ' + VERSION); } catch (e) { }
  } catch (err) {
    try { hoja1.getRange(1, 26).setValue('ERR: ' + String(err)); } catch (e) { }
  }
}

function limpiarDuplicadosHoja1_(hoja, filaActual, orderId) {
  try {
    var fila1 = hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1)).getValues()[0];
    var colLead = fila1.indexOf('Lead');
    var colId = fila1.indexOf('ID');
    var ultima = Math.max(hoja.getLastRow(), 2);
    for (var f = ultima; f >= 2; f--) {
      if (f === filaActual) continue;
      var coincide = false;
      if (colLead !== -1) {
        if (String(hoja.getRange(f, colLead + 1).getValue()).toUpperCase().indexOf(orderId.toUpperCase()) !== -1) coincide = true;
      }
      if (colId !== -1 && !coincide) {
        if (String(hoja.getRange(f, colId + 1).getValue()).toUpperCase().indexOf(orderId.toUpperCase()) !== -1) coincide = true;
      }
      if (coincide) hoja.deleteRow(f);
    }
  } catch (e) { }
}

function buscarFilaHoja1_(hoja, orderId) {
  var fila1 = hoja.getRange(1, 1, 1, Math.max(hoja.getLastColumn(), 1)).getValues()[0];
  var colLead = fila1.indexOf('Lead');
  var colId = fila1.indexOf('ID');
  var ultima = Math.max(hoja.getLastRow(), 2);
  var columnas = [];
  if (colLead !== -1) columnas.push(colLead + 1);
  if (colId !== -1) columnas.push(colId + 1);
  for (var k = 0; k < columnas.length; k++) {
    var datos = hoja.getRange(2, columnas[k], Math.max(ultima - 1, 1), 1).getValues();
    for (var i = 0; i < datos.length; i++) {
      if (String(datos[i][0]).toUpperCase().indexOf(orderId.toUpperCase()) !== -1) return i + 2;
    }
  }
  if (colLead !== -1) hoja.getRange(ultima + 1, colLead + 1).setValue(orderId);
  return ultima + 1;
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