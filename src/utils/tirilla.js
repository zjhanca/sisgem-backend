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

// ── Datos de la empresa ─────────────────────────────────────────────
const EMPRESA = {
  nombre:      'SISGEM',
  razonSocial: 'Mini-Mercado',
  nit:         '900.123.456-7',
  direccion:   'Calle 45 # 32-10, Medellín',
  telefono:    '(604) 123 4567',
  regimen:     'Régimen Simplificado',
}

function encabezado(doc, titulo, numero, fecha) {
  let y = MARGEN

  // Nombre comercial
  doc.fillColor(NEGRO).fontSize(11).font('Helvetica-Bold')
     .text(EMPRESA.nombre, MARGEN, y, { width: CONTENIDO, align: 'center' })
  y += 13

  // Razón social
  doc.fillColor(GRIS).fontSize(6.5).font('Helvetica')
     .text(EMPRESA.razonSocial, MARGEN, y, { width: CONTENIDO, align: 'center' })
  y += 10

  // NIT
  doc.fillColor(GRIS).fontSize(6.5).font('Helvetica')
     .text(`NIT: ${EMPRESA.nit}`, MARGEN, y, { width: CONTENIDO, align: 'center' })
  y += 10

  // Dirección
  doc.fillColor(GRIS).fontSize(6.5).font('Helvetica')
     .text(EMPRESA.direccion, MARGEN, y, { width: CONTENIDO, align: 'center' })
  y += 10

  // Teléfono
  doc.fillColor(GRIS).fontSize(6.5).font('Helvetica')
     .text(`Tel: ${EMPRESA.telefono}`, MARGEN, y, { width: CONTENIDO, align: 'center' })
  y += 10

  // Régimen
  doc.fillColor(GRIS).fontSize(6.5).font('Helvetica')
     .text(EMPRESA.regimen, MARGEN, y, { width: CONTENIDO, align: 'center' })
  y += 12

  lineaSolida(doc, y)
  y += 6

  // Título del documento
  doc.fillColor(NEGRO).fontSize(8).font('Helvetica-Bold')
     .text(titulo.toUpperCase(), MARGEN, y, { width: CONTENIDO, align: 'center' })
  y += 12

  // Número + fecha
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
     .text(`${EMPRESA.nombre} · Documento válido como constancia`, MARGEN, y,
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