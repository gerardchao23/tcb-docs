/**
 * ═══ LEADS CONVOCATORIA 1TO1 · Klaviyo → Panel ═══════════════════════
 *
 * El panel (panel.thecrewacademy.es) es HTML público: la clave privada de
 * Klaviyo no puede ir dentro. Este script hace de intermediario: guarda la
 * clave a salvo en Google, pregunta a Klaviyo y devuelve al panel solo
 * números y datos enmascarados (nunca emails ni teléfonos completos).
 *
 * MONTAJE (una vez):
 *  1. script.google.com → Nuevo proyecto → borra lo que haya y pega esto.
 *  2. ⚙ Configuración del proyecto → Propiedades del script → Añadir:
 *       Propiedad: KLAVIYO_KEY    Valor: tu clave privada de Klaviyo (pk_…)
 *     La clave se crea en Klaviyo → Configuración → Claves API → Crear clave
 *     privada, con acceso de solo lectura a Listas y Perfiles.
 *  3. Implementar → Nueva implementación → tipo "Aplicación web"
 *       Ejecutar como: Yo · Quién tiene acceso: Cualquier usuario → Implementar
 *  4. Copia la URL que acaba en /exec y pásasela a Claude.
 */

const LISTA    = 'Convocatoria 1to1'; // nombre exacto de la lista en Klaviyo
const REVISION = '2026-07-15';        // versión de la API de Klaviyo
const API      = 'https://a.klaviyo.com/api';
const CACHE_S  = 300;                 // 5 min: no se consulta Klaviyo en cada recarga

function doGet() {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get('leads');
  if (guardado) return json_(guardado);

  let out;
  try {
    out = JSON.stringify(leads_());
    cache.put('leads', out, CACHE_S);
  } catch (e) {
    out = JSON.stringify({ ok: false, error: String(e.message || e) });
  }
  return json_(out);
}

function leads_() {
  const key = PropertiesService.getScriptProperties().getProperty('KLAVIYO_KEY');
  if (!key) throw new Error('Falta KLAVIYO_KEY en Propiedades del script');

  const filtro = encodeURIComponent(`equals(name,"${LISTA}")`);
  const listas = get_(`${API}/lists?filter=${filtro}`, key).data;
  if (!listas.length) throw new Error(`No existe la lista "${LISTA}" en Klaviyo`);

  const perfiles = [];
  let url = `${API}/lists/${listas[0].id}/profiles?page%5Bsize%5D=100`;
  while (url) {
    const r = get_(url, key);
    perfiles.push(...r.data);
    url = r.links && r.links.next;
  }

  const tz = Session.getScriptTimeZone();
  const dia = d => Utilities.formatDate(d, tz, 'yyyy-MM-dd');
  const ahora = new Date();

  const filas = perfiles.map(p => {
    const a = p.attributes || {};
    const props = a.properties || {};
    return {
      fecha: new Date(a.joined_group_at || a.created),
      nombre: a.first_name || '',
      email: enmascarar_(a.email),
      whatsapp: Boolean(a.phone_number || props.whatsapp || props.WhatsApp),
    };
  }).sort((x, y) => y.fecha - x.fecha);

  // últimos 14 días, del más antiguo a hoy
  const porDia = [];
  for (let i = 13; i >= 0; i--) {
    const d = dia(new Date(ahora.getTime() - i * 864e5));
    porDia.push({ dia: d, n: filas.filter(f => dia(f.fecha) === d).length });
  }

  return {
    ok: true,
    lista: LISTA,
    total: filas.length,
    hoy: porDia[13].n,
    ultimos7: porDia.slice(7).reduce((s, x) => s + x.n, 0),
    conWhatsapp: filas.filter(f => f.whatsapp).length,
    porDia,
    recientes: filas.slice(0, 15).map(f => ({ ...f, fecha: f.fecha.toISOString() })),
    actualizado: ahora.toISOString(),
  };
}

function get_(url, key) {
  const r = UrlFetchApp.fetch(url, {
    headers: {
      Authorization: `Klaviyo-API-Key ${key}`,
      accept: 'application/vnd.api+json',
      revision: REVISION,
    },
    muteHttpExceptions: true,
  });
  if (r.getResponseCode() >= 300) {
    throw new Error(`Klaviyo ${r.getResponseCode()}: ${r.getContentText().slice(0, 200)}`);
  }
  return JSON.parse(r.getContentText());
}

// gerard@gmail.com → g•••@gmail.com
function enmascarar_(email) {
  if (!email) return '';
  const [u, dom] = email.split('@');
  return `${u.charAt(0)}•••@${dom}`;
}

function json_(texto) {
  return ContentService.createTextOutput(texto).setMimeType(ContentService.MimeType.JSON);
}
