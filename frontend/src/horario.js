const CLAVE = "magnolias_horario";

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

export function cargarHorario() {
  try {
    const raw = localStorage.getItem(CLAVE);
    if (!raw) return structuredClone(HORARIO_DEFAULT);
    const data = JSON.parse(raw);
    if (!Array.isArray(data.grid)) return structuredClone(HORARIO_DEFAULT);
    return data;
  } catch {
    return structuredClone(HORARIO_DEFAULT);
  }
}

export function guardarHorario(datos) {
  localStorage.setItem(CLAVE, JSON.stringify(datos));
}

export function restaurarHorario() {
  localStorage.removeItem(CLAVE);
  return structuredClone(HORARIO_DEFAULT);
}
