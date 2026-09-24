import { useState, useEffect, useMemo, useCallback, useRef, Fragment } from "react";
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
  createMateria,
  syncInscripciones,
  deleteProgreso,
  login as apiLogin,
  setToken,
  clearToken,
  isLoggedIn,
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

const VISTAS = [
  { id: "credenciales", nombre: "Credenciales de alumnos", icon: Users },
  { id: "registro", nombre: "Registro semanal", icon: ClipboardList },
  { id: "avance", nombre: "Avance individual", icon: UserSearch },
  { id: "matriz", nombre: "Matriz general", icon: Table2 },
  { id: "horario", nombre: "Horario escolar", icon: Calendar },
];

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

function Indicador({ entregado, onClick }) {
  const [hover, setHover] = useState(false);

  if (entregado && onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        onMouseEnter={() => setHover(true)}
        onMouseLeave={() => setHover(false)}
        className="mx-auto flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 transition-colors hover:bg-red-500 cursor-pointer"
        title="Eliminar registro"
      >
        {hover ? (
          <X className="h-3 w-3 text-white" strokeWidth={3} />
        ) : (
          <Check className="h-3 w-3 text-white" strokeWidth={3} />
        )}
      </button>
    );
  }
  if (entregado) {
    return (
      <div className="mx-auto flex h-5 w-5 items-center justify-center rounded-full bg-blue-600">
        <Check className="h-3 w-3 text-white" strokeWidth={3} />
      </div>
    );
  }
  return <div className="mx-auto h-5 w-5 rounded-full border border-gray-200" />;
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

function LoginForm({ onLogin }) {
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

function VistaAvance({ alumnos, materias, inscripciones, progreso }) {
  const [alumnoId, setAlumnoId] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [hitoSeleccionado, setHitoSeleccionado] = useState("todos");
  const [hitoDesde, setHitoDesde] = useState(HITOS[0]);
  const [hitoHasta, setHitoHasta] = useState(HITOS[HITOS.length - 1]);

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
          return { hito: h, cumplio: !!registro?.cumplio, fecha_registro: registro?.fecha_registro };
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
            return (
              <div key={materia?.id_materia} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                    <BookOpen className="h-4 w-4 text-gray-400" />
                    {materia?.nombre}
                  </h3>
                </div>
                {hitosFiltrados.length === 0 ? (
                  <p className="text-sm text-gray-400">No hay hitos en esta categoria.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {hitosFiltrados.map((h) => (
                      <div
                        key={h.hito}
                        className="flex items-center gap-1.5 rounded-full border border-gray-100 bg-gray-50 px-2.5 py-1"
                      >
                        <span className="text-xs font-medium text-gray-500">{h.hito}</span>
                        <StatusChip entregado={h.cumplio} />
                      </div>
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
/*  Vista 4: Matriz general                                             */
/* ------------------------------------------------------------------ */

function VistaMatriz({ alumnos, materias, inscripciones, progreso, onActualizar }) {
  const [eliminando, setEliminando] = useState(null);
  const [exito, setExito] = useState(null);
  const [guardandoEliminacion, setGuardandoEliminacion] = useState(false);

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
            return registro
              ? { cumplio: !!registro.cumplio, id: registro.id_progreso, hito: h, id_alumno: i.id_alumno, id_materia: i.id_materia }
              : null;
          });
          return { id_alumno: i.id_alumno, id_materia: i.id_materia, materiaNombre: materia?.nombre ?? "Materia", celdas };
        });
      return { alumno, filas };
    });
  }, [alumnos, materias, inscripciones, progreso]);

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

      <div
        className="overflow-auto rounded-2xl border border-gray-100 bg-white shadow-sm"
        style={{ maxHeight: "32rem" }}
      >
        <table className="w-full min-w-max border-collapse text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-20 w-64 border-b border-r border-gray-100 bg-gray-50 px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                Alumno / Materia
              </th>
              {HITOS.map((h) => (
                <th
                  key={h}
                  className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50 px-4 py-3 text-center text-xs font-medium uppercase tracking-wide text-gray-500"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grupos.map((grupo, grupoIdx) => {
              const bg = grupoIdx % 2 === 0 ? "bg-white" : "bg-blue-50/40";
              return (
                <Fragment key={grupo.alumno.id_alumno}>
                  <tr>
                    <td
                      colSpan={HITOS.length + 1}
                      className="sticky left-0 z-10 border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-900"
                    >
                      {grupo.alumno.nombre}{" "}
                      <span className="font-normal text-gray-400">cuenta {grupo.alumno.cuenta}</span>
                    </td>
                  </tr>
                  {grupo.filas.map((fila) => (
                    <tr key={`${fila.id_alumno}-${fila.id_materia}`} className={`${bg} hover:brightness-95`}>
                      <td className={`sticky left-0 z-10 border-b border-r border-gray-100 px-4 py-2.5 pl-8 text-gray-600 ${bg}`}>
                        {fila.materiaNombre}
                      </td>
                      {fila.celdas.map((celda, cIdx) => (
                        <td key={cIdx} className={`border-b border-gray-100 px-4 py-2.5 text-center ${bg}`}>
                          <Indicador
                            entregado={celda?.cumplio}
                            onClick={
                              celda
                                ? () =>
                                    setEliminando({
                                      id: celda.id,
                                      alumno: grupo.alumno.nombre,
                                      materia: fila.materiaNombre,
                                      hito: celda.hito,
                                    })
                                : undefined
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

      <div className="flex items-center gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-2">
          <Indicador entregado={true} /> Hito entregado
        </span>
        <span className="flex items-center gap-2">
          <Indicador entregado={false} /> Hito pendiente
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

function VistaHorario() {
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
              <button
                type="button"
                onClick={() => setEditando(true)}
                className="inline-flex items-center gap-1.5 rounded-full bg-gray-100 px-4 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-200"
              >
                <Pencil className="h-3.5 w-3.5" />
                Editar
              </button>
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
/*  Aplicacion principal                                                */
/* ------------------------------------------------------------------ */

export default function App() {
  const [autenticado, setAutenticado] = useState(isLoggedIn);
  const [vista, setVista] = useState("credenciales");
  const [cargando, setCargando] = useState(true);
  const [alumnos, setAlumnos] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [inscripciones, setInscripciones] = useState([]);
  const [progreso, setProgreso] = useState([]);
  const [notificacion, setNotificacion] = useState(null);
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
    } catch (err) {
      console.error("Error cargando datos:", err);
      if (err.message.includes("401") || err.message.includes("Token")) {
        clearToken();
        setAutenticado(false);
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
    setAutenticado(true);
    setCargando(true);
  };

  const manejarLogout = () => {
    clearToken();
    setAutenticado(false);
    setVista("credenciales");
    setAlumnos([]);
    setMaterias([]);
    setInscripciones([]);
    setProgreso([]);
  };

  if (!autenticado) {
    return <LoginForm onLogin={manejarLogin} />;
  }

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
  }, []);

  const vistaActual = VISTAS.find((v) => v.id === vista);
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
          {VISTAS.map((v) => {
            const Icono = v.icon;
            const activa = v.id === vista;
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
          ) : vista === "credenciales" ? (
            <VistaCredenciales alumnos={alumnos} onActualizar={manejarActualizarAlumno} />
          ) : vista === "registro" ? (
            <VistaRegistro
              alumnos={alumnos}
              materias={materias}
              inscripciones={inscripciones}
              progreso={progreso}
              onRegistrar={manejarRegistro}
              onRegistrarLote={manejarRegistroLote}
            />
          ) : vista === "avance" ? (
            <VistaAvance
              alumnos={alumnos}
              materias={materias}
              inscripciones={inscripciones}
              progreso={progreso}
            />
          ) : vista === "horario" ? (
            <VistaHorario />
          ) : (
            <VistaMatriz
              alumnos={alumnos}
              materias={materias}
              inscripciones={inscripciones}
              progreso={progreso}
              onActualizar={manejarActualizarProgreso}
            />
          )}
        </main>
      </div>

      <NotificacionCambioClase notificacion={notificacion} onCerrar={cerrarNotificacion} />
    </div>
  );
}
