const PDFDocument = require('pdfkit');

// colores de marca (los mismos que en excel.js y en el frontend)
const COLORES = {
  oscuro:      '#0F1C22', // fondo de encabezado y pie
  primario:    '#1E9E50', // verde de marca (encabezado de tabla, acentos)
  acento:      '#7CCF92', // verde claro para texto secundario sobre fondo oscuro
  textoOscuro: '#1D3326', // texto principal sobre fondo claro
  filaPar:     '#F0FFF4', // zebra striping / fondo de tarjetas
  borde:       '#E3EFE6',
  textoMuted:  '#6B7280',
};

const MARGEN = 50;
const ALTO_FILA = 22;
const ALTO_PIE = 36;

function capitalizar(str) {
  if (str === null || str === undefined || str === '') return str;
  const s = String(str);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function crearDocumento() {
  // margin: 0 es intencional — PDFKit inserta automáticamente una página
  // nueva cuando se escribe texto más allá de su zona de margen inferior,
  // lo cual generaba páginas en blanco de más cada vez que el pie de
  // página o un salto de tabla dibujaba cerca del borde. Como todo el
  // espaciado ya se maneja a mano con la constante MARGEN, no se necesita
  // el margen automático de PDFKit.
  const doc = new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });
  return doc;
}

// encabezado minimalista: marca + título + fecha, una sola franja oscura
function agregarEncabezado(doc, titulo) {
  doc.rect(0, 0, doc.page.width, 64).fill(COLORES.oscuro);

  doc.fillColor(COLORES.primario).fontSize(18).font('Helvetica-Bold')
     .text('SISGEM', MARGEN, 16);

  doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica')
     .text(capitalizar(titulo), MARGEN, 38);

  const fecha = new Date().toLocaleDateString('es-CO', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  doc.fillColor(COLORES.acento).fontSize(8)
     .text(`Generado: ${fecha}`, 0, 24, { align: 'right', width: doc.page.width - MARGEN });

  doc.y = 90;
}

// pie minimalista: línea sutil + marca centrada
function agregarPie(doc) {
  const y = doc.page.height - ALTO_PIE;
  doc.rect(MARGEN, y, doc.page.width - MARGEN * 2, 1).fill(COLORES.borde);
  doc.fillColor('#9CA3AF').fontSize(8).font('Helvetica')
     .text('SISGEM · Sistema de gestión para minimercado', MARGEN, y + 10, {
       align: 'center', width: doc.page.width - MARGEN * 2,
     });
}

// título de sección: pequeño, en mayúsculas, color de marca (igual al
// ".section-title" del frontend) — reemplaza los doc.text('productos') sueltos
function agregarSeccionTitulo(doc, texto) {
  if (doc.y + 20 > doc.page.height - ALTO_PIE - 10) {
    agregarPie(doc);
    doc.addPage();
    doc.y = MARGEN;
  }
  doc.fillColor(COLORES.primario).fontSize(9).font('Helvetica-Bold')
     .text(String(texto).toUpperCase(), MARGEN, doc.y);
  doc.y += 16;
}

// ficha de datos en tarjeta (grid de 2 columnas, etiqueta arriba y valor abajo,
// igual al patrón "campo-label" + valor del frontend) — reemplaza las líneas
// sueltas tipo "cliente: Juan Perez"
function agregarFicha(doc, campos, columnas = 2) {
  const anchoTotal = doc.page.width - MARGEN * 2;
  const anchoCol = anchoTotal / columnas;
  const alturaFila = 32;
  const filas = Math.ceil(campos.length / columnas);
  const alturaCaja = filas * alturaFila + 16;

  if (doc.y + alturaCaja > doc.page.height - ALTO_PIE - 10) {
    agregarPie(doc);
    doc.addPage();
    doc.y = MARGEN;
  }

  const startY = doc.y;
  doc.roundedRect(MARGEN, startY, anchoTotal, alturaCaja, 6).fill(COLORES.filaPar);

  campos.forEach((campo, i) => {
    const col = i % columnas;
    const fila = Math.floor(i / columnas);
    const x = MARGEN + 14 + col * anchoCol;
    const y = startY + 10 + fila * alturaFila;

    doc.fillColor(COLORES.textoMuted).fontSize(7).font('Helvetica-Bold')
       .text(String(campo.label).toUpperCase(), x, y, { width: anchoCol - 24 });
    doc.fillColor(COLORES.textoOscuro).fontSize(9.5).font('Helvetica')
       .text(String(campo.valor ?? '—'), x, y + 11, { width: anchoCol - 24 });
  });

  doc.y = startY + alturaCaja + 12;
}

// total destacado en una píldora del color de marca, alineada a la derecha
// (reemplaza el texto plano en negrita para los totales)
function agregarTotalDestacado(doc, etiqueta, valorFormateado) {
  const texto = `${capitalizar(etiqueta)}: ${valorFormateado}`;
  doc.fontSize(11).font('Helvetica-Bold');
  const anchoTexto = doc.widthOfString(texto) + 28;
  const alturaCaja = 26;

  if (doc.y + alturaCaja > doc.page.height - ALTO_PIE - 10) {
    agregarPie(doc);
    doc.addPage();
    doc.y = MARGEN;
  }

  const x = doc.page.width - MARGEN - anchoTexto;
  const y = doc.y;
  doc.roundedRect(x, y, anchoTexto, alturaCaja, 6).fill(COLORES.primario);
  doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica-Bold')
     .text(texto, x + 14, y + 7);
  doc.y = y + alturaCaja + 10;
}

// dibuja solo la fila de encabezado de la tabla (se reutiliza al pasar de página)
function dibujarEncabezadoTabla(doc, columnas, colWidths) {
  const startX = MARGEN;
  const y = doc.y;
  const anchoTotal = doc.page.width - MARGEN * 2;

  doc.rect(startX, y, anchoTotal, ALTO_FILA).fill(COLORES.primario);
  let x = startX + 10;
  columnas.forEach((col, i) => {
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold')
       .text(capitalizar(col), x, y + 7, { width: colWidths[i] - 10 });
    x += colWidths[i];
  });
  doc.y = y + ALTO_FILA;
}

// agrega la tabla completa, con paginación automática cuando el contenido
// no cabe en la página actual (redibuja el encabezado en la página siguiente)
function agregarTabla(doc, columnas, filas, colWidths) {
  const startX = MARGEN;
  const anchoTotal = doc.page.width - MARGEN * 2;
  colWidths = colWidths || columnas.map(() => anchoTotal / columnas.length);

  dibujarEncabezadoTabla(doc, columnas, colWidths);

  filas.forEach((fila, rowIdx) => {
    // salto de página si la fila no cabe antes del pie
    if (doc.y + ALTO_FILA > doc.page.height - ALTO_PIE - 10) {
      agregarPie(doc);
      doc.addPage();
      doc.y = MARGEN;
      dibujarEncabezadoTabla(doc, columnas, colWidths);
    }

    const y = doc.y;
    const relleno = rowIdx % 2 === 0 ? COLORES.filaPar : '#FFFFFF';
    doc.rect(startX, y, anchoTotal, ALTO_FILA).fill(relleno);

    let x = startX + 10;
    fila.forEach((celda, i) => {
      doc.fillColor(COLORES.textoOscuro).fontSize(9).font('Helvetica')
         .text(String(celda ?? '—'), x, y + 7, { width: colWidths[i] - 10 });
      x += colWidths[i];
    });

    // línea divisoria sutil entre filas
    doc.rect(startX, y + ALTO_FILA - 0.5, anchoTotal, 0.5).fill(COLORES.borde);
    doc.y = y + ALTO_FILA;
  });

  // línea de cierre en el color de marca
  doc.rect(startX, doc.y, anchoTotal, 1.5).fill(COLORES.primario);
  doc.y += 12;
}

module.exports = {
  crearDocumento, agregarEncabezado, agregarTabla, agregarPie,
  agregarSeccionTitulo, agregarFicha, agregarTotalDestacado, capitalizar,
};