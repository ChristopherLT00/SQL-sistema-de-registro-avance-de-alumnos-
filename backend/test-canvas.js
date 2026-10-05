/**
 * Prueba de conexion con Canvas (miaprendizaje.prepanet.tec.mx)
 *
 * Uso:  node test-canvas.js
 * Pide usuario y contrasena de UNA cuenta real de alumno.
 *
 * Valida:
 *   1. Login web en /login/canvas (CSRF + cookie de sesion)
 *   2. Que la cookie funcione con la API /api/v1/*
 *   3. Imprime cursos (materias), actividades (hitos) y una muestra de entregas
 */

const readline = require("readline");

const BASE = "https://miaprendizaje.prepanet.tec.mx";

/* ---------------------------------------------------------------- */
/*  Mini manejador de cookies (fetch no las gestiona solo)           */
/* ---------------------------------------------------------------- */

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
        if (valor === "" || /Expires=Thu, 01 Jan 1970/i.test(p)) {
          cookies.delete(nombre);
        } else {
          cookies.set(nombre, valor);
        }
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
  const res = await fetch(url, {
    method,
    headers,
    body,
    redirect: "manual",
  });

  const setCookie = res.headers.getSetCookie ? res.headers.getSetCookie() : [];
  if (jar && setCookie.length) jar.absorber(setCookie);

  return res;
}

/* ---------------------------------------------------------------- */
/*  Login Canvas                                                     */
/* ---------------------------------------------------------------- */

async function loginCanvas(usuario, contrasena) {
  const jar = crearJar();

  // 1. GET /login/canvas -> cookie _csrf_token
  const pagina = await pedir(`${BASE}/login/canvas`, { jar });
  if (!pagina.ok) {
    throw new Error(`No se pudo cargar la pagina de login (HTTP ${pagina.status})`);
  }
  const csrf = jar.ver("_csrf_token");
  if (!csrf) throw new Error("No se recibio la cookie _csrf_token");

  console.log("  [1] Pagina de login OK, CSRF obtenido");

  // 2. POST credenciales
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
  let json = null;
  try {
    json = JSON.parse(texto);
  } catch {}

  if (res.status === 200 || res.status === 302) {
    console.log(`  [2] Login OK (HTTP ${res.status})`);
    console.log(`      Cookies: ${jar.listar().join(", ")}`);
    return jar;
  }

  if (json && json.errors) {
    const msg = String(json.errors[0]).replace(/<[^>]+>/g, "");
    throw new Error(`Login rechazado: ${msg}`);
  }
  throw new Error(`Login fallo: HTTP ${res.status} -> ${texto.slice(0, 200)}`);
}

/* ---------------------------------------------------------------- */
/*  API Canvas con cookie                                            */
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
    throw new Error(`API 401 en ${ruta}: la cookie de sesion no fue aceptada`);
  }
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`API ${res.status} en ${ruta}: ${t.slice(0, 200)}`);
  }
  return res.json();
}

/* ---------------------------------------------------------------- */
/*  Principal                                                        */
/* ---------------------------------------------------------------- */

function pedirDato(pregunta, oculto = false) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      // stdin embebido (pipes): las lineas ya fueron leidas en main()
      process.stdout.write(pregunta + (oculto ? "********" : (pendientes[0] ?? "")) + "\n");
      resolve((pendientes.shift() || "").trim());
      return;
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (oculto) {
      const bufs = [];
      const onData = (char) => {
        const c = char.toString();
        if (c === "\n" || c === "\r" || c === "\u0004") {
          process.stdin.off("data", onData);
          process.stdout.write("\n");
          rl.close();
          resolve(Buffer.concat(bufs).toString("utf8"));
        } else if (c === "\u0003") {
          process.exit(1);
        } else {
          bufs.push(Buffer.from(c));
          process.stdout.write("*");
        }
      };
      process.stdout.write(pregunta);
      process.stdin.on("data", onData);
      process.stdin.setRawMode && process.stdin.setRawMode(true);
    } else {
      rl.question(pregunta, (r) => {
        rl.close();
        resolve(r.trim());
      });
    }
  });
}

const pendientes = [];

async function main() {
  console.log("=== Prueba de conexion con Canvas (PrepaNet) ===\n");

  if (!process.stdin.isTTY) {
    // leer todas las lineas del stdin embebido (pipes)
    const crudo = await new Promise((resolve) => {
      let s = "";
      process.stdin.on("data", (d) => (s += d.toString()));
      process.stdin.on("end", () => resolve(s));
      process.stdin.resume();
    });
    pendientes.push(...crudo.split("\n").filter((l) => l.length > 0));
  }

  const usuario = await pedirDato("Usuario/email del alumno: ");
  const contrasena = await pedirDato("Contrasena (no se guarda ni se envia a otro lado): ", true);

  console.log("\nEntrando a Canvas...");
  const jar = await loginCanvas(usuario, contrasena);

  console.log("\nConsultando API...\n");

  // Cursos (materias)
  const cursos = await apiGet("/api/v1/courses?enrollment_state=active&per_page=100", jar);
  console.log(`COURSES: ${cursos.length} cursos activos`);
  for (const c of cursos) {
    console.log(`  - id=${c.id}  nombre="${c.name}"`);
  }

  if (cursos.length === 0) {
    console.log("\nNo hay cursos visibles con esta cuenta.");
    return;
  }

  // Actividades (hitos) del primer curso
  const curso = cursos[0];
  console.log(`\nACTIVIDADES en "${curso.name}" (id=${curso.id}):`);
  const assigns = await apiGet(
    `/api/v1/courses/${curso.id}/assignments?per_page=100&order_by=due_at`,
    jar
  );
  console.log(`  total: ${assigns.length}`);
  for (const a of assigns.slice(0, 30)) {
    console.log(`  - id=${a.id}  "${a.name}"  due=${a.due_at || "s/n"}  puntos=${a.points_possible ?? "?"}`);
  }
  if (assigns.length > 30) console.log(`  ... y ${assigns.length - 30} mas`);

  // Entregas del curso (todas las asignaciones, solo este alumno)
  console.log(`\nENTREGAS de este alumno en "${curso.name}":`);
  const subs = await apiGet(
    `/api/v1/courses/${curso.id}/students/submissions?per_page=100`,
    jar
  );
  const nombreAssign = {};
  for (const a of assigns) nombreAssign[a.id] = a.name;
  let entregadas = 0;
  for (const s of subs) {
    const estado = s.workflow_state;
    const fecha = s.submitted_at ? s.submitted_at.slice(0, 10) : "-";
    const nota = s.score ?? "-";
    if (s.submitted_at) entregadas++;
    console.log(
      `  - "${nombreAssign[s.assignment_id] || s.assignment_id}"  estado=${estado}  enviada=${fecha}  calif=${nota}`
    );
  }
  console.log(`\n  Entregadas: ${entregadas} / ${subs.length}`);

  // Calificacion global (enrollments)
  console.log("\nCALIFICACION GLOBAL por curso:");
  const enr = await apiGet(
    "/api/v1/users/self/enrollments?include[]=total_scores&per_page=100",
    jar
  );
  for (const e of enr) {
    const g = e.grades || {};
    console.log(
      `  - ${e.course_id}  actual=${g.current_score ?? "-"}  final=${g.final_score ?? "-"}`
    );
  }

  console.log("\n=== TODAS LAS PRUEBAS PASARON ===");
}

main().catch((err) => {
  console.error("\nERROR:", err.message);
  process.exit(1);
});
