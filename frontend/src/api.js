const API = "/api";

/* ------------------------------------------------------------------ */
/*  Token / Auth                                                       */
/* ------------------------------------------------------------------ */

export function getToken() {
  return localStorage.getItem("token");
}

export function setToken(token) {
  localStorage.setItem("token", token);
}

export function clearToken() {
  localStorage.removeItem("token");
}

export function isLoggedIn() {
  return !!getToken();
}

function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

/* ------------------------------------------------------------------ */
/*  Login                                                              */
/* ------------------------------------------------------------------ */

export async function login(usuario, contrasena) {
  const res = await fetch(`${API}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usuario, contrasena }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Credenciales incorrectas");
  }
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Alumnos                                                            */
/* ------------------------------------------------------------------ */

export async function fetchAlumnos() {
  const res = await fetch(`${API}/alumnos`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Error al obtener alumnos");
  return res.json();
}

export async function createAlumno({ nombre, cuenta, contrasena }) {
  const res = await fetch(`${API}/alumnos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ nombre, cuenta, contrasena }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Error al crear alumno");
  }
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Materias                                                           */
/* ------------------------------------------------------------------ */

export async function fetchMaterias() {
  const res = await fetch(`${API}/materias`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Error al obtener materias");
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Inscripciones                                                      */
/* ------------------------------------------------------------------ */

export async function fetchInscripciones() {
  const res = await fetch(`${API}/inscripciones`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Error al obtener inscripciones");
  return res.json();
}

export async function createMateria(nombre) {
  const res = await fetch(`${API}/materias`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ nombre }),
  });
  if (!res.ok) throw new Error("Error al crear materia");
  return res.json();
}

export async function syncInscripciones(idAlumno, materiasIds) {
  const res = await fetch(`${API}/inscripciones/lote`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ id_alumno: idAlumno, materias: materiasIds }),
  });
  if (!res.ok) throw new Error("Error al sincronizar inscripciones");
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Horario                                                            */
/* ------------------------------------------------------------------ */

export async function fetchHorario() {
  const res = await fetch(`${API}/horario`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Error al obtener horario");
  return res.json();
}

export async function saveHorario(grid) {
  const res = await fetch(`${API}/horario`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ grid }),
  });
  if (!res.ok) throw new Error("Error al guardar horario");
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Progreso                                                           */
/* ------------------------------------------------------------------ */

export async function fetchProgreso(alumnoId) {
  const url = alumnoId
    ? `${API}/progreso?alumno_id=${alumnoId}`
    : `${API}/progreso`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error("Error al obtener progreso");
  return res.json();
}

export async function registrarAvance(idAlumno, idMateria, hito) {
  const res = await fetch(`${API}/progreso`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      id_alumno: idAlumno,
      id_materia: idMateria,
      hito,
      cumplio: true,
    }),
  });
  if (!res.ok) throw new Error("Error al registrar avance");
  return res.json();
}

export async function updateAlumno(id, { nombre, cuenta, contrasena }) {
  const res = await fetch(`${API}/alumnos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ nombre, cuenta, contrasena }),
  });
  if (!res.ok) throw new Error("Error al actualizar alumno");
  return res.json();
}

export async function registrarAvanceLote(idAlumno, hito, materiasIds) {
  const res = await fetch(`${API}/progreso/lote`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({
      id_alumno: idAlumno,
      hito,
      materias: materiasIds,
    }),
  });
  if (!res.ok) throw new Error("Error al registrar avance en lote");
  return res.json();
}

export async function deleteProgreso(id) {
  const res = await fetch(`${API}/progreso/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Error al eliminar registro");
  return res.json();
}
