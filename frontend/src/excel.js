import * as XLSX from "xlsx";

const HITOS = [
  "1", "2", "3", "4", "Int 1", "Parcial 1",
  "6", "7", "8", "9", "Int 2", "Parcial 2",
  "11", "12", "13", "Int 3", "Final",
];

function filtrarHitosAvance(hitos, hitoSeleccionado, hitoDesde, hitoHasta, filtro) {
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
}

/* ------------------------------------------------------------------ */
/*  Excel: Avance individual de un alumno                              */
/* ------------------------------------------------------------------ */

export function generarExcelAvance({ alumnoNombre, datos, filtro, hitoSeleccionado, hitoDesde, hitoHasta }) {
  const wb = XLSX.utils.book_new();

  for (const { materia, hitos } of datos) {
    const hitosFiltrados = filtrarHitosAvance(hitos, hitoSeleccionado, hitoDesde, hitoHasta, filtro);

    if (hitosFiltrados.length === 0) continue;

    const rows = hitosFiltrados.map((h) => ({
      Hito: h.hito,
      Estado: h.cumplio ? "Entregado" : "Pendiente",
      Fecha: h.fecha_registro
        ? new Date(h.fecha_registro).toLocaleDateString("es-MX")
        : "-",
    }));

    const nombreHoja = (materia?.nombre ?? "Materia").substring(0, 31);
    const ws = XLSX.utils.json_to_sheet(rows);

    ws["!cols"] = [{ wch: 12 }, { wch: 12 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, nombreHoja);
  }

  const nombreRango =
    hitoSeleccionado === "rango"
      ? `${hitoDesde}_a_${hitoHasta}`.replace(/\s+/g, "_")
      : hitoSeleccionado;
  XLSX.writeFile(
    wb,
    `Avance_${alumnoNombre.replace(/\s+/g, "_")}_${nombreRango}_${filtro}.xlsx`
  );
}

/* ------------------------------------------------------------------ */
/*  Colores por grupo de alumno (RGB hex)                              */
/* ------------------------------------------------------------------ */

const COLORES_GRUPO = [
  "FFFFFF",
  "DBEAFE",
  "FEF3C7",
  "DCFCE7",
  "FCE7F3",
];

/* ------------------------------------------------------------------ */
/*  Excel: Matriz general                                              */
/* ------------------------------------------------------------------ */

export function generarExcelMatriz({ grupos, hitos }) {
  const wb = XLSX.utils.book_new();

  const rows = [];
  const merges = [];

  grupos.forEach((grupo, grupoIdx) => {
    const color = COLORES_GRUPO[grupoIdx % COLORES_GRUPO.length];
    grupo.filas.forEach((fila) => {
      const registro = { Alumno: grupo.alumno.nombre, Materia: fila.materiaNombre };
      hitos.forEach((h, i) => {
        registro[h] = fila.celdas[i] ? "X" : "";
      });
      registro.__color = color;
      rows.push(registro);
    });
  });

  const data = rows.map((r) => {
    const { __color, ...rest } = r;
    return rest;
  });

  const ws = XLSX.utils.json_to_sheet(data);

  const cols = [
    { wch: 35 },
    { wch: 35 },
    ...hitos.map(() => ({ wch: 8 })),
  ];
  ws["!cols"] = cols;

  const range = XLSX.utils.decode_range(ws["!ref"]);
  let rowIdx = 0;
  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    if (rowIdx < rows.length) {
      const color = rows[rowIdx].__color;
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        if (!ws[addr]) ws[addr] = { v: "", t: "s" };
        ws[addr].s = {
          fill: { fgColor: { rgb: color } },
        };
      }
      rowIdx++;
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, "Matriz General");
  XLSX.writeFile(wb, `Matriz_General_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
