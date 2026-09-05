const PDFDocument = require('pdfkit');

const COLORES = {
  oscuro:      '#000000', // negro puro
  primario:    '#1E9E50', // verde solo para el logo SISGEM
  acento:      '#CCCCCC', // gris claro para texto secundario sobre fondo oscuro
  textoOscuro: '#000000', // texto principal
  filaPar:     '#F3F3F3', // zebra striping gris claro
  borde:       '#DDDDDD', // bordes grises
  textoMuted:  '#555555', // texto secundario
};

const MARGEN    = 50;
const ALTO_FILA = 22;
const ALTO_PIE  = 36;

function capitalizar(str) {
  if (str === null || str === undefined || str === '') return str;
  const s = String(str);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function crearDocumento() {
  return new PDFDocument({ margin: 0, size: 'A4', bufferPages: true });
}

// Encabezado — solo SISGEM en verde, resto en B&N
function agregarEncabezado(doc, titulo) {
  // Fondo negro
  doc.rect(0, 0, doc.page.width, 64).fill('#000000');

  // Logo SISGEM en verde
  doc.fillColor('#1E9E50').fontSize(18).font('Helvetica-Bold')
     .text('SISGEM', MARGEN, 16);

  // Título en blanco
  doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica')
     .text(capitalizar(titulo), MARGEN, 38);

  // Fecha en gris claro
  const fecha = new Date().toLocaleDateString('es-CO', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  doc.fillColor('#AAAAAA').fontSize(8)
     .text(`Generado: ${fecha}`, 0, 24,
       { align: 'right', width: doc.page.width - MARGEN });

  doc.y = 90;
}

// Pie — línea gris + texto gris
function agregarPie(doc) {
  const y = doc.page.height - ALTO_PIE;
  doc.rect(MARGEN, y, doc.page.width - MARGEN * 2, 1).fill('#DDDDDD');
  doc.fillColor('#888888').fontSize(8).font('Helvetica')
     .text('SISGEM · Sistema de gestión para minimercado', MARGEN, y + 10, {
       align: 'center', width: doc.page.width - MARGEN * 2,
     });
}

function agregarSeccionTitulo(doc, texto) {
  if (doc.y + 20 > doc.page.height - ALTO_PIE - 10) {
    agregarPie(doc);
    doc.addPage();
    doc.y = MARGEN;
  }
  // Título sección en negro
  doc.fillColor('#000000').fontSize(9).font('Helvetica-Bold')
     .text(String(texto).toUpperCase(), MARGEN, doc.y);
  // Línea negra debajo
  doc.moveTo(MARGEN, doc.y + 12).lineTo(doc.page.width - MARGEN, doc.y + 12)
     .strokeColor('#000000').lineWidth(1).stroke();
  doc.y += 20;
}

function agregarFicha(doc, campos, columnas = 2) {
  const anchoTotal = doc.page.width - MARGEN * 2;
  const anchoCol   = anchoTotal / columnas;
  const alturaFila = 32;
  const filas      = Math.ceil(campos.length / columnas);
  const alturaCaja = filas * alturaFila + 16;

  if (doc.y + alturaCaja > doc.page.height - ALTO_PIE - 10) {
    agregarPie(doc);
    doc.addPage();
    doc.y = MARGEN;
  }

  const startY = doc.y;
  // Fondo gris muy claro
  doc.roundedRect(MARGEN, startY, anchoTotal, alturaCaja, 4).fill('#F3F3F3');

  campos.forEach((campo, i) => {
    const col  = i % columnas;
    const fila = Math.floor(i / columnas);
    const x    = MARGEN + 14 + col * anchoCol;
    const y    = startY + 10 + fila * alturaFila;

    // Label en gris oscuro
    doc.fillColor('#555555').fontSize(7).font('Helvetica-Bold')
       .text(String(campo.label).toUpperCase(), x, y, { width: anchoCol - 24 });
    // Valor en negro
    doc.fillColor('#000000').fontSize(9.5).font('Helvetica')
       .text(String(campo.valor ?? '—'), x, y + 11, { width: anchoCol - 24 });
  });

  doc.y = startY + alturaCaja + 12;
}

function agregarTotalDestacado(doc, etiqueta, valorFormateado) {
  const texto      = `${capitalizar(etiqueta)}: ${valorFormateado}`;
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

  // Fondo negro — total destacado
  doc.roundedRect(x, y, anchoTexto, alturaCaja, 4).fill('#000000');
  doc.fillColor('#FFFFFF').fontSize(11).font('Helvetica-Bold')
     .text(texto, x + 14, y + 7);

  doc.y = y + alturaCaja + 10;
}

function dibujarEncabezadoTabla(doc, columnas, colWidths) {
  const startX     = MARGEN;
  const y          = doc.y;
  const anchoTotal = doc.page.width - MARGEN * 2;

  // Encabezado tabla en negro
  doc.rect(startX, y, anchoTotal, ALTO_FILA).fill('#000000');

  let x = startX + 10;
  columnas.forEach((col, i) => {
    doc.fillColor('#FFFFFF').fontSize(9).font('Helvetica-Bold')
       .text(capitalizar(col), x, y + 7, { width: colWidths[i] - 10 });
    x += colWidths[i];
  });

  doc.y = y + ALTO_FILA;
}

function agregarTabla(doc, columnas, filas, colWidths) {
  const startX     = MARGEN;
  const anchoTotal = doc.page.width - MARGEN * 2;
  colWidths        = colWidths || columnas.map(() => anchoTotal / columnas.length);

  dibujarEncabezadoTabla(doc, columnas, colWidths);

  filas.forEach((fila, rowIdx) => {
    if (doc.y + ALTO_FILA > doc.page.height - ALTO_PIE - 10) {
      agregarPie(doc);
      doc.addPage();
      doc.y = MARGEN;
      dibujarEncabezadoTabla(doc, columnas, colWidths);
    }

    const y      = doc.y;
    // Zebra gris muy claro / blanco
    const relleno = rowIdx % 2 === 0 ? '#F3F3F3' : '#FFFFFF';
    doc.rect(startX, y, anchoTotal, ALTO_FILA).fill(relleno);

    let x = startX + 10;
    fila.forEach((celda, i) => {
      doc.fillColor('#000000').fontSize(9).font('Helvetica')
         .text(String(celda ?? '—'), x, y + 7, { width: colWidths[i] - 10 });
      x += colWidths[i];
    });

    // Línea divisoria gris
    doc.rect(startX, y + ALTO_FILA - 0.5, anchoTotal, 0.5).fill('#DDDDDD');
    doc.y = y + ALTO_FILA;
  });

  // Línea de cierre negra
  doc.rect(startX, doc.y, anchoTotal, 1.5).fill('#000000');
  doc.y += 12;
}

module.exports = {
  crearDocumento, agregarEncabezado, agregarTabla, agregarPie,
  agregarSeccionTitulo, agregarFicha, agregarTotalDestacado, capitalizar,
};