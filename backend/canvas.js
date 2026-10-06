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

/* ---------------------------------------------------------------- */
/*  Mapeo Canvas -> catalogo de Magnolias                            */
/* ---------------------------------------------------------------- */

// "Ingles III (CEM)" -> "ingles iii"
function limpiarCurso(nombre) {
  return normalizar(nombre).replace(/\s*\([^)]*\)\s*$/, "").trim();
}

function tokens(texto) {
  return limpiarCurso(texto).split(" ").filter(Boolean);
}

function emparejarCursoExacto(nombreCurso, candidatas) {
  const limpio = limpiarCurso(nombreCurso);
  for (const m of candidatas) {
    if (limpiarCurso(m.nombre) === limpio) return m;
  }
  return null;
}

// "Emprendimiento II (CEM)" -> "Emprendimiento II" (conserva acentos/mayusculas)
function nombreMateriaDesdeCurso(nombreCurso) {
  return String(nombreCurso || "")
    .trim()
    .replace(/\s*\([^)]*\)\s*$/, "")
    .trim();
}

function emparejarCurso(nombreCurso, candidatas) {
  const exacta = emparejarCursoExacto(nombreCurso, candidatas);
  if (exacta) return exacta;
  // gana el que mas tokens del nombre de la materia aparecen en el curso
  // (desempate por proporcion, luego por cantidad absoluta: mas especifico)
  let mejor = null;
  let mejorScore = 0;
  let mejorComunes = 0;
  for (const m of candidatas) {
    const tc = new Set(tokens(nombreCurso));
    const tm = tokens(m.nombre);
    const comunes = tm.filter((t) => tc.has(t)).length;
    if (tm.length === 0) continue;
    const score = comunes / tm.length;
    if (score > 0.6 && (score > mejorScore || (score === mejorScore && comunes > mejorComunes))) {
      mejorScore = score;
      mejorComunes = comunes;
      mejor = m;
    }
  }
  return mejor;
}

function hitoNumerico(n) {
  const h = String(Number(n));
  return HITOS.includes(h) ? h : null;
}

// Nombre de actividad de Canvas -> hito de Magnolias (null si no aplica).
// Cubre: "Examen 1er. Parcial", "Actividad evaluable de la semana N",
// "Actividad integradora - Fase N", "Examen final", variantes.
function hitoDesdeActividad(nombre) {
  const n = normalizar(nombre);
  let m;
  if ((m = n.match(/examen\s+(1er|primero|primer)\.?\s*parcial/))) return "Parcial 1";
  if ((m = n.match(/examen\s+(2do|segundo|2)\.?\s*parcial/))) return "Parcial 2";
  // "Primer Examen Parcial" / "Segundo Examen Parcial"
  if ((m = n.match(/(primer|primero)\s+examen\s+parcial/))) return "Parcial 1";
  if ((m = n.match(/(segundo|2do)\s+examen\s+parcial/))) return "Parcial 2";
  if (/examen\s+final/.test(n)) return "Final";
  // Ingles: "First partial exam", "Second partial exam", "Final exam"
  if (/\bfirst\s+partial\s+exam\b/.test(n) || /\bpartial\s+exam\s*1\b/.test(n)) return "Parcial 1";
  if (/\bsecond\s+partial\s+exam\b/.test(n) || /\bpartial\s+exam\s*2\b/.test(n)) return "Parcial 2";
  if (/\bfinal\s+exam\b/.test(n)) return "Final";
  if ((m = n.match(/integradora.*fase\s*(\d+)/))) {
    const h = `Int ${m[1]}`;
    return HITOS.includes(h) ? h : null;
  }
  // Ingles: "Integrated Activity - Stage N"
  if ((m = n.match(/integrated\s+activity.*stage\s*(\d+)/))) {
    const h = `Int ${m[1]}`;
    return HITOS.includes(h) ? h : null;
  }
  if ((m = n.match(/actividad.*semana\s*(\d+)/))) return hitoNumerico(m[1]);
  if ((m = n.match(/semana\s*(\d+)\s*[:\-]?\s*actividad/))) return hitoNumerico(m[1]);
  // "Activity of the week N" (Ingles III), "Week 1: activity" (Ingles V)
  if ((m = n.match(/activity\s+(?:of\s+the\s+)?week\s*(\d+)/))) return hitoNumerico(m[1]);
  if ((m = n.match(/\bweek\s*(\d+)\s*[:\-]?\s*activity/))) return hitoNumerico(m[1]);
  if ((m = n.match(/\bsemana\s*(\d+)/))) return hitoNumerico(m[1]);
  if (/1er\.?\s*parcial|primer\s*parcial/.test(n)) return "Parcial 1";
  if (/2do\.?\s*parcial|segundo\s*parcial/.test(n)) return "Parcial 2";
  if (/\bparcial\s*1\b/.test(n)) return "Parcial 1";
  if (/\bparcial\s*2\b/.test(n)) return "Parcial 2";
  if (/\bfinal\b/.test(n)) return "Final";
  return null;
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
  const { materiasInscritas, catalogo } = datos;
  const resultado = {
    alumno: alumno.nombre,
    hitos_marcados: 0,
    calificaciones: 0,
    global_actualizadas: 0,
    materias_creadas: [],
    inscripciones_creadas: 0,
    cursos_sin_match: [],
    actividades_sin_match: [],
    actividades_ignoradas: 0,
  };

  const jar = await loginCanvas(alumno.cuenta, alumno.contrasena);

  const cursosCanvas = await apiGet(
    "/api/v1/courses?enrollment_state=active&per_page=100",
    jar
  );

  // mapeo curso -> materia:
  //   1) exacto entre las materias ya inscritas del alumno
  //   2) exacto en todo el catalogo (auto-inscribe)
  //   3) fuzzy entre las inscritas (como siempre)
  //   4) crea la materia nueva y la auto-inscribe
  const cursosMatch = [];
  for (const c of cursosCanvas) {
    let mat = emparejarCursoExacto(c.name, materiasInscritas);
    if (!mat && catalogo) {
      mat = catalogo.buscarExacta(c.name);
      if (mat && (await asegurarInscripcion(pool, alumno.id_alumno, mat.id_materia))) {
        resultado.inscripciones_creadas++;
      }
    }
    if (!mat) mat = emparejarCurso(c.name, materiasInscritas);
    if (!mat && catalogo) {
      const r = await catalogo.asegurar(pool, c.name);
      mat = r.materia;
      if (r.creada) resultado.materias_creadas.push(mat.nombre);
      if (await asegurarInscripcion(pool, alumno.id_alumno, mat.id_materia)) {
        resultado.inscripciones_creadas++;
      }
    }
    if (mat) cursosMatch.push({ curso: c, materia: mat });
    else resultado.cursos_sin_match.push(c.name);
  }

  for (const { curso, materia } of cursosMatch) {
    const assigns = await apiGet(
      `/api/v1/courses/${curso.id}/assignments?per_page=100`,
      jar
    );

    // agrupa actividades -> hito (varias actividades pueden caer en un hito)
    const porHito = new Map();
    for (const a of assigns) {
      const n = normalizar(a.name);
      if (!a.points_possible || n.startsWith("ejercicio")) {
        // ejercicios/practica sin puntos: se ignoran
        resultado.actividades_ignoradas++;
        continue;
      }
      const hito = hitoDesdeActividad(a.name);
      if (!hito) {
        resultado.actividades_sin_match.push(`[${materia.nombre}] ${a.name}`);
        continue;
      }
      if (!porHito.has(hito)) porHito.set(hito, []);
      porHito.get(hito).push(a);
    }

    if (porHito.size === 0) continue;

    // entregas del alumno en este curso (+ comentarios del maestro)
    const subs = await apiGet(
      `/api/v1/courses/${curso.id}/students/submissions?per_page=100&include[]=submission_comments`,
      jar
    );
    const subPorAssign = new Map(subs.map((s) => [s.assignment_id, s]));

    for (const [hito, acts] of porHito) {
      let enviada = false;
      let nota = null;
      let fechaEntrega = null;
      const comentarios = [];
      const nombresActs = [];
      for (const a of acts) {
        const s = subPorAssign.get(a.id);
        nombresActs.push(a.name.trim());
        if (s && s.submitted_at) {
          enviada = true;
          if (!fechaEntrega || s.submitted_at > fechaEntrega) fechaEntrega = s.submitted_at;
        }
        if (s && s.score != null && (nota == null || s.score > nota)) nota = s.score;
        if (s && Array.isArray(s.submission_comments)) {
          for (const c of s.submission_comments) {
            if (c && c.comment) comentarios.push(`${c.author_name}: ${c.comment}`);
          }
        }
      }

      if (!enviada && nota == null) continue; // nada que registrar

      const comentario = comentarios.length ? comentarios.join("\n") : null;
      const actividadCanvas = nombresActs.join(" + ");
      const args = [
        alumno.id_alumno,
        materia.id_materia,
        hito,
        nota,
        fechaEntrega,
        comentario,
        actividadCanvas,
      ];

      const existente = await pool.query(
        `SELECT id_progreso, cumplio, calificacion FROM progreso
         WHERE id_alumno = $1 AND id_materia = $2 AND hito = $3`,
        [alumno.id_alumno, materia.id_materia, hito]
      );

      if (existente.rows.length === 0) {
        // solo crear registro si esta enviada (nunca crear "pendiente" artificial)
        if (!enviada) continue;
        await pool.query(
          `INSERT INTO progreso (id_alumno, id_materia, hito, cumplio, calificacion,
                                 fecha_entrega, comentario, actividad_canvas, origen,
                                 sincronizado_en, fecha_registro)
           VALUES ($1, $2, $3, true, $4, $5, $6, $7, 'canvas', now(), CURRENT_TIMESTAMP)`,
          args
        );
        resultado.hitos_marcados++;
        if (nota != null) resultado.calificaciones++;
      } else {
        const fila = existente.rows[0];
        // solo marcar, nunca desmarcar
        const cumpleAhora = fila.cumplio || enviada;
        const califAhora = nota != null ? nota : fila.calificacion;
        const cambio = cumpleAhora !== fila.cumplio || califAhora !== fila.calificacion;
        if (cambio || fechaEntrega) {
          await pool.query(
            `UPDATE progreso SET cumplio = $1, calificacion = $2,
                    fecha_entrega = COALESCE($3, fecha_entrega),
                    comentario = COALESCE($4, comentario),
                    actividad_canvas = COALESCE($5, actividad_canvas),
                    origen = 'canvas',
                    sincronizado_en = now(),
                    fecha_registro = CASE WHEN $6 THEN CURRENT_TIMESTAMP ELSE fecha_registro END
             WHERE id_progreso = $7`,
            [cumpleAhora, califAhora, fechaEntrega, comentario, actividadCanvas, cambio, fila.id_progreso]
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
/*  Catalogo compartido: cache + creacion serializada de materias     */
/* ---------------------------------------------------------------- */

async function asegurarInscripcion(pool, idAlumno, idMateria) {
  const r = await pool.query(
    `INSERT INTO inscripciones (id_alumno, id_materia) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [idAlumno, idMateria]
  );
  return r.rowCount > 0;
}

// Catalogo compartido entre los 3 workers concurrentes de sincronizarTodo.
// La creacion de materias va serializada con un mutex (cadena de promesas)
// para que dos alumnos con el mismo curso nuevo no dupliquen la fila.
function crearCatalogo(pool, materias) {
  const cache = new Map(); // limpiarCurso(nombre) -> materia
  for (const m of materias) cache.set(limpiarCurso(m.nombre), m);

  let cola = Promise.resolve();

  function buscarExacta(nombreCurso) {
    return cache.get(limpiarCurso(nombreCurso)) || null;
  }

  function asegurar(nombreCurso) {
    const tarea = async () => {
      const limpio = limpiarCurso(nombreCurso);
      const ya = cache.get(limpio);
      if (ya) return { materia: ya, creada: false };

      const nombre =
        nombreMateriaDesdeCurso(nombreCurso) || String(nombreCurso || "").trim();
      const ins = await pool.query(
        `INSERT INTO materias (nombre) VALUES ($1)
         ON CONFLICT (nombre) DO NOTHING
         RETURNING id_materia, nombre`,
        [nombre]
      );
      if (ins.rows.length) {
        const nueva = ins.rows[0];
        cache.set(limpio, nueva);
        materias.push(nueva);
        return { materia: nueva, creada: true };
      }
      // nombre ya existia en DB (creado fuera del cache): reusarlo
      const sel = await pool.query(
        `SELECT id_materia, nombre FROM materias WHERE nombre = $1`,
        [nombre]
      );
      if (!sel.rows.length) {
        throw new Error(`No se pudo crear ni encontrar la materia "${nombre}"`);
      }
      cache.set(limpio, sel.rows[0]);
      return { materia: sel.rows[0], creada: false };
    };

    const resultado = cola.then(tarea, tarea);
    cola = resultado.then(
      () => {},
      () => {}
    );
    return resultado;
  }

  return { buscarExacta, asegurar };
}

/* ---------------------------------------------------------------- */
/*  Sincronizacion TOTAL                                             */
/* ---------------------------------------------------------------- */

async function sincronizarTodo(pool) {
  const [alumnosRes, materiasRes, inscRes] = await Promise.all([
    pool.query("SELECT id_alumno, nombre, cuenta, contrasena FROM alumnos ORDER BY nombre"),
    pool.query("SELECT id_materia, nombre FROM materias"),
    pool.query("SELECT id_alumno, id_materia FROM inscripciones"),
  ]);
  const alumnos = alumnosRes.rows;
  const materias = materiasRes.rows;
  const catalogo = crearCatalogo(pool, materias);

  const materiasPorAlumno = new Map();
  for (const i of inscRes.rows) {
    if (!materiasPorAlumno.has(i.id_alumno)) materiasPorAlumno.set(i.id_alumno, []);
    const mat = materias.find((m) => m.id_materia === i.id_materia);
    if (mat) materiasPorAlumno.get(i.id_alumno).push(mat);
  }

  const resumen = {
    alumnos_ok: 0,
    alumnos_error: 0,
    alumnos_sin_cuenta: 0,
    hitos_marcados: 0,
    calificaciones: 0,
    global_actualizadas: 0,
    materias_creadas: 0,
    materias_creadas_nombres: [],
    inscripciones_creadas: 0,
    cursos_sin_match: [],
    actividades_sin_match: [],
    actividades_ignoradas: 0,
    errores: [],
    detalles: [],
  };

  // concurrencia 3
  const COLA = 3;
  let indice = 0;

  async function trabajador() {
    while (indice < alumnos.length) {
      const alumno = alumnos[indice++];
      if (!alumno.cuenta || !alumno.contrasena) {
        resumen.alumnos_sin_cuenta++;
        continue;
      }
      try {
        const r = await sincronizarAlumno(pool, alumno, {
          materiasInscritas: materiasPorAlumno.get(alumno.id_alumno) || [],
          catalogo,
        });
        resumen.alumnos_ok++;
        resumen.hitos_marcados += r.hitos_marcados;
        resumen.calificaciones += r.calificaciones;
        resumen.global_actualizadas += r.global_actualizadas;
        resumen.actividades_ignoradas += r.actividades_ignoradas;
        resumen.materias_creadas += r.materias_creadas.length;
        resumen.inscripciones_creadas += r.inscripciones_creadas;
        for (const n of r.materias_creadas)
          if (!resumen.materias_creadas_nombres.includes(n))
            resumen.materias_creadas_nombres.push(n);
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

module.exports = {
  loginCanvas,
  apiGet,
  sincronizarAlumno,
  sincronizarTodo,
  normalizar,
  limpiarCurso,
  emparejarCurso,
  emparejarCursoExacto,
  nombreMateriaDesdeCurso,
  crearCatalogo,
  asegurarInscripcion,
  hitoDesdeActividad,
  HITOS,
};
