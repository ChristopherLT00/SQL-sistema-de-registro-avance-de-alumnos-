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
  GraduationCap,
  CheckCircle2,
  Search,
  BookOpen,
} from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Catálogos y datos simulados (harían las veces de tablas SQL)       */
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
];

const INITIAL_ALUMNOS = [
  { id: "al-1", nombre: "María Fernanda López Torres", cuenta: "320045821", password: "Fis*2026Ax" },
  { id: "al-2", nombre: "Diego Alejandro Ramírez Ochoa", cuenta: "319078234", password: "Qc7#Vector" },
  { id: "al-3", nombre: "Ana Sofía Martínez Cruz", cuenta: "321089456", password: "Termo#88q" },
  { id: "al-4", nombre: "Luis Eduardo Hernández Pineda", cuenta: "318012987", password: "Onda!452z" },
  { id: "al-5", nombre: "Paola Ximena Castillo Reyes", cuenta: "320067123", password: "Grad#719k" },
  { id: "al-6", nombre: "Jorge Iván Salazar Domínguez", cuenta: "319099345", password: "Flux*203m" },
];

const INITIAL_MATERIAS = [
  { id: "ma-1", nombre: "Física Estadística", clave: "FIS-401" },
  { id: "ma-2", nombre: "Mecánica Cuántica", clave: "FIS-402" },
  { id: "ma-3", nombre: "Física Computacional", clave: "FIS-403" },
  { id: "ma-4", nombre: "Electromagnetismo", clave: "FIS-404" },
  { id: "ma-5", nombre: "Termodinámica", clave: "FIS-305" },
  { id: "ma-6", nombre: "Óptica", clave: "FIS-306" },
];

const INITIAL_INSCRIPCIONES = [
  { id: "in-1", alumnoId: "al-1", materiaId: "ma-1" },
  { id: "in-2", alumnoId: "al-1", materiaId: "ma-2" },
  { id: "in-3", alumnoId: "al-1", materiaId: "ma-4" },
  { id: "in-4", alumnoId: "al-2", materiaId: "ma-1" },
  { id: "in-5", alumnoId: "al-2", materiaId: "ma-3" },
  { id: "in-6", alumnoId: "al-2", materiaId: "ma-5" },
  { id: "in-7", alumnoId: "al-3", materiaId: "ma-2" },
  { id: "in-8", alumnoId: "al-3", materiaId: "ma-4" },
  { id: "in-9", alumnoId: "al-3", materiaId: "ma-6" },
  { id: "in-10", alumnoId: "al-4", materiaId: "ma-1" },
  { id: "in-11", alumnoId: "al-4", materiaId: "ma-3" },
  { id: "in-12", alumnoId: "al-4", materiaId: "ma-4" },
  { id: "in-13", alumnoId: "al-5", materiaId: "ma-2" },
  { id: "in-14", alumnoId: "al-5", materiaId: "ma-5" },
  { id: "in-15", alumnoId: "al-5", materiaId: "ma-6" },
  { id: "in-16", alumnoId: "al-6", materiaId: "ma-3" },
  { id: "in-17", alumnoId: "al-6", materiaId: "ma-4" },
  { id: "in-18", alumnoId: "al-6", materiaId: "ma-5" },
];

function generarProgresoInicial(inscripciones) {
  const progreso = [];
  inscripciones.forEach((insc, idx) => {
    const completados = 3 + (idx % 6);
    for (let i = 0; i < completados && i < HITOS.length; i++) {
      const mes = 2 + (i % 6);
      const dia = 3 + (i % 24);
      progreso.push({
        id: `pg-${insc.id}-${i}`,
        inscripcionId: insc.id,
        hito: HITOS[i],
        cumplido: true,
        fecha: `2026-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`,
      });
    }
  });
  return progreso;
}

const INITIAL_PROGRESO = generarProgresoInicial(INITIAL_INSCRIPCIONES);

/* ------------------------------------------------------------------ */
/*  Capa de datos: simula una API REST sobre una base de datos         */
/*  relacional. En producción, cada método de este objeto se           */
/*  sustituye por un fetch() a un endpoint real (ver guía adjunta).    */
/* ------------------------------------------------------------------ */

function createAcademicAPI() {
  let _alumnos = [...INITIAL_ALUMNOS];
  let _materias = [...INITIAL_MATERIAS];
  let _inscripciones = [...INITIAL_INSCRIPCIONES];
  let _progreso = [...INITIAL_PROGRESO];

  const responder = (payload, ms = 300) =>
    new Promise((resolve) => setTimeout(() => resolve(payload), ms));

  return {
    fetchAlumnos: () => responder([..._alumnos]),
    fetchMaterias: () => responder([..._materias]),
    fetchInscripciones: () => responder([..._inscripciones]),
    fetchProgreso: () => responder([..._progreso]),
    registrarAvance: (inscripcionId, hito) => {
      const idx = _progreso.findIndex(
        (p) => p.inscripcionId === inscripcionId && p.hito === hito
      );
      const fecha = new Date().toISOString().slice(0, 10);
      if (idx >= 0) {
        _progreso[idx] = { ..._progreso[idx], cumplido: true, fecha };
      } else {
        _progreso = [
          ..._progreso,
          {
            id: `pg-${inscripcionId}-${hito}-${Date.now()}`,
            inscripcionId,
            hito,
            cumplido: true,
            fecha,
          },
        ];
      }
      return responder([..._progreso]);
    },
  };
}

/* ------------------------------------------------------------------ */
/*  Componentes auxiliares                                             */
/* ------------------------------------------------------------------ */

function StatusChip({ cumplido }) {
  if (cumplido) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-700">
        <Check className="h-3 w-3" strokeWidth={2.5} />
        Cumplió
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-400">
      Pendiente
    </span>
  );
}

function Indicador({ cumplido }) {
  if (cumplido) {
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
      <p className="text-sm">Cargando datos académicos...</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Vista 1: Credenciales de alumnos                                   */
/* ------------------------------------------------------------------ */

function VistaCredenciales({ alumnos }) {
  const [visibles, setVisibles] = useState({});

  const alternar = (id) => {
    setVisibles((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-gray-900">
          <KeyRound className="h-5 w-5 text-gray-400" />
          Credenciales de alumnos
        </h2>
        <p className="mt-1 text-sm text-gray-500">
          Cuentas de acceso registradas para el ciclo escolar en curso. Información de uso interno.
        </p>
      </div>
      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide">Nombre</th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide">Cuenta</th>
              <th className="px-6 py-3 text-xs font-medium uppercase tracking-wide">Contraseña</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {alumnos.map((alumno) => (
              <tr key={alumno.id} className="hover:bg-gray-50">
                <td className="px-6 py-4 text-gray-900">{alumno.nombre}</td>
                <td className="px-6 py-4 font-mono text-gray-500">{alumno.cuenta}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-gray-500">
                      {visibles[alumno.id] ? alumno.password : "••••••••••"}
                    </span>
                    <button
                      type="button"
                      onClick={() => alternar(alumno.id)}
                      className="text-gray-300 hover:text-gray-600"
                      aria-label="Mostrar u ocultar contraseña"
                    >
                      {visibles[alumno.id] ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Vista 2: Registro semanal                                          */
/* ------------------------------------------------------------------ */

function VistaRegistro({ alumnos, materias, inscripciones, progreso, onRegistrar }) {
  const [alumnoId, setAlumnoId] = useState("");
  const [inscripcionId, setInscripcionId] = useState("");
  const [hito, setHito] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [mensaje, setMensaje] = useState(null);

  const materiasDisponibles = useMemo(() => {
    return inscripciones
      .filter((i) => i.alumnoId === alumnoId)
      .map((i) => {
        const materia = materias.find((m) => m.id === i.materiaId);
        return {
          inscripcionId: i.id,
          nombre: materia?.nombre ?? "Materia sin registrar",
          clave: materia?.clave,
        };
      });
  }, [alumnoId, inscripciones, materias]);

  const registroExistente = useMemo(() => {
    if (!inscripcionId || !hito) return null;
    return progreso.find((p) => p.inscripcionId === inscripcionId && p.hito === hito) ?? null;
  }, [inscripcionId, hito, progreso]);

  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(() => setMensaje(null), 3500);
    return () => clearTimeout(t);
  }, [mensaje]);

  const manejarAlumno = (valor) => {
    setAlumnoId(valor);
    setInscripcionId("");
    setHito("");
  };

  const manejarMateria = (valor) => {
    setInscripcionId(valor);
    setHito("");
  };

  const manejarRegistro = async () => {
    if (!inscripcionId || !hito) return;
    setGuardando(true);
    await onRegistrar(inscripcionId, hito);
    setGuardando(false);
    setMensaje("Cumplimiento registrado correctamente.");
  };

  const alumnoSeleccionado = alumnos.find((a) => a.id === alumnoId);
  const materiaSeleccionada = materiasDisponibles.find((m) => m.inscripcionId === inscripcionId);

  const campoSelect =
    "w-full rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm text-gray-900 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-300";

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-gray-900">Registro semanal</h2>
        <p className="mt-1 text-sm text-gray-500">
          Selecciona al alumno, la materia correspondiente y el hito a evaluar para registrar su cumplimiento.
        </p>
      </div>

      <div className="space-y-5 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Alumno</label>
          <select value={alumnoId} onChange={(e) => manejarAlumno(e.target.value)} className={campoSelect}>
            <option value="">Selecciona un alumno</option>
            {alumnos.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Materia</label>
          <select
            value={inscripcionId}
            onChange={(e) => manejarMateria(e.target.value)}
            disabled={!alumnoId}
            className={campoSelect}
          >
            <option value="">
              {alumnoId ? "Selecciona una materia" : "Primero selecciona un alumno"}
            </option>
            {materiasDisponibles.map((m) => (
              <option key={m.inscripcionId} value={m.inscripcionId}>
                {m.nombre} ({m.clave})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1.5 block text-sm font-medium text-gray-700">Hito</label>
          <select
            value={hito}
            onChange={(e) => setHito(e.target.value)}
            disabled={!inscripcionId}
            className={campoSelect}
          >
            <option value="">
              {inscripcionId ? "Selecciona un hito" : "Primero selecciona una materia"}
            </option>
            {HITOS.map((h) => (
              <option key={h} value={h}>
                {h}
              </option>
            ))}
          </select>
        </div>

        {hito && inscripcionId ? (
          <p className="text-sm text-gray-500">
            Estado actual:{" "}
            {registroExistente?.cumplido
              ? `cumplido el ${registroExistente.fecha}`
              : "pendiente de registro"}
            .
          </p>
        ) : null}

        <button
          type="button"
          onClick={manejarRegistro}
          disabled={!inscripcionId || !hito || guardando}
          className="inline-flex items-center gap-2 rounded-full bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:bg-gray-200 disabled:text-gray-400"
        >
          {guardando ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          Registrar cumplimiento
        </button>

        {mensaje ? (
          <div className="flex items-center gap-2 rounded-xl bg-green-50 px-4 py-2.5 text-sm text-green-700">
            <CheckCircle2 className="h-4 w-4" />
            {mensaje}
          </div>
        ) : null}
      </div>

      {alumnoSeleccionado ? (
        <p className="text-xs text-gray-400">
          Registrando para {alumnoSeleccionado.nombre}
          {materiaSeleccionada ? ` (${materiaSeleccionada.nombre})` : ""}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Vista 3: Avance individual                                         */
/* ------------------------------------------------------------------ */

function VistaAvance({ alumnos, materias, inscripciones, progreso }) {
  const [alumnoId, setAlumnoId] = useState("");
  const [filtro, setFiltro] = useState("todos");

  const datos = useMemo(() => {
    if (!alumnoId) return [];
    return inscripciones
      .filter((i) => i.alumnoId === alumnoId)
      .map((i) => {
        const materia = materias.find((m) => m.id === i.materiaId);
        const hitos = HITOS.map((h) => {
          const registro = progreso.find((p) => p.inscripcionId === i.id && p.hito === h);
          return { hito: h, cumplido: !!registro?.cumplido, fecha: registro?.fecha };
        });
        return { materia, hitos };
      });
  }, [alumnoId, inscripciones, materias, progreso]);

  const filtrarHitos = (hitos) => {
    if (filtro === "entregados") return hitos.filter((h) => h.cumplido);
    if (filtro === "pendientes") return hitos.filter((h) => !h.cumplido);
    return hitos;
  };

  const opciones = [
    { id: "todos", nombre: "Todos" },
    { id: "entregados", nombre: "Entregados" },
    { id: "pendientes", nombre: "Pendientes" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-gray-900">Avance individual</h2>
        <p className="mt-1 text-sm text-gray-500">
          Consulta el avance de un alumno específico, materia por materia.
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
              <option key={a.id} value={a.id}>
                {a.nombre}
              </option>
            ))}
          </select>
        </div>

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
              <div key={materia?.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-base font-semibold text-gray-900">
                    <BookOpen className="h-4 w-4 text-gray-400" />
                    {materia?.nombre}
                  </h3>
                  <span className="text-xs text-gray-400">{materia?.clave}</span>
                </div>
                {hitosFiltrados.length === 0 ? (
                  <p className="text-sm text-gray-400">No hay hitos en esta categoría.</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {hitosFiltrados.map((h) => (
                      <div
                        key={h.hito}
                        className="flex items-center gap-1.5 rounded-full border border-gray-100 bg-gray-50 px-2.5 py-1"
                      >
                        <span className="text-xs font-medium text-gray-500">{h.hito}</span>
                        <StatusChip cumplido={h.cumplido} />
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

function VistaMatriz({ alumnos, materias, inscripciones, progreso }) {
  const grupos = useMemo(() => {
    return alumnos.map((alumno) => {
      const filas = inscripciones
        .filter((i) => i.alumnoId === alumno.id)
        .map((i) => {
          const materia = materias.find((m) => m.id === i.materiaId);
          const celdas = HITOS.map((h) => {
            const registro = progreso.find((p) => p.inscripcionId === i.id && p.hito === h);
            return !!registro?.cumplido;
          });
          return { inscripcionId: i.id, materiaNombre: materia?.nombre ?? "Materia", celdas };
        });
      return { alumno, filas };
    });
  }, [alumnos, materias, inscripciones, progreso]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-gray-900">Matriz general</h2>
        <p className="mt-1 text-sm text-gray-500">
          Cruce consolidado de alumnos, materias y hitos a lo largo del ciclo escolar.
        </p>
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
            {grupos.map((grupo) => (
              <Fragment key={grupo.alumno.id}>
                <tr>
                  <td
                    colSpan={HITOS.length + 1}
                    className="sticky left-0 z-10 border-b border-gray-100 bg-gray-50 px-4 py-2.5 text-sm font-semibold text-gray-900"
                  >
                    {grupo.alumno.nombre}{" "}
                    <span className="font-normal text-gray-400">· cuenta {grupo.alumno.cuenta}</span>
                  </td>
                </tr>
                {grupo.filas.map((fila) => (
                  <tr key={fila.inscripcionId} className="hover:bg-gray-50">
                    <td className="sticky left-0 z-10 border-b border-r border-gray-100 bg-white px-4 py-2.5 pl-8 text-gray-600">
                      {fila.materiaNombre}
                    </td>
                    {fila.celdas.map((cumplido, cIdx) => (
                      <td key={cIdx} className="border-b border-gray-100 px-4 py-2.5 text-center">
                        <Indicador cumplido={cumplido} />
                      </td>
                    ))}
                  </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-6 text-xs text-gray-500">
        <span className="flex items-center gap-2">
          <Indicador cumplido={true} /> Hito cumplido
        </span>
        <span className="flex items-center gap-2">
          <Indicador cumplido={false} /> Hito pendiente
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Aplicación principal                                                */
/* ------------------------------------------------------------------ */

export default function App() {
  const api = useRef(createAcademicAPI()).current;

  const [vista, setVista] = useState("credenciales");
  const [cargando, setCargando] = useState(true);
  const [alumnos, setAlumnos] = useState([]);
  const [materias, setMaterias] = useState([]);
  const [inscripciones, setInscripciones] = useState([]);
  const [progreso, setProgreso] = useState([]);

  useEffect(() => {
    let activo = true;
    Promise.all([
      api.fetchAlumnos(),
      api.fetchMaterias(),
      api.fetchInscripciones(),
      api.fetchProgreso(),
    ]).then(([a, m, i, p]) => {
      if (!activo) return;
      setAlumnos(a);
      setMaterias(m);
      setInscripciones(i);
      setProgreso(p);
      setCargando(false);
    });
    return () => {
      activo = false;
    };
  }, [api]);

  const registrarAvance = useCallback(
    async (inscripcionId, hito) => {
      const actualizado = await api.registrarAvance(inscripcionId, hito);
      setProgreso(actualizado);
      return actualizado;
    },
    [api]
  );

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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-900">
            <GraduationCap className="h-5 w-5 text-white" />
          </div>
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
            <VistaCredenciales alumnos={alumnos} />
          ) : vista === "registro" ? (
            <VistaRegistro
              alumnos={alumnos}
              materias={materias}
              inscripciones={inscripciones}
              progreso={progreso}
              onRegistrar={registrarAvance}
            />
          ) : vista === "avance" ? (
            <VistaAvance
              alumnos={alumnos}
              materias={materias}
              inscripciones={inscripciones}
              progreso={progreso}
            />
          ) : (
            <VistaMatriz
              alumnos={alumnos}
              materias={materias}
              inscripciones={inscripciones}
              progreso={progreso}
            />
          )}
        </main>
      </div>
    </div>
  );
}
