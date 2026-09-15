#!/usr/bin/env node
/**
 * ═══ PANEL CIFRADO · The Crew ═══════════════════════════════════════
 *
 * Las páginas del panel se escriben en claro en `fuente/` (que NUNCA se sube)
 * y se publican cifradas en la raíz del repositorio.
 *
 *   node panel-cifrar.js contraseña   pide la contraseña (no se ve al escribir)
 *                                     y crea o actualiza el candado
 *   node panel-cifrar.js publicar     cifra cada .html de fuente/ y lo deja
 *                                     en la misma ruta de la raíz
 *
 * Cómo funciona:
 *  - Una llave aleatoria de 256 bits cifra cada página con AES-256-GCM.
 *    Vive solo en este Mac, en ~/.tcb-panel/llave (permisos 600).
 *  - En la web va esa llave "envuelta" con la contraseña (PBKDF2-SHA256,
 *    600.000 vueltas + AES-GCM) en candado.json. Sin la contraseña no se
 *    desenvuelve, y sin la llave las páginas son ruido.
 *  - Cambiar la contraseña solo vuelve a envolver la misma llave: las páginas
 *    publicadas siguen valiendo, basta con volver a publicar.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const RAIZ = __dirname;
const FUENTE = path.join(RAIZ, 'fuente');
const CANDADO = path.join(RAIZ, 'candado.json');
const LLAVE = path.join(os.homedir(), '.tcb-panel', 'llave');
const VUELTAS = 600000;
const MINIMO = 12;

// ── Criptografía (compatible con WebCrypto del navegador) ───────────
function cifrarGcm(llave, datos) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', llave, iv);
  const cuerpo = Buffer.concat([c.update(datos), c.final(), c.getAuthTag()]); // WebCrypto espera la etiqueta al final
  return { iv, cuerpo };
}

function descifrarGcm(llave, iv, cuerpo) {
  const d = crypto.createDecipheriv('aes-256-gcm', llave, iv);
  d.setAuthTag(cuerpo.subarray(cuerpo.length - 16));
  return Buffer.concat([d.update(cuerpo.subarray(0, cuerpo.length - 16)), d.final()]);
}

function envolverLlave(llave, contrasena) {
  const sal = crypto.randomBytes(16);
  const kek = crypto.pbkdf2Sync(contrasena, sal, VUELTAS, 32, 'sha256');
  const { iv, cuerpo } = cifrarGcm(kek, llave);
  return { v: 1, vueltas: VUELTAS, sal: sal.toString('base64'), iv: iv.toString('base64'), llave: cuerpo.toString('base64') };
}

function desenvolverLlave(candado, contrasena) {
  const kek = crypto.pbkdf2Sync(contrasena, Buffer.from(candado.sal, 'base64'), candado.vueltas, 32, 'sha256');
  return descifrarGcm(kek, Buffer.from(candado.iv, 'base64'), Buffer.from(candado.llave, 'base64'));
}

function cifrarPagina(llave, html) {
  const { iv, cuerpo } = cifrarGcm(llave, Buffer.from(html, 'utf8'));
  return Buffer.concat([iv, cuerpo]).toString('base64');
}

// ── Página pública: solo la pantalla de contraseña y el texto cifrado ──
function plantilla(candado, datos) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>The Crew — Panel</title>
<link rel="icon" href="/favicon.png">
<style>
  html,body{margin:0;height:100%;}
  body{
    display:flex;align-items:center;justify-content:center;padding:0 20px;
    font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#f2e8de;
    background:radial-gradient(80% 60% at 18% 28%,rgba(226,28,94,.30),transparent 70%),
               radial-gradient(70% 60% at 85% 82%,rgba(226,28,94,.18),transparent 70%),#0c0518;
  }
  form{width:100%;max-width:340px;text-align:center;}
  h1{margin:0 0 6px;font-size:15px;letter-spacing:.14em;text-transform:uppercase;}
  p{margin:0 0 28px;font-size:12px;color:rgba(242,232,222,.55);}
  input{width:100%;box-sizing:border-box;padding:14px 16px;border-radius:12px;font-size:16px;color:inherit;
        border:1px solid rgba(247,220,184,.22);background:rgba(255,255,255,.04);outline:none;}
  input:focus{border-color:#ff3b73;}
  button{margin-top:14px;width:100%;padding:14px;border:0;border-radius:999px;cursor:pointer;
         background:#ff3b73;color:#1a0510;font-weight:800;font-size:12px;letter-spacing:.12em;text-transform:uppercase;}
  button[disabled]{opacity:.6;cursor:wait;}
  .err{min-height:18px;margin-top:12px;font-size:12px;color:#ff7a9c;}
</style>
</head>
<body>
<form id="acceso" onsubmit="return false">
  <h1>The Crew — Panel</h1>
  <p>Contenido cifrado · acceso privado</p>
  <input id="clave" type="password" autocomplete="current-password" placeholder="Contraseña" autofocus required>
  <button id="entrar">Entrar</button>
  <div class="err" id="aviso" role="alert"></div>
</form>
<script>
  var CANDADO = ${JSON.stringify(candado)};
  var DATOS = "${datos}";
  var SESION = 'tcb-panel-llave';

  function b64(s) { return Uint8Array.from(atob(s), function (c) { return c.charCodeAt(0); }); }
  function a64(u) { var s = ''; u.forEach(function (x) { s += String.fromCharCode(x); }); return btoa(s); }

  async function desenvolver(clave) {
    var base = await crypto.subtle.importKey('raw', new TextEncoder().encode(clave), 'PBKDF2', false, ['deriveKey']);
    var kek = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: b64(CANDADO.sal), iterations: CANDADO.vueltas, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
    return new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b64(CANDADO.iv) }, kek, b64(CANDADO.llave)));
  }

  // Hasta que el navegador no termina de leer esta página, escribir encima la añade en vez de sustituirla
  function cargado() {
    return document.readyState === 'complete'
      ? Promise.resolve()
      : new Promise(function (listo) { window.addEventListener('load', listo, { once: true }); });
  }

  async function abrir(llaveCruda) {
    var llave = await crypto.subtle.importKey('raw', llaveCruda, 'AES-GCM', false, ['decrypt']);
    var d = b64(DATOS);
    var html = new TextDecoder().decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: d.slice(0, 12) }, llave, d.slice(12)));
    sessionStorage.setItem(SESION, a64(llaveCruda));   // el resto de páginas del panel se abren sin volver a pedirla
    sessionStorage.setItem('tcb_auth', '1');           // salta el login antiguo que lleva dentro el panel
    await cargado();
    if (location.search) history.replaceState(null, '', location.pathname + location.hash);
    document.open(); document.write(html); document.close();
  }

  (async function () {
    var guardada = sessionStorage.getItem(SESION);
    if (guardada) {
      try { await abrir(b64(guardada)); return; } catch (e) { sessionStorage.removeItem(SESION); }
    }
    var form = document.getElementById('acceso');
    var boton = document.getElementById('entrar');
    var aviso = document.getElementById('aviso');
    form.addEventListener('submit', async function (e) {
      e.preventDefault();
      boton.disabled = true; aviso.textContent = ''; boton.textContent = 'Abriendo…';
      try {
        await abrir(await desenvolver(document.getElementById('clave').value));
      } catch (err) {
        aviso.textContent = 'Contraseña incorrecta';
        boton.disabled = false; boton.textContent = 'Entrar';
        document.getElementById('clave').select();
      }
    });
  })();
</script>
</body>
</html>
`;
}

// ── Terminal: contraseña sin eco ─────────────────────────────────────
function preguntarOculto(texto) {
  return new Promise(function (resolve) {
    var stdin = process.stdin;
    if (!stdin.isTTY) { console.error('Ejecútalo en una terminal.'); process.exit(1); }
    process.stdout.write(texto);
    stdin.setRawMode(true); stdin.resume(); stdin.setEncoding('utf8');
    var s = '';
    function alTeclear(trozo) {
      for (var c of trozo) {
        if (c === '\r' || c === '\n') {
          stdin.setRawMode(false); stdin.pause(); stdin.removeListener('data', alTeclear);
          process.stdout.write('\n');
          return resolve(s);
        }
        if (c === '') { process.stdout.write('\n'); process.exit(1); }
        if (c === '' || c === '\b') { s = s.slice(0, -1); continue; }
        s += c;
      }
    }
    stdin.on('data', alTeclear);
  });
}

function leerLlave() {
  if (!fs.existsSync(LLAVE)) return null;
  var k = fs.readFileSync(LLAVE);
  if (k.length !== 32) throw new Error('La llave de ' + LLAVE + ' no tiene 32 bytes');
  return k;
}

async function comandoContrasena() {
  // No vuelve a la terminal hasta tener una contraseña válida: así nunca se escribe en la línea de comandos por error
  var c1;
  for (;;) {
    c1 = await preguntarOculto('Nueva contraseña del panel (no se ve al escribir): ');
    if (c1.length < MINIMO) {
      console.log('Muy corta: tiene ' + c1.length + ' caracteres y hacen falta ' + MINIMO + '. Prueba con una frase.\n');
      continue;
    }
    var c2 = await preguntarOculto('Repítela: ');
    if (c1 === c2) break;
    console.log('No coinciden. Vamos otra vez.\n');
  }

  var llave = leerLlave();
  if (!llave) {
    llave = crypto.randomBytes(32);
    fs.mkdirSync(path.dirname(LLAVE), { recursive: true, mode: 0o700 });
    fs.writeFileSync(LLAVE, llave, { mode: 0o600 });
  }
  var candado = envolverLlave(llave, c1);
  if (!desenvolverLlave(candado, c1).equals(llave)) throw new Error('Comprobación del candado fallida');
  fs.writeFileSync(CANDADO, JSON.stringify(candado, null, 2) + '\n');
  console.log('Listo. Candado guardado. Ya puedes cerrar esta pestaña.');
}

function paginasFuente(dir, base) {
  base = base || dir;
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(function (e) {
    var p = path.join(dir, e.name);
    if (e.isDirectory()) return paginasFuente(p, base);
    return e.name.endsWith('.html') ? [path.relative(base, p)] : [];
  });
}

function comandoPublicar() {
  var llave = leerLlave();
  if (!llave || !fs.existsSync(CANDADO)) {
    console.error('Falta la llave o el candado: primero `node panel-cifrar.js contraseña`.');
    process.exit(1);
  }
  var candado = JSON.parse(fs.readFileSync(CANDADO, 'utf8'));
  var paginas = paginasFuente(FUENTE);
  paginas.forEach(function (rel) {
    var html = fs.readFileSync(path.join(FUENTE, rel), 'utf8');
    var datos = cifrarPagina(llave, html);
    // prueba de ida y vuelta antes de escribir nada
    var d = Buffer.from(datos, 'base64');
    if (descifrarGcm(llave, d.subarray(0, 12), d.subarray(12)).toString('utf8') !== html) throw new Error('Fallo al cifrar ' + rel);
    var destino = path.join(RAIZ, rel);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, plantilla(candado, datos));
    console.log('cifrada  ' + rel);
  });
  console.log(paginas.length + ' páginas cifradas.');
}

module.exports = { envolverLlave, desenvolverLlave, cifrarPagina, descifrarGcm, plantilla };

if (require.main === module) {
  var orden = process.argv[2];
  if (orden === 'contraseña' || orden === 'contrasena') comandoContrasena();
  else if (orden === 'publicar') comandoPublicar();
  else console.log('Uso:\n  node panel-cifrar.js contraseña\n  node panel-cifrar.js publicar');
}
