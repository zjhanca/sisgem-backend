const PDFDocument = require('pdfkit');

function crearDocumento() {
  const doc = new PDFDocument({ margin: 50, size: 'A4' });
  return doc;
}

function agregarEncabezado(doc, titulo) {
  // fondo del encabezado
  doc.rect(0, 0, doc.page.width, 80).fill('#0F1C22');

  // nombre del sistema
  doc.fillColor('#A6E8B2').fontSize(24).font('Helvetica-Bold')
     .text('sisgem', 50, 20);

  // titulo del reporte
  doc.fillColor('#EAF7EE').fontSize(12).font('Helvetica')
     .text(titulo, 50, 50);

  // fecha
  const fecha = new Date().toLocaleDateString('es-CO', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  doc.fillColor('#7CCF92').fontSize(10)
     .text(`generado: ${fecha}`, 400, 35, { align: 'right', width: 160 });

  doc.moveDown(3);
}

function agregarTabla(doc, columnas, filas, colWidths) {
  const startY = doc.y;
  const startX = 50;
  const rowH = 24;

  // encabezado de la tabla
  doc.rect(startX, startY, doc.page.width - 100, rowH).fill('#1D3326');
  let x = startX + 8;
  columnas.forEach((col, i) => {
    doc.fillColor('#A6E8B2').fontSize(9).font('Helvetica-Bold')
       .text(col, x, startY + 7, { width: colWidths[i] - 8 });
    x += colWidths[i];
  });
  doc.y = startY + rowH;

  // filas
  filas.forEach((fila, rowIdx) => {
    const y = doc.y;
    const fill = rowIdx % 2 === 0 ? '#F0FFF4' : '#FFFFFF';
    doc.rect(startX, y, doc.page.width - 100, rowH).fill(fill);
    let xf = startX + 8;
    fila.forEach((celda, i) => {
      doc.fillColor('#1D3326').fontSize(9).font('Helvetica')
         .text(String(celda), xf, y + 7, { width: colWidths[i] - 8 });
      xf += colWidths[i];
    });
    doc.y = y + rowH;
  });

  // linea final
  doc.rect(startX, doc.y, doc.page.width - 100, 1).fill('#A6E8B2');
}

function agregarPie(doc) {
  doc.rect(0, doc.page.height - 40, doc.page.width, 40).fill('#0F1C22');
  doc.fillColor('#7CCF92').fontSize(8).font('Helvetica')
     .text('sisgem - sistema de gestion para minimercado',
           50, doc.page.height - 25, { align: 'center', width: doc.page.width - 100 });
}

module.exports = { crearDocumento, agregarEncabezado, agregarTabla, agregarPie };
