import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import logoBase64 from "./logo-base64.js";

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

function fechaStr() {
  return new Date().toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function agregarLogo(doc) {
  doc.addImage(logoBase64, "JPEG", 267, 6, 20, 20);
}

/* ------------------------------------------------------------------ */
/*  PDF: Avance individual de un alumno                                */
/* ------------------------------------------------------------------ */

export function generarPDFAvance({ alumnoNombre, datos, filtro, hitoSeleccionado, hitoDesde, hitoHasta }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  agregarLogo(doc);

  const filtroHitoTexto =
    hitoSeleccionado === "todos"
      ? "Todos"
      : hitoSeleccionado === "rango"
        ? `Rango: ${hitoDesde} – ${hitoHasta}`
        : `Hito ${hitoSeleccionado}`;
  const filtroEstadoTexto = filtro === "todos" ? "Todos" : filtro === "entregados" ? "Entregados" : "Pendientes";

  doc.setFontSize(16);
  doc.text("Avance Individual", 14, 15);
  doc.setFontSize(11);
  doc.text(`Alumno: ${alumnoNombre}`, 14, 22);
  doc.text(`Hito: ${filtroHitoTexto}`, 14, 28);
  doc.text(`Estado: ${filtroEstadoTexto}`, 14, 34);
  doc.text(`Fecha: ${fechaStr()}`, 14, 40);

  let y = 48;

  for (const { materia, hitos } of datos) {
    const hitosFiltrados = filtrarHitosAvance(hitos, hitoSeleccionado, hitoDesde, hitoHasta, filtro);

    if (hitosFiltrados.length === 0) continue;

    if (y > 170) {
      doc.addPage();
      agregarLogo(doc);
      y = 15;
    }

    doc.setFontSize(12);
    doc.setFont(undefined, "bold");
    doc.text(materia?.nombre ?? "Materia", 14, y);
    doc.setFont(undefined, "normal");
    y += 2;

    const rows = hitosFiltrados.map((h) => [
      h.hito,
      h.cumplio ? "Entregado" : "Pendiente",
      h.fecha_registro
        ? new Date(h.fecha_registro).toLocaleDateString("es-MX")
        : "-",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["Hito", "Estado", "Fecha"]],
      body: rows,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 2 },
      headStyles: { fillColor: [30, 30, 30] },
      margin: { left: 14, right: 14 },
    });

    y = doc.lastAutoTable.finalY + 8;
  }

  const nombreRango =
    hitoSeleccionado === "rango"
      ? `${hitoDesde}_a_${hitoHasta}`.replace(/\s+/g, "_")
      : hitoSeleccionado;
  doc.save(`Avance_${alumnoNombre.replace(/\s+/g, "_")}_${nombreRango}_${filtro}.pdf`);
}

/* ------------------------------------------------------------------ */
/*  PDF: Matriz general                                                */
/* ------------------------------------------------------------------ */

const COLORES_GRUPO = [
  [255, 255, 255],
  [219, 234, 254],
  [254, 243, 199],
  [220, 252, 231],
  [252, 231, 243],
];

export function generarPDFMatriz({ grupos, hitos }) {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  agregarLogo(doc);

  doc.setFontSize(16);
  doc.text("Matriz General de Avance", 14, 15);
  doc.setFontSize(11);
  doc.text(`Fecha: ${fechaStr()}`, 14, 22);

  const head = [["Alumno", "Materia", ...hitos]];

  const rows = [];
  const rowStyles = [];

  grupos.forEach((grupo, grupoIdx) => {
    const color = COLORES_GRUPO[grupoIdx % COLORES_GRUPO.length];
    grupo.filas.forEach((fila) => {
      const celdas = fila.celdas.map((c) => (c?.cumplio ? "X" : ""));
      rows.push([grupo.alumno.nombre, fila.materiaNombre, ...celdas]);
      rowStyles.push({ fillColor: color });
    });
  });

  autoTable(doc, {
    startY: 28,
    head,
    body: rows,
    theme: "grid",
    styles: { fontSize: 7, cellPadding: 1.5, halign: "center" },
    headStyles: { fillColor: [30, 30, 30], fontSize: 7 },
    columnStyles: {
      0: { halign: "left", cellWidth: 45 },
      1: { halign: "left", cellWidth: 40 },
    },
    margin: { left: 14, right: 14 },
    didParseCell: (data) => {
      if (data.section === "body" && data.row.index < rowStyles.length) {
        const color = rowStyles[data.row.index].fillColor;
        data.cell.styles.fillColor = color;
      }
    },
  });

  doc.save(`Matriz_General_${new Date().toISOString().slice(0, 10)}.pdf`);
}
