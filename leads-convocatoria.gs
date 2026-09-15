/**
 * ═══ LEADS CONVOCATORIA 1TO1 · Pop-up → Hoja de Google → Panel ═══════
 *
 * El pop-up de /pages/1to1 manda cada lead a dos sitios: a la lista
 * "Convocatoria 1to1" de Klaviyo (para los emails) y a este script, que lo
 * guarda en una hoja de Google privada. El panel lee de aquí un resumen con
 * los emails enmascarados, porque panel.thecrewacademy.es es público.
 *
 * Sin claves de API. La hoja "Leads convocatoria 1to1" se crea sola en tu
 * Drive al ejecutar `prepararHoja` una vez desde el editor.
 *
 * Despliegue: Implementar → Nueva implementación → Aplicación web
 *   Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario
 */

const NOMBRE_HOJA = 'Leads convocatoria 1to1';
const CACHE_S = 120;  // el panel ve los leads nuevos en 2 min como mucho

// ── El pop-up escribe aquí ──────────────────────────────────────────
function doPost(e) {
  let d;
  try {
    d = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ ok: false, error: 'JSON inválido' });
  }

  const email = String(d.email || '').trim().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json_({ ok: false, error: 'Email inválido' });
  if (d.prueba) return json_({ ok: true, prueba: true }); // comprueba el despliegue sin escribir

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    hoja_().appendRow([
      new Date(),
      String(d.nombre || '').trim().slice(0, 80),
      email,
      String(d.whatsapp || '').trim().slice(0, 40),
      String(d.origen || 'Pop-up convocatoria 1to1').slice(0, 60),
    ]);
  } finally {
    lock.releaseLock();
  }
  CacheService.getScriptCache().remove('resumen');
  return json_({ ok: true });
}

// ── El panel lee de aquí ────────────────────────────────────────────
function doGet() {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get('resumen');
  if (guardado) return texto_(guardado);

  let out;
  try {
    out = JSON.stringify(resumen_());
    cache.put('resumen', out, CACHE_S);
  } catch (e) {
    out = JSON.stringify({ ok: false, error: String(e.message || e) });
  }
  return texto_(out);
}

function resumen_() {
  const sh = hoja_();
  const n = Math.max(sh.getLastRow() - 1, 0);
  const filas = (n ? sh.getRange(2, 1, n, 4).getValues() : [])
    .filter(r => r[0] instanceof Date)
    .map(r => ({
      fecha: r[0],
      nombre: String(r[1]),
      email: enmascarar_(String(r[2])),
      whatsapp: Boolean(String(r[3]).trim()),
    }))
    .sort((a, b) => b.fecha - a.fecha);

  const tz = Session.getScriptTimeZone();
  const dia = d => Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  const ahora = new Date();

  // últimos 14 días, del más antiguo a hoy
  const porDia = [];
  for (let i = 13; i >= 0; i--) {
    const d = dia(new Date(ahora.getTime() - i * 864e5));
    porDia.push({ dia: d, n: filas.filter(f => dia(f.fecha) === d).length });
  }

  return {
    ok: true,
    lista: NOMBRE_HOJA,
    total: filas.length,
    hoy: porDia[13].n,
    ultimos7: porDia.slice(7).reduce((s, x) => s + x.n, 0),
    conWhatsapp: filas.filter(f => f.whatsapp).length,
    porDia,
    recientes: filas.slice(0, 15).map(f => ({ ...f, fecha: f.fecha.toISOString() })),
    actualizado: ahora.toISOString(),
  };
}

// La hoja se crea la primera vez y su id queda guardado en el script
function hoja_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('HOJA_ID');
  let ss = null;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create(NOMBRE_HOJA);
    const sh = ss.getSheets()[0];
    sh.appendRow(['Fecha', 'Nombre', 'Email', 'WhatsApp', 'Origen']);
    sh.setFrozenRows(1);
    props.setProperty('HOJA_ID', ss.getId());
  }
  return ss.getSheets()[0];
}

// Ejecutar una vez desde el editor: autoriza el script y crea la hoja
function prepararHoja() {
  Logger.log(hoja_().getParent().getUrl());
}

// gerard@gmail.com → g•••@gmail.com
function enmascarar_(email) {
  if (!email.includes('@')) return '';
  const [u, dom] = email.split('@');
  return `${u.charAt(0)}•••@${dom}`;
}

function json_(obj) {
  return texto_(JSON.stringify(obj));
}

function texto_(s) {
  return ContentService.createTextOutput(s).setMimeType(ContentService.MimeType.JSON);
}
