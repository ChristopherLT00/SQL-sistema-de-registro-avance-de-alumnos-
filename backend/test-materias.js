/**
 * Pruebas de la auto-creacion de materias/inscripciones (sincronizacion Canvas).
 *
 * Corre contra el Postgres LOCAL (magnolias2026) para no escribir en produccion.
 *   node test-materias.js
 */
const { Pool } = require("pg");
const {
  limpiarCurso,
  emparejarCursoExacto,
  nombreMateriaDesdeCurso,
  crearCatalogo,
  asegurarInscripcion,
} = require("./canvas");

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "magnolias2026",
  user: "postgres",
});

let pass = 0;
let fail = 0;

function check(nombre, cond, detalle) {
  if (cond) {
    pass++;
    console.log(`  PASS  ${nombre}`);
  } else {
    fail++;
    console.log(`  FAIL  ${nombre}${detalle ? ` -> ${detalle}` : ""}`);
  }
}

const NOMBRE_PRUEBA = "Materia Prueba Sync";
const CURSO_PRUEBA = `${NOMBRE_PRUEBA} (CEM)`;

async function limpiar() {
  await pool.query(
    `DELETE FROM inscripciones WHERE id_materia IN
       (SELECT id_materia FROM materias WHERE nombre = $1)`,
    [NOMBRE_PRUEBA]
  );
  await pool.query(`DELETE FROM materias WHERE nombre = $1`, [NOMBRE_PRUEBA]);
}

async function main() {
  console.log("\n== 1. Helpers puros (sin BD) ==");

  check(
    "nombreMateriaDesdeCurso quita sufijo (CEM) conservando acentos",
    nombreMateriaDesdeCurso("Emprendimiento II (CEM)") === "Emprendimiento II" &&
      nombreMateriaDesdeCurso("Ingl\u00e9s VI (CEM)") === "Ingl\u00e9s VI"
  );
  check(
    "nombreMateriaDesdeCurso sin sufijo queda igual",
    nombreMateriaDesdeCurso("Biolog\u00eda III") === "Biolog\u00eda III"
  );
  check(
    "limpiarCurso normaliza (acentos, minusculas, sufijo)",
    limpiarCurso("Ingl\u00e9s VI (CEM)") === "ingles vi"
  );

  const catalogoFalso = [
    { id_materia: 1, nombre: "Historia de M\u00e9xico" },
    { id_materia: 2, nombre: "Historia de M\u00e9xico y el siglo XIX" },
    { id_materia: 3, nombre: "Taller de lectura y redacci\u00f3n II" },
  ];
  check(
    'emparejarCursoExacto: match exacto a pesar de "(CEM)"',
    emparejarCursoExacto("Historia de M\u00e9xico (CEM)", catalogoFalso)?.id_materia === 1
  );
  check(
    "emparejarCursoExacto: NO fusiona materias parecidas (siglo XIX)",
    emparejarCursoExacto("Historia de M\u00e9xico y el siglo XIX (CEM)", catalogoFalso)
      ?.id_materia === 2
  );
  check(
    "emparejarCursoExacto: devuelve null si no hay match",
    emparejarCursoExacto("Qu\u00edmica IV (CEM)", catalogoFalso) === null
  );

  console.log("\n== 2. crearCatalogo contra BD local ==");

  await limpiar();

  const materias = (await pool.query("SELECT id_materia, nombre FROM materias")).rows;
  const catalogo = crearCatalogo(pool, materias);

  // 2a. curso no existe -> crea materia con nombre limpio
  const r1 = await catalogo.asegurar(CURSO_PRUEBA);
  check("asegurar crea la materia (creada=true)", r1.creada === true);
  check(
    "materia creada con nombre sin (CEM)",
    r1.materia.nombre === NOMBRE_PRUEBA,
    `obtuvo "${r1.materia.nombre}"`
  );
  const enDB = await pool.query(`SELECT id_materia FROM materias WHERE nombre = $1`, [
    NOMBRE_PRUEBA,
  ]);
  check("materia persistida en BD", enDB.rows.length === 1);

  // 2b. segunda llamada -> idempotente (mismo id, no duplica)
  const r2 = await catalogo.asegurar(CURSO_PRUEBA);
  check("2a llamada idempotente (creada=false, mismo id)", r2.creada === false && r2.materia.id_materia === r1.materia.id_materia);
  const enDB2 = await pool.query(`SELECT count(*)::int AS n FROM materias WHERE nombre = $1`, [
    NOMBRE_PRUEBA,
  ]);
  check("no se duplico la materia", enDB2.rows[0].n === 1);

  // 2c. cache: buscarExacta la encuentra tras crearla
  check(
    "buscarExacta encuentra la materia recien creada",
    catalogo.buscarExacta(CURSO_PRUEBA)?.id_materia === r1.materia.id_materia
  );

  // 2d. catalogo nuevo (cache fria) -> reutiliza la existente por ON CONFLICT
  const catalogoFrio = crearCatalogo(
    pool,
    (await pool.query("SELECT id_materia, nombre FROM materias")).rows
  );
  const r3 = await catalogoFrio.asegurar(CURSO_PRUEBA);
  check(
    "catalogo con cache fria reutiliza materia existente (creada=false)",
    r3.creada === false && r3.materia.id_materia === r1.materia.id_materia
  );

  // 2e. 3 creaciones concurrentes del mismo curso -> 1 sola fila
  await limpiar();
  const catalogoConc = crearCatalogo(pool, await (async () => (await pool.query("SELECT id_materia, nombre FROM materias")).rows)());
  const resultados = await Promise.all([
    catalogoConc.asegurar(CURSO_PRUEBA),
    catalogoConc.asegurar(CURSO_PRUEBA),
    catalogoConc.asegurar(CURSO_PRUEBA),
  ]);
  const conteo = await pool.query(
    `SELECT count(*)::int AS n FROM materias WHERE nombre = $1`,
    [NOMBRE_PRUEBA]
  );
  check("3 asegurar concurrentes -> 1 sola materia", conteo.rows[0].n === 1, `hay ${conteo.rows[0].n}`);
  check(
    "solo una llamada marco creada=true",
    resultados.filter((r) => r.creada).length === 1,
    `${resultados.filter((r) => r.creada).length} marcaron creada`
  );

  // 2f. dos catalogos distintos concurrentes (simula 2 workers con caches separadas)
  await limpiar();
  const cA = crearCatalogo(pool, await (async () => (await pool.query("SELECT id_materia, nombre FROM materias")).rows)());
  const cB = crearCatalogo(pool, await (async () => (await pool.query("SELECT id_materia, nombre FROM materias")).rows)());
  await Promise.all([cA.asegurar(CURSO_PRUEBA), cB.asegurar(CURSO_PRUEBA)]);
  const conteo2 = await pool.query(
    `SELECT count(*)::int AS n FROM materias WHERE nombre = $1`,
    [NOMBRE_PRUEBA]
  );
  check("2 caches distintas concurrentes -> 1 sola materia (ON CONFLICT)", conteo2.rows[0].n === 1, `hay ${conteo2.rows[0].n}`);

  console.log("\n== 3. asegurarInscripcion (idempotencia) ==");

  // 2f limpio las filas y el cache del catalogo anterior quedo obsoleto:
  // recrear la materia con un catalogo fresco para la seccion 3
  const catalogoFinal = crearCatalogo(
    pool,
    (await pool.query("SELECT id_materia, nombre FROM materias")).rows
  );
  const r4 = await catalogoFinal.asegurar(CURSO_PRUEBA);
  const idMateria = r4.materia.id_materia;
  const alumno = (await pool.query("SELECT id_alumno FROM alumnos ORDER BY id_alumno LIMIT 1"))
    .rows[0];
  if (!alumno) {
    check("hay al menos un alumno en la BD local", false);
  } else {
    await pool.query(`DELETE FROM inscripciones WHERE id_alumno = $1 AND id_materia = $2`, [
      alumno.id_alumno,
      idMateria,
    ]);
    const ins1 = await asegurarInscripcion(pool, alumno.id_alumno, idMateria);
    check("1a inscripcion crea la fila (true)", ins1 === true);
    const ins2 = await asegurarInscripcion(pool, alumno.id_alumno, idMateria);
    check("2a inscripcion no duplica (false)", ins2 === false);
    const n = await pool.query(
      `SELECT count(*)::int AS n FROM inscripciones WHERE id_alumno = $1 AND id_materia = $2`,
      [alumno.id_alumno, idMateria]
    );
    check("exactamente 1 inscripcion", n.rows[0].n === 1);
  }

  await limpiar();
  const final = await pool.query(`SELECT count(*)::int AS n FROM materias WHERE nombre = $1`, [
    NOMBRE_PRUEBA,
  ]);
  check("limpieza: no quedaron filas de prueba", final.rows[0].n === 0);

  await pool.end();
  console.log(`\nResultado: ${pass} PASS, ${fail} FAIL\n`);
  process.exit(fail > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error("ERROR:", err.message);
  await limpiar().catch(() => {});
  await pool.end().catch(() => {});
  process.exit(1);
});
