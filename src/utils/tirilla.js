const PDFDocument = require('pdfkit')

const ANCHO_MM  = 80
const ANCHO_PT  = ANCHO_MM * 2.83465
const MARGEN    = 8
const CONTENIDO = ANCHO_PT - MARGEN * 2

const NEGRO = '#000000'
const GRIS  = '#555555'

function crearTirilla() {
  return new PDFDocument({
    margin: 0,
    size: [ANCHO_PT, 800],
    bufferPages: true,
  })
}

function enviarTirilla(res, doc, nombre) {
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', `attachment; filename=${nombre}`)
  doc.pipe(res)
}

function linea(doc, y) {
  doc.moveTo(MARGEN, y).lineTo(ANCHO_PT - MARGEN, y)
     .strokeColor(NEGRO).lineWidth(0.5).dash(2, { space: 2 }).stroke()
  doc.undash()
}

function lineaSolida(doc, y) {
  doc.moveTo(MARGEN, y).lineTo(ANCHO_PT - MARGEN, y)
     .strokeColor(NEGRO).lineWidth(0.8).stroke()
}

function encabezado(doc, titulo, numero, fecha) {
  let y = MARGEN
  doc.fillColor(NEGRO).fontSize(11).font('Helvetica-Bold')
     .text('SISGEM', MARGEN, y, { width: CONTENIDO, align: 'center' })
  y += 14
  doc.fillColor(GRIS).fontSize(6.5).font('Helvetica')
     .text('Sistema de Gestión para Minimercado', MARGEN, y, { width: CONTENIDO, align: 'center' })
  y += 12
  lineaSolida(doc, y)
  y += 6
  doc.fillColor(NEGRO).fontSize(8).font('Helvetica-Bold')
     .text(titulo.toUpperCase(), MARGEN, y, { width: CONTENIDO, align: 'center' })
  y += 12
  doc.fillColor(NEGRO).fontSize(7).font('Helvetica-Bold')
     .text(`No. ${numero}`, MARGEN, y, { width: CONTENIDO / 2 })
  doc.fillColor(GRIS).fontSize(7).font('Helvetica')
     .text(fecha, MARGEN + CONTENIDO / 2, y, { width: CONTENIDO / 2, align: 'right' })
  y += 12
  linea(doc, y)
  return y + 6
}

function filaDetalle(doc, label, valor, y, negrita = false) {
  doc.fillColor(GRIS).fontSize(7).font('Helvetica')
     .text(label, MARGEN, y, { width: CONTENIDO * 0.48 })
  doc.fillColor(NEGRO).fontSize(7).font(negrita ? 'Helvetica-Bold' : 'Helvetica')
     .text(String(valor ?? '—'), MARGEN + CONTENIDO * 0.48, y,
       { width: CONTENIDO * 0.52, align: 'right' })
  return y + 11
}

function pie(doc, y) {
  y += 6
  linea(doc, y)
  y += 6
  doc.fillColor(GRIS).fontSize(6.5).font('Helvetica')
     .text('Gracias por su compra', MARGEN, y, { width: CONTENIDO, align: 'center' })
  y += 9
  doc.fillColor(GRIS).fontSize(6).font('Helvetica')
     .text('SISGEM · Documento válido como constancia', MARGEN, y,
       { width: CONTENIDO, align: 'center' })
  return y + 12
}

const money = n => `$${parseFloat(n || 0).toLocaleString('es-CO')}`

const capitalizar = str => {
  if (!str) return str
  return String(str).charAt(0).toUpperCase() + String(str).slice(1)
}

module.exports = {
  crearTirilla, enviarTirilla,
  linea, lineaSolida,
  encabezado, filaDetalle, pie,
  money, capitalizar,
  MARGEN, CONTENIDO, ANCHO_PT,
  NEGRO, GRIS,
}