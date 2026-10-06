import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
import { createPortal } from "react-dom";
import {
  Users,
  ClipboardList,
  UserSearch,
  Table2,
  Check,
  KeyRound,
  Eye,
  EyeOff,
  Loader2,
  CheckCircle2,
  Search,
  BookOpen,
  Copy,
  Download,
  Pencil,
  X,
  Save,
  LogOut,
  UserPlus,
  Calendar,
  RotateCcw,
  Bell,
  RefreshCw,
  ScrollText,
  History,
  FileSearch,
  UserCog,
  Trash2,
} from "lucide-react";
import {
  fetchAlumnos,
  fetchMaterias,
  fetchInscripciones,
  fetchProgreso,
  registrarAvance,
  registrarAvanceLote,
  updateAlumno,
  createAlumno,
  deleteAlumno,
  createMateria,
  syncInscripciones,
  deleteProgreso,
  syncCanvas,
  fetchNotasMateria,
  fetchBitacora,
  login as apiLogin,
  setToken,
  clearToken,
  isLoggedIn,
  obtenerSesion,
  fetchUsuarios,
  createUsuario,
  updateUsuario,
  deleteUsuario,
} from "./api";
import { generarPDFAvance, generarPDFMatriz } from "./pdf";
import { generarExcelAvance, generarExcelMatriz } from "./excel";
import {
  DIAS,
  BLOQUES,
  HORARIO_DEFAULT,
  cargarHorario,
  guardarHorario,
  restaurarHorario,
  obtenerEstadoActual,
  obtenerMateriaActual,
} from "./horario";

/* ------------------------------------------------------------------ */
/*  Catalogos (definidos en frontend, no en la DB)                     */
/* ------------------------------------------------------------------ */

const HITOS = [
  "1", "2", "3", "4", "Int 1", "Parcial 1",
  "6", "7", "8", "9", "Int 2", "Parcial 2",
  "11", "12", "13", "Int 3", "Final",
];

// Calificacion global minima aprobatoria (escala 0-100; 7.0 equivale a 70)
const MIN_APROBATORIA = 70;

function globalEnRiesgo(calificacion) {
  if (calificacion == null) return false;
  const v = Number(calificacion);
  if (Number.isNaN(v)) return false;
  // admite escala 0-10 (7.0) y 0-100 (70)
  const v100 = v <= 10 ? v * 10 : v;
  return v100 < MIN_APROBATORIA;
}

const VISTAS = [
  { id: "credenciales", nombre: "Credenciales de alumnos", icon: Users },
  { id: "registro", nombre: "Registro semanal", icon: ClipboardList },
  { id: "avance", nombre: "Avance individual", icon: UserSearch },
  { id: "matriz", nombre: "Matriz general", icon: Table2 },
  { id: "auditoria", nombre: "Auditoria", icon: ScrollText },
  { id: "usuarios", nombre: "Usuarios", icon: UserCog },
  { id: "horario", nombre: "Horario escolar", icon: Calendar },
];

// Vistas visibles por rol (la autenticacion de verdad es en el backend)
const VISTAS_POR_ROL = {
  admin: ["credenciales", "registro", "avance", "matriz", "auditoria", "usuarios", "horario"],
  direccion: ["avance", "matriz", "horario"],
  padre: ["avance", "matriz", "horario"],
};

const NOMBRES_ROL = {
  admin: "Administrador",
  direccion: "Direccion",
  padre: "Padre",
};

/* ------------------------------------------------------------------ */
/*  Componentes auxiliares                                             */
/* ------------------------------------------------------------------ */

function StatusChip({ entregado }) {
  if (entregado) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
        <Check className="h-3 w-3" strokeWidth={2.5} />
        Entregado
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-400">
      Pendiente
    </span>
  );
}

function normalizarTexto(texto) {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function formatearFecha(iso) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("es-MX", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

// Card flotante con la evidencia de un registro, en el estilo de la pagina.
// Se portaliza a document.body para no quedar recortada por los contenedores overflow-auto.
function ContenidoEvidencia({ base, nota, fechaEntrega, comentario, sincronizado, tituloEliminar }) {
  const entrega = formatearFecha(fechaEntrega);
  const sync = formatearFecha(sincronizado);
  const filas = [
    ["Calificacion", nota != null ? nota : null],
    ["Entrega", entrega],
    ["Sincronizado", sync],
  ].filter(([, valor]) => valor != null && valor !== "");
  return (
    <div className="space-y-2">
      {base && (
        <p className={`text-xs font-semibold ${tituloEliminar ? "text-red-600" : "text-gray-900"}`}>{base}</p>
      )}
      {filas.length > 0 && (
        <dl className="space-y-1">
          {filas.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="flex items-baseline justify-between gap-3">
              <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{etiqueta}</dt>
              <dd className="text-right text-xs text-gray-700">{valor}</dd>
            </div>
          ))}
        </dl>
      )}
      {comentario ? (
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Comentario</p>
          <p className="mt-1 max-h-32 overflow-y-auto whitespace-pre-line rounded-lg bg-gray-50 px-2 py-1.5 text-xs leading-relaxed text-gray-600">
            {comentario}
          </p>
        </div>
      ) : null}
      {filas.length === 0 && !comentario && (
        <p className="text-xs text-gray-400">Sin evidencia registrada</p>
      )}
    </div>
  );
}

function TooltipFlotante({ children, contenido, ancho = 256, delay = 150, className = "block" }) {
  const [abierto, setAbierto] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0, arriba: true });
  const anclaRef = useRef(null);
  const timerRef = useRef(null);

  const ocultar = () => {
    clearTimeout(timerRef.current);
    setAbierto(false);
  };

  const mostrar = () => {
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      const el = anclaRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const mitad = ancho / 2;
      const x = Math.min(Math.max(r.left + r.width / 2, mitad + 8), window.innerWidth - mitad - 8);
      // si arriba no cabe la card, se despliega hacia abajo
      const arriba = r.top > 240;
      setPos({ x, y: arriba ? r.top - 8 : r.bottom + 8, arriba });
      setAbierto(true);
    }, delay);
  };

  useEffect(() => () => clearTimeout(timerRef.current), []);

  // al hacer scroll o redimensionar la card queda desanclada: se cierra
  useEffect(() => {
    if (!abierto) return undefined;
    const cerrar = () => setAbierto(false);
    window.addEventListener("scroll", cerrar, true);
    window.addEventListener("resize", cerrar);
    return () => {
      window.removeEventListener("scroll", cerrar, true);
      window.removeEventListener("resize", cerrar);
    };
  }, [abierto]);

  return (
    <>
      <span
        ref={anclaRef}
        className={className}
        onMouseEnter={mostrar}
        onMouseLeave={ocultar}
        onFocus={mostrar}
        onBlur={ocultar}
      >
        {children}
      </span>
      {abierto &&
        createPortal(
          <div
            className="pointer-events-none fixed z-[999]"
            style={{
              left: pos.x,
              top: pos.y,
              transform: pos.arriba ? "translate(-50%, -100%)" : "translate(-50%, 0)",
            }}
          >
            <div
              className="rounded-xl border border-gray-200 bg-white p-3 shadow-xl ring-1 ring-black/5"
              style={{ width: ancho }}
            >
              {contenido}
            </div>
          </div>,
          document.body
        )}
    </>
  );
}

function Indicador({ entregado, onClick, nota, fechaEntrega, comentario, sincronizado }) {
  const [hover, setHover] = useState(false);
  const evidencia = { nota, fechaEntrega, comentario, sincronizado };
  const base = entregado ? "Hito entregado" : "Hito pendiente";

  if (entregado && onClick) {
    return (
      <TooltipFlotante
        contenido={<ContenidoEvidencia base="Eliminar registro" tituloEliminar {...evidencia} />}
      >
        <button
          type="button"
          onClick={onClick}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          className="mx-auto flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 transition-colors hover:bg-red-500 cursor-pointer"
        >
          {hover ? (
            <X className="h-3 w-3 text-white" strokeWidth={3} />
          ) : (
            <Check className="h-3 w-3 text-white" strokeWidth={3} />
          )}
        </button>
      </TooltipFlotante>
    );
  }
  if (entregado) {
    return (
      <TooltipFlotante contenido={<ContenidoEvidencia base={base} {...evidencia} />}>
        <div className="mx-auto flex h-5 w-5 items-center justify-center rounded-full bg-blue-600">
          <Check className="h-3 w-3 text-white" strokeWidth={3} />
        </div>
      </TooltipFlotante>
    );
  }
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="mx-auto flex h-5 w-5 items-center justify-center rounded-full border border-gray-200 bg-white transition-colors hover:border-blue-600 hover:bg-blue-600 cursor-pointer"
        title="Registrar hito"
      >
        {hover && <Check className="h-3 w-3 text-white" strokeWidth={3} />}
      </button>
    );
  }
  return (
    <TooltipFlotante contenido={<ContenidoEvidencia base={base} {...evidencia} />}>
      <div className="mx-auto h-5 w-5 rounded-full border border-gray-200" />
    </TooltipFlotante>
  );
}

function LoadingScreen() {
  return (
    <div className="flex h-64 w-full flex-col items-center justify-center gap-3 text-gray-400">
      <Loader2 className="h-6 w-6 animate-spin" />
      <p className="text-sm">Cargando datos academicos...</p>
    </div>
  );
}

function Toast({ mensaje, onclose }) {
  const [animState, setAnimState] = useState("entering");

  useEffect(() => {
    if (!mensaje) {
      setAnimState("entering");
      return;
    }
    setAnimState("entering");
    const t1 = setTimeout(() => setAnimState("visible"), 400);
    return () => clearTimeout(t1);
  }, [mensaje]);

  const handleClose = () => {
    setAnimState("exiting");
    setTimeout(onclose, 300);
  };

  useEffect(() => {
    if (!mensaje || animState !== "visible") return;
    const t = setTimeout(handleClose, 3500);
    return () => clearTimeout(t);
  }, [mensaje, animState]);

  if (!mensaje && animState !== "exiting") return null;

  return (
    <div className={`fixed right-6 top-6 z-50 ${animState === "entering" ? "toast-enter" : animState === "exiting" ? "toast-exit" : ""}`}>
      <div className="flex items-center gap-3 rounded-2xl border border-white/20 bg-white/70 px-5 py-3.5 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-xl">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-500/10">
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        </div>
        <span className="text-sm font-medium text-gray-800">{mensaje}</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  LoginForm                                                          */
/* ------------------------------------------------------------------ */

function LoginForm({ onLogin, aviso }) {
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!usuario.trim() || !contrasena.trim()) return;
    setCargando(true);
    setError("");
    try {
      const data = await apiLogin(usuario.trim(), contrasena);
      setToken(data.token);
      onLogin();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img
            src="/magnoliaslogo.jpeg"
            alt="Magnolias"
            className="h-20 w-20 rounded-2xl object-cover shadow-lg mb-4"
          />
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Calificaciones</h1>
          <p className="text-sm text-gray-400 mt-1">Ciclo escolar 2026</p>
        </div>

        {aviso && (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
            {aviso}
          </div>
        )}

        <form onSubmit={handleSubmit} className="rounded-2xl border border-gray-100 bg-white p-6 shadow-sm space-y-5">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Usuario</label>
            <input
              type="text"
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
              autoFocus
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-gray-700">Contrasena</label>
            <input
              type="password"
              value={contrasena}
              onChange={(e) => setContrasena(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>

          {error && (
            <div className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>
          )}

          <button
            type="submit"
            disabled={cargando || !usuario.trim() || !contrasena.trim()}
            className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
          >
            {cargando && <Loader2 className="h-4 w-4 animate-spin" />}
            Iniciar sesion
          </button>
        </form>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Vista 1: Credenciales de alumnos                                   */
/* ------------------------------------------------------------------ */

function VistaCredenciales({ alumnos, onActualizar }) {
  const [visibles, setVisibles] = useState({});
  const [copiado, setCopiado] = useState(null);
  const [editando, setEditando] = useState(null);
  const [eliminando, setEliminando] = useState(null);
  const [guardandoEliminacion, setGuardandoEliminacion] = useState(false);
  const [form, setForm] = useState({ nombre: "", cuenta: "", contrasena: "" });
  const [guardando, setGuardando] = useState(false);
  const [exito, setExito] = useState(null);

  const [editandoMaterias, setEditandoMaterias] = useState(null);
  const [todasMaterias, setTodasMaterias] = useState([]);
  const [materiasSeleccionadas, setMateriasSeleccionadas] = useState([]);
  const [busquedaMateria, setBusquedaMateria] = useState("");
  const [guardandoMaterias, setGuardandoMaterias] = useState(false);

  const [agregando, setAgregando] = useState(false);
  const [formNuevoAlumno, setFormNuevoAlumno] = useState({ nombre: "", cuenta: "", contrasena: "" });
  const [materiasNuevas, setMateriasNuevas] = useState([]);
  const [todasMateriasTmp, setTodasMateriasTmp] = useState([]);
  const [busquedaMateriaNueva, setBusquedaMateriaNueva] = useState("");
  const [guardandoNuevo, setGuardandoNuevo] = useState(false);

  const alternar = (id) => {
    setVisibles((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const copiar = (id, valor, tipo) => {
    navigator.clipboard.writeText(valor).then(() => {
      setCopiado(`${id}-${tipo}`);
      setTimeout(() => setCopiado(null), 2000);
    });
  };

  const abrirEditar = (alumno) => {
    setEditando(alumno.id_alumno);
    setForm({ nombre: alumno.nombre, cuenta: alumno.cuenta, contrasena: alumno.contrasena });
  };

  const cerrarEditar = () => {
    setEditando(null);
    setForm({ nombre: "", cuenta: "", contrasena: "" });
  };

  const guardarCambios = async () => {
    if (!form.nombre.trim() || !form.cuenta.trim() || !form.contrasena.trim()) return;
    setGuardando(true);
    try {
      await updateAlumno(editando, form);
      await onActualizar();
      cerrarEditar();
      setExito("Los datos del alumno se guardaron correctamente.");
    } catch (err) {
      console.error("Error al actualizar:", err);
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminacion = async () => {
    if (!eliminando) return;
    setGuardandoEliminacion(true);
    try {
      await deleteAlumno(eliminando.id_alumno);
      await onActualizar();
      setExito(`Alumno "${eliminando.nombre}" eliminado junto con su avance.`);
      setEliminando(null);
    } catch (err) {
      console.error("Error al eliminar alumno:", err);
      setEliminando(null);
    } finally {
      setGuardandoEliminacion(false);
    }
  };

  const abrirMaterias = async (alumno) => {
    setEditandoMaterias(alumno.id_alumno);
    setBusquedaMateria("");
    try {
      const [materias, inscripciones] = await Promise.all([
        fetchMaterias(),
        fetchInscripciones(),
      ]);
      setTodasMaterias(materias);
      const asignadas = inscripciones
        .filter((i) => i.id_alumno === alumno.id_alumno)
        .map((i) => i.id_materia);
      setMateriasSeleccionadas(asignadas);
    } catch (err) {
      console.error("Error al cargar materias:", err);
    }
  };

  const cerrarMaterias = () => {
    setEditandoMaterias(null);
    setTodasMaterias([]);
    setMateriasSeleccionadas([]);
    setBusquedaMateria("");
  };

  const toggleMateria = (idMateria) => {
    setMateriasSeleccionadas((prev) =>
      prev.includes(idMateria) ? prev.filter((id) => id !== idMateria) : [...prev, idMateria]
    );
  };

  const crearYAsignarMateria = async () => {
    if (!busquedaMateria.trim()) return;
    try {
      const nueva = await createMateria(busquedaMateria.trim());
      setTodasMaterias((prev) => {
        if (prev.some((m) => m.id_materia === nueva.id_materia)) return prev;
        return [...prev, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre));
      });
      setMateriasSeleccionadas((prev) => [...prev, nueva.id_materia]);
      setBusquedaMateria("");
    } catch (err) {
      console.error("Error al crear materia:", err);
    }
  };

  const guardarMaterias = async () => {
    setGuardandoMaterias(true);
    try {
      await syncInscripciones(editandoMaterias, materiasSeleccionadas);
      await onActualizar();
      cerrarMaterias();
      setExito("Materias actualizadas correctamente.");
    } catch (err) {
      console.error("Error al sincronizar materias:", err);
    } finally {
      setGuardandoMaterias(false);
    }
  };

  const materiasFiltradas = todasMaterias.filter((m) =>
    m.nombre.toLowerCase().includes(busquedaMateria.toLowerCase())
  );

  const existeMateria = todasMaterias.some(
    (m) => m.nombre.toLowerCase() === busquedaMateria.trim().toLowerCase()
  );

  const abrirAgregar = async () => {
    setAgregando(true);
    setFormNuevoAlumno({ nombre: "", cuenta: "", contrasena: "" });
    setMateriasNuevas([]);
    setBusquedaMateriaNueva("");
    try {
      const materias = await fetchMaterias();
      setTodasMateriasTmp(materias);
    } catch (err) {
      console.error("Error al cargar materias:", err);
    }
  };

  const cerrarAgregar = () => {
    setAgregando(false);
    setFormNuevoAlumno({ nombre: "", cuenta: "", contrasena: "" });
    setMateriasNuevas([]);
    setBusquedaMateriaNueva("");
    setTodasMateriasTmp([]);
  };

  const toggleMateriaNueva = (idMateria) => {
    setMateriasNuevas((prev) =>
      prev.includes(idMateria) ? prev.filter((id) => id !== idMateria) : [...prev, idMateria]
    );
  };

  const crearMateriaNueva = async () => {
    if (!busquedaMateriaNueva.trim()) return;
    try {
      const nueva = await createMateria(busquedaMateriaNueva.trim());
      setTodasMateriasTmp((prev) => {
        if (prev.some((m) => m.id_materia === nueva.id_materia)) return prev;
        return [...prev, nueva].sort((a, b) => a.nombre.localeCompare(b.nombre));
      });
      setMateriasNuevas((prev) => [...prev, nueva.id_materia]);
      setBusquedaMateriaNueva("");
    } catch (err) {
      console.error("Error al crear materia:", err);
    }
  };

  const guardarNuevoAlumno = async () => {
    if (!formNuevoAlumno.nombre.trim() || !formNuevoAlumno.cuenta.trim() || !formNuevoAlumno.contrasena.trim()) return;
    setGuardandoNuevo(true);
    try {
      const nuevo = await createAlumno(formNuevoAlumno);
      if (materiasNuevas.length > 0) {
        await syncInscripciones(nuevo.id_alumno, materiasNuevas);
      }
      await onActualizar();
      cerrarAgregar();
      setExito("Alumno agregado correctamente.");
    } catch (err) {
      console.error("Error al crear alumno:", err);
    } finally {
      setGuardandoNuevo(false);
    }
  };

  const materiasFiltradasNuevas = todasMateriasTmp.filter((m) =>
    m.nombre.toLowerCase().includes(busquedaMateriaNueva.toLowerCase())
  );

  const existeMateriaNueva = todasMateriasTmp.some(
    (m) => m.nombre.toLowerCase() === busquedaMateriaNueva.trim().toLowerCase()
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-gray-900">
            <KeyRound className="h-5 w-5 text-gray-400" />
            Credenciales de alumnos
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Cuentas de acceso registradas para el ciclo escolar en curso. Informacion de uso interno.
          </p>
        </div>
        <button
          type="button"
          onClick={abrirAgregar}
          className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          <UserPlus className="h-4 w-4" />
          Agregar alumno
        </button>
      </div>
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide">Nombre</th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide">Cuenta</th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide">Contrasena</th>
              <th className="px-6 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {alumnos.map((alumno, idx) => (
              <tr key={alumno.id_alumno} className={`${idx % 2 === 0 ? "bg-white" : "bg-gray-50/50"} hover:bg-gray-100/60 transition-colors`}>
                <td className="px-6 py-4 text-gray-900">{alumno.nombre}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-gray-500">{alumno.cuenta}</span>
                    <button
                      type="button"
                      onClick={() => copiar(alumno.id_alumno, alumno.cuenta, "cuenta")}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                        copiado === `${alumno.id_alumno}-cuenta`
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {copiado === `${alumno.id_alumno}-cuenta` ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-gray-500">
                      {visibles[alumno.id_alumno] ? alumno.contrasena : "••••••••••"}
                    </span>
                    <button
                      type="button"
                      onClick={() => alternar(alumno.id_alumno)}
                      className="text-gray-300 hover:text-gray-600"
                      aria-label="Mostrar u ocultar contrasena"
                    >
                      {visibles[alumno.id_alumno] ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => copiar(alumno.id_alumno, alumno.contrasena, "contra")}
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium transition-colors ${
                        copiado === `${alumno.id_alumno}-contra`
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {copiado === `${alumno.id_alumno}-contra` ? (
                        <Check className="h-3 w-3" />
                      ) : (
                        <Copy className="h-3 w-3" />
                      )}
                    </button>
                  </div>
                </td>
                <td className="px-6 py-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => abrirMaterias(alumno)}
                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
                    >
                      <BookOpen className="h-3 w-3" />
                      Asignar materias
                    </button>
                    <button
                      type="button"
                      onClick={() => abrirEditar(alumno)}
                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
                    >
                      <Pencil className="h-3 w-3" />
                      Editar
                    </button>
                    <button
                      type="button"
                      onClick={() => setEliminando(alumno)}
                      className="inline-flex items-center gap-1 rounded-full bg-red-50 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-100"
                    >
                      <Trash2 className="h-3 w-3" />
                      Eliminar
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Editar datos del alumno</h3>
              <button
                type="button"
                onClick={cerrarEditar}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nombre</label>
                <input
                  type="text"
                  value={form.nombre}
                  onChange={(e) => setForm({ ...form, nombre: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Cuenta</label>
                <input
                  type="text"
                  value={form.cuenta}
                  onChange={(e) => setForm({ ...form, cuenta: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Contrasena</label>
                <input
                  type="text"
                  value={form.contrasena}
                  onChange={(e) => setForm({ ...form, contrasena: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={cerrarEditar}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarCambios}
                disabled={guardando || !form.nombre.trim() || !form.cuenta.trim() || !form.contrasena.trim()}
                className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {guardando ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {editandoMaterias && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">
                Asignar materias — {alumnos.find((a) => a.id_alumno === editandoMaterias)?.nombre}
              </h3>
              <button
                type="button"
                onClick={cerrarMaterias}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="relative mb-4">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar materia..."
                value={busquedaMateria}
                onChange={(e) => setBusquedaMateria(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
              />
            </div>

            {busquedaMateria.trim() && !existeMateria && (
              <button
                type="button"
                onClick={crearYAsignarMateria}
                className="mb-3 w-full rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
              >
                + Crear materia "{busquedaMateria.trim()}" y asignarla
              </button>
            )}

            <div className="max-h-64 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3">
              {materiasFiltradas.length === 0 ? (
                <p className="text-sm text-gray-400">
                  {busquedaMateria ? "No se encontraron materias." : "No hay materias disponibles."}
                </p>
              ) : (
                <div className="space-y-1">
                  {materiasFiltradas.map((m) => (
                    <label
                      key={m.id_materia}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                        materiasSeleccionadas.includes(m.id_materia)
                          ? "bg-blue-50 text-blue-900"
                          : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={materiasSeleccionadas.includes(m.id_materia)}
                        onChange={() => toggleMateria(m.id_materia)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      {m.nombre}
                    </label>
                  ))}
                </div>
              )}
            </div>

            <p className="mt-2 text-xs text-gray-400">
              {materiasSeleccionadas.length} materia(s) asignada(s)
            </p>

            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={cerrarMaterias}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarMaterias}
                disabled={guardandoMaterias}
                className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {guardandoMaterias ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {agregando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Agregar nuevo alumno</h3>
              <button
                type="button"
                onClick={cerrarAgregar}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nombre</label>
                <input
                  type="text"
                  value={formNuevoAlumno.nombre}
                  onChange={(e) => setFormNuevoAlumno({ ...formNuevoAlumno, nombre: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="Nombre completo"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Cuenta</label>
                <input
                  type="text"
                  value={formNuevoAlumno.cuenta}
                  onChange={(e) => setFormNuevoAlumno({ ...formNuevoAlumno, cuenta: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="Usuario de acceso"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Contrasena</label>
                <input
                  type="text"
                  value={formNuevoAlumno.contrasena}
                  onChange={(e) => setFormNuevoAlumno({ ...formNuevoAlumno, contrasena: e.target.value })}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                  placeholder="Contrasena de acceso"
                />
              </div>
            </div>

            <div className="mt-5">
              <label className="mb-2 block text-sm font-medium text-gray-700">Materias (opcional)</label>
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
                <input
                  type="text"
                  placeholder="Buscar materia..."
                  value={busquedaMateriaNueva}
                  onChange={(e) => setBusquedaMateriaNueva(e.target.value)}
                  className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
                />
              </div>

              {busquedaMateriaNueva.trim() && !existeMateriaNueva && (
                <button
                  type="button"
                  onClick={crearMateriaNueva}
                  className="mb-3 w-full rounded-xl border border-dashed border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
                >
                  + Crear materia "{busquedaMateriaNueva.trim()}" y asignarla
                </button>
              )}

              <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3">
                {materiasFiltradasNuevas.length === 0 ? (
                  <p className="text-sm text-gray-400">
                    {busquedaMateriaNueva ? "No se encontraron materias." : "No hay materias disponibles."}
                  </p>
                ) : (
                  <div className="space-y-1">
                    {materiasFiltradasNuevas.map((m) => (
                      <label
                        key={m.id_materia}
                        className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          materiasNuevas.includes(m.id_materia)
                            ? "bg-blue-50 text-blue-900"
                            : "text-gray-700 hover:bg-gray-100"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={materiasNuevas.includes(m.id_materia)}
                          onChange={() => toggleMateriaNueva(m.id_materia)}
                          className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        {m.nombre}
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {materiasNuevas.length > 0 && (
                <p className="mt-2 text-xs text-gray-400">
                  {materiasNuevas.length} materia(s) seleccionada(s)
                </p>
              )}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={cerrarAgregar}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarNuevoAlumno}
                disabled={guardandoNuevo}
                className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {guardandoNuevo ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}

      {eliminando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Eliminar alumno</h3>
              <button
                type="button"
                onClick={() => setEliminando(null)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600">
              Se eliminara a <span className="font-medium">{eliminando.nombre}</span> junto con
              todo su avance, calificaciones e inscripciones. Esta accion no se puede deshacer.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEliminando(null)}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarEliminacion}
                disabled={guardandoEliminacion}
                className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {guardandoEliminacion && <Loader2 className="h-4 w-4 animate-spin" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast mensaje={exito} onclose={() => setExito(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Vista 2: Registro semanal (multi-materia)                          */
/* ------------------------------------------------------------------ */

function VistaRegistro({ alumnos, materias, inscripciones, progreso, onRegistrar, onRegistrarLote }) {
  const [alumnoId, setAlumnoId] = useState("");
  const [materiasIds, setMateriasIds] = useState([]);
  const [hito, setHito] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  const materiasDisponibles = useMemo(() => {
    return inscripciones
      .filter((i) => i.id_alumno === Number(alumnoId))
      .map((i) => {
        const materia = materias.find((m) => m.id_materia === i.id_materia);
        return {
          id_alumno: i.id_alumno,
          id_materia: i.id_materia,
          nombre: materia?.nombre ?? "Materia sin registrar",
        };
      });
  }, [alumnoId, inscripciones, materias]);

  const manejarAlumno = (valor) => {
    setAlumnoId(valor);
    setMateriasIds([]);
    setHito("");
  };

  const toggleMateria = (idMateria) => {
    setMateriasIds((prev) =>
      prev.includes(idMateria) ? prev.filter((id) => id !== idMateria) : [...prev, idMateria]
    );
  };

  const seleccionarTodas = () => {
    setMateriasIds(materiasDisponibles.map((m) => m.id_materia));
  };

  const limpiarSeleccion = () => {
    setMateriasIds([]);
  };

  const todasSeleccionadas = materiasDisponibles.length > 0 && materiasIds.length === materiasDisponibles.length;

  const manejarRegistro = async () => {
    if (!alumnoId || materiasIds.length === 0 || !hito) return;
    setGuardando(true);
    if (materiasIds.length === 1) {
      await onRegistrar(Number(alumnoId), materiasIds[0], hito);
    } else {
      await onRegistrarLote(Number(alumnoId), hito, materiasIds);
    }
    setGuardando(false);
    setMensaje(`${materiasIds.length} materia(s) registrada(s) correctamente.`);
    setMateriasIds([]);
    setHito("");
  };

  const alumnoSeleccionado = alumnos.find((a) => a.id_alumno === Number(alumnoId));

  const campoSelect =
    "w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-300";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-gray-900">Registro semanal</h2>
        <p className="mt-1 text-sm text-gray-500">
          Selecciona al alumno, las materias correspondientes y el hito a evaluar para registrar su avance.
        </p>
      </div>

      <div className="space-y-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Alumno</label>
          <select value={alumnoId} onChange={(e) => manejarAlumno(e.target.value)} className={campoSelect}>
            <option value="">Selecciona un alumno</option>
            {alumnos.map((a) => (
              <option key={a.id_alumno} value={a.id_alumno}>
                {a.nombre}
              </option>
            ))}
          </select>
        </div>

        {alumnoId ? (
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-gray-700">Materias</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={seleccionarTodas}
                  disabled={todasSeleccionadas}
                  className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:text-gray-300"
                >
                  Seleccionar todas
                </button>
                <span className="text-gray-300">|</span>
                <button
                  type="button"
                  onClick={limpiarSeleccion}
                  disabled={materiasIds.length === 0}
                  className="text-xs font-medium text-gray-500 hover:text-gray-700 disabled:text-gray-300"
                >
                  Limpiar
                </button>
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto rounded-xl border border-gray-200 bg-gray-50 p-3">
              {materiasDisponibles.length === 0 ? (
                <p className="text-sm text-gray-400">Este alumno no tiene materias asignadas.</p>
              ) : (
                <div className="space-y-1">
                  {materiasDisponibles.map((m) => (
                    <label
                      key={m.id_materia}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                        materiasIds.includes(m.id_materia) ? "bg-blue-50 text-blue-900" : "text-gray-700 hover:bg-gray-100"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={materiasIds.includes(m.id_materia)}
                        onChange={() => toggleMateria(m.id_materia)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      {m.nombre}
                    </label>
                  ))}
                </div>
              )}
            </div>
            {materiasIds.length > 0 && (
              <p className="mt-1.5 text-xs text-gray-400">{materiasIds.length} materia(s) seleccionada(s)</p>
            )}
          </div>
        ) : null}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Hito</label>
          <select
            value={hito}
            onChange={(e) => setHito(e.target.value)}
            disabled={materiasIds.length === 0}
            className={campoSelect}
          >
            <option value="">
              {materiasIds.length > 0 ? "Selecciona un hito" : "Primero selecciona las materias"}
            </option>
            {HITOS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={manejarRegistro}
          disabled={!alumnoId || materiasIds.length === 0 || !hito || guardando}
          className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
        >
          {guardando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Registrar avance
        </button>
      </div>

      {alumnoSeleccionado ? (
        <p className="text-xs text-gray-400">
          Registrando para {alumnoSeleccionado.nombre}
          {hito ? ` — hito ${hito}` : ""}
        </p>
      ) : null}

      <Toast mensaje={mensaje} onclose={() => setMensaje(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Vista 3: Avance individual                                         */
/* ------------------------------------------------------------------ */

function VistaAvance({ alumnos, materias, inscripciones, progreso, notasMateria }) {
  const [alumnoId, setAlumnoId] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [hitoSeleccionado, setHitoSeleccionado] = useState("todos");
  const [hitoDesde, setHitoDesde] = useState(HITOS[0]);
  const [hitoHasta, setHitoHasta] = useState(HITOS[HITOS.length - 1]);

  // si solo hay un alumno visible (padre), entra directo a su hijo
  useEffect(() => {
    if (!alumnoId && alumnos.length === 1) {
      setAlumnoId(String(alumnos[0].id_alumno));
    }
  }, [alumnos, alumnoId]);

  const datos = useMemo(() => {
    if (!alumnoId) return [];
    return inscripciones
      .filter((i) => i.id_alumno === Number(alumnoId))
      .map((i) => {
        const materia = materias.find((m) => m.id_materia === i.id_materia);
          const hitos = HITOS.map((h) => {
            const registro = progreso.find(
              (p) => p.id_alumno === i.id_alumno && p.id_materia === i.id_materia && p.hito === h
            );
            return {
              hito: h,
              cumplio: !!registro?.cumplio,
              fecha_registro: registro?.fecha_registro,
              nota: registro?.calificacion ?? null,
              fecha_entrega: registro?.fecha_entrega ?? null,
              comentario: registro?.comentario ?? null,
              sincronizado_en: registro?.sincronizado_en ?? null,
            };
          });
        return { materia, hitos };
      });
  }, [alumnoId, inscripciones, materias, progreso]);

  const filtrarHitos = (hitos) => {
    let resultado = hitos;
    if (hitoSeleccionado === "rango") {
      const iDesde = HITOS.indexOf(hitoDesde);
      const iHasta = HITOS.indexOf(hitoHasta);
      const [lo, hi] = iDesde <= iHasta ? [iDesde, iHasta] : [iHasta, iDesde];
      resultado = resultado.filter((h) => {
        const i = HITOS.indexOf(h.hito);
        return i >= lo && i <= hi;
      });
    } else if (hitoSeleccionado !== "todos") {
      resultado = resultado.filter((h) => h.hito === hitoSeleccionado);
    }
    if (filtro === "entregados") resultado = resultado.filter((h) => h.cumplio);
    if (filtro === "pendientes") resultado = resultado.filter((h) => !h.cumplio);
    return resultado;
  };

  const opciones = [
    { id: "todos", nombre: "Todos" },
    { id: "entregados", nombre: "Entregados" },
    { id: "pendientes", nombre: "Pendientes" },
  ];

  const alumnoNombre = alumnos.find((a) => a.id_alumno === Number(alumnoId))?.nombre ?? "";

  const descargarPDF = () => {
    if (!alumnoId || datos.length === 0) return;
    generarPDFAvance({ alumnoNombre, datos, filtro, hitoSeleccionado, hitoDesde, hitoHasta });
  };

  const descargarExcel = () => {
    if (!alumnoId || datos.length === 0) return;
    generarExcelAvance({ alumnoNombre, datos, filtro, hitoSeleccionado, hitoDesde, hitoHasta });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-gray-900">Avance individual</h2>
        <p className="mt-1 text-sm text-gray-500">
          Consulta el avance de un alumno especifico, materia por materia.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <select
            value={alumnoId}
            onChange={(e) => setAlumnoId(e.target.value)}
            className="w-full rounded-full border border-gray-200 bg-gray-50 py-2.5 pl-10 pr-4 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
          >
            <option value="">Buscar alumno</option>
            {alumnos.map((a) => (
              <option key={a.id_alumno} value={a.id_alumno}>
                {a.nombre}
              </option>
            ))}
          </select>
        </div>

        <select
          value={hitoSeleccionado}
          onChange={(e) => setHitoSeleccionado(e.target.value)}
          className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
        >
          <option value="todos">Todos los hitos</option>
          <option value="rango">Rango de hitos</option>
          {HITOS.map((h) => (
            <option key={h} value={h}>
              Hito {h}
            </option>
          ))}
        </select>

        {hitoSeleccionado === "rango" && (
          <>
            <select
              value={hitoDesde}
              onChange={(e) => setHitoDesde(e.target.value)}
              className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="" disabled>Desde</option>
              {HITOS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
            <select
              value={hitoHasta}
              onChange={(e) => setHitoHasta(e.target.value)}
              className="rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            >
              <option value="" disabled>Hasta</option>
              {HITOS.map((h) => (
                <option key={h} value={h}>
                  {h}
                </option>
              ))}
            </select>
          </>
        )}

        <div className="inline-flex items-center rounded-full bg-gray-100 p-1">
          {opciones.map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setFiltro(o.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                filtro === o.id ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {o.nombre}
            </button>
          ))}
        </div>

        {alumnoId && datos.length > 0 && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={descargarPDF}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-3.5 w-3.5" />
              PDF
            </button>
            <button
              type="button"
              onClick={descargarExcel}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-3.5 w-3.5" />
              Excel
            </button>
          </div>
        )}
      </div>

      {!alumnoId ? (
        <p className="rounded-2xl border border-dashed border-gray-200 px-4 py-10 text-center text-sm text-gray-400">
          Selecciona un alumno para ver su avance.
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {datos.map(({ materia, hitos }) => {
            const hitosFiltrados = filtrarHitos(hitos);
            const global = notasMateria?.find(
              (n) =>
                n.id_alumno === Number(alumnoId) &&
                n.id_materia === materia?.id_materia
            );
            return (
              <div key={materia?.id_materia} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                    <BookOpen className="h-4 w-4 text-gray-400" />
                    {materia?.nombre}
                  </h3>
                  {global?.calificacion_global != null && (
                    <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                      Global: {Number(global.calificacion_global).toFixed(1)}
                    </span>
                  )}
                </div>
                {hitosFiltrados.length === 0 ? (
                  <p className="text-sm text-gray-400">No hay hitos en esta categoria.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {hitosFiltrados.map((h) => (
                      <TooltipFlotante
                        key={h.hito}
                        contenido={
                          <ContenidoEvidencia
                            base={`Hito ${h.hito}`}
                            nota={h.nota}
                            fechaEntrega={h.fecha_entrega}
                            comentario={h.comentario}
                            sincronizado={h.sincronizado_en}
                          />
                        }
                      >
                        <div className="flex items-center gap-1.5 rounded-full border border-gray-100 bg-gray-50 px-2.5 py-1">
                          <span className="text-xs font-medium text-gray-500">{h.hito}</span>
                          {h.nota != null && (
                            <span className="text-xs font-semibold text-blue-600">{h.nota}</span>
                          )}
                          <StatusChip entregado={h.cumplio} />
                        </div>
                      </TooltipFlotante>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Vista: Auditoria (bitacora de sync + registros con evidencia)      */
/* ------------------------------------------------------------------ */

function VistaAuditoria({ alumnos, materias, progreso, bitacora }) {
  const [filtroAlumno, setFiltroAlumno] = useState("");
  const [filtroMateria, setFiltroMateria] = useState("");
  const [filtroOrigen, setFiltroOrigen] = useState("todos");
  const [filtroHito, setFiltroHito] = useState("todos");
  const [busqueda, setBusqueda] = useState("");

  const nombreAlumno = useCallback(
    (id) => alumnos.find((a) => a.id_alumno === id)?.nombre ?? `Alumno ${id}`,
    [alumnos]
  );
  const nombreMateria = useCallback(
    (id) => materias.find((m) => m.id_materia === id)?.nombre ?? `Materia ${id}`,
    [materias]
  );

  const registros = useMemo(() => {
    const q = normalizarTexto(busqueda);
    return progreso
      .filter((p) => {
        if (filtroAlumno && p.id_alumno !== Number(filtroAlumno)) return false;
        if (filtroMateria && p.id_materia !== Number(filtroMateria)) return false;
        if (filtroOrigen !== "todos" && (p.origen ?? "manual") !== filtroOrigen) return false;
        if (filtroHito !== "todos" && p.hito !== filtroHito) return false;
        if (q) {
          const heno = normalizarTexto(
            `${nombreAlumno(p.id_alumno)} ${nombreMateria(p.id_materia)} ${p.hito} ${
              p.comentario ?? ""
            } ${p.actividad_canvas ?? ""}`
          );
          if (!heno.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const na = nombreAlumno(a.id_alumno).localeCompare(nombreAlumno(b.id_alumno));
        if (na !== 0) return na;
        return String(a.hito).localeCompare(String(b.hito));
      });
  }, [progreso, filtroAlumno, filtroMateria, filtroOrigen, filtroHito, busqueda, nombreAlumno, nombreMateria]);

  const alumnosIds = useMemo(() => [...new Set(progreso.map((p) => p.id_alumno))], [progreso]);

  const campoSelect =
    "rounded-full border border-gray-200 bg-gray-50 px-3.5 py-2 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100";

  const fmt = (iso) => {
    if (!iso) return "-";
    try {
      return new Date(iso).toLocaleString("es-MX", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "-";
    }
  };

  const fmtDuracion = (ms) => (ms != null ? `${(ms / 1000).toFixed(1)} s` : "-");

  const totalConOrigen = registros.filter((r) => (r.origen ?? "manual") === "canvas").length;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-gray-900">Auditoria</h2>
        <p className="mt-1 text-sm text-gray-500">
          Historial de sincronizaciones con Canvas y evidencia de cada registro: entrega, comentario y origen.
        </p>
      </div>

      {/* Bitacora de sincronizaciones */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
          <History className="h-4 w-4 text-blue-600" />
          Historial de sincronizaciones
        </h3>
        {!bitacora || bitacora.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
            Aun no hay sincronizaciones registradas. Presiona "Sincronizar" en la Matriz general.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-2 py-2 font-medium">Fecha</th>
                  <th className="px-2 py-2 font-medium">Duracion</th>
                  <th className="px-2 py-2 font-medium">Alumnos</th>
                  <th className="px-2 py-2 font-medium">Hitos</th>
                  <th className="px-2 py-2 font-medium">Califs.</th>
                  <th className="px-2 py-2 font-medium">Globales</th>
                  <th className="px-2 py-2 font-medium">Detalle</th>
                </tr>
              </thead>
              <tbody>
                {bitacora.map((b) => {
                  const errores = Array.isArray(b.errores) ? b.errores : [];
                  const sinMatch = Array.isArray(b.actividades_sin_match)
                    ? b.actividades_sin_match
                    : [];
                  const cursosSin = Array.isArray(b.cursos_sin_match) ? b.cursos_sin_match : [];
                  const materiasNuevas = Array.isArray(b.materias_creadas_nombres)
                    ? b.materias_creadas_nombres
                    : [];
                  const conError = (b.alumnos_error ?? 0) > 0 || errores.length > 0;
                  return (
                    <tr key={b.id} className="border-b border-gray-50 text-gray-700">
                      <td className="whitespace-nowrap px-2 py-2">{fmt(b.iniciado_en)}</td>
                      <td className="whitespace-nowrap px-2 py-2">{fmtDuracion(b.duracion_ms)}</td>
                      <td className="whitespace-nowrap px-2 py-2">
                        <span className="font-medium text-gray-900">{b.alumnos_ok ?? 0}</span>
                        {conError && (
                          <span className="ml-1 text-red-500">({b.alumnos_error} err.)</span>
                        )}
                      </td>
                      <td className="px-2 py-2">{b.hitos_marcados ?? 0}</td>
                      <td className="px-2 py-2">{b.calificaciones ?? 0}</td>
                      <td className="px-2 py-2">{b.global_actualizadas ?? 0}</td>
                      <td className="px-2 py-2">
                        {errores.length === 0 && sinMatch.length === 0 && cursosSin.length === 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-600">
                            <CheckCircle2 className="h-3.5 w-3.5" /> Limpia
                          </span>
                        ) : (
                          <details className="text-xs text-gray-500">
                            <summary className="cursor-pointer font-medium text-gray-600">
                              Ver ({errores.length + sinMatch.length + cursosSin.length})
                            </summary>
                            <ul className="mt-1 max-w-md list-inside list-disc space-y-0.5 pl-1">
                              {errores.map((e, i) => (
                                <li key={`e${i}`} className="text-red-600">
                                  {e.alumno}: {e.error}
                                </li>
                              ))}
                              {cursosSin.map((c, i) => (
                                <li key={`c${i}`}>Curso sin materia: {c}</li>
                              ))}
                              {sinMatch.map((s, i) => (
                                <li key={`s${i}`}>Sin hito: {s}</li>
                              ))}
                            </ul>
                          </details>
                        )}
                        {(b.materias_creadas ?? 0) > 0 && (
                          <div className="mt-0.5 text-xs text-emerald-600">
                            {b.materias_creadas} materia
                            {(b.materias_creadas ?? 0) > 1 ? "s" : ""} nueva
                            {(b.materias_creadas ?? 0) > 1 ? "s" : ""} ({b.inscripciones_creadas ?? 0}{" "}
                            insc.)
                            {materiasNuevas.length > 0 && (
                              <span className="text-gray-500">: {materiasNuevas.join(", ")}</span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Registros con evidencia */}
      <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <FileSearch className="h-4 w-4 text-blue-600" />
            Registros con evidencia
            <span className="font-normal text-gray-400">({registros.length})</span>
          </h3>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar alumno, materia, comentario..."
              className="w-64 rounded-full border border-gray-200 bg-gray-50 py-2 pl-9 pr-4 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100"
            />
          </div>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <select value={filtroAlumno} onChange={(e) => setFiltroAlumno(e.target.value)} className={campoSelect}>
            <option value="">Todos los alumnos</option>
            {alumnosIds.map((id) => (
              <option key={id} value={id}>
                {nombreAlumno(id)}
              </option>
            ))}
          </select>
          <select value={filtroMateria} onChange={(e) => setFiltroMateria(e.target.value)} className={campoSelect}>
            <option value="">Todas las materias</option>
            {materias.map((m) => (
              <option key={m.id_materia} value={m.id_materia}>
                {m.nombre}
              </option>
            ))}
          </select>
          <select value={filtroHito} onChange={(e) => setFiltroHito(e.target.value)} className={campoSelect}>
            <option value="todos">Todos los hitos</option>
            {HITOS.map((h) => (
              <option key={h} value={h}>
                Hito {h}
              </option>
            ))}
          </select>
          <select value={filtroOrigen} onChange={(e) => setFiltroOrigen(e.target.value)} className={campoSelect}>
            <option value="todos">Todos los origenes</option>
            <option value="canvas">Canvas</option>
            <option value="manual">Manual</option>
          </select>
          <span className="self-center text-xs text-gray-400">
            {totalConOrigen} de {registros.length} vienen de Canvas
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-xs uppercase tracking-wide text-gray-400">
                <th className="px-2 py-2 font-medium">Alumno</th>
                <th className="px-2 py-2 font-medium">Materia</th>
                <th className="px-2 py-2 font-medium">Hito</th>
                <th className="px-2 py-2 font-medium">Estado</th>
                <th className="px-2 py-2 font-medium">Calif.</th>
                <th className="px-2 py-2 font-medium">F. entrega</th>
                <th className="px-2 py-2 font-medium">Comentario</th>
                <th className="px-2 py-2 font-medium">Actividad en Canvas</th>
                <th className="px-2 py-2 font-medium">Origen</th>
                <th className="px-2 py-2 font-medium">Sincronizado</th>
              </tr>
            </thead>
            <tbody>
              {registros.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-2 py-8 text-center text-sm text-gray-400">
                    No hay registros que coincidan con los filtros.
                  </td>
                </tr>
              ) : (
                registros.map((p) => {
                  const origen = p.origen ?? "manual";
                  const comentario = p.comentario ?? null;
                  return (
                    <tr key={p.id_progreso} className="border-b border-gray-50 text-gray-700 hover:bg-gray-50">
                      <td className="whitespace-nowrap px-2 py-2 text-gray-900">
                        {nombreAlumno(p.id_alumno)}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">{nombreMateria(p.id_materia)}</td>
                      <td className="whitespace-nowrap px-2 py-2 font-medium">{p.hito}</td>
                      <td className="px-2 py-2">
                        {p.cumplio ? (
                          <CheckCircle2 className="h-4 w-4 text-blue-600" />
                        ) : (
                          <span className="text-xs text-gray-400">Pendiente</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        {p.calificacion != null ? (
                          <span className="font-semibold text-blue-700">{p.calificacion}</span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2 py-2">{fmt(p.fecha_entrega)}</td>
                      <td className="max-w-xs px-2 py-2">
                        {comentario ? (
                          <TooltipFlotante
                            contenido={
                              <div>
                                <p className="text-xs font-semibold text-gray-900">Comentario</p>
                                <p className="mt-1 max-h-40 overflow-y-auto whitespace-pre-line text-xs leading-relaxed text-gray-600">
                                  {comentario}
                                </p>
                              </div>
                            }
                          >
                            <span className="block truncate text-gray-600">
                              {comentario.replace(/\n+/g, " | ")}
                            </span>
                          </TooltipFlotante>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="max-w-xs px-2 py-2">
                        {p.actividad_canvas ? (
                          <TooltipFlotante
                            contenido={
                              <div>
                                <p className="text-xs font-semibold text-gray-900">Actividad en Canvas</p>
                                <p className="mt-1 text-xs leading-relaxed text-gray-600">
                                  {p.actividad_canvas}
                                </p>
                              </div>
                            }
                          >
                            <span className="block truncate text-gray-500">
                              {p.actividad_canvas}
                            </span>
                          </TooltipFlotante>
                        ) : (
                          <span className="text-gray-300">-</span>
                        )}
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                            origen === "canvas"
                              ? "bg-blue-50 text-blue-700"
                              : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {origen === "canvas" ? "Canvas" : "Manual"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-2 py-2 text-gray-500">
                        {fmt(p.sincronizado_en)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
        {registros.length > 300 && (
          <p className="mt-3 text-xs text-gray-400">
            Mostrando {registros.length} registros. Usa los filtros para reducir la lista.
          </p>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Vista 4: Matriz general                                             */
/* ------------------------------------------------------------------ */

function ReporteSync({ reporte, onCerrar }) {
  const conErrores = (reporte.errores || []).length > 0;
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Sincronizacion con Canvas</h3>
          <p className="mt-1 text-sm text-gray-600">
            {reporte.alumnos_ok ?? 0} alumnos sincronizados
            {(reporte.alumnos_error ?? 0) > 0 && (
              <span className="text-red-500">, {reporte.alumnos_error} con error</span>
            )}
            {" · "}
            {reporte.hitos_marcados ?? 0} hitos marcados
            {" · "}
            {reporte.calificaciones ?? 0} calificaciones de actividad
            {" · "}
            {reporte.global_actualizadas ?? 0} calificaciones globales
            {(reporte.materias_creadas ?? 0) > 0 && (
              <span className="text-emerald-600">
                {" · "}
                {reporte.materias_creadas} materias nuevas
              </span>
            )}
            {(reporte.inscripciones_creadas ?? 0) > 0 && (
              <span className="text-emerald-600">
                {" · "}
                {reporte.inscripciones_creadas} inscripciones nuevas
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={onCerrar}
          className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {(reporte.errores || []).length > 0 && (
        <ul className="mt-3 space-y-1 rounded-xl bg-red-50 p-3 text-xs text-red-700">
          {reporte.errores.map((e, i) => (
            <li key={i}>
              <span className="font-semibold">{e.alumno}:</span> {e.error}
            </li>
          ))}
        </ul>
      )}

      {(reporte.materias_creadas_nombres || []).length > 0 && (
        <div className="mt-3 text-xs text-gray-500">
          <span className="font-medium text-emerald-700">Materias nuevas creadas:</span>{" "}
          {reporte.materias_creadas_nombres.join(", ")}
        </div>
      )}

      {(reporte.cursos_sin_match || []).length > 0 && (
        <div className="mt-3 text-xs text-gray-500">
          <span className="font-medium text-gray-700">Cursos sin materia asignada:</span>{" "}
          {reporte.cursos_sin_match.join(", ")}
        </div>
      )}

      {(reporte.actividades_sin_match || []).length > 0 && (
        <details className="mt-2 text-xs text-gray-500">
          <summary className="cursor-pointer font-medium text-gray-700">
            Actividades sin hito asignado ({reporte.actividades_sin_match.length})
          </summary>
          <ul className="mt-1 list-inside list-disc pl-2">
            {reporte.actividades_sin_match.slice(0, 40).map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function VistaMatriz({ alumnos, materias, inscripciones, progreso, notasMateria, onActualizar, onRegistrar, soloLectura = false }) {
  const [eliminando, setEliminando] = useState(null);
  const [registrando, setRegistrando] = useState(null);
  const [exito, setExito] = useState(null);
  const [guardandoEliminacion, setGuardandoEliminacion] = useState(false);
  const [guardandoRegistro, setGuardandoRegistro] = useState(false);
  const [sincronizando, setSincronizando] = useState(false);
  const [reporte, setReporte] = useState(null);

  const grupos = useMemo(() => {
    return alumnos.map((alumno) => {
      const filas = inscripciones
        .filter((i) => i.id_alumno === alumno.id_alumno)
        .map((i) => {
          const materia = materias.find((m) => m.id_materia === i.id_materia);
          const celdas = HITOS.map((h) => {
            const registro = progreso.find(
              (p) => p.id_alumno === i.id_alumno && p.id_materia === i.id_materia && p.hito === h
            );
            return {
              cumplio: !!registro?.cumplio,
              id: registro?.id_progreso ?? null,
              nota: registro?.calificacion ?? null,
              fecha_entrega: registro?.fecha_entrega ?? null,
              comentario: registro?.comentario ?? null,
              sincronizado_en: registro?.sincronizado_en ?? null,
              hito: h,
              id_alumno: i.id_alumno,
              id_materia: i.id_materia,
            };
          });
          return { id_alumno: i.id_alumno, id_materia: i.id_materia, materiaNombre: materia?.nombre ?? "Materia", celdas };
        });

      // alumno en riesgo: alguna materia con calificacion global < 70
      const enRiesgo = inscripciones.some(
        (i) =>
          i.id_alumno === alumno.id_alumno &&
          globalEnRiesgo(
            notasMateria?.find(
              (n) => n.id_alumno === i.id_alumno && n.id_materia === i.id_materia
            )?.calificacion_global
          )
      );

      return { alumno, filas, enRiesgo };
    });
  }, [alumnos, materias, inscripciones, progreso, notasMateria]);

  const sincronizar = async () => {
    setSincronizando(true);
    setReporte(null);
    try {
      const r = await syncCanvas();
      setReporte(r);
      await onActualizar();
      setExito(
        `Canvas: ${r.hitos_marcados} hitos marcados, ${r.calificaciones} calificaciones.` +
          ((r.materias_creadas ?? 0) > 0 ? ` ${r.materias_creadas} materias nuevas.` : "") +
          ((r.inscripciones_creadas ?? 0) > 0
            ? ` ${r.inscripciones_creadas} inscripciones nuevas.`
            : "")
      );
    } catch (err) {
      setReporte({ errores: [{ alumno: "Sincronizacion", error: err.message }] });
    } finally {
      setSincronizando(false);
    }
  };

  const confirmarEliminacion = async () => {
    if (!eliminando) return;
    setGuardandoEliminacion(true);
    try {
      await deleteProgreso(eliminando.id);
      await onActualizar();
      setExito("Registro eliminado correctamente.");
      setEliminando(null);
    } catch (err) {
      console.error("Error al eliminar:", err);
    } finally {
      setGuardandoEliminacion(false);
    }
  };

  const confirmarRegistro = async () => {
    if (!registrando) return;
    setGuardandoRegistro(true);
    try {
      await onRegistrar(registrando.id_alumno, registrando.id_materia, registrando.hito);
      setExito("Hito registrado correctamente.");
      setRegistrando(null);
    } catch (err) {
      console.error("Error al registrar:", err);
    } finally {
      setGuardandoRegistro(false);
    }
  };

  const descargarMatrizPDF = () => {
    if (grupos.length === 0) return;
    generarPDFMatriz({ grupos, hitos: HITOS });
  };

  const descargarMatrizExcel = () => {
    if (grupos.length === 0) return;
    generarExcelMatriz({ grupos, hitos: HITOS });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">Matriz general</h2>
          <p className="mt-1 text-sm text-gray-500">
            Cruce consolidado de alumnos, materias y hitos a lo largo del ciclo escolar.
          </p>
        </div>
        {grupos.length > 0 && (
          <div className="flex gap-2">
            {!soloLectura && (
              <button
                type="button"
                onClick={sincronizar}
                disabled={sincronizando}
                className="inline-flex items-center gap-1.5 rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-300"
                title="Entrar a Canvas y revisar entregas/calificaciones"
              >
                {sincronizando ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {sincronizando ? "Sincronizando..." : "Sincronizar"}
              </button>
            )}
            <button
              type="button"
              onClick={descargarMatrizPDF}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-3.5 w-3.5" />
              PDF
            </button>
            <button
              type="button"
              onClick={descargarMatrizExcel}
              className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              <Download className="h-3.5 w-3.5" />
              Excel
            </button>
          </div>
        )}
      </div>

      {reporte && <ReporteSync reporte={reporte} onCerrar={() => setReporte(null)} />}

      <div
        className="max-h-[70vh] overflow-auto rounded-2xl border border-gray-100 bg-white shadow-sm"
      >
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 w-44 border-b border-r border-gray-100 bg-gray-50 px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500 shadow-[inset_-1px_0_0_#f3f4f6,0_2px_4px_rgba(0,0,0,0.06)]">
                Alumno / Materia
              </th>
              {HITOS.map((h) => (
                <th
                  key={h}
                  className="sticky top-0 z-20 border-b border-gray-100 bg-gray-50 px-2 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500 shadow-[0_2px_4px_rgba(0,0,0,0.06)]"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grupos.map((grupo, grupoIdx) => {
              const bg = grupo.enRiesgo
                ? "bg-red-50"
                : grupoIdx % 2 === 0
                  ? "bg-white"
                  : "bg-blue-50/40";
              const bgHeader = grupo.enRiesgo ? "bg-red-100" : "bg-gray-50";
              const textoHeader = grupo.enRiesgo ? "text-red-800" : "text-gray-900";
              return (
                <Fragment key={grupo.alumno.id_alumno}>
                  <tr>
                    <td
                      colSpan={HITOS.length + 1}
                      className={`sticky left-0 z-10 border-b border-gray-100 px-4 py-2.5 text-sm font-semibold ${bgHeader} ${textoHeader}`}
                    >
                      {grupo.alumno.nombre}{" "}
                      <span className="font-normal text-gray-400">cuenta {grupo.alumno.cuenta}</span>
                    </td>
                  </tr>
                  {grupo.filas.map((fila) => (
                    <tr key={`${fila.id_alumno}-${fila.id_materia}`} className={`${bg} hover:brightness-95`}>
                      <td className={`sticky left-0 z-10 border-b border-r border-gray-100 px-3 py-2 pl-4 text-gray-600 ${bg}`}>
                        {fila.materiaNombre}
                      </td>
                      {fila.celdas.map((celda, cIdx) => (
                        <td key={cIdx} className={`border-b border-gray-100 px-2 py-2 text-center ${bg}`}>
                          <Indicador
                            entregado={celda.cumplio}
                            nota={celda.nota}
                            fechaEntrega={celda.fecha_entrega}
                            comentario={celda.comentario}
                            sincronizado={celda.sincronizado_en}
                            onClick={
                              soloLectura
                                ? undefined
                                : celda.cumplio
                                  ? () =>
                                      setEliminando({
                                        id: celda.id,
                                        alumno: grupo.alumno.nombre,
                                        materia: fila.materiaNombre,
                                        hito: celda.hito,
                                      })
                                  : () =>
                                      setRegistrando({
                                        id_alumno: celda.id_alumno,
                                        id_materia: celda.id_materia,
                                        alumno: grupo.alumno.nombre,
                                        materia: fila.materiaNombre,
                                        hito: celda.hito,
                                      })
                            }
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-2">
          <Indicador entregado={true} /> Hito entregado
        </span>
        <span className="flex items-center gap-2">
          <Indicador entregado={false} /> Hito pendiente
        </span>
        <span className="flex items-center gap-2">
          <span className="h-4 w-4 rounded bg-red-100" /> Alumno en riesgo (global &lt; 70)
        </span>
      </div>

      {eliminando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Eliminar registro</h3>
              <button
                type="button"
                onClick={() => setEliminando(null)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Alumno</span>
                <span className="font-medium text-gray-900">{eliminando.alumno}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Materia</span>
                <span className="font-medium text-gray-900">{eliminando.materia}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Hito</span>
                <span className="font-medium text-gray-900">{eliminando.hito}</span>
              </div>
            </div>
            <p className="mt-4 text-xs text-gray-400">Esta accion no se puede deshacer.</p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEliminando(null)}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarEliminacion}
                disabled={guardandoEliminacion}
                className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {guardandoEliminacion ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <X className="h-4 w-4" />
                )}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {registrando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Registrar hito</h3>
              <button
                type="button"
                onClick={() => setRegistrando(null)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Alumno</span>
                <span className="font-medium text-gray-900">{registrando.alumno}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Materia</span>
                <span className="font-medium text-gray-900">{registrando.materia}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Hito</span>
                <span className="font-medium text-gray-900">{registrando.hito}</span>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setRegistrando(null)}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarRegistro}
                disabled={guardandoRegistro}
                className="inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {guardandoRegistro ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Check className="h-4 w-4" />
                )}
                Registrar
              </button>
            </div>
          </div>
        </div>
      )}

      <Toast mensaje={exito} onclose={() => setExito(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Vista 5: Horario escolar                                           */
/* ------------------------------------------------------------------ */

const COLORES_MATERIA = {
  "plataforma": { punto: "#3b82f6", texto: "#1d4ed8" },
  "biología": { punto: "#22c55e", texto: "#15803d" },
  "taller optativo": { punto: "#a855f7", texto: "#7c3aed" },
  "taller optativo - música": { punto: "#ec4899", texto: "#be185d" },
  "música ensamble": { punto: "#f43f5e", texto: "#be123c" },
  "pintura": { punto: "#f59e0b", texto: "#b45309" },
};

const PALETA_FALLA = [
  { punto: "#06b6d4", texto: "#0e7490" },
  { punto: "#8b5cf6", texto: "#6d28d9" },
  { punto: "#10b981", texto: "#047857" },
  { punto: "#f97316", texto: "#c2410c" },
  { punto: "#64748b", texto: "#475569" },
];

function colorParaMateria(nombre) {
  if (!nombre || nombre === "—" || nombre === "AUSENTE") {
    return { punto: "#d1d5db", texto: "#9ca3af" };
  }
  const clave = nombre.toLowerCase().trim();
  if (COLORES_MATERIA[clave]) return COLORES_MATERIA[clave];
  for (const [k, v] of Object.entries(COLORES_MATERIA)) {
    if (clave.includes(k) || k.includes(clave)) return v;
  }
  let hash = 0;
  for (let i = 0; i < clave.length; i++) hash = (hash * 31 + clave.charCodeAt(i)) | 0;
  return PALETA_FALLA[Math.abs(hash) % PALETA_FALLA.length];
}

function NotificacionCambioClase({ notificacion, onCerrar }) {
  const [animState, setAnimState] = useState("entering");

  useEffect(() => {
    if (!notificacion) {
      setAnimState("entering");
      return;
    }
    setAnimState("entering");
    const t1 = setTimeout(() => setAnimState("visible"), 50);
    return () => clearTimeout(t1);
  }, [notificacion]);

  useEffect(() => {
    if (!notificacion || animState !== "visible") return;
    const t = setTimeout(() => {
      setAnimState("exiting");
      setTimeout(onCerrar, 350);
    }, 4000);
    return () => clearTimeout(t);
  }, [notificacion, animState, onCerrar]);

  if (!notificacion && animState !== "exiting") return null;

  return (
    <div className={`fixed left-1/2 top-4 z-[60] -translate-x-1/2 ${animState === "entering" ? "notify-enter" : animState === "exiting" ? "notify-exit" : ""}`}>
      <div className="flex items-center gap-3.5 rounded-[20px] border border-white/40 bg-white/70 px-5 py-3.5 shadow-[0_8px_40px_rgba(0,0,0,0.16)] backdrop-blur-2xl">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-500/10">
          <Calendar className="h-5 w-5 text-blue-600" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
            Horario escolar
          </p>
          <p className="text-sm font-semibold text-gray-900">
            {notificacion?.titulo}
          </p>
          <p className="text-xs text-gray-500">
            {notificacion?.mensaje}
          </p>
        </div>
      </div>
    </div>
  );
}

function VistaHorario({ soloLectura = false }) {
  const [horario, setHorario] = useState(HORARIO_DEFAULT);
  const [cargandoHorario, setCargandoHorario] = useState(true);
  const [editando, setEditando] = useState(false);
  const [celdaEditando, setCeldaEditando] = useState(null);
  const [valorCelda, setValorCelda] = useState("");
  const [exito, setExito] = useState(null);
  const [ahora, setAhora] = useState(() => new Date());
  const [permisoNotif, setPermisoNotif] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );

  useEffect(() => {
    cargarHorario().then((data) => {
      setHorario(data);
      setCargandoHorario(false);
    });
  }, []);

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const estado = useMemo(() => obtenerEstadoActual(), [ahora]);

  const materiaActual = obtenerMateriaActual(horario, estado);

  const pedirPermisoNotif = async () => {
    if (typeof Notification === "undefined") return;
    const perm = await Notification.requestPermission();
    setPermisoNotif(perm);
  };

  const iniciarEdicion = (bloqueIdx, diaIdx) => {
    if (!editando) return;
    setCeldaEditando({ bloqueIdx, diaIdx });
    setValorCelda(horario.grid[bloqueIdx]?.[diaIdx] || "");
  };

  const confirmarCelda = () => {
    if (celdaEditando) {
      const nuevoGrid = horario.grid.map((fila) => [...fila]);
      nuevoGrid[celdaEditando.bloqueIdx][celdaEditando.diaIdx] = valorCelda;
      setHorario({ ...horario, grid: nuevoGrid });
      setCeldaEditando(null);
    }
  };

  const cancelarCelda = () => {
    setCeldaEditando(null);
    setValorCelda("");
  };

  const guardar = async () => {
    await guardarHorario(horario);
    setEditando(false);
    setCeldaEditando(null);
    setExito("Horario guardado correctamente.");
  };

  const restaurar = async () => {
    const def = await restaurarHorario();
    setHorario(def);
    setCeldaEditando(null);
    setExito("Horario restaurado al original.");
  };

  const progresoPct =
    estado.tipo === "enClase"
      ? Math.round(((estado.minutosTotales - estado.minutosRestantes) / estado.minutosTotales) * 100)
      : 0;

  const esFinde = estado.tipo === "finde";
  const reloj = ahora.toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  const diaNombre = estado.diaIdx >= 0 ? DIAS[estado.diaIdx] : "FIN DE SEMANA";

  const tituloActividad =
    estado.tipo === "enClase"
      ? materiaActual || "Sin actividad"
      : estado.tipo === "espera"
        ? "Receso"
        : estado.tipo === "terminado"
          ? "Jornada terminada"
          : "Fin de semana";

  const subtituloActividad =
    estado.tipo === "enClase" && estado.diaIdx >= 0 && estado.bloqueIdx >= 0
      ? `${DIAS[estado.diaIdx]} · ${BLOQUES[estado.bloqueIdx].inicio} – ${BLOQUES[estado.bloqueIdx].fin}`
      : estado.tipo === "espera" && estado.diaIdx >= 0 && estado.bloqueIdx >= 0
        ? `${DIAS[estado.diaIdx]} · Siguiente: ${horario.grid[estado.bloqueIdx]?.[estado.diaIdx] || "—"} (${BLOQUES[estado.bloqueIdx].inicio})`
        : estado.tipo === "terminado" && estado.siguienteDia >= 0
          ? `Mañana ${DIAS[estado.siguienteDia]} · ${horario.grid[0]?.[estado.siguienteDia] || "—"}`
          : diaNombre;

  if (cargandoHorario) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-gray-900">
            <Calendar className="h-5 w-5 text-gray-400" />
            Horario escolar
          </h2>
          <p className="mt-1 text-sm text-gray-500">
            Horario semanal del ciclo escolar en curso. Los cambios se sincronizan con todos los dispositivos.
          </p>
        </div>
        {permisoNotif !== "granted" && permisoNotif !== "denied" && (
          <button
            type="button"
            onClick={pedirPermisoNotif}
            className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-4 py-2 text-xs font-medium text-gray-600 hover:bg-gray-200"
          >
            <Bell className="h-3.5 w-3.5" />
            Activar notificaciones
          </button>
        )}
        {permisoNotif === "granted" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-xs font-medium text-green-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Notificaciones activas
          </span>
        )}
        {permisoNotif === "denied" && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-400">
            <Bell className="h-3.5 w-3.5" />
            Notificaciones bloqueadas
          </span>
        )}
      </div>

      {/* Card: en curso ahora */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 px-6 py-5 text-white">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-widest text-gray-400">En curso ahora</p>
              <p className="mt-1.5 text-2xl font-semibold tracking-tight">{tituloActividad}</p>
              <p className="mt-1 text-sm text-gray-400">{subtituloActividad}</p>
            </div>
            {!esFinde && (
              <div className="text-right">
                <p className="text-3xl font-bold tabular-nums tracking-tight">{reloj}</p>
                <p className="text-xs text-gray-400">{diaNombre}</p>
              </div>
            )}
          </div>

          {estado.tipo === "enClase" && (
            <div className="mt-5">
              <div className="flex items-center justify-between text-xs text-gray-400 mb-1.5">
                <span>Progreso de la clase</span>
                <span>{estado.minutosRestantes} min restantes</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all duration-1000"
                  style={{ width: `${progresoPct}%` }}
                />
              </div>
            </div>
          )}

          {estado.tipo === "espera" && (
            <div className="mt-4 text-sm text-gray-400">
              Siguiente clase en{" "}
              <span className="font-semibold text-white">
                {estado.minutosParaSiguiente} min
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Grid del horario */}
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-6 py-4">
          <p className="text-sm font-medium text-gray-700">Vista semanal</p>
          <div className="flex gap-2">
            {editando ? (
              <>
                <button
                  type="button"
                  onClick={restaurar}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Restaurar
                </button>
                <button
                  type="button"
                  onClick={guardar}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gray-900 px-4 py-1.5 text-xs font-medium text-white hover:bg-gray-800"
                >
                  <Save className="h-3.5 w-3.5" />
                  Guardar
                </button>
              </>
            ) : (
              !soloLectura && (
                <button
                  type="button"
                  onClick={() => setEditando(true)}
                  className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-4 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
                >
                  <Pencil className="h-3.5 w-3.5" />
                  Editar
                </button>
              )
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
                <th className="px-5 py-3 text-xs font-medium uppercase tracking-wide">Hora</th>
                {DIAS.map((d) => (
                  <th
                    key={d}
                    className={`px-5 py-3 text-xs font-medium uppercase tracking-wide ${
                      estado.diaIdx === DIAS.indexOf(d) ? "bg-blue-50 text-blue-700" : ""
                    }`}
                  >
                    {d}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {BLOQUES.map((bloque, bIdx) => (
                <tr
                  key={bloque.inicio}
                  className={bIdx % 2 === 0 ? "bg-white" : "bg-gray-50/50"}
                >
                  <td className="whitespace-nowrap px-5 py-3.5 text-xs font-medium text-gray-500">
                    {bloque.inicio} – {bloque.fin}
                  </td>
                  {DIAS.map((d, dIdx) => {
                    const esActual = estado.tipo === "enClase" && estado.bloqueIdx === bIdx && estado.diaIdx === dIdx;
                    const valor = horario.grid[bIdx]?.[dIdx] || "";
                    const esAusente = valor === "AUSENTE";
                    const editandoEsta = celdaEditando?.bloqueIdx === bIdx && celdaEditando?.diaIdx === dIdx;
                    const color = colorParaMateria(valor);

                    return (
                      <td
                        key={d}
                        onClick={() => iniciarEdicion(bIdx, dIdx)}
                        className={`px-5 py-3.5 text-sm ${
                          editando ? "cursor-pointer hover:bg-blue-50" : ""
                        } ${esActual ? "bg-blue-50/60 ring-1 ring-inset ring-blue-200" : ""}`}
                      >
                        {editandoEsta ? (
                          <input
                            type="text"
                            value={valorCelda}
                            onChange={(e) => setValorCelda(e.target.value)}
                            onBlur={confirmarCelda}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") confirmarCelda();
                              if (e.key === "Escape") cancelarCelda();
                            }}
                            autoFocus
                            className="w-full rounded-lg border border-blue-300 bg-white px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-200"
                          />
                        ) : (
                          <span
                            className={`inline-flex items-center gap-1.5 ${esAusente ? "" : "font-medium"}`}
                            style={esAusente ? {} : { color: color.texto }}
                          >
                            {!esAusente && valor && (
                              <span
                                className="h-2 w-2 shrink-0 rounded-full"
                                style={{ backgroundColor: color.punto }}
                              />
                            )}
                            {esAusente ? (
                              <span className="text-gray-300">{valor || "—"}</span>
                            ) : (
                              <>
                                {valor || "—"}
                                {esActual && (
                                  <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                                )}
                              </>
                            )}
                          </span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {editando && (
          <div className="border-t border-gray-100 px-6 py-3 text-xs text-gray-400">
            Haz clic en cualquier celda para editar el nombre de la materia. Enter para confirmar, Esc para cancelar.
          </div>
        )}
      </div>

      <Toast mensaje={exito} onclose={() => setExito(null)} />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Vista nueva: Usuarios (solo admin)                                 */
/* ------------------------------------------------------------------ */

function VistaUsuarios({ alumnos }) {
  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [form, setForm] = useState({ usuario: "", contrasena: "", rol: "direccion", id_alumno: "" });
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState(null);
  const [cambiando, setCambiando] = useState(null);
  const [nuevaContrasena, setNuevaContrasena] = useState("");
  const miSesion = obtenerSesion();

  const cargar = useCallback(async () => {
    try {
      const lista = await fetchUsuarios();
      setUsuarios(lista);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  const crear = async (e) => {
    e.preventDefault();
    if (!form.usuario.trim() || !form.contrasena) return;
    setGuardando(true);
    setError(null);
    try {
      await createUsuario({
        usuario: form.usuario.trim(),
        contrasena: form.contrasena,
        rol: form.rol,
        id_alumno: form.rol === "padre" && form.id_alumno ? Number(form.id_alumno) : null,
      });
      setForm({ usuario: "", contrasena: "", rol: "direccion", id_alumno: "" });
      await cargar();
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const confirmarEliminacion = async () => {
    if (!eliminando) return;
    setGuardando(true);
    try {
      await deleteUsuario(eliminando.id_usuario);
      setEliminando(null);
      await cargar();
    } catch (err) {
      setError(err.message);
      setEliminando(null);
    } finally {
      setGuardando(false);
    }
  };

  const guardarContrasena = async () => {
    if (!cambiando || !nuevaContrasena) return;
    setGuardando(true);
    try {
      await updateUsuario(cambiando.id_usuario, { contrasena: nuevaContrasena });
      setCambiando(null);
      setNuevaContrasena("");
    } catch (err) {
      setError(err.message);
    } finally {
      setGuardando(false);
    }
  };

  const nombreAlumno = (id) =>
    alumnos.find((a) => a.id_alumno === id)?.nombre ?? "—";

  const campoSelect =
    "w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100";

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-gray-900">Usuarios</h2>
        <p className="mt-1 text-sm text-gray-500">
          Cuentas de acceso a la pagina. Los padres se vinculan a un solo alumno.
        </p>
      </div>

      <form
        onSubmit={crear}
        className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"
      >
        <h3 className="mb-4 text-sm font-semibold text-gray-900">Nueva cuenta</h3>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">Usuario</label>
            <input
              type="text"
              value={form.usuario}
              onChange={(e) => setForm({ ...form, usuario: e.target.value })}
              className={campoSelect}
              placeholder="ej. padre.perez"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">Contrasena</label>
            <input
              type="password"
              value={form.contrasena}
              onChange={(e) => setForm({ ...form, contrasena: e.target.value })}
              className={campoSelect}
              placeholder="minimo 4 caracteres"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-gray-500">Rol</label>
            <select
              value={form.rol}
              onChange={(e) => setForm({ ...form, rol: e.target.value })}
              className={campoSelect}
            >
              <option value="direccion">Direccion</option>
              <option value="padre">Padre</option>
              <option value="admin">Administrador</option>
            </select>
          </div>
          {form.rol === "padre" && (
            <div>
              <label className="mb-1.5 block text-xs font-medium text-gray-500">Alumno vinculado</label>
              <select
                value={form.id_alumno}
                onChange={(e) => setForm({ ...form, id_alumno: e.target.value })}
                className={campoSelect}
              >
                <option value="">Selecciona un alumno</option>
                {alumnos.map((a) => (
                  <option key={a.id_alumno} value={a.id_alumno}>
                    {a.nombre}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
        <button
          type="submit"
          disabled={
            guardando ||
            !form.usuario.trim() ||
            !form.contrasena ||
            (form.rol === "padre" && !form.id_alumno)
          }
          className="mt-4 inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
        >
          {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
          Crear cuenta
        </button>
      </form>

      {error && (
        <div className="rounded-xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</div>
      )}

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3 font-medium">Usuario</th>
              <th className="px-4 py-3 font-medium">Rol</th>
              <th className="px-4 py-3 font-medium">Alumno vinculado</th>
              <th className="px-4 py-3 text-right font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {cargando ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                  Cargando usuarios...
                </td>
              </tr>
            ) : usuarios.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-gray-400">
                  No hay usuarios registrados.
                </td>
              </tr>
            ) : (
              usuarios.map((u) => {
                const soyYo = u.id_usuario === miSesion?.id;
                return (
                  <tr key={u.id_usuario} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-gray-900">{u.usuario}</span>
                      {soyYo && (
                        <span className="ml-2 text-xs text-gray-400">(tu cuenta)</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-block rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                        {NOMBRES_ROL[u.rol] || u.rol}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600">
                      {u.rol === "padre" ? nombreAlumno(u.id_alumno) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setCambiando(u);
                            setNuevaContrasena("");
                          }}
                          className="rounded-full border border-gray-200 bg-white px-3 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50"
                        >
                          Contrasena
                        </button>
                        <button
                          type="button"
                          disabled={soyYo}
                          onClick={() => setEliminando(u)}
                          className="rounded-full border border-red-100 bg-white px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:border-gray-100 disabled:text-gray-300"
                        >
                          Eliminar
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {eliminando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Eliminar usuario</h3>
              <button
                type="button"
                onClick={() => setEliminando(null)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-gray-600">
              Se eliminara la cuenta <span className="font-medium">{eliminando.usuario}</span>.
              Esta persona dejara de poder entrar.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setEliminando(null)}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={confirmarEliminacion}
                disabled={guardando}
                className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {cambiando && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900">Cambiar contrasena</h3>
              <button
                type="button"
                onClick={() => setCambiando(null)}
                className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-3 text-sm text-gray-600">
              Cuenta: <span className="font-medium">{cambiando.usuario}</span>
            </p>
            <input
              type="password"
              value={nuevaContrasena}
              onChange={(e) => setNuevaContrasena(e.target.value)}
              placeholder="Nueva contrasena"
              className={campoSelect}
              autoFocus
            />
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setCambiando(null)}
                className="rounded-full border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={guardarContrasena}
                disabled={guardando || !nuevaContrasena}
                className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
              >
                {guardando && <Loader2 className="h-4 w-4 animate-spin" />}
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Aplicacion principal                                                */
/* ------------------------------------------------------------------ */

export default function App() {
  const [autenticado, setAutenticado] = useState(isLoggedIn);
  const [sesion, setSesion] = useState(null);
  const [vista, setVista] = useState("credenciales");
  const [cargando, setCargando] = useState(true);
  const [alumnos, setAlumnos] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [inscripciones, setInscripciones] = useState([]);
  const [progreso, setProgreso] = useState([]);
  const [notasMateria, setNotasMateria] = useState([]);
  const [bitacora, setBitacora] = useState([]);
  const [notificacion, setNotificacion] = useState(null);
  const [errorCarga, setErrorCarga] = useState(null);
  const [avisoSesion, setAvisoSesion] = useState("");
  const prevMateriaRef = useRef(null);
  const notifActivaRef = useRef(false);
  const horarioRef = useRef(null);

  const cerrarNotificacion = useCallback(() => {
    setNotificacion(null);
    notifActivaRef.current = false;
  }, []);

  useEffect(() => {
    if (!autenticado) return;
    let cancelado = false;

    cargarHorario().then((data) => {
      if (!cancelado) horarioRef.current = data;
    });

    const detectar = () => {
      const horario = horarioRef.current;
      if (!horario) return;
      const estado = obtenerEstadoActual();
      const materia = obtenerMateriaActual(horario, estado);
      const clave = `${new Date().getDay()}-${estado.bloqueIdx}-${materia}`;

      if (prevMateriaRef.current === null) {
        prevMateriaRef.current = clave;
        return;
      }
      if (prevMateriaRef.current === clave) return;
      prevMateriaRef.current = clave;
      if (!materia || notifActivaRef.current) return;

      notifActivaRef.current = true;
      const diaNombre = estado.diaIdx >= 0 ? DIAS[estado.diaIdx] : "";
      const bloque = estado.bloqueIdx >= 0 ? BLOQUES[estado.bloqueIdx] : null;
      const mensaje = bloque ? `${diaNombre} · ${bloque.inicio} – ${bloque.fin}` : diaNombre;

      setNotificacion({ titulo: materia, mensaje });

      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        try {
          new Notification("Horario escolar", {
            body: `${materia} · ${mensaje}`,
            icon: "/magnoliaslogo.jpeg",
          });
        } catch {}
      }
    };

    const t = setInterval(detectar, 30000);
    const detectarVisible = () => {
      if (!document.hidden) detectar();
    };
    document.addEventListener("visibilitychange", detectarVisible);

    return () => {
      cancelado = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", detectarVisible);
    };
  }, [autenticado]);

  const cargarDatos = useCallback(async () => {
    try {
      const [a, m, i, p] = await Promise.all([
        fetchAlumnos(),
        fetchMaterias(),
        fetchInscripciones(),
        fetchProgreso(),
      ]);
      setAlumnos(a);
      setMaterias(m);
      setInscripciones(i);
      setProgreso(p);
      setErrorCarga(null);
      // notas_materia puede no existir aun (tabla nueva): no romper la carga
      fetchNotasMateria().then(setNotasMateria).catch(() => {});
      // la bitacora es solo admin; para otros roles la peticion da 403
      if (obtenerSesion()?.rol === "admin") {
        fetchBitacora().then(setBitacora).catch(() => {});
      }
    } catch (err) {
      console.error("Error cargando datos:", err);
      if (err.message.includes("401") || err.message.includes("Token")) {
        clearToken();
        setSesion(null);
        setAvisoSesion("Tu sesion expiro, inicia sesion de nuevo.");
        setAutenticado(false);
      } else {
        setErrorCarga(err.message || "No se pudieron cargar los datos.");
      }
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (autenticado) {
      setCargando(true);
      cargarDatos();
    }
  }, [autenticado, cargarDatos]);

  const manejarLogin = () => {
    const s = obtenerSesion();
    setSesion(s);
    setAvisoSesion("");
    setErrorCarga(null);
    setAutenticado(true);
    setCargando(true);
    // vista inicial segun el rol
    const ids = VISTAS_POR_ROL[s?.rol] ?? VISTAS_POR_ROL.admin;
    setVista(s?.rol === "admin" ? "credenciales" : ids[0]);
  };

  const manejarLogout = () => {
    clearToken();
    setSesion(null);
    setAutenticado(false);
    setVista("credenciales");
    setAlumnos([]);
    setMaterias([]);
    setInscripciones([]);
    setProgreso([]);
    setNotasMateria([]);
    setBitacora([]);
  };

  const manejarRegistro = useCallback(async (idAlumno, idMateria, hito) => {
    await registrarAvance(idAlumno, idMateria, hito);
    const p = await fetchProgreso();
    setProgreso(p);
  }, []);

  const manejarRegistroLote = useCallback(async (idAlumno, hito, materiasIds) => {
    await registrarAvanceLote(idAlumno, hito, materiasIds);
    const p = await fetchProgreso();
    setProgreso(p);
  }, []);

  const manejarActualizarAlumno = useCallback(async () => {
    const [a, m, i] = await Promise.all([
      fetchAlumnos(),
      fetchMaterias(),
      fetchInscripciones(),
    ]);
    setAlumnos(a);
    setMaterias(m);
    setInscripciones(i);
  }, []);

  const manejarActualizarProgreso = useCallback(async () => {
    const p = await fetchProgreso();
    setProgreso(p);
    fetchNotasMateria().then(setNotasMateria).catch(() => {});
    // la sync de Canvas puede crear materias/inscripciones nuevas
    fetchMaterias().then(setMaterias).catch(() => {});
    fetchInscripciones().then(setInscripciones).catch(() => {});
    if (obtenerSesion()?.rol === "admin") {
      fetchBitacora().then(setBitacora).catch(() => {});
    }
  }, []);

  if (!autenticado) {
    return <LoginForm onLogin={manejarLogin} aviso={avisoSesion} />;
  }

  // Vistas permitidas para el rol y redireccion si la actual no aplica
  const rol = sesion?.rol ?? "admin";
  const idsPermitidos = VISTAS_POR_ROL[rol] ?? VISTAS_POR_ROL.admin;
  const vistasVisibles = VISTAS.filter((v) => idsPermitidos.includes(v.id));
  const vistaSegura = idsPermitidos.includes(vista) ? vista : idsPermitidos[0];
  const soloLectura = rol !== "admin";

  const vistaActual = VISTAS.find((v) => v.id === vistaSegura);
  const fechaHoy = new Date().toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <div className="flex min-h-screen flex-col bg-white font-sans text-gray-900 md:flex-row">
      <aside className="flex flex-col border-b border-gray-100 bg-white md:w-64 md:border-b-0 md:border-r">
        <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-6">
          <img
            src="/magnoliaslogo.jpeg"
            alt="Magnolias"
            className="h-10 w-10 rounded-xl object-cover"
          />
          <div>
            <p className="text-base font-semibold tracking-tight text-gray-900">Calificaciones</p>
            <p className="text-xs text-gray-400">Ciclo escolar 2026</p>
          </div>
        </div>
        <nav className="flex overflow-x-auto px-3 py-3 md:flex-1 md:flex-col md:gap-1 md:overflow-visible">
          {vistasVisibles.map((v) => {
            const Icono = v.icon;
            const activa = v.id === vistaSegura;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setVista(v.id)}
                className={`flex shrink-0 items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-medium md:w-full ${
                  activa ? "bg-gray-100 text-gray-900" : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                }`}
              >
                <Icono className={`h-4 w-4 shrink-0 ${activa ? "text-blue-600" : "text-gray-400"}`} />
                <span className="whitespace-nowrap">{v.nombre}</span>
              </button>
            );
          })}
        </nav>
        <div className="border-t border-gray-100 px-3 py-3">
          <div className="mb-2 px-3">
            <p className="truncate text-xs text-gray-400">
              {sesion?.usuario} · {NOMBRES_ROL[rol] ?? rol}
            </p>
          </div>
          <button
            type="button"
            onClick={manejarLogout}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-red-500 hover:bg-red-50"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className="whitespace-nowrap">Cerrar sesion</span>
          </button>
        </div>
      </aside>

      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-gray-100 bg-white px-8 py-6">
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{vistaActual?.nombre}</h1>
          <p className="text-sm text-gray-400">{fechaHoy}</p>
        </header>

        <main className="flex-1 overflow-auto bg-gray-50 px-8 py-8">
          {cargando ? (
            <LoadingScreen />
          ) : errorCarga ? (
            <div className="mx-auto max-w-md rounded-2xl border border-red-100 bg-white p-6 text-center shadow-sm">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-50">
                <X className="h-5 w-5 text-red-500" />
              </div>
              <h3 className="text-sm font-semibold text-gray-900">No se pudieron cargar los datos</h3>
              <p className="mt-1 text-sm text-gray-500">{errorCarga}</p>
              <button
                type="button"
                onClick={() => {
                  setCargando(true);
                  cargarDatos();
                }}
                className="mt-4 inline-flex items-center gap-2 rounded-full bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                <RotateCcw className="h-4 w-4" />
                Reintentar
              </button>
            </div>
          ) : vistaSegura === "credenciales" ? (
            <VistaCredenciales alumnos={alumnos} onActualizar={manejarActualizarAlumno} />
          ) : vistaSegura === "registro" ? (
            <VistaRegistro
              alumnos={alumnos}
              materias={materias}
              inscripciones={inscripciones}
              progreso={progreso}
              onRegistrar={manejarRegistro}
              onRegistrarLote={manejarRegistroLote}
            />
          ) : vistaSegura === "avance" ? (
            <VistaAvance
              alumnos={alumnos}
              materias={materias}
              inscripciones={inscripciones}
              progreso={progreso}
              notasMateria={notasMateria}
            />
          ) : vistaSegura === "auditoria" ? (
            <VistaAuditoria
              alumnos={alumnos}
              materias={materias}
              progreso={progreso}
              bitacora={bitacora}
            />
          ) : vistaSegura === "usuarios" ? (
            <VistaUsuarios alumnos={alumnos} />
          ) : vistaSegura === "horario" ? (
            <VistaHorario soloLectura={soloLectura} />
          ) : (
            <VistaMatriz
              alumnos={alumnos}
              materias={materias}
              inscripciones={inscripciones}
              progreso={progreso}
              notasMateria={notasMateria}
              onActualizar={manejarActualizarProgreso}
              onRegistrar={manejarRegistro}
              soloLectura={soloLectura}
            />
          )}
        </main>
      </div>

      <NotificacionCambioClase notificacion={notificacion} onCerrar={cerrarNotificacion} />
    </div>
  );
}
