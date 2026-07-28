const ExcelJS = require('exceljs');

// hojas: [{ nombre, columnas: [{ header, key, width }], filas: [{...}] }]
async function enviarExcel(res, nombreArchivo, hojas) {
  const workbook = new ExcelJS.Workbook();

  for (const hoja of hojas) {
    const ws = workbook.addWorksheet(hoja.nombre || 'Hoja1');
    ws.columns = hoja.columnas.map(c => ({ header: c.header, key: c.key, width: c.width || 20 }));

    const filaEncabezado = ws.getRow(1);
    filaEncabezado.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    filaEncabezado.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E9E50' } };
    filaEncabezado.alignment = { vertical: 'middle' };

    hoja.filas.forEach(f => ws.addRow(f));
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${nombreArchivo}`);
  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { enviarExcel };