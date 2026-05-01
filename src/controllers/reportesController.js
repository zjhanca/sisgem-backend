// controllers/reportesController.js
const pool = require('../config/db');
const { crearDocumento, agregarEncabezado, agregarTabla, agregarPie } = require('../utils/pdf');

async function reporteVentas(req, res) {
  const { desde, hasta } = req.query;
  try {
    const result = await pool.query(`
      SELECT p.id, cl.nombre || ' ' || cl.apellido AS cliente,
        p.tipo_venta, p.total, p.fecha_pedido,
        e.nombre AS estado
      FROM pedidos p
      LEFT JOIN clientes cl ON p.cliente_id = cl.id
      LEFT JOIN estados e ON p.estado_id = e.id
      WHERE p.fecha_pedido BETWEEN $1 AND $2
        AND p.estado_id != 5
      ORDER BY p.fecha_pedido DESC`
    , [desde || '2020-01-01', hasta || new Date()]);

    const doc = crearDocumento();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=reporte-ventas.pdf');
    doc.pipe(res);

    agregarEncabezado(doc, 'reporte de ventas');

    const totalGeneral = result.rows.reduce((s, r) => s + parseFloat(r.total), 0);
    doc.fillColor('#1D3326').fontSize(11).font('Helvetica-Bold')
       .text(`total general: $${totalGeneral.toLocaleString('es-CO')}`, { align: 'right' });
    doc.moveDown();

    agregarTabla(doc,
      ['#', 'cliente', 'tipo', 'estado', 'total', 'fecha'],
      result.rows.map(r => [
        r.id, r.cliente, r.tipo_venta, r.estado,
        '$' + parseFloat(r.total).toLocaleString('es-CO'),
        new Date(r.fecha_pedido).toLocaleDateString('es-CO')
      ]),
      [40, 130, 70, 70, 80, 85]
    );

    agregarPie(doc);
    doc.end();
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
}

module.exports = { reporteVentas };
