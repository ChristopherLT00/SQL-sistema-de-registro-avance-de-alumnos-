require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { sincronizarTodo } = require("./canvas");

const JWT_SECRET = process.env.JWT_SECRET || "magnolias_calificaciones_2026_secret_key";
const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgres://postgres@localhost:5432/magnolias2026",
  ssl: process.env.DATABASE_URL ? { rejectUnauthorized: false } : false,
});

/* ------------------------------------------------------------------ */
/*  Autenticacion                                                      */
/* ------------------------------------------------------------------ */

function autenticar(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token no proporcionado" });
  }
  try {
    const payload = jwt.verify(auth.split(" ")[1], JWT_SECRET);
    // tokens antiguos sin rol se asumen admin (solo existian cuentas admin)
    req.usuario = { ...payload, rol: payload.rol || "admin" };
    next();
  } catch {
    return res.status(401).json({ error: "Token invalido o expirado" });
  }
}

function requiereRol(...roles) {
  return (req, res, next) => {
    if (!req.usuario || !roles.includes(req.usuario.rol)) {
      return res.status(403).json({ error: "No tienes permiso para esta accion" });
    }
    next();
  };
}

const soloAdmin = requiereRol("admin");

// Para padres: id_alumno del token, ignorando cualquier filtro del cliente
function alumnoDelToken(req) {
  return req.usuario?.rol === "padre" ? req.usuario.id_alumno ?? -1 : null;
}

app.post("/api/login", async (req, res) => {
  try {
    const { usuario, contrasena } = req.body;
    const result = await pool.query("SELECT * FROM usuarios WHERE usuario = $1", [usuario]);
    if (result.rowCount === 0) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }
    const user = result.rows[0];
    const valid = await bcrypt.compare(contrasena, user.contrasena);
    if (!valid) {
      return res.status(401).json({ error: "Credenciales incorrectas" });
    }
    const rol = user.rol || "admin";
    const token = jwt.sign(
      { id: user.id_usuario, usuario: user.usuario, rol, id_alumno: user.id_alumno ?? null },
      JWT_SECRET,
      { expiresIn: "7d" }
    );
    res.json({ token, rol, id_alumno: user.id_alumno ?? null });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.use("/api", autenticar);

/* ------------------------------------------------------------------ */
/*  Alumnos                                                            */
/* ------------------------------------------------------------------ */

app.get("/api/alumnos", async (req, res) => {
  try {
    const soloAlumno = alumnoDelToken(req);
    const result = soloAlumno
      ? await pool.query("SELECT * FROM alumnos WHERE id_alumno = $1", [soloAlumno])
      : await pool.query("SELECT * FROM alumnos ORDER BY nombre");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/alumnos", soloAdmin, async (req, res) => {
  try {
    const { nombre, cuenta, contrasena } = req.body;
    if (!nombre || !cuenta || !contrasena) {
      return res.status(400).json({ error: "Nombre, cuenta y contrasena son requeridos" });
    }
    const existe = await pool.query("SELECT id_alumno FROM alumnos WHERE cuenta = $1", [cuenta]);
    if (existe.rowCount > 0) {
      return res.status(400).json({ error: "Ya existe un alumno con esa cuenta" });
    }
    const result = await pool.query(
      "INSERT INTO alumnos (nombre, cuenta, contrasena) VALUES ($1, $2, $3) RETURNING *",
      [nombre, cuenta, contrasena]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/alumnos/:id", soloAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre, cuenta, contrasena } = req.body;
    const result = await pool.query(
      "UPDATE alumnos SET nombre = $1, cuenta = $2, contrasena = $3 WHERE id_alumno = $4 RETURNING *",
      [nombre, cuenta, contrasena, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Alumno no encontrado" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ */
/*  Materias                                                           */
/* ------------------------------------------------------------------ */

app.get("/api/materias", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM materias ORDER BY nombre");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/materias", soloAdmin, async (req, res) => {
  try {
    const { nombre } = req.body;
    if (!nombre || !nombre.trim()) {
      return res.status(400).json({ error: "Nombre es requerido" });
    }
    const existing = await pool.query("SELECT * FROM materias WHERE LOWER(nombre) = LOWER($1)", [nombre.trim()]);
    if (existing.rowCount > 0) {
      return res.json(existing.rows[0]);
    }
    const result = await pool.query(
      "INSERT INTO materias (nombre) VALUES ($1) RETURNING *",
      [nombre.trim()]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ */
/*  Inscripciones                                                      */
/* ------------------------------------------------------------------ */

app.get("/api/inscripciones", async (req, res) => {
  try {
    const soloAlumno = alumnoDelToken(req);
    const { alumno_id } = req.query;
    const params = [];
    let query = "SELECT * FROM inscripciones";
    const conditions = [];
    if (soloAlumno) {
      params.push(soloAlumno);
      conditions.push(`id_alumno = $${params.length}`);
    } else if (alumno_id) {
      params.push(alumno_id);
      conditions.push(`id_alumno = $${params.length}`);
    }
    if (conditions.length > 0) query += " WHERE " + conditions.join(" AND ");
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/inscripciones", soloAdmin, async (req, res) => {
  try {
    const { id_alumno, id_materia } = req.body;
    const result = await pool.query(
      "INSERT INTO inscripciones (id_alumno, id_materia) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING *",
      [id_alumno, id_materia]
    );
    res.json(result.rows[0] || { id_alumno, id_materia });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/inscripciones", soloAdmin, async (req, res) => {
  try {
    const { id_alumno, id_materia } = req.body;
    await pool.query(
      "DELETE FROM inscripciones WHERE id_alumno = $1 AND id_materia = $2",
      [id_alumno, id_materia]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/inscripciones/lote", soloAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id_alumno, materias } = req.body;
    if (!id_alumno || !Array.isArray(materias)) {
      return res.status(400).json({ error: "Faltan parametros: id_alumno, materias[]" });
    }
    await client.query("BEGIN");
    await client.query("DELETE FROM inscripciones WHERE id_alumno = $1", [id_alumno]);
    for (const id_materia of materias) {
      await client.query(
        "INSERT INTO inscripciones (id_alumno, id_materia) VALUES ($1, $2) ON CONFLICT DO NOTHING",
        [id_alumno, id_materia]
      );
    }
    await client.query("COMMIT");
    const result = await pool.query("SELECT * FROM inscripciones WHERE id_alumno = $1", [id_alumno]);
    res.json(result.rows);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

/* ------------------------------------------------------------------ */
/*  Progreso                                                           */
/* ------------------------------------------------------------------ */

app.get("/api/progreso", async (req, res) => {
  try {
    const soloAlumno = alumnoDelToken(req);
    const { alumno_id, materia_id } = req.query;
    let query = "SELECT * FROM progreso";
    const conditions = [];
    const params = [];
    if (soloAlumno) {
      params.push(soloAlumno);
      conditions.push(`id_alumno = $${params.length}`);
    } else if (alumno_id) {
      params.push(alumno_id);
      conditions.push(`id_alumno = $${params.length}`);
    }
    if (materia_id) {
      params.push(materia_id);
      conditions.push(`id_materia = $${params.length}`);
    }
    if (conditions.length > 0) {
      query += " WHERE " + conditions.join(" AND ");
    }
    const result = await pool.query(query, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/progreso/lote", soloAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { id_alumno, hito, materias } = req.body;
    if (!id_alumno || !hito || !Array.isArray(materias) || materias.length === 0) {
      return res.status(400).json({ error: "Faltan parametros: id_alumno, hito, materias[]" });
    }
    await client.query("BEGIN");
    const resultados = [];
    for (const id_materia of materias) {
      const result = await client.query(
        `INSERT INTO progreso (id_alumno, id_materia, hito, cumplio, fecha_registro)
         VALUES ($1, $2, $3, true, CURRENT_TIMESTAMP)
         ON CONFLICT (id_alumno, id_materia, hito)
         DO UPDATE SET cumplio = true, fecha_registro = CURRENT_TIMESTAMP, origen = 'manual'
         RETURNING *`,
        [id_alumno, id_materia, hito]
      );
      resultados.push(result.rows[0]);
    }
    await client.query("COMMIT");
    res.json(resultados);
  } catch (err) {
    await client.query("ROLLBACK");
    res.status(500).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.post("/api/progreso", soloAdmin, async (req, res) => {
  try {
    const { id_alumno, id_materia, hito, cumplio } = req.body;
    const result = await pool.query(
      `INSERT INTO progreso (id_alumno, id_materia, hito, cumplio, fecha_registro)
       VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
       ON CONFLICT (id_alumno, id_materia, hito)
       DO UPDATE SET cumplio = $4, fecha_registro = CURRENT_TIMESTAMP, origen = 'manual'
       RETURNING *`,
      [id_alumno, id_materia, hito, cumplio ?? true]
    );
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/progreso/:id", soloAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { cumplio } = req.body;
    const result = await pool.query(
      "UPDATE progreso SET cumplio = $1, fecha_registro = CURRENT_TIMESTAMP, origen = 'manual' WHERE id_progreso = $2 RETURNING *",
      [cumplio, id]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Registro no encontrado" });
    }
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/progreso/:id", soloAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await pool.query("DELETE FROM progreso WHERE id_progreso = $1", [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ */
/*  Horario                                                            */
/* ------------------------------------------------------------------ */

app.get("/api/horario", async (req, res) => {
  try {
    const result = await pool.query("SELECT grid FROM horario ORDER BY id LIMIT 1");
    if (result.rowCount === 0) {
      return res.json({
        grid: [
          ["Plataforma", "Plataforma", "Plataforma", "Plataforma", "AUSENTE"],
          ["Plataforma", "Plataforma", "Plataforma", "Biología", "AUSENTE"],
          ["Plataforma", "Plataforma", "Biología", "Taller optativo", "AUSENTE"],
          ["Taller optativo - Música", "Taller optativo - Música", "Música ensamble", "Taller optativo", "AUSENTE"],
          ["Plataforma", "Pintura", "Pintura", "Plataforma", "AUSENTE"],
        ],
      });
    }
    res.json(result.rows[0].grid);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/horario", soloAdmin, async (req, res) => {
  try {
    const { grid } = req.body;
    if (!Array.isArray(grid)) {
      return res.status(400).json({ error: "grid inválido" });
    }
    await pool.query(
      `INSERT INTO horario (id, grid, actualizado_en)
       VALUES (1, $1, now())
       ON CONFLICT (id) DO UPDATE SET grid = $1, actualizado_en = now()`,
      [JSON.stringify({ grid })]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ */
/*  Sincronizacion Canvas                                              */
/* ------------------------------------------------------------------ */

app.get("/api/notas-materia", async (req, res) => {
  try {
    const soloAlumno = alumnoDelToken(req);
    const result = soloAlumno
      ? await pool.query("SELECT * FROM notas_materia WHERE id_alumno = $1", [soloAlumno])
      : await pool.query("SELECT * FROM notas_materia");
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/bitacora-sync", soloAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      "SELECT * FROM bitacora_sync ORDER BY iniciado_en DESC LIMIT 30"
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

let sincronizandoEnCurso = false;

app.post("/api/canvas/sync", soloAdmin, async (req, res) => {
  if (sincronizandoEnCurso) {
    return res.status(409).json({ error: "Ya hay una sincronizacion en curso" });
  }
  sincronizandoEnCurso = true;
  const iniciado = Date.now();
  try {
    const resumen = await sincronizarTodo(pool);
    const duracion = Date.now() - iniciado;
    try {
      await pool.query(
        `INSERT INTO bitacora_sync (duracion_ms, alumnos_ok, alumnos_error, alumnos_sin_cuenta,
           hitos_marcados, calificaciones, global_actualizadas, actividades_ignoradas,
           cursos_sin_match, actividades_sin_match, errores)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          duracion,
          resumen.alumnos_ok,
          resumen.alumnos_error,
          resumen.alumnos_sin_cuenta,
          resumen.hitos_marcados,
          resumen.calificaciones,
          resumen.global_actualizadas,
          resumen.actividades_ignoradas,
          JSON.stringify(resumen.cursos_sin_match),
          JSON.stringify(resumen.actividades_sin_match),
          JSON.stringify(resumen.errores),
        ]
      );
    } catch (bitErr) {
      console.error("No se pudo guardar la bitacora de sync:", bitErr.message);
    }
    res.json({ ...resumen, duracion_ms: duracion });
  } catch (err) {
    res.status(500).json({ error: err.message });
  } finally {
    sincronizandoEnCurso = false;
  }
});

/* ------------------------------------------------------------------ */
/*  Usuarios (solo admin)                                              */
/* ------------------------------------------------------------------ */

const ROLES_VALIDOS = ["admin", "direccion", "padre"];

function validarUsuario({ usuario, contrasena, rol, id_alumno }) {
  if (!usuario || !String(usuario).trim()) return "El usuario es requerido";
  if (rol !== undefined && !ROLES_VALIDOS.includes(rol)) return "Rol invalido";
  if (rol === "padre" && !id_alumno) return "El rol padre requiere un alumno vinculado";
  if (contrasena !== undefined && contrasena !== null && String(contrasena).length < 4) {
    return "La contrasena debe tener al menos 4 caracteres";
  }
  return null;
}

app.get("/api/usuarios", soloAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT u.id_usuario, u.usuario, u.rol, u.id_alumno, a.nombre AS alumno_nombre
       FROM usuarios u
       LEFT JOIN alumnos a ON a.id_alumno = u.id_alumno
       ORDER BY u.id_usuario`
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/usuarios", soloAdmin, async (req, res) => {
  try {
    const { usuario, contrasena, rol = "admin", id_alumno = null } = req.body;
    const error = validarUsuario({ usuario, contrasena, rol, id_alumno });
    if (error) return res.status(400).json({ error });
    if (!contrasena) return res.status(400).json({ error: "La contrasena es requerida" });

    const existe = await pool.query("SELECT id_usuario FROM usuarios WHERE usuario = $1", [
      String(usuario).trim(),
    ]);
    if (existe.rowCount > 0) return res.status(400).json({ error: "Ese usuario ya existe" });

    const hash = await bcrypt.hash(String(contrasena), 10);
    const result = await pool.query(
      "INSERT INTO usuarios (usuario, contrasena, rol, id_alumno) VALUES ($1, $2, $3, $4) RETURNING id_usuario, usuario, rol, id_alumno",
      [String(usuario).trim(), hash, rol, id_alumno]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put("/api/usuarios/:id", soloAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { contrasena, rol, id_alumno } = req.body;
    const propio = Number(id) === Number(req.usuario.id);
    if (propio && rol !== undefined && rol !== "admin") {
      return res.status(400).json({ error: "No puedes cambiar tu propio rol" });
    }
    const error = validarUsuario({ usuario: "x", rol, id_alumno });
    if (error) return res.status(400).json({ error });

    const campos = [];
    const params = [];
    if (contrasena) {
      params.push(await bcrypt.hash(String(contrasena), 10));
      campos.push(`contrasena = $${params.length}`);
    }
    if (rol !== undefined) {
      params.push(rol);
      campos.push(`rol = $${params.length}`);
    }
    if (id_alumno !== undefined) {
      params.push(id_alumno);
      campos.push(`id_alumno = $${params.length}`);
    }
    if (campos.length === 0) return res.status(400).json({ error: "Nada que actualizar" });

    params.push(id);
    const result = await pool.query(
      `UPDATE usuarios SET ${campos.join(", ")} WHERE id_usuario = $${params.length} RETURNING id_usuario, usuario, rol, id_alumno`,
      params
    );
    if (result.rowCount === 0) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/usuarios/:id", soloAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    if (Number(id) === Number(req.usuario.id)) {
      return res.status(400).json({ error: "No puedes eliminar tu propia cuenta" });
    }
    const result = await pool.query("DELETE FROM usuarios WHERE id_usuario = $1", [id]);
    if (result.rowCount === 0) return res.status(404).json({ error: "Usuario no encontrado" });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/* ------------------------------------------------------------------ */
/*  Servir frontend en produccion                                      */
/* ------------------------------------------------------------------ */

const frontendPath = path.join(__dirname, "../frontend/dist");
app.use(express.static(frontendPath));
app.get("*", (req, res) => {
  res.sendFile(path.join(frontendPath, "index.html"));
});

/* ------------------------------------------------------------------ */
/*  Iniciar servidor                                                   */
/* ------------------------------------------------------------------ */

app.listen(PORT, "0.0.0.0", () => {
  console.log(`APIMagnolias corriendo en http://0.0.0.0:${PORT}`);
});
