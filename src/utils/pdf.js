const PDFDocument = require('pdfkit')

const NEGRO = '#000000'
const GRIS  = '#555555'
const GRIS2 = '#999999'
const BORDE = '#CCCCCC'
const FONDO = '#F5F5F5'

const MARGEN    = 50
const ALTO_FILA = 20
const ALTO_PIE  = 36

function capitalizar(str) {
  if (str === null || str === undefined || str === '') return str
  const s = String(str)
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function crearDocumento() {
  return new PDFDocument({ margin: 0, size: 'A4', bufferPages: true })
}

function agregarEncabezado(doc, titulo) {
  const MG = MARGEN

  // Logo verde — único color de marca
  doc.fillColor('#1E9E50').fontSize(20).font('Helvetica-Bold')
     .text('SISGEM', MG, 28)
  doc.fillColor(GRIS2).fontSize(8).font('Helvetica')
     .text('Sistema de Gestión para Minimercado', MG, 52)

  // Título derecha
  doc.fillColor(NEGRO).fontSize(10).font('Helvetica-Bold')
     .text(capitalizar(titulo), 0, 28,
       { align: 'right', width: doc.page.width - MG })

  // Fecha
  const fecha = new Date().toLocaleDateString('es-CO', {
    year: 'numeric', month: 'long', day: 'numeric',
  })
  doc.fillColor(GRIS2).fontSize(8).font('Helvetica')
     .text(`Generado: ${fecha}`, 0, 44,
       { align: 'right', width: doc.page.width - MG })

  // Línea separadora
  doc.moveTo(MG, 68).lineTo(doc.page.width - MG, 68)
     .strokeColor(BORDE).lineWidth(0.8).stroke()

  doc.y = 82
}

function agregarPie(doc) {
  const y = doc.page.height - ALTO_PIE
  doc.moveTo(MARGEN, y).lineTo(doc.page.width - MARGEN, y)
     .strokeColor(BORDE).lineWidth(0.5).stroke()
  doc.fillColor(GRIS2).fontSize(7).font('Helvetica')
     .text('SISGEM · Sistema de gestión para minimercado',
       MARGEN, y + 10, {
         align: 'center', width: doc.page.width - MARGEN * 2,
       })
}

function agregarSeccionTitulo(doc, texto) {
  if (doc.y + 20 > doc.page.height - ALTO_PIE - 10) {
    agregarPie(doc); doc.addPage(); doc.y = MARGEN
  }
  doc.fillColor(NEGRO).fontSize(9).font('Helvetica-Bold')
     .text(String(texto).toUpperCase(), MARGEN, doc.y)
  doc.moveTo(MARGEN, doc.y + 12).lineTo(doc.page.width - MARGEN, doc.y + 12)
     .strokeColor(BORDE).lineWidth(0.8).stroke()
  doc.y += 20
}

function agregarFicha(doc, campos, columnas = 2) {
  const anchoTotal = doc.page.width - MARGEN * 2
  const anchoCol   = anchoTotal / columnas
  const alturaFila = 28
  const filas      = Math.ceil(campos.length / columnas)
  const alturaCaja = filas * alturaFila + 12

  if (doc.y + alturaCaja > doc.page.height - ALTO_PIE - 10) {
    agregarPie(doc); doc.addPage(); doc.y = MARGEN
  }

  const startY = doc.y
  doc.roundedRect(MARGEN, startY, anchoTotal, alturaCaja, 3).fill(FONDO)
  doc.roundedRect(MARGEN, startY, anchoTotal, alturaCaja, 3)
     .strokeColor(BORDE).lineWidth(0.5).stroke()

  campos.forEach((campo, i) => {
    const col  = i % columnas
    const fila = Math.floor(i / columnas)
    const x    = MARGEN + 12 + col * anchoCol
    const y    = startY + 8 + fila * alturaFila

    doc.fillColor(GRIS).fontSize(7).font('Helvetica-Bold')
       .text(String(campo.label).toUpperCase(), x, y, { width: anchoCol - 20 })
    doc.fillColor(NEGRO).fontSize(9).font('Helvetica')
       .text(String(campo.valor ?? '—'), x, y + 10, { width: anchoCol - 20 })
  })

  doc.y = startY + alturaCaja + 10
}

function agregarTotalDestacado(doc, etiqueta, valorFormateado) {
  const texto      = `${capitalizar(etiqueta)}: ${valorFormateado}`
  doc.fontSize(11).font('Helvetica-Bold')
  const anchoTexto = doc.widthOfString(texto) + 24
  const alturaCaja = 24

  if (doc.y + alturaCaja > doc.page.height - ALTO_PIE - 10) {
    agregarPie(doc); doc.addPage(); doc.y = MARGEN
  }

  const x = doc.page.width - MARGEN - anchoTexto
  const y = doc.y

  doc.roundedRect(x, y, anchoTexto, alturaCaja, 3)
     .strokeColor(NEGRO).lineWidth(1).stroke()
  doc.fillColor(NEGRO).fontSize(11).font('Helvetica-Bold')
     .text(texto, x + 12, y + 6)

  doc.y = y + alturaCaja + 10
}

function dibujarEncabezadoTabla(doc, columnas, colWidths) {
  const startX     = MARGEN
  const y          = doc.y
  const anchoTotal = doc.page.width - MARGEN * 2

  doc.rect(startX, y, anchoTotal, ALTO_FILA).fill(FONDO)
  doc.rect(startX, y, anchoTotal, ALTO_FILA)
     .strokeColor(BORDE).lineWidth(0.5).stroke()

  let x = startX + 8
  columnas.forEach((col, i) => {
    doc.fillColor(NEGRO).fontSize(8).font('Helvetica-Bold')
       .text(capitalizar(col), x, y + 6, { width: colWidths[i] - 10 })
    x += colWidths[i]
  })

  doc.y = y + ALTO_FILA
}

function agregarTabla(doc, columnas, filas, colWidths) {
  const startX     = MARGEN
  const anchoTotal = doc.page.width - MARGEN * 2
  colWidths        = colWidths || columnas.map(() => anchoTotal / columnas.length)

  dibujarEncabezadoTabla(doc, columnas, colWidths)

  filas.forEach((fila, rowIdx) => {
    if (doc.y + ALTO_FILA > doc.page.height - ALTO_PIE - 10) {
      agregarPie(doc); doc.addPage(); doc.y = MARGEN
      dibujarEncabezadoTabla(doc, columnas, colWidths)
    }

    const y      = doc.y
    const relleno = rowIdx % 2 === 0 ? '#FFFFFF' : FONDO
    doc.rect(startX, y, anchoTotal, ALTO_FILA).fill(relleno)

    let x = startX + 8
    fila.forEach((celda, i) => {
      doc.fillColor(NEGRO).fontSize(8).font('Helvetica')
         .text(String(celda ?? '—'), x, y + 6, { width: colWidths[i] - 10 })
      x += colWidths[i]
    })

    doc.moveTo(startX, y + ALTO_FILA).lineTo(startX + anchoTotal, y + ALTO_FILA)
       .strokeColor(BORDE).lineWidth(0.3).stroke()

    doc.y = y + ALTO_FILA
  })

  doc.moveTo(startX, doc.y).lineTo(startX + anchoTotal, doc.y)
     .strokeColor(BORDE).lineWidth(0.8).stroke()
  doc.y += 10
}

module.exports = {
  crearDocumento, agregarEncabezado, agregarTabla, agregarPie,
  agregarSeccionTitulo, agregarFicha, agregarTotalDestacado, capitalizar,
}