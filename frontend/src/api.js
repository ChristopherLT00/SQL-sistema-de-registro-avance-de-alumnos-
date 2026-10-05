const API = "/api";

/* ------------------------------------------------------------------ */
/*  Token / Auth                                                       */
/* ------------------------------------------------------------------ */

// El token vive solo en memoria: cada recarga de pagina exige iniciar sesion.
let tokenMemoria = null;
try {
  localStorage.removeItem("token"); // limpia la clave de versiones anteriores
} catch {
  /* sin localStorage */
}

export function getToken() {
  return tokenMemoria;
}

export function setToken(token) {
  tokenMemoria = token;
}

export function clearToken() {
  tokenMemoria = null;
}

export function isLoggedIn() {
  return !!tokenMemoria;
}

// Decodifica el payload del JWT (rol, id_alumno) sin librerias externas
export function obtenerSesion() {
  const t = getToken();
  if (!t) return null;
  try {
    const base64 = t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const payload = JSON.parse(atob(base64));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return {
      id: payload.id ?? null,
      usuario: payload.usuario ?? "",
      rol: payload.rol || "admin",
      id_alumno: payload.id_alumno ?? null,
    };
  } catch {
    return null;
  }
}

function authHeaders() {
  const t = getToken();
  return t ? { Authorization: `Bearer ${t}` } : {};
}

function fallo(res, mensaje) {
  if (res.status === 401) {
    throw new Error("Token invalido o expirado (401)");
  }
  if (res.status === 403) {
    throw new Error("No tienes permiso para esta accion (403)");
  }
  throw new Error(`${mensaje} (${res.status})`);
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
  if (!res.ok) fallo(res, "Error al obtener alumnos");
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
  if (!res.ok) fallo(res, "Error al obtener materias");
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Inscripciones                                                      */
/* ------------------------------------------------------------------ */

export async function fetchInscripciones() {
  const res = await fetch(`${API}/inscripciones`, { headers: authHeaders() });
  if (!res.ok) fallo(res, "Error al obtener inscripciones");
  return res.json();
}

export async function createMateria(nombre) {
  const res = await fetch(`${API}/materias`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ nombre }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Error al crear materia");
  }
  return res.json();
}

export async function syncInscripciones(idAlumno, materiasIds) {
  const res = await fetch(`${API}/inscripciones/lote`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ id_alumno: idAlumno, materias: materiasIds }),
  });
  if (!res.ok) fallo(res, "Error al sincronizar inscripciones");
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Horario                                                            */
/* ------------------------------------------------------------------ */

export async function fetchHorario() {
  const res = await fetch(`${API}/horario`, { headers: authHeaders() });
  if (!res.ok) fallo(res, "Error al obtener horario");
  return res.json();
}

export async function saveHorario(grid) {
  const res = await fetch(`${API}/horario`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ grid }),
  });
  if (!res.ok) fallo(res, "Error al guardar horario");
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
  if (!res.ok) fallo(res, "Error al obtener progreso");
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
  if (!res.ok) fallo(res, "Error al registrar avance");
  return res.json();
}

export async function updateAlumno(id, { nombre, cuenta, contrasena }) {
  const res = await fetch(`${API}/alumnos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ nombre, cuenta, contrasena }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Error al actualizar alumno");
  }
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
  if (!res.ok) fallo(res, "Error al registrar avance en lote");
  return res.json();
}

export async function deleteProgreso(id) {
  const res = await fetch(`${API}/progreso/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) fallo(res, "Error al eliminar registro");
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Canvas                                                             */
/* ------------------------------------------------------------------ */

export async function syncCanvas() {
  const res = await fetch(`${API}/canvas/sync`, {
    method: "POST",
    headers: { ...authHeaders() },
  });
  if (!res.ok) fallo(res, "Error al sincronizar con Canvas");
  return res.json();
}

export async function fetchNotasMateria() {
  const res = await fetch(`${API}/notas-materia`, { headers: authHeaders() });
  if (!res.ok) fallo(res, "Error al obtener calificaciones globales");
  return res.json();
}

export async function fetchBitacora() {
  const res = await fetch(`${API}/bitacora-sync`, { headers: authHeaders() });
  if (!res.ok) fallo(res, "Error al obtener la bitacora de sincronizaciones");
  return res.json();
}

/* ------------------------------------------------------------------ */
/*  Usuarios (solo admin)                                              */
/* ------------------------------------------------------------------ */

export async function fetchUsuarios() {
  const res = await fetch(`${API}/usuarios`, { headers: authHeaders() });
  if (!res.ok) fallo(res, "Error al obtener usuarios");
  return res.json();
}

export async function createUsuario({ usuario, contrasena, rol, id_alumno }) {
  const res = await fetch(`${API}/usuarios`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ usuario, contrasena, rol, id_alumno }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Error al crear usuario");
  }
  return res.json();
}

export async function updateUsuario(id, { contrasena, rol, id_alumno }) {
  const res = await fetch(`${API}/usuarios/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify({ contrasena, rol, id_alumno }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Error al actualizar usuario");
  }
  return res.json();
}

export async function deleteUsuario(id) {
  const res = await fetch(`${API}/usuarios/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || "Error al eliminar usuario");
  }
  return res.json();
}
