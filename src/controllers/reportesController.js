const pool = require('../config/db');
const { crearDocumento, agregarEncabezado, agregarTabla, agregarPie } = require('../utils/pdf');

function enviarPDF(res, doc, nombre) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${nombre}`);
  doc.pipe(res);
}

async function reporteVentas(req, res) {
  const { desde, hasta, tipo_venta, estado_id } = req.query;
  try {
    let query = `
      SELECT p.id,
        COALESCE(c.nombre || ' ' || c.apellido, p.cliente_nombre || ' (no registrado)', 'Cliente sin registro') AS cliente,
        p.tipo_venta, p.total, p.fecha_pedido, e.nombre AS estado
      FROM pedidos p
      LEFT JOIN clientes c ON p.cliente_id = c.id
      LEFT JOIN estados e ON p.estado_id = e.id
      WHERE 1=1
    `;
    const params = [];
    if (desde)      { params.push(desde);      query += ` AND DATE(p.fecha_pedido) >= $${params.length}`; }
    if (hasta)      { params.push(hasta);       query += ` AND DATE(p.fecha_pedido) <= $${params.length}`; }
    if (tipo_venta) { params.push(tipo_venta);  query += ` AND p.tipo_venta = $${params.length}`; }
    if (estado_id)  { params.push(estado_id);   query += ` AND p.estado_id = $${params.length}`; }
    query += ` ORDER BY p.fecha_pedido DESC`;
    const result = await pool.query(query, params);

    const doc = crearDocumento();
    enviarPDF(res, doc, 'reporte-ventas.pdf');
    agregarEncabezado(doc, 'reporte de ventas');

    const total = result.rows.reduce((s, r) => s + parseFloat(r.total || 0), 0);
    doc.fillColor('#1D3326').fontSize(10).font('Helvetica-Bold')
      .text(`total general: $${total.toLocaleString('es-CO')}`, { align: 'right' });
    doc.moveDown(0.5);

    agregarTabla(doc,
      ['#', 'cliente', 'tipo', 'estado', 'total', 'fecha'],
      result.rows.map(r => [
        r.id, r.cliente, r.tipo_venta, r.estado,
        `$${parseFloat(r.total).toLocaleString('es-CO')}`,
        new Date(r.fecha_pedido).toLocaleDateString('es-CO')
      ]),
      [35, 140, 70, 70, 90, 90]
    );
    agregarPie(doc);
    doc.end();
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function reportePedidos(req, res) {
  const { desde, hasta, estado_id } = req.query;
  try {
    let query = `
      SELECT p.id,
        COALESCE(c.nombre || ' ' || c.apellido, p.cliente_nombre || ' (no registrado)', 'Cliente sin registro') AS cliente,
        p.tipo_venta, p.total, p.fecha_pedido, e.nombre AS estado
      FROM pedidos p
      LEFT JOIN clientes c ON p.cliente_id = c.id
      LEFT JOIN estados e ON p.estado_id = e.id
      WHERE 1=1
    `;
    const params = [];
    if (desde)     { params.push(desde);     query += ` AND DATE(p.fecha_pedido) >= $${params.length}`; }
    if (hasta)     { params.push(hasta);      query += ` AND DATE(p.fecha_pedido) <= $${params.length}`; }
    if (estado_id) { params.push(estado_id);  query += ` AND p.estado_id = $${params.length}`; }
    query += ` ORDER BY p.fecha_pedido DESC`;
    const result = await pool.query(query, params);

    const doc = crearDocumento();
    enviarPDF(res, doc, 'reporte-pedidos.pdf');
    agregarEncabezado(doc, 'reporte de pedidos');
    agregarTabla(doc,
      ['#', 'cliente', 'tipo', 'estado', 'total', 'fecha'],
      result.rows.map(r => [
        r.id, r.cliente, r.tipo_venta, r.estado,
        `$${parseFloat(r.total).toLocaleString('es-CO')}`,
        new Date(r.fecha_pedido).toLocaleDateString('es-CO')
      ]),
      [35, 140, 70, 70, 90, 90]
    );
    agregarPie(doc);
    doc.end();
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function comprobantePedido(req, res) {
  const { id } = req.params;
  try {
    const pedido = await pool.query(`
      SELECT p.*,
             COALESCE(c.nombre || ' ' || c.apellido, p.cliente_nombre || ' (no registrado)', 'Cliente sin registro') AS cliente,
             c.telefono AS cliente_tel, e.nombre AS estado
      FROM pedidos p
      LEFT JOIN clientes c ON p.cliente_id = c.id
      LEFT JOIN estados e ON p.estado_id = e.id
      WHERE p.id = $1
    `, [id]);
    if (!pedido.rows.length)
      return res.status(404).json({ ok: false, mensaje: 'pedido no encontrado' });

    const prods = await pool.query(`
      SELECT pp.cantidad, pp.precio_unitario, pp.subtotal, pr.nombre
      FROM pedido_productos pp
      JOIN productos pr ON pp.producto_id = pr.id
      WHERE pp.pedido_id = $1
    `, [id]);

    const p = pedido.rows[0];
    const doc = crearDocumento();
    enviarPDF(res, doc, `comprobante-${id}.pdf`);
    agregarEncabezado(doc, `comprobante de pedido #${id}`);

    doc.fillColor('#1D3326').fontSize(10).font('Helvetica-Bold').text('datos del pedido');
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica')
      .text(`cliente: ${p.cliente}`)
      .text(`telefono: ${p.cliente_tel || '-'}`)
      .text(`tipo de venta: ${p.tipo_venta}`)
      .text(`estado: ${p.estado}`)
      .text(`fecha: ${new Date(p.fecha_pedido).toLocaleString('es-CO')}`);
    doc.moveDown(0.5);

    doc.fontSize(10).font('Helvetica-Bold').text('productos');
    doc.moveDown(0.3);
    agregarTabla(doc,
      ['producto', 'cant', 'precio unit', 'subtotal'],
      prods.rows.map(r => [
        r.nombre, r.cantidad,
        `$${parseFloat(r.precio_unitario).toLocaleString('es-CO')}`,
        `$${parseFloat(r.subtotal).toLocaleString('es-CO')}`
      ]),
      [220, 50, 110, 115]
    );

    doc.moveDown(0.5);
    doc.fillColor('#1D3326').fontSize(11).font('Helvetica-Bold')
      .text(`total: $${parseFloat(p.total).toLocaleString('es-CO')}`, { align: 'right' });

    agregarPie(doc);
    doc.end();
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function reporteClientes(req, res) {
  try {
    const result = await pool.query(`SELECT * FROM clientes ORDER BY id DESC`);
    const doc = crearDocumento();
    enviarPDF(res, doc, 'reporte-clientes.pdf');
    agregarEncabezado(doc, 'reporte de clientes');
    agregarTabla(doc,
      ['#', 'nombre', 'correo', 'telefono', 'estado'],
      result.rows.map(r => [
        r.id, `${r.nombre} ${r.apellido}`,
        r.email || '-', r.telefono || '-',
        r.estado ? 'activo' : 'inactivo'
      ]),
      [35, 160, 150, 80, 70]
    );
    agregarPie(doc);
    doc.end();
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function reporteProveedores(req, res) {
  try {
    const result = await pool.query(`SELECT * FROM proveedores ORDER BY id DESC`);
    const doc = crearDocumento();
    enviarPDF(res, doc, 'reporte-proveedores.pdf');
    agregarEncabezado(doc, 'reporte de proveedores');
    agregarTabla(doc,
      ['#', 'nombre', 'documento', 'telefono', 'correo', 'estado'],
      result.rows.map(r => [
        r.id, r.nombre, r.documento || '-',
        r.telefono || '-', r.email || '-',
        r.estado ? 'activo' : 'inactivo'
      ]),
      [35, 130, 80, 80, 120, 50]
    );
    agregarPie(doc);
    doc.end();
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function reportePagos(req, res) {
  try {
    const result = await pool.query(`
      SELECT p.id, p.pedido_id, p.monto, p.metodo, p.fecha, e.nombre AS estado
      FROM pagos p LEFT JOIN estados e ON p.estado_id = e.id
      ORDER BY p.id DESC
    `);
    const doc = crearDocumento();
    enviarPDF(res, doc, 'reporte-pagos.pdf');
    agregarEncabezado(doc, 'reporte de pagos');
    agregarTabla(doc,
      ['#', 'pedido #', 'monto', 'metodo', 'estado', 'fecha'],
      result.rows.map(r => [
        r.id, r.pedido_id,
        `$${parseFloat(r.monto).toLocaleString('es-CO')}`,
        r.metodo, r.estado || '-',
        new Date(r.fecha).toLocaleDateString('es-CO')
      ]),
      [35, 65, 90, 80, 70, 100]
    );
    agregarPie(doc);
    doc.end();
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function comprobantePagosPedido(req, res) {
  const { id } = req.params;
  try {
    const pedido = await pool.query(`
      SELECT p.*,
             COALESCE(c.nombre || ' ' || c.apellido, p.cliente_nombre || ' (no registrado)', 'Cliente sin registro') AS cliente
      FROM pedidos p
      LEFT JOIN clientes c ON p.cliente_id = c.id
      WHERE p.id = $1
    `, [id]);
    if (!pedido.rows.length)
      return res.status(404).json({ ok: false, mensaje: 'pedido no encontrado' });

    const pagos = await pool.query(`
      SELECT p.id, p.monto, p.metodo, p.fecha, e.nombre AS estado
      FROM pagos p
      LEFT JOIN estados e ON p.estado_id = e.id
      WHERE p.pedido_id = $1
      ORDER BY p.fecha ASC, p.id ASC
    `, [id]);

    const p = pedido.rows[0];
    const esAnuladoEstado = nombre => !!nombre && nombre.toLowerCase().includes('anula');

    const totalPagado = pagos.rows
      .filter(r => !esAnuladoEstado(r.estado))
      .reduce((s, r) => s + parseFloat(r.monto || 0), 0);
    const saldoPendiente = Math.max(0, parseFloat(p.total || 0) - totalPagado);

    const doc = crearDocumento();
    enviarPDF(res, doc, `pagos-pedido-${id}.pdf`);
    agregarEncabezado(doc, `historial de pagos — venta #${id}`);

    doc.fillColor('#1D3326').fontSize(10).font('Helvetica-Bold').text('datos de la venta');
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica')
      .text(`cliente: ${p.cliente}`)
      .text(`total venta: $${parseFloat(p.total).toLocaleString('es-CO')}`)
      .text(`total pagado: $${totalPagado.toLocaleString('es-CO')}`)
      .text(`saldo pendiente: ${saldoPendiente === 0 ? 'completamente pagado' : '$' + saldoPendiente.toLocaleString('es-CO')}`);
    doc.moveDown(0.5);

    doc.fontSize(10).font('Helvetica-Bold').text('movimientos');
    doc.moveDown(0.3);

    if (pagos.rows.length === 0) {
      doc.fontSize(9).font('Helvetica').fillColor('#888').text('sin movimientos registrados');
    } else {
      agregarTabla(doc,
        ['#', 'monto', 'metodo', 'estado', 'fecha'],
        pagos.rows.map(r => [
          r.id,
          `$${parseFloat(r.monto).toLocaleString('es-CO')}`,
          r.metodo || '-',
          r.estado || '-',
          new Date(r.fecha).toLocaleString('es-CO')
        ]),
        [35, 100, 90, 90, 145]
      );
    }

    doc.moveDown(0.5);
    doc.fillColor('#1D3326').fontSize(11).font('Helvetica-Bold')
      .text(`total pagado: $${totalPagado.toLocaleString('es-CO')}`, { align: 'right' });

    agregarPie(doc);
    doc.end();
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function reporteOrdenes(req, res) {
  try {
    const result = await pool.query(`
      SELECT o.id, p.nombre AS proveedor, o.total, o.fecha, e.nombre AS estado
      FROM ordenes_compra o
      LEFT JOIN proveedores p ON o.proveedor_id = p.id
      LEFT JOIN estados e ON o.estado_id = e.id
      ORDER BY o.id DESC
    `);
    const doc = crearDocumento();
    enviarPDF(res, doc, 'reporte-ordenes.pdf');
    agregarEncabezado(doc, 'reporte de ordenes de compra');
    agregarTabla(doc,
      ['#', 'proveedor', 'total', 'estado', 'fecha'],
      result.rows.map(r => [
        r.id, r.proveedor,
        `$${parseFloat(r.total).toLocaleString('es-CO')}`,
        r.estado || '-',
        new Date(r.fecha).toLocaleDateString('es-CO')
      ]),
      [35, 180, 100, 80, 100]
    );
    agregarPie(doc);
    doc.end();
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function reporteDomicilios(req, res) {
  try {
    const result = await pool.query(`
      SELECT d.id, d.pedido_id, de.direccion, de.ciudad,
             d.tarifa_aplicada, e.nombre AS estado
      FROM domicilios d
      LEFT JOIN direcciones_envio de ON d.direccion_id = de.id
      LEFT JOIN estados e ON d.estado_id = e.id
      ORDER BY d.id DESC
    `);
    const doc = crearDocumento();
    enviarPDF(res, doc, 'reporte-domicilios.pdf');
    agregarEncabezado(doc, 'reporte de domicilios');
    agregarTabla(doc,
      ['#', 'pedido #', 'direccion', 'ciudad', 'tarifa', 'estado'],
      result.rows.map(r => [
        r.id, r.pedido_id, r.direccion || '-', r.ciudad || '-',
        `$${parseFloat(r.tarifa_aplicada || 0).toLocaleString('es-CO')}`,
        r.estado || '-'
      ]),
      [35, 60, 150, 80, 70, 70]
    );
    agregarPie(doc);
    doc.end();
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function reporteProductos(req, res) {
  try {
    const result = await pool.query(`
      SELECT p.id, p.nombre, p.precio, p.stock,
             c.nombre AS categoria, pr.nombre AS proveedor,
             p.estado
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
      ORDER BY p.id DESC
    `);
    const doc = crearDocumento();
    enviarPDF(res, doc, 'reporte-productos.pdf');
    agregarEncabezado(doc, 'reporte de productos');
    agregarTabla(doc,
      ['#', 'nombre', 'categoria', 'precio', 'stock', 'estado'],
      result.rows.map(r => [
        r.id, r.nombre, r.categoria || '-',
        `$${parseFloat(r.precio).toLocaleString('es-CO')}`,
        r.stock,
        r.estado ? 'activo' : 'inactivo'
      ]),
      [35, 150, 100, 80, 50, 60]
    );
    agregarPie(doc);
    doc.end();
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function comprobanteOrden(req, res) {
  const { id } = req.params;
  try {
    const orden = await pool.query(`
      SELECT o.*, p.nombre AS proveedor, e.nombre AS estado
      FROM ordenes_compra o
      LEFT JOIN proveedores p ON o.proveedor_id = p.id
      LEFT JOIN estados e ON o.estado_id = e.id
      WHERE o.id = $1
    `, [id]);
    if (!orden.rows.length)
      return res.status(404).json({ ok: false, mensaje: 'orden no encontrada' });

    const det = await pool.query(`
      SELECT od.cantidad, od.costo_unitario, od.subtotal, pr.nombre
      FROM ordenes_compra_detalle od
      JOIN productos pr ON od.producto_id = pr.id
      WHERE od.orden_compra_id = $1
    `, [id]);

    const o = orden.rows[0];
    const doc = crearDocumento();
    enviarPDF(res, doc, `orden-${id}.pdf`);
    agregarEncabezado(doc, `orden de compra #${id}`);

    doc.fillColor('#1D3326').fontSize(10).font('Helvetica-Bold').text('datos de la orden');
    doc.moveDown(0.3);
    doc.fontSize(9).font('Helvetica')
      .text(`proveedor: ${o.proveedor}`)
      .text(`estado: ${o.estado}`)
      .text(`metodo pago: ${o.metodo_pago || '-'}`)
      .text(`fecha: ${o.fecha_compra ? new Date(o.fecha_compra).toLocaleDateString('es-CO') : '-'}`);
    doc.moveDown(0.5);

    doc.fontSize(10).font('Helvetica-Bold').text('productos');
    doc.moveDown(0.3);
    agregarTabla(doc,
      ['producto', 'cant', 'costo unit', 'subtotal'],
      det.rows.map(r => [
        r.nombre, r.cantidad,
        `$${parseFloat(r.costo_unitario).toLocaleString('es-CO')}`,
        `$${parseFloat(r.subtotal).toLocaleString('es-CO')}`
      ]),
      [220, 50, 110, 115]
    );

    doc.moveDown(0.5);
    doc.fillColor('#1D3326').fontSize(11).font('Helvetica-Bold')
      .text(`total: $${parseFloat(o.total).toLocaleString('es-CO')}`, { align: 'right' });

    agregarPie(doc);
    doc.end();
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = {
  reporteVentas, reportePedidos, comprobantePedido,
  reporteClientes, reporteProveedores, reportePagos, comprobantePagosPedido,
  reporteOrdenes, comprobanteOrden, reporteDomicilios, reporteProductos
};