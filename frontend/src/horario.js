import { fetchHorario, saveHorario } from "./api";

export const DIAS = ["LUNES", "MARTES", "MIÉRCOLES", "JUEVES", "VIERNES"];

export const BLOQUES = [
  { inicio: "09:00", fin: "10:00" },
  { inicio: "10:00", fin: "11:00" },
  { inicio: "11:00", fin: "12:00" },
  { inicio: "12:00", fin: "13:00" },
  { inicio: "13:00", fin: "14:00" },
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
