const jwt = require("jsonwebtoken");
const S = "magnolias_calificaciones_2026_secret_key";
const BASE = "http://localhost:3999";

const DIR = jwt.sign({ id: 99, usuario: "dir.test", rol: "direccion", id_alumno: null }, S, { expiresIn: "1h" });
const PADRE = jwt.sign({ id: 98, usuario: "padre.test", rol: "padre", id_alumno: 1 }, S, { expiresIn: "1h" });
const ADMIN = jwt.sign({ id: 1, usuario: "admin", rol: "admin", id_alumno: null }, S, { expiresIn: "1h" });
const VIEJO = jwt.sign({ id: 1, usuario: "admin" }, S, { expiresIn: "1h" });

async function test(desc, metodo, ruta, token, cuerpo, esperado) {
  const opts = { method: metodo, headers: { Authorization: `Bearer ${token}` } };
  if (cuerpo !== undefined) {
    opts.headers["Content-Type"] = "application/json";
    opts.body = JSON.stringify(cuerpo);
  }
  try {
    const res = await fetch(BASE + ruta, opts);
    const ok = res.status === esperado;
    console.log(`${ok ? "PASS" : "FAIL"}  [${res.status}≠${esperado}] ${desc}`);
    return { ok, status: res.status, body: await res.json().catch(() => null) };
  } catch (e) {
    console.log(`FAIL  [ERROR] ${desc}: ${e.message}`);
    return { ok: false };
  }
}

(async () => {
  let fails = 0;
  const check = (r) => { if (!r.ok) fails++; };

  console.log("\n===== DIRECCION: escritura debe ser 403 =====");
  check(await test("POST /api/progreso", "POST", "/api/progreso", DIR, { id_alumno: 1 }, 403));
  check(await test("POST /api/progreso/lote", "POST", "/api/progreso/lote", DIR, {}, 403));
  check(await test("PUT /api/progreso/1", "PUT", "/api/progreso/1", DIR, {}, 403));
  check(await test("DELETE /api/progreso/1", "DELETE", "/api/progreso/1", DIR, undefined, 403));
  check(await test("POST /api/alumnos", "POST", "/api/alumnos", DIR, {}, 403));
  check(await test("PUT /api/alumnos/1", "PUT", "/api/alumnos/1", DIR, {}, 403));
  check(await test("POST /api/materias", "POST", "/api/materias", DIR, {}, 403));
  check(await test("POST /api/inscripciones", "POST", "/api/inscripciones", DIR, {}, 403));
  check(await test("DELETE /api/inscripciones", "DELETE", "/api/inscripciones", DIR, {}, 403));
  check(await test("PUT /api/inscripciones/lote", "PUT", "/api/inscripciones/lote", DIR, {}, 403));
  check(await test("PUT /api/horario", "PUT", "/api/horario", DIR, { grid: [] }, 403));
  check(await test("GET /api/bitacora-sync", "GET", "/api/bitacora-sync", DIR, undefined, 403));
  check(await test("POST /api/canvas/sync", "POST", "/api/canvas/sync", DIR, undefined, 403));
  check(await test("POST /api/usuarios", "POST", "/api/usuarios", DIR, {}, 403));
  check(await test("GET /api/usuarios", "GET", "/api/usuarios", DIR, undefined, 403));
  check(await test("DELETE /api/usuarios/1", "DELETE", "/api/usuarios/1", DIR, undefined, 403));

  console.log("\n===== DIRECCION: lectura debe ser 200 =====");
  check(await test("GET /api/alumnos", "GET", "/api/alumnos", DIR, undefined, 200));
  check(await test("GET /api/materias", "GET", "/api/materias", DIR, undefined, 200));
  check(await test("GET /api/inscripciones", "GET", "/api/inscripciones", DIR, undefined, 200));
  check(await test("GET /api/progreso", "GET", "/api/progreso", DIR, undefined, 200));
  check(await test("GET /api/horario", "GET", "/api/horario", DIR, undefined, 200));
  check(await test("GET /api/notas-materia", "GET", "/api/notas-materia", DIR, undefined, 200));

  console.log("\n===== PADRE: filtrado forzado a su alumno =====");
  const a = await test("GET /api/alumnos", "GET", "/api/alumnos", PADRE, undefined, 200);
  check(a);
  if (a.body) {
    const ids = a.body.map((x) => x.id_alumno);
    const okIds = ids.length <= 1 && (ids.length === 0 || ids[0] === 1);
    console.log(`${okIds ? "PASS" : "FAIL"}  [filtrado] alumnos visibles: ${JSON.stringify(ids)} (esperado solo id 1)`);
    if (!okIds) fails++;
  }
  const p = await test("GET /api/progreso", "GET", "/api/progreso", PADRE, undefined, 200);
  check(p);
  if (p.body) {
    const ids = [...new Set(p.body.map((x) => x.id_alumno))];
    const okIds = ids.every((i) => i === 1);
    console.log(`${okIds ? "PASS" : "FAIL"}  [filtrado] id_alumno en progreso: ${JSON.stringify(ids)} (esperado solo 1)`);
    if (!okIds) fails++;
  }
  const i = await test("GET /api/inscripciones", "GET", "/api/inscripciones", PADRE, undefined, 200);
  check(i);
  if (i.body) {
    const ids = [...new Set(i.body.map((x) => x.id_alumno))];
    const okIds = ids.every((x) => x === 1);
    console.log(`${okIds ? "PASS" : "FAIL"}  [filtrado] id_alumno en inscripciones: ${JSON.stringify(ids)}`);
    if (!okIds) fails++;
  }
  check(await test("PADRE POST /api/progreso (403)", "POST", "/api/progreso", PADRE, {}, 403));
  check(await test("PADRE GET /api/bitacora-sync (403)", "GET", "/api/bitacora-sync", PADRE, undefined, 403));

  console.log("\n===== ADMIN: todo pasa =====");
  check(await test("GET /api/usuarios", "GET", "/api/usuarios", ADMIN, undefined, 200));
  check(await test("GET /api/bitacora-sync", "GET", "/api/bitacora-sync", ADMIN, undefined, 200));
  check(await test("GET /api/alumnos (todos)", "GET", "/api/alumnos", ADMIN, undefined, 200));

  console.log("\n===== TOKEN VIEJO sin rol (debe tratarse como admin) =====");
  check(await test("GET /api/bitacora-sync con token viejo", "GET", "/api/bitacora-sync", VIEJO, undefined, 200));

  console.log("\n===== SIN TOKEN / token basura =====");
  check(await test("sin token", "GET", "/api/alumnos", "", undefined, 401));
  check(await test("token basura", "GET", "/api/alumnos", "abc.def.ghi", undefined, 401));

  console.log(`\n${fails === 0 ? "=== TODAS LAS PRUEBAS PASARON ===" : `=== ${fails} FALLOS ===`}`);
  process.exit(fails === 0 ? 0 : 1);
})();
