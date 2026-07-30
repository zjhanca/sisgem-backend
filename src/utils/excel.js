const ExcelJS = require('exceljs');

// colores de marca (los mismos usados en el PDF y en el frontend)
const COLOR_PRIMARIO = 'FF1E9E50'; // verde principal
const COLOR_TEXTO_CLARO = 'FFFFFFFF';
const COLOR_FILA_PAR = 'FFF0FFF4'; // verde muy claro (zebra)

// pone en mayúscula la primera letra (para encabezados de columna)
function capitalizar(str) {
  if (!str) return str;
  const s = String(str);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// corrige texto que llegó mal codificado (ej. "Ã©" en vez de "é"), típico
// cuando una cadena UTF-8 se interpretó por error como Latin1 en algún punto
// de la cadena (driver de BD, lectura de archivo, etc). Solo se aplica si
// detecta el patrón típico de ese error, para no romper texto ya correcto.
function corregirTexto(valor) {
  if (typeof valor !== 'string') return valor;
  const pareceMalCodificado = /Ã[\x80-\xBF]|Â[\x80-\xBF]/.test(valor);
  if (!pareceMalCodificado) return valor.normalize('NFC');
  try {
    const reparado = Buffer.from(valor, 'latin1').toString('utf8');
    return reparado.normalize('NFC');
  } catch {
    return valor;
  }
}

// columnas cuyo contenido se formatea como moneda automáticamente
const CLAVES_MONEDA = ['precio', 'monto', 'total', 'subtotal', 'costo', 'saldo', 'pagado', 'pendiente'];
const esColumnaMoneda = key => CLAVES_MONEDA.some(c => key?.toLowerCase().includes(c));

// hojas: [{ nombre, columnas: [{ header, key, width }], filas: [{...}] }]
async function enviarExcel(res, nombreArchivo, hojas) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SISGEM';
  workbook.created = new Date();

  for (const hoja of hojas) {
    const ws = workbook.addWorksheet(corregirTexto(hoja.nombre) || 'Hoja1');

    ws.columns = hoja.columnas.map(c => ({
      header: capitalizar(corregirTexto(c.header)),
      key: c.key,
      width: c.width || 20,
    }));

    // encabezado con el color de marca
    const filaEncabezado = ws.getRow(1);
    filaEncabezado.eachCell(cell => {
      cell.font = { bold: true, color: { argb: COLOR_TEXTO_CLARO } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_PRIMARIO } };
      cell.alignment = { vertical: 'middle', horizontal: 'left' };
    });
    filaEncabezado.height = 20;

    // filas: corrige texto mal codificado y aplica formato de moneda donde aplique
    hoja.filas.forEach((f, idx) => {
      const limpia = {};
      for (const [key, valor] of Object.entries(f)) {
        limpia[key] = corregirTexto(valor);
      }
      const fila = ws.addRow(limpia);

      hoja.columnas.forEach(col => {
        const cell = fila.getCell(col.key);
        if (esColumnaMoneda(col.key) && typeof cell.value === 'number') {
          cell.numFmt = '"$"#,##0';
        }
      });

      // zebra striping sutil, mismo tono que el PDF
      if (idx % 2 === 0) {
        fila.eachCell(cell => {
          if (!cell.fill) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLOR_FILA_PAR } };
        });
      }
    });

    // encabezado siempre visible al hacer scroll, y filtro rápido
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: hoja.columnas.length } };
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"; filename*=UTF-8''${encodeURIComponent(nombreArchivo)}`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { enviarExcel };