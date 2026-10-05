/**
 * Cliente Canvas para miaprendizaje.prepanet.tec.mx
 *
 * Login web (CSRF + cookie de sesion) y sincronizacion de
 * entregas/calificaciones hacia la BD de Magnolias.
 */

const BASE = "https://miaprendizaje.prepanet.tec.mx";

const HITOS = [
  "1", "2", "3", "4", "Int 1", "Parcial 1",
  "6", "7", "8", "9", "Int 2", "Parcial 2",
  "11", "12", "13", "Int 3", "Final",
];

/* ---------------------------------------------------------------- */
/*  Utilidades                                                       */
/* ---------------------------------------------------------------- */

function normalizar(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function crearJar() {
  const cookies = new Map();
  return {
    absorber(rawSetCookie) {
      if (!rawSetCookie) return;
      const partes = Array.isArray(rawSetCookie) ? rawSetCookie : [rawSetCookie];
      for (const p of partes) {
        const par = p.split(";")[0];
        const i = par.indexOf("=");
        if (i < 0) continue;
        const nombre = par.slice(0, i).trim();
        const valor = par.slice(i + 1).trim();
        if (valor === "" || /Expires=Thu, 01 Jan 1970/i.test(p)) cookies.delete(nombre);
        else cookies.set(nombre, valor);
      }
    },
    header() {
      return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
    },
    ver(nombre) {
      return cookies.get(nombre);
    },
    listar() {
      return [...cookies.keys()];
    },
  };
}

async function pedir(url, { method = "GET", headers = {}, body, jar } = {}) {
  const res = await fetch(url, { method, headers, body, redirect: "manual" });
  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (jar && setCookie.length) jar.absorber(setCookie);
  return res;
}

/* ---------------------------------------------------------------- */
/*  Login                                                            */
/* ---------------------------------------------------------------- */

async function loginCanvas(usuario, contrasena) {
  const jar = crearJar();

  const pagina = await pedir(`${BASE}/login/canvas`, { jar });
  if (!pagina.ok) {
    throw new Error(`No se pudo cargar la pagina de login (HTTP ${pagina.status})`);
  }
  const csrf = jar.ver("_csrf_token");
  if (!csrf) throw new Error("No se recibio la cookie _csrf_token de Canvas");

  const cuerpo = new URLSearchParams({
    authenticity_token: decodeURIComponent(csrf),
    "pseudonym_session[unique_id]": usuario,
    "pseudonym_session[password]": contrasena,
    "pseudonym_session[remember_me]": "0",
  });

  const res = await pedir(`${BASE}/login/canvas`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
      "X-Requested-With": "XMLHttpRequest",
      "X-CSRF-Token": csrf,
      "Accept": "application/json+canvas-string-ids, application/json",
      "Referer": `${BASE}/login/canvas`,
      "Cookie": jar.header(),
    },
    body: cuerpo,
    jar,
  });

  const texto = await res.text();

  if (res.status === 200 || res.status === 302) {
    const sesion = jar.ver("canvas_session") || jar.ver("_session_id") || jar.listar().length > 1;
    if (!sesion) throw new Error("Login OK pero sin cookie de sesion");
    return jar;
  }

  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {}
  if (json && json.errors) {
    const msg = String(json.errors[0]).replace(/<[^>]+>/g, "");
    throw new Error(`Login rechazado: ${msg}`);
  }
  throw new Error(`Login fallo: HTTP ${res.status}`);
}

/* ---------------------------------------------------------------- */
/*  API                                                              */
/* ---------------------------------------------------------------- */

async function apiGet(ruta, jar) {
  const res = await pedir(`${BASE}${ruta}`, {
    headers: {
      "Accept": "application/json+canvas-string-ids, application/json",
      "X-Requested-With": "XMLHttpRequest",
      "Cookie": jar.header(),
    },
    jar,
  });
  if (res.status === 401) {
    throw new Error("Sesion Canvas rechazada (401): la cookie no fue aceptada por la API");
  }
  if (res.status === 403) {
    throw new Error("Acceso denegado por Canvas (403)");
  }
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Canvas API ${res.status} en ${ruta}: ${t.slice(0, 150)}`);
  }
  return res.json();
}

/* ---------------------------------------------------------------- */
/*  Sincronizacion de UN alumno                                      */
/* ---------------------------------------------------------------- */

async function sincronizarAlumno(pool, alumno, datos) {
  const { cursos, materias } = datos;
  const resultado = {
    alumno: alumno.nombre,
    hitos_marcados: 0,
    calificaciones: 0,
    global_actualizadas: 0,
    cursos_sin_match: [],
    actividades_sin_match: [],
  };

  const jar = await loginCanvas(alumno.cuenta, alumno.contrasena);

  const cursosCanvas = await apiGet(
    "/api/v1/courses?enrollment_state=active&per_page=100",
    jar
  );

  // mapeo materia <-> curso (normalizado)
  const porNombre = new Map();
  for (const m of materias) porNombre.set(normalizar(m.nombre), m);

  const cursosMatch = [];
  for (const c of cursosCanvas) {
    const mat = porNombre.get(normalizar(c.name));
    if (mat) cursosMatch.push({ curso: c, materia: mat });
    else resultado.cursos_sin_match.push(c.name);
  }

  for (const { curso, materia } of cursosMatch) {
    const assigns = await apiGet(
      `/api/v1/courses/${curso.id}/assignments?per_page=100`,
      jar
    );

    // hito <-> assignment
    const hitoPorNombre = new Map();
    for (const h of HITOS) hitoPorNombre.set(normalizar(h), h);
    const assignsMatch = [];
    for (const a of assigns) {
      const hito = hitoPorNombre.get(normalizar(a.name));
      if (hito) assignsMatch.push({ assign: a, hito });
      else resultado.actividades_sin_match.push(`[${materia.nombre}] ${a.name}`);
    }

    if (assignsMatch.length === 0) continue;

    // entregas del alumno en este curso
    const subs = await apiGet(
      `/api/v1/courses/${curso.id}/students/submissions?per_page=100`,
      jar
    );
    const subPorAssign = new Map(subs.map((s) => [s.assignment_id, s]));

    for (const { assign, hito } of assignsMatch) {
      const s = subPorAssign.get(assign.id);
      const enviada = !!(s && s.submitted_at);
      const nota = s && s.score != null ? s.score : null;

      if (!enviada && nota == null) continue; // nada que registrar

      const existente = await pool.query(
        `SELECT id_progreso, cumplio, calificacion FROM progreso
         WHERE id_alumno = $1 AND id_materia = $2 AND hito = $3`,
        [alumno.id_alumno, materia.id_materia, hito]
      );

      if (existente.rows.length === 0) {
        // solo crear registro si esta enviada (nunca crear "pendiente" artificial)
        if (!enviada) continue;
        await pool.query(
          `INSERT INTO progreso (id_alumno, id_materia, hito, cumplio, calificacion, fecha_registro)
           VALUES ($1, $2, $3, true, $4, CURRENT_TIMESTAMP)`,
          [alumno.id_alumno, materia.id_materia, hito, nota]
        );
        resultado.hitos_marcados++;
        if (nota != null) resultado.calificaciones++;
      } else {
        const fila = existente.rows[0];
        // solo marcar, nunca desmarcar
        const cumpleAhora = fila.cumplio || enviada;
        const califAhora = nota != null ? nota : fila.calificacion;
        if (cumpleAhora !== fila.cumplio || califAhora !== fila.calificacion) {
          await pool.query(
            `UPDATE progreso SET cumplio = $1, calificacion = $2, fecha_registro = CURRENT_TIMESTAMP
             WHERE id_progreso = $3`,
            [cumpleAhora, califAhora, fila.id_progreso]
          );
          if (enviada && !fila.cumplio) resultado.hitos_marcados++;
          if (nota != null && fila.calificacion == null) resultado.calificaciones++;
        }
      }
    }
  }

  // calificacion global por materia (enrollments)
  const enrollments = await apiGet(
    "/api/v1/users/self/enrollments?include[]=total_scores&per_page=100",
    jar
  );
  const matPorCurso = new Map(cursosMatch.map((c) => [c.curso.id, c.materia]));
  for (const e of enrollments) {
    const materia = matPorCurso.get(e.course_id);
    if (!materia) continue;
    const global = e.grades ? e.grades.current_score : null;
    if (global == null) continue;
    await pool.query(
      `INSERT INTO notas_materia (id_alumno, id_materia, calificacion_global, actualizado_en)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (id_alumno, id_materia)
       DO UPDATE SET calificacion_global = $3, actualizado_en = now()`,
      [alumno.id_alumno, materia.id_materia, global]
    );
    resultado.global_actualizadas++;
  }

  return resultado;
}

/* ---------------------------------------------------------------- */
/*  Sincronizacion TOTAL                                             */
/* ---------------------------------------------------------------- */

async function sincronizarTodo(pool) {
  const [alumnosRes, materiasRes] = await Promise.all([
    pool.query("SELECT id_alumno, nombre, cuenta, contrasena FROM alumnos ORDER BY nombre"),
    pool.query("SELECT id_materia, nombre FROM materias"),
  ]);
  const alumnos = alumnosRes.rows;
  const materias = materiasRes.rows;

  const resumen = {
    alumnos_ok: 0,
    alumnos_error: 0,
    hitos_marcados: 0,
    calificaciones: 0,
    global_actualizadas: 0,
    cursos_sin_match: [],
    actividades_sin_match: [],
    errores: [],
    detalles: [],
  };

  // concurrencia 3
  const COLA = 3;
  let indice = 0;

  async function trabajador() {
    while (indice < alumnos.length) {
      const alumno = alumnos[indice++];
      try {
        const r = await sincronizarAlumno(pool, alumno, { materias });
        resumen.alumnos_ok++;
        resumen.hitos_marcados += r.hitos_marcados;
        resumen.calificaciones += r.calificaciones;
        resumen.global_actualizadas += r.global_actualizadas;
        for (const c of r.cursos_sin_match)
          if (!resumen.cursos_sin_match.includes(c)) resumen.cursos_sin_match.push(c);
        for (const a of r.actividades_sin_match)
          if (!resumen.actividades_sin_match.includes(a)) resumen.actividades_sin_match.push(a);
        resumen.detalles.push({
          alumno: r.alumno,
          hitos: r.hitos_marcados,
          calificaciones: r.calificaciones,
        });
      } catch (err) {
        resumen.alumnos_error++;
        resumen.errores.push({ alumno: alumno.nombre, error: err.message });
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(COLA, alumnos.length) }, trabajador));

  return resumen;
}

module.exports = { loginCanvas, apiGet, sincronizarAlumno, sincronizarTodo, normalizar, HITOS };
