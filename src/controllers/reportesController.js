const pool = require('../config/db');
const {
  crearDocumento, agregarEncabezado, agregarTabla, agregarPie,
  agregarSeccionTitulo, agregarFicha, agregarTotalDestacado, capitalizar,
} = require('../utils/pdf');
const { enviarExcel } = require('../utils/excel');

function enviarPDF(res, doc, nombre) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename=${nombre}`);
  doc.pipe(res);
}

const money = n => `$${parseFloat(n || 0).toLocaleString('es-CO')}`;

// calcula el rango de fechas y el título según el período pedido (dia/semana/mes),
// o usa desde/hasta directamente si no se pasa período (rango personalizado).
// Se reutiliza en reporteVentas, reportePagos y reporteOrdenes para no repetir
// la misma lógica tres veces.
function calcularRangoPeriodo(periodo, prefijo, desdeQS, hastaQS) {
  let fechaDesde = desdeQS;
  let fechaHasta = hastaQS;
  let tituloPeriodo = `reporte de ${prefijo}`;

  if (periodo) {
    const hoy = new Date();
    const yyyy = hoy.getFullYear();
    const mm   = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd   = String(hoy.getDate()).padStart(2, '0');

    if (periodo === 'dia') {
      fechaDesde = `${yyyy}-${mm}-${dd}`;
      fechaHasta = `${yyyy}-${mm}-${dd}`;
      tituloPeriodo = `reporte diario de ${prefijo} — ${hoy.toLocaleDateString('es-CO')}`;
    } else if (periodo === 'semana') {
      const inicioSemana = new Date(hoy);
      inicioSemana.setDate(hoy.getDate() - hoy.getDay() + 1); // lunes
      const y1 = inicioSemana.getFullYear();
      const m1 = String(inicioSemana.getMonth() + 1).padStart(2, '0');
      const d1 = String(inicioSemana.getDate()).padStart(2, '0');
      fechaDesde = `${y1}-${m1}-${d1}`;
      fechaHasta = `${yyyy}-${mm}-${dd}`;
      tituloPeriodo = `reporte semanal de ${prefijo} — semana del ${d1}/${m1}/${y1}`;
    } else if (periodo === 'mes') {
      fechaDesde = `${yyyy}-${mm}-01`;
      fechaHasta = `${yyyy}-${mm}-${dd}`;
      tituloPeriodo = `reporte mensual de ${prefijo} — ${hoy.toLocaleString('es-CO', { month: 'long', year: 'numeric' })}`;
    }
  } else if (desdeQS || hastaQS) {
    tituloPeriodo = `reporte de ${prefijo} — rango personalizado`;
  }

  return { fechaDesde, fechaHasta, tituloPeriodo };
}

async function reporteVentas(req, res) {
  const { desde, hasta, tipo_venta, estado_id, periodo, formato } = req.query;
  try {
    const { fechaDesde, fechaHasta, tituloPeriodo } = calcularRangoPeriodo(periodo, 'ventas', desde, hasta);

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
    if (fechaDesde)  { params.push(fechaDesde);  query += ` AND DATE(p.fecha_pedido) >= $${params.length}`; }
    if (fechaHasta)  { params.push(fechaHasta);  query += ` AND DATE(p.fecha_pedido) <= $${params.length}`; }
    if (tipo_venta)  { params.push(tipo_venta);  query += ` AND p.tipo_venta = $${params.length}`; }
    if (estado_id)   { params.push(estado_id);   query += ` AND p.estado_id = $${params.length}`; }
    query += ` ORDER BY p.fecha_pedido DESC`;
    const result = await pool.query(query, params);

    const total = result.rows.reduce((s, r) => s + parseFloat(r.total || 0), 0);

    if (formato === 'excel') {
      return enviarExcel(res, 'reporte-ventas.xlsx', [{
        nombre: 'Ventas',
        columnas: [
          { header: '#',       key: 'id',     width: 8  },
          { header: 'Cliente', key: 'cliente',width: 30 },
          { header: 'Tipo',    key: 'tipo',   width: 14 },
          { header: 'Estado',  key: 'estado', width: 14 },
          { header: 'Total',   key: 'total',  width: 16 },
          { header: 'Fecha',   key: 'fecha',  width: 16 },
        ],
        filas: result.rows.map(r => ({
          id: r.id, cliente: r.cliente, tipo: capitalizar(r.tipo_venta), estado: capitalizar(r.estado),
          total: parseFloat(r.total), fecha: new Date(r.fecha_pedido).toLocaleDateString('es-CO'),
        })),
      }]);
    }

    const doc = crearDocumento();
    enviarPDF(res, doc, 'reporte-ventas.pdf');
    agregarEncabezado(doc, tituloPeriodo);

    agregarTotalDestacado(doc, 'Total general', money(total));

    agregarTabla(doc,
      ['#', 'cliente', 'tipo', 'estado', 'total', 'fecha'],
      result.rows.map(r => [
        r.id, r.cliente, capitalizar(r.tipo_venta), capitalizar(r.estado),
        money(r.total),
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
        r.id, r.cliente, capitalizar(r.tipo_venta), capitalizar(r.estado),
        money(r.total),
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

    agregarSeccionTitulo(doc, 'Datos del pedido');
    agregarFicha(doc, [
      { label: 'Cliente',       valor: p.cliente },
      { label: 'Teléfono',      valor: p.cliente_tel || '—' },
      { label: 'Tipo de venta', valor: capitalizar(p.tipo_venta) },
      { label: 'Estado',        valor: capitalizar(p.estado) },
      { label: 'Fecha',         valor: new Date(p.fecha_pedido).toLocaleString('es-CO') },
    ]);

    agregarSeccionTitulo(doc, 'Productos')
    agregarTabla(doc,
      ['producto', 'cant', 'precio unit', 'subtotal'],
      prods.rows.map(r => [
        r.nombre, r.cantidad, money(r.precio_unitario), money(r.subtotal)
      ]),
      [220, 50, 110, 115]
    );

    agregarTotalDestacado(doc, 'Total', money(p.total));

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
        r.email || '—', r.telefono || '—',
        r.estado ? 'Activo' : 'Inactivo'
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
        r.id, r.nombre, r.documento || '—',
        r.telefono || '—', r.email || '—',
        r.estado ? 'Activo' : 'Inactivo'
      ]),
      [35, 130, 80, 80, 120, 50]
    );
    agregarPie(doc);
    doc.end();
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function reportePagos(req, res) {
  const { desde, hasta, periodo, formato } = req.query;
  try {
    const { fechaDesde, fechaHasta, tituloPeriodo } = calcularRangoPeriodo(periodo, 'pagos', desde, hasta);

    let query = `
      SELECT p.id, p.pedido_id, p.monto, p.metodo, p.fecha, e.nombre AS estado
      FROM pagos p LEFT JOIN estados e ON p.estado_id = e.id
      WHERE 1=1
    `;
    const params = [];
    if (fechaDesde) { params.push(fechaDesde); query += ` AND DATE(p.fecha) >= $${params.length}`; }
    if (fechaHasta) { params.push(fechaHasta); query += ` AND DATE(p.fecha) <= $${params.length}`; }
    query += ` ORDER BY p.id DESC`;
    const result = await pool.query(query, params);

    if (formato === 'excel') {
      return enviarExcel(res, 'reporte-pagos.xlsx', [{
        nombre: 'Pagos',
        columnas: [
          { header: '#',        key: 'id',      width: 8  },
          { header: 'Pedido #', key: 'pedido',  width: 12 },
          { header: 'Monto',    key: 'monto',   width: 16 },
          { header: 'Metodo',   key: 'metodo',  width: 16 },
          { header: 'Estado',   key: 'estado',  width: 14 },
          { header: 'Fecha',    key: 'fecha',   width: 16 },
        ],
        filas: result.rows.map(r => ({
          id: r.id, pedido: r.pedido_id, monto: parseFloat(r.monto),
          metodo: capitalizar(r.metodo), estado: capitalizar(r.estado),
          fecha: new Date(r.fecha).toLocaleDateString('es-CO'),
        })),
      }]);
    }

    const doc = crearDocumento();
    enviarPDF(res, doc, 'reporte-pagos.pdf');
    agregarEncabezado(doc, tituloPeriodo);
    agregarTabla(doc,
      ['#', 'pedido #', 'monto', 'metodo', 'estado', 'fecha'],
      result.rows.map(r => [
        r.id, r.pedido_id, money(r.monto),
        capitalizar(r.metodo), capitalizar(r.estado) || '—',
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

    agregarSeccionTitulo(doc, 'Datos de la venta');
    agregarFicha(doc, [
      { label: 'Cliente',          valor: p.cliente },
      { label: 'Total venta',      valor: money(p.total) },
      { label: 'Total pagado',     valor: money(totalPagado) },
      { label: 'Saldo pendiente',  valor: saldoPendiente === 0 ? 'Completamente pagado' : money(saldoPendiente) },
    ]);

    agregarSeccionTitulo(doc, 'Movimientos');

    if (pagos.rows.length === 0) {
      doc.fontSize(9).font('Helvetica').fillColor('#9CA3AF').text('Sin movimientos registrados');
      doc.moveDown(1);
    } else {
      agregarTabla(doc,
        ['#', 'monto', 'metodo', 'estado', 'fecha'],
        pagos.rows.map(r => [
          r.id, money(r.monto), capitalizar(r.metodo) || '—', capitalizar(r.estado) || '—',
          new Date(r.fecha).toLocaleString('es-CO')
        ]),
        [35, 100, 90, 90, 145]
      );
    }

    agregarTotalDestacado(doc, 'Total pagado', money(totalPagado));

    agregarPie(doc);
    doc.end();
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function reporteOrdenes(req, res) {
  const { desde, hasta, periodo, formato } = req.query;
  try {
    const { fechaDesde, fechaHasta, tituloPeriodo } = calcularRangoPeriodo(periodo, 'ordenes de compra', desde, hasta);

    let query = `
      SELECT o.id, p.nombre AS proveedor, o.total, o.fecha, e.nombre AS estado
      FROM ordenes_compra o
      LEFT JOIN proveedores p ON o.proveedor_id = p.id
      LEFT JOIN estados e ON o.estado_id = e.id
      WHERE 1=1
    `;
    const params = [];
    if (fechaDesde) { params.push(fechaDesde); query += ` AND DATE(o.fecha) >= $${params.length}`; }
    if (fechaHasta) { params.push(fechaHasta); query += ` AND DATE(o.fecha) <= $${params.length}`; }
    query += ` ORDER BY o.id DESC`;
    const result = await pool.query(query, params);

    if (formato === 'excel') {
      return enviarExcel(res, 'reporte-ordenes.xlsx', [{
        nombre: 'Ordenes',
        columnas: [
          { header: '#',         key: 'id',        width: 8  },
          { header: 'Proveedor', key: 'proveedor', width: 30 },
          { header: 'Total',     key: 'total',      width: 16 },
          { header: 'Estado',    key: 'estado',     width: 14 },
          { header: 'Fecha',     key: 'fecha',      width: 16 },
        ],
        filas: result.rows.map(r => ({
          id: r.id, proveedor: r.proveedor, total: parseFloat(r.total),
          estado: capitalizar(r.estado), fecha: new Date(r.fecha).toLocaleDateString('es-CO'),
        })),
      }]);
    }

    const doc = crearDocumento();
    enviarPDF(res, doc, 'reporte-ordenes.pdf');
    agregarEncabezado(doc, tituloPeriodo);
    agregarTabla(doc,
      ['#', 'proveedor', 'total', 'estado', 'fecha'],
      result.rows.map(r => [
        r.id, r.proveedor, money(r.total), capitalizar(r.estado) || '—',
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
        r.id, r.pedido_id, r.direccion || '—', r.ciudad || '—',
        money(r.tarifa_aplicada),
        capitalizar(r.estado) || '—'
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
        r.id, r.nombre, r.categoria || '—',
        money(r.precio),
        r.stock,
        r.estado ? 'Activo' : 'Inactivo'
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

    agregarSeccionTitulo(doc, 'Datos de la orden');
    agregarFicha(doc, [
      { label: 'Proveedor',    valor: o.proveedor },
      { label: 'Estado',       valor: capitalizar(o.estado) },
      { label: 'Método pago',  valor: o.metodo_pago || '—' },
      { label: 'Fecha',        valor: o.fecha_compra ? new Date(o.fecha_compra).toLocaleDateString('es-CO') : '—' },
    ]);

    agregarSeccionTitulo(doc, 'Productos')
    agregarTabla(doc,
      ['producto', 'cant', 'costo unit', 'subtotal'],
      det.rows.map(r => [
        r.nombre, r.cantidad, money(r.costo_unitario), money(r.subtotal)
      ]),
      [220, 50, 110, 115]
    );

    agregarTotalDestacado(doc, 'Total', money(o.total));

    agregarPie(doc);
    doc.end();
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = {
  reporteVentas, reportePedidos, comprobantePedido,
  reporteClientes, reporteProveedores, reportePagos, comprobantePagosPedido,
  reporteOrdenes, comprobanteOrden, reporteDomicilios, reporteProductos
};