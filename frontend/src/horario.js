import { fetchHorario, saveHorario, fetchHorarioGrupoC, saveHorarioGrupoC } from "./api";

export const DIAS = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES"];

export const BLOQUES = [
  { inicio: "09:00", fin: "10:00" },
  { inicio: "10:00", fin: "11:00" },
  { inicio: "11:00", fin: "12:00" },
  { inicio: "12:00", fin: "13:00" },
  { inicio: "13:00", fin: "14:00" },
];

export const BLOQUES_SECUNDARIA = [
  { inicio: "08:00", fin: "09:00" },
  { inicio: "09:00", fin: "10:00" },
  { inicio: "10:00", fin: "11:00" },
  { inicio: "11:00", fin: "11:40" },
  { inicio: "11:40", fin: "12:20" },
  { inicio: "12:20", fin: "13:30" },
  { inicio: "13:30", fin: "14:30" },
];

export const HORARIO_DEFAULT = {
  grid: [
    ["Plataforma", "Plataforma", "Plataforma", "Plataforma", "AUSENTE"],
    ["Plataforma", "Plataforma", "Plataforma", "Biología", "AUSENTE"],
    ["Plataforma", "Plataforma", "Biología", "Taller optativo", "AUSENTE"],
    ["Taller optativo - Música", "Taller optativo - Música", "Música ensamble", "Taller optativo", "AUSENTE"],
    ["Plataforma", "Pintura", "Pintura", "Plataforma", "AUSENTE"],
  ],
};

export const HORARIO_SECUNDARIA_DEFAULT = {
  grid: [
    ["", "", "", "", ""],
    ["INGLES", "INGLES", "BIOLOGÍA", "QUÍMICA", "DEPORTES"],
    ["ESPAÑOL", "ESPAÑOL", "INGLES", "ESPAÑOL", "GEOGRAFIA"],
    ["ORTOGRAFIA / CALIGRAFIA", "LITERATURA", "INGLES", "LITERATURA U ORTOGRAFIA", "HISTORIA"],
    ["LUNCH/RECREO", "LUNCH/RECREO", "LUNCH/RECREO", "LUNCH/RECREO", "LUNCH/RECREO"],
    ["HISTORIA", "MATEMÁTICAS", "MATEMÁTICAS", "INGLES", "MATEMÁTICAS"],
    ["BIOLOGÍA", "MATEMÁTICAS", "GEOGRAFIA", "HISTORIA", "MATEMÁTICAS"],
  ],
};

const IDX_DIA_POR_DEFECTO = [-1, 0, 1, 2, 3, 4, -1];

function horaAMinuto(hhmm) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function obtenerEstadoActual(bloques = BLOQUES) {
  const ahora = new Date();
  const diaIdx = IDX_DIA_POR_DEFECTO[ahora.getDay()];
  const minutosAhora = ahora.getHours() * 60 + ahora.getMinutes();

  if (diaIdx < 0) {
    return { tipo: "finde", diaIdx: -1, bloqueIdx: -1, minutosAhora };
  }

  for (let i = 0; i < bloques.length; i++) {
    const ini = horaAMinuto(bloques[i].inicio);
    const fin = horaAMinuto(bloques[i].fin);
    if (minutosAhora >= ini && minutosAhora < fin) {
      return { tipo: "enClase", diaIdx, bloqueIdx: i, minutosAhora, minutosRestantes: fin - minutosAhora, minutosTotales: fin - ini };
    }
  }

  let siguiente = -1;
  for (let i = 0; i < bloques.length; i++) {
    if (horaAMinuto(bloques[i].inicio) > minutosAhora) {
      siguiente = i;
      break;
    }
  }
  if (siguiente >= 0) {
    return { tipo: "espera", diaIdx, bloqueIdx: siguiente, minutosAhora, minutosParaSiguiente: horaAMinuto(bloques[siguiente].inicio) - minutosAhora };
  }

  const manana = diaIdx + 1 <= 4 ? diaIdx + 1 : -1;
  if (manana >= 0) {
    const hastaManana = 24 * 60 - minutosAhora + horaAMinuto(bloques[0].inicio);
    return { tipo: "terminado", diaIdx, bloqueIdx: -1, minutosAhora, siguienteDia: manana, minutosParaSiguiente: hastaManana };
  }
  return { tipo: "finde", diaIdx, bloqueIdx: -1, minutosAhora };
}

export function obtenerMateriaActual(horario, estado) {
  if (estado.diaIdx >= 0 && estado.bloqueIdx >= 0) {
    return horario.grid?.[estado.bloqueIdx]?.[estado.diaIdx] || "";
  }
  return "";
}

export async function cargarHorario() {
  try {
    const data = await fetchHorario();
    if (!data || !Array.isArray(data.grid)) return structuredClone(HORARIO_DEFAULT);
    return { grid: data.grid };
  } catch {
    return structuredClone(HORARIO_DEFAULT);
  }
}

export async function guardarHorario(datos) {
  await saveHorario(datos.grid);
}

export async function restaurarHorario() {
  const def = structuredClone(HORARIO_DEFAULT);
  await saveHorario(def.grid);
  return def;
}

export async function cargarHorarioGrupoC() {
  try {
    const data = await fetchHorarioGrupoC();
    if (!data || !Array.isArray(data.grid)) return structuredClone(HORARIO_SECUNDARIA_DEFAULT);
    return { grid: data.grid };
  } catch {
    return structuredClone(HORARIO_SECUNDARIA_DEFAULT);
  }
}

export async function guardarHorarioGrupoC(datos) {
  await saveHorarioGrupoC(datos.grid);
}

export async function restaurarHorarioGrupoC() {
  const def = structuredClone(HORARIO_SECUNDARIA_DEFAULT);
  await saveHorarioGrupoC(def.grid);
  return def;
}
