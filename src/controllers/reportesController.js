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

function calcularRangoPeriodo(periodo, prefijo, desdeQS, hastaQS) {
  let fechaDesde = desdeQS;
  let fechaHasta = hastaQS;
  let tituloPeriodo = `reporte de ${prefijo}`;
  if (periodo) {
    const hoy  = new Date();
    const yyyy = hoy.getFullYear();
    const mm   = String(hoy.getMonth() + 1).padStart(2, '0');
    const dd   = String(hoy.getDate()).padStart(2, '0');
    if (periodo === 'dia') {
      fechaDesde = `${yyyy}-${mm}-${dd}`;
      fechaHasta = `${yyyy}-${mm}-${dd}`;
      tituloPeriodo = `reporte diario de ${prefijo} — ${hoy.toLocaleDateString('es-CO')}`;
    } else if (periodo === 'semana') {
      const inicioSemana = new Date(hoy);
      inicioSemana.setDate(hoy.getDate() - hoy.getDay() + 1);
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
    const total  = result.rows.reduce((s, r) => s + parseFloat(r.total || 0), 0);
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
          id: r.id, cliente: r.cliente, tipo: capitalizar(r.tipo_venta),
          estado: capitalizar(r.estado), total: parseFloat(r.total),
          fecha: new Date(r.fecha_pedido).toLocaleDateString('es-CO'),
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
        money(r.total), new Date(r.fecha_pedido).toLocaleDateString('es-CO'),
      ]),
      [35, 130, 65, 70, 80, 85]
    );
    agregarPie(doc);
    doc.end();
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function reportePedidos(req, res) {
  try {
    const result = await pool.query(`
      SELECT p.id,
        COALESCE(c.nombre || ' ' || c.apellido, p.cliente_nombre, 'ocasional') AS cliente,
        p.tipo_venta, p.total, p.fecha_pedido, e.nombre AS estado
      FROM pedidos p
      LEFT JOIN clientes c ON p.cliente_id = c.id
      LEFT JOIN estados e ON p.estado_id = e.id
      ORDER BY p.id DESC
    `);
    const doc = crearDocumento();
    enviarPDF(res, doc, 'reporte-pedidos.pdf');
    agregarEncabezado(doc, 'reporte de pedidos');
    agregarTabla(doc,
      ['#', 'cliente', 'tipo', 'total', 'estado', 'fecha'],
      result.rows.map(r => [
        r.id, r.cliente, capitalizar(r.tipo_venta),
        money(r.total), capitalizar(r.estado),
        new Date(r.fecha_pedido).toLocaleDateString('es-CO'),
      ]),
      [35, 130, 65, 70, 80, 85]
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
        COALESCE(c.nombre || ' ' || c.apellido, p.cliente_nombre, 'Cliente mostrador') AS cliente,
        c.telefono AS cliente_tel, c.tipo_documento, c.numero_documento,
        e.nombre AS estado,
        (SELECT metodo FROM pagos WHERE pedido_id = p.id
         AND estado_id NOT IN (SELECT id FROM estados WHERE LOWER(nombre) LIKE '%anula%')
         ORDER BY id ASC LIMIT 1) AS metodo_pago
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

    const p      = pedido.rows[0];
    const VERDE  = '#1E9E50';
    const OSCURO = '#0F1C22';
    const GRIS   = '#6B7280';
    const MG     = 50;
    const ANCHO  = 595 - MG * 2;
    const doc    = new (require('pdfkit'))({ margin: 0, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=comprobante-${id}.pdf`);
    doc.pipe(res);

    doc.rect(0, 0, doc.page.width, 100).fill(OSCURO);
    doc.fillColor(VERDE).fontSize(26).font('Helvetica-Bold').text('SISGEM', MG, 20);
    doc.fillColor('#9CA3AF').fontSize(9).font('Helvetica')
       .text('Sistema de Gestión para Minimercado', MG, 50);
    doc.fillColor(VERDE).fontSize(14).font('Helvetica-Bold')
       .text(`Comprobante #${id}`, 0, 20, { align: 'right', width: doc.page.width - MG });
    doc.fillColor('#9CA3AF').fontSize(8).font('Helvetica')
       .text(
         new Date(p.fecha_pedido).toLocaleString('es-CO', {
           year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
         }),
         0, 42, { align: 'right', width: doc.page.width - MG }
       );
    const estadoColor = p.estado?.toLowerCase().includes('anula') ? '#EF4444'
      : p.estado?.toLowerCase().includes('pendiente') ? '#F59E0B' : VERDE;
    doc.roundedRect(MG, 62, 100, 20, 4).fill(estadoColor);
    doc.fillColor('#FFFFFF').fontSize(8).font('Helvetica-Bold')
       .text(capitalizar(p.estado) || 'Pendiente', MG, 68, { width: 100, align: 'center' });
    doc.y = 118;

    doc.fillColor(OSCURO).fontSize(10).font('Helvetica-Bold').text('DATOS DEL CLIENTE', MG, doc.y);
    doc.moveTo(MG, doc.y + 14).lineTo(doc.page.width - MG, doc.y + 14)
       .strokeColor(VERDE).lineWidth(1.5).stroke();
    doc.y += 22;

    const fila = (label, valor) => {
      if (!valor || valor === '—') return;
      const y = doc.y;
      doc.fillColor(GRIS).fontSize(8).font('Helvetica').text(label, MG, y, { width: 110 });
      doc.fillColor(OSCURO).fontSize(8).font('Helvetica-Bold')
         .text(valor, MG + 120, y, { width: ANCHO - 120 });
      doc.y = y + 14;
    };
    fila('Cliente',        p.cliente);
    fila('Teléfono',       p.cliente_tel);
    fila('Documento',      p.numero_documento ? `${p.tipo_documento || 'CC'}: ${p.numero_documento}` : null);
    fila('Método de pago', capitalizar(p.metodo_pago) || 'Efectivo');
    fila('Tipo de venta',  capitalizar(p.tipo_venta));
    doc.y += 10;

    doc.fillColor(OSCURO).fontSize(10).font('Helvetica-Bold').text('PRODUCTOS', MG, doc.y);
    doc.moveTo(MG, doc.y + 14).lineTo(doc.page.width - MG, doc.y + 14)
       .strokeColor(VERDE).lineWidth(1.5).stroke();
    doc.y += 22;

    const cols  = [220, 55, 110, 110];
    const heads = ['Producto', 'Cant.', 'Precio unit.', 'Subtotal'];
    doc.rect(MG, doc.y, cols.reduce((a, b) => a + b, 0), 20).fill('#E8F5E9');
    let x    = MG;
    const yH = doc.y + 5;
    heads.forEach((h, i) => {
      doc.fillColor(OSCURO).fontSize(8).font('Helvetica-Bold')
         .text(h, x + 4, yH, { width: cols[i] - 8, align: i > 0 ? 'right' : 'left' });
      x += cols[i];
    });
    doc.y = yH + 17;

    prods.rows.forEach((r, idx) => {
      if (idx % 2 === 1) doc.rect(MG, doc.y, cols.reduce((a, b) => a + b, 0), 16).fill('#F9FAFB');
      x = MG;
      const vals = [r.nombre, r.cantidad, money(r.precio_unitario), money(r.subtotal)];
      const yR   = doc.y + 3;
      vals.forEach((v, i) => {
        doc.fillColor(i === 0 ? OSCURO : GRIS).fontSize(8).font('Helvetica')
           .text(String(v), x + 4, yR, { width: cols[i] - 8, align: i > 0 ? 'right' : 'left' });
        x += cols[i];
      });
      doc.y = yR + 14;
    });
    doc.y += 10;

    const tAncho = 210;
    const tX     = doc.page.width - MG - tAncho;
    doc.rect(tX, doc.y, tAncho, 36).fill(OSCURO);
    doc.fillColor('#9CA3AF').fontSize(9).font('Helvetica').text('TOTAL A PAGAR', tX + 12, doc.y + 6);
    doc.fillColor(VERDE).fontSize(16).font('Helvetica-Bold')
       .text(money(p.total), tX, doc.y + 14, { width: tAncho - 12, align: 'right' });
    doc.y += 50;

    doc.moveTo(MG, doc.y).lineTo(doc.page.width - MG, doc.y)
       .strokeColor('#E5E7EB').lineWidth(0.5).stroke();
    doc.y += 8;
    doc.fillColor(GRIS).fontSize(7).font('Helvetica')
       .text('SISGEM — Documento válido como constancia de compra.', MG, doc.y,
         { align: 'center', width: ANCHO });
    doc.end();
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function reporteClientes(req, res) {
  const { formato } = req.query;
  try {
    const result = await pool.query(`SELECT * FROM clientes ORDER BY id DESC`);
    if (formato === 'excel') {
      return enviarExcel(res, 'reporte-clientes.xlsx', [{
        nombre: 'Clientes',
        columnas: [
          { header: '#',        key: 'id',       width: 8  },
          { header: 'Nombre',   key: 'nombre',   width: 30 },
          { header: 'Correo',   key: 'correo',   width: 26 },
          { header: 'Telefono', key: 'telefono', width: 16 },
          { header: 'Estado',   key: 'estado',   width: 12 },
        ],
        filas: result.rows.map(r => ({
          id: r.id, nombre: `${r.nombre} ${r.apellido}`,
          correo: r.email || '—', telefono: r.telefono || '—',
          estado: r.estado ? 'Activo' : 'Inactivo',
        })),
      }]);
    }
    const doc = crearDocumento();
    enviarPDF(res, doc, 'reporte-clientes.pdf');
    agregarEncabezado(doc, 'reporte de clientes');
    agregarTabla(doc,
      ['#', 'nombre', 'correo', 'telefono', 'estado'],
      result.rows.map(r => [
        r.id, `${r.nombre} ${r.apellido}`, r.email || '—',
        r.telefono || '—', r.estado ? 'Activo' : 'Inactivo'
      ]),
      [35, 160, 150, 80, 70]
    );
    agregarPie(doc);
    doc.end();
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function reporteProveedores(req, res) {
  const { formato } = req.query;
  try {
    const result = await pool.query(`SELECT * FROM proveedores ORDER BY id DESC`);
    if (formato === 'excel') {
      return enviarExcel(res, 'reporte-proveedores.xlsx', [{
        nombre: 'Proveedores',
        columnas: [
          { header: '#',         key: 'id',        width: 8  },
          { header: 'Nombre',    key: 'nombre',    width: 30 },
          { header: 'Documento', key: 'documento', width: 18 },
          { header: 'Telefono',  key: 'telefono',  width: 16 },
          { header: 'Correo',    key: 'correo',    width: 26 },
          { header: 'Estado',    key: 'estado',    width: 12 },
        ],
        filas: result.rows.map(r => ({
          id: r.id, nombre: r.nombre, documento: r.documento || '—',
          telefono: r.telefono || '—', correo: r.email || '—',
          estado: r.estado ? 'Activo' : 'Inactivo',
        })),
      }]);
    }
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
          { header: '#',        key: 'id',     width: 8  },
          { header: 'Pedido #', key: 'pedido', width: 12 },
          { header: 'Monto',    key: 'monto',  width: 16 },
          { header: 'Metodo',   key: 'metodo', width: 16 },
          { header: 'Estado',   key: 'estado', width: 14 },
          { header: 'Fecha',    key: 'fecha',  width: 16 },
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
        COALESCE(c.nombre || ' ' || c.apellido, p.cliente_nombre, 'Cliente mostrador') AS cliente
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
    const esAnuladoEstado  = nombre => !!nombre && nombre.toLowerCase().includes('anula');
    const totalPagado      = pagos.rows.filter(r => !esAnuladoEstado(r.estado))
      .reduce((s, r) => s + parseFloat(r.monto || 0), 0);
    const saldoPendiente   = Math.max(0, parseFloat(p.total || 0) - totalPagado);

    const doc = crearDocumento();
    enviarPDF(res, doc, `pagos-pedido-${id}.pdf`);
    agregarEncabezado(doc, `historial de pagos — venta #${id}`);
    agregarSeccionTitulo(doc, 'Datos de la venta');
    agregarFicha(doc, [
      { label: 'Cliente',         valor: p.cliente },
      { label: 'Total venta',     valor: money(p.total) },
      { label: 'Total pagado',    valor: money(totalPagado) },
      { label: 'Saldo pendiente', valor: saldoPendiente === 0 ? 'Completamente pagado' : money(saldoPendiente) },
    ]);
    agregarSeccionTitulo(doc, 'Movimientos');
    if (pagos.rows.length === 0) {
      doc.fontSize(9).font('Helvetica').fillColor('#9CA3AF').text('Sin movimientos registrados');
      doc.moveDown(1);
    } else {
      agregarTabla(doc,
        ['#', 'monto', 'metodo', 'estado', 'fecha'],
        pagos.rows.map(r => [
          r.id, money(r.monto), capitalizar(r.metodo) || '—',
          capitalizar(r.estado) || '—', new Date(r.fecha).toLocaleString('es-CO')
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
      SELECT o.id, p.nombre AS proveedor, o.total, o.fecha_compra, e.nombre AS estado
      FROM ordenes_compra o
      LEFT JOIN proveedores p ON o.proveedor_id = p.id
      LEFT JOIN estados e ON o.estado_id = e.id
      WHERE 1=1
    `;
    const params = [];
    if (fechaDesde) { params.push(fechaDesde); query += ` AND DATE(o.fecha_compra) >= $${params.length}`; }
    if (fechaHasta) { params.push(fechaHasta); query += ` AND DATE(o.fecha_compra) <= $${params.length}`; }
    query += ` ORDER BY o.id DESC`;
    const result = await pool.query(query, params);
    if (formato === 'excel') {
      return enviarExcel(res, 'reporte-ordenes.xlsx', [{
        nombre: 'Ordenes',
        columnas: [
          { header: '#',         key: 'id',        width: 8  },
          { header: 'Proveedor', key: 'proveedor', width: 30 },
          { header: 'Total',     key: 'total',     width: 16 },
          { header: 'Estado',    key: 'estado',    width: 14 },
          { header: 'Fecha',     key: 'fecha',     width: 16 },
        ],
        filas: result.rows.map(r => ({
          id: r.id, proveedor: r.proveedor, total: parseFloat(r.total),
          estado: capitalizar(r.estado),
          fecha: r.fecha_compra ? new Date(r.fecha_compra).toLocaleDateString('es-CO') : '—',
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
        r.fecha_compra ? new Date(r.fecha_compra).toLocaleDateString('es-CO') : '—',
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
        money(r.tarifa_aplicada), capitalizar(r.estado) || '—'
      ]),
      [35, 60, 150, 80, 70, 70]
    );
    agregarPie(doc);
    doc.end();
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function reporteProductos(req, res) {
  const { formato } = req.query;
  try {
    const result = await pool.query(`
      SELECT p.id, p.nombre, p.precio, p.stock,
             c.nombre AS categoria, pr.nombre AS proveedor, p.estado
      FROM productos p
      LEFT JOIN categorias c ON p.categoria_id = c.id
      LEFT JOIN proveedores pr ON p.proveedor_id = pr.id
      ORDER BY p.id DESC
    `);
    if (formato === 'excel') {
      return enviarExcel(res, 'reporte-productos.xlsx', [{
        nombre: 'Productos',
        columnas: [
          { header: '#',         key: 'id',        width: 8  },
          { header: 'Nombre',    key: 'nombre',    width: 30 },
          { header: 'Categoria', key: 'categoria', width: 20 },
          { header: 'Precio',    key: 'precio',    width: 14 },
          { header: 'Stock',     key: 'stock',     width: 10 },
          { header: 'Estado',    key: 'estado',    width: 12 },
        ],
        filas: result.rows.map(r => ({
          id: r.id, nombre: r.nombre, categoria: r.categoria || '—',
          precio: parseFloat(r.precio), stock: r.stock,
          estado: r.estado ? 'Activo' : 'Inactivo',
        })),
      }]);
    }
    const doc = crearDocumento();
    enviarPDF(res, doc, 'reporte-productos.pdf');
    agregarEncabezado(doc, 'reporte de productos');
    agregarTabla(doc,
      ['#', 'nombre', 'categoria', 'precio', 'stock', 'estado'],
      result.rows.map(r => [
        r.id, r.nombre, r.categoria || '—',
        money(r.precio), r.stock, r.estado ? 'Activo' : 'Inactivo'
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

    const o   = orden.rows[0];
    const doc = crearDocumento();
    enviarPDF(res, doc, `orden-${id}.pdf`);
    agregarEncabezado(doc, `orden de compra #${id}`);
    agregarSeccionTitulo(doc, 'Datos de la orden');
    agregarFicha(doc, [
      { label: 'Proveedor',   valor: o.proveedor },
      { label: 'Estado',      valor: capitalizar(o.estado) },
      { label: 'Método pago', valor: o.metodo_pago || '—' },
      { label: 'Fecha',       valor: o.fecha_compra ? new Date(o.fecha_compra).toLocaleDateString('es-CO') : '—' },
    ]);
    agregarSeccionTitulo(doc, 'Productos');
    agregarTabla(doc,
      ['producto', 'cant', 'costo unit', 'subtotal'],
      det.rows.map(r => [r.nombre, r.cantidad, money(r.costo_unitario), money(r.subtotal)]),
      [220, 50, 110, 115]
    );
    agregarTotalDestacado(doc, 'Total', money(o.total));
    agregarPie(doc);
    doc.end();
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

// ── TIRILLA COMPROBANTE VENTA ─────────────────────────────────────────────────
async function comprobantePedidoTirilla(req, res) {
  const { id } = req.params
  const t = require('../utils/tirilla')
  try {
    const pedido = await pool.query(`
      SELECT p.*,
        COALESCE(c.nombre || ' ' || c.apellido, p.cliente_nombre, 'Mostrador') AS cliente,
        c.telefono AS cliente_tel, c.tipo_documento, c.numero_documento,
        e.nombre AS estado,
        (SELECT metodo FROM pagos WHERE pedido_id = p.id
         AND estado_id NOT IN (SELECT id FROM estados WHERE LOWER(nombre) LIKE '%anula%')
         ORDER BY id ASC LIMIT 1) AS metodo_pago
      FROM pedidos p
      LEFT JOIN clientes c ON p.cliente_id = c.id
      LEFT JOIN estados e ON p.estado_id = e.id
      WHERE p.id = $1
    `, [id])
    if (!pedido.rows.length)
      return res.status(404).json({ ok: false, mensaje: 'pedido no encontrado' })

    const prods = await pool.query(`
      SELECT pp.cantidad, pp.precio_unitario, pp.subtotal, pr.nombre
      FROM pedido_productos pp
      JOIN productos pr ON pp.producto_id = pr.id
      WHERE pp.pedido_id = $1
    `, [id])

    const p   = pedido.rows[0]
    const doc = t.crearTirilla()
    t.enviarTirilla(res, doc, `comprobante-${id}.pdf`)

    const fecha = new Date(p.fecha_pedido).toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    let y = t.encabezado(doc, 'Comprobante de Venta', id, fecha)

    y = t.filaDetalle(doc, 'Cliente',    p.cliente, y)
    if (p.cliente_tel)
      y = t.filaDetalle(doc, 'Teléfono', p.cliente_tel, y)
    if (p.numero_documento)
      y = t.filaDetalle(doc, 'Documento',
        `${p.tipo_documento || 'CC'}: ${p.numero_documento}`, y)
    y = t.filaDetalle(doc, 'Método',  t.capitalizar(p.metodo_pago) || 'Efectivo', y)
    y = t.filaDetalle(doc, 'Estado',  t.capitalizar(p.estado), y)

    y += 4
    t.linea(doc, y)
    y += 6

    // Encabezado columnas productos
    doc.fillColor(t.NEGRO).fontSize(7).font('Helvetica-Bold')
       .text('Producto', t.MARGEN, y, { width: t.CONTENIDO * 0.46 })
    doc.fillColor(t.NEGRO).fontSize(7).font('Helvetica-Bold')
       .text('Cant', t.MARGEN + t.CONTENIDO * 0.46, y,
         { width: t.CONTENIDO * 0.14, align: 'center' })
    doc.fillColor(t.NEGRO).fontSize(7).font('Helvetica-Bold')
       .text('Subtotal', t.MARGEN + t.CONTENIDO * 0.60, y,
         { width: t.CONTENIDO * 0.40, align: 'right' })
    y += 10
    t.linea(doc, y)
    y += 4

    prods.rows.forEach(r => {
      doc.fillColor(t.NEGRO).fontSize(7).font('Helvetica')
         .text(r.nombre, t.MARGEN, y, { width: t.CONTENIDO * 0.46 })
      const alto = doc.heightOfString(r.nombre, { width: t.CONTENIDO * 0.46 })
      doc.fillColor(t.GRIS).fontSize(7).font('Helvetica')
         .text(String(r.cantidad), t.MARGEN + t.CONTENIDO * 0.46, y,
           { width: t.CONTENIDO * 0.14, align: 'center' })
      doc.fillColor(t.NEGRO).fontSize(7).font('Helvetica')
         .text(t.money(r.subtotal), t.MARGEN + t.CONTENIDO * 0.60, y,
           { width: t.CONTENIDO * 0.40, align: 'right' })
      y += Math.max(alto, 10) + 3
    })

    y += 4
    t.lineaSolida(doc, y)
    y += 6

    doc.fillColor(t.NEGRO).fontSize(9).font('Helvetica-Bold')
       .text('TOTAL', t.MARGEN, y, { width: t.CONTENIDO * 0.50 })
    doc.fillColor(t.NEGRO).fontSize(9).font('Helvetica-Bold')
       .text(t.money(p.total), t.MARGEN + t.CONTENIDO * 0.50, y,
         { width: t.CONTENIDO * 0.50, align: 'right' })
    y += 14

    t.pie(doc, y)
    doc.end()
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }) }
}

// ── TIRILLA COMPROBANTE PAGOS ─────────────────────────────────────────────────
async function comprobantePagosPedidoTirilla(req, res) {
  const { id } = req.params
  const t = require('../utils/tirilla')
  try {
    const pedido = await pool.query(`
      SELECT p.*,
        COALESCE(c.nombre || ' ' || c.apellido, p.cliente_nombre, 'Mostrador') AS cliente
      FROM pedidos p
      LEFT JOIN clientes c ON p.cliente_id = c.id
      WHERE p.id = $1
    `, [id])
    if (!pedido.rows.length)
      return res.status(404).json({ ok: false, mensaje: 'pedido no encontrado' })

    const pagosRes = await pool.query(`
      SELECT p.id, p.monto, p.metodo, p.fecha, e.nombre AS estado
      FROM pagos p
      LEFT JOIN estados e ON p.estado_id = e.id
      WHERE p.pedido_id = $1
      ORDER BY p.fecha ASC, p.id ASC
    `, [id])

    const p        = pedido.rows[0]
    const esAnul   = n => !!n && n.toLowerCase().includes('anula')
    const totalPag = pagosRes.rows.filter(r => !esAnul(r.estado))
      .reduce((s, r) => s + parseFloat(r.monto || 0), 0)
    const saldo    = Math.max(0, parseFloat(p.total || 0) - totalPag)

    const doc = t.crearTirilla()
    t.enviarTirilla(res, doc, `pagos-pedido-${id}.pdf`)

    const fecha = new Date().toLocaleString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })

    let y = t.encabezado(doc, 'Comprobante de Pago', id, fecha)

    y = t.filaDetalle(doc, 'Cliente',         p.cliente,       y)
    y = t.filaDetalle(doc, 'Total venta',      t.money(p.total), y)
    y = t.filaDetalle(doc, 'Total pagado',     t.money(totalPag), y)
    y = t.filaDetalle(doc, 'Saldo pendiente',
      saldo === 0 ? 'Pagado' : t.money(saldo), y, true)

    y += 4
    t.linea(doc, y)
    y += 6

    doc.fillColor(t.NEGRO).fontSize(7).font('Helvetica-Bold')
       .text('Fecha', t.MARGEN, y, { width: t.CONTENIDO * 0.38 })
    doc.fillColor(t.NEGRO).fontSize(7).font('Helvetica-Bold')
       .text('Método', t.MARGEN + t.CONTENIDO * 0.38, y, { width: t.CONTENIDO * 0.28 })
    doc.fillColor(t.NEGRO).fontSize(7).font('Helvetica-Bold')
       .text('Monto', t.MARGEN + t.CONTENIDO * 0.66, y,
         { width: t.CONTENIDO * 0.34, align: 'right' })
    y += 10
    t.linea(doc, y)
    y += 4

    if (pagosRes.rows.length === 0) {
      doc.fillColor(t.GRIS).fontSize(7).font('Helvetica')
         .text('Sin movimientos', t.MARGEN, y, { width: t.CONTENIDO, align: 'center' })
      y += 12
    } else {
      pagosRes.rows.forEach(r => {
        const fp     = new Date(r.fecha).toLocaleDateString('es-CO',
          { day: '2-digit', month: '2-digit', year: '2-digit' })
        const anulado = esAnul(r.estado)
        const color   = anulado ? '#999999' : t.NEGRO
        doc.fillColor(color).fontSize(7).font('Helvetica')
           .text(fp, t.MARGEN, y, { width: t.CONTENIDO * 0.38 })
        doc.fillColor(color).fontSize(7).font('Helvetica')
           .text(t.capitalizar(r.metodo) || '—', t.MARGEN + t.CONTENIDO * 0.38, y,
             { width: t.CONTENIDO * 0.28 })
        doc.fillColor(color).fontSize(7)
           .font(anulado ? 'Helvetica' : 'Helvetica-Bold')
           .text(anulado ? `(${t.money(r.monto)})` : t.money(r.monto),
             t.MARGEN + t.CONTENIDO * 0.66, y,
             { width: t.CONTENIDO * 0.34, align: 'right' })
        y += 11
      })
    }

    y += 4
    t.lineaSolida(doc, y)
    y += 6

    doc.fillColor(t.NEGRO).fontSize(9).font('Helvetica-Bold')
       .text('TOTAL PAGADO', t.MARGEN, y, { width: t.CONTENIDO * 0.55 })
    doc.fillColor(t.NEGRO).fontSize(9).font('Helvetica-Bold')
       .text(t.money(totalPag), t.MARGEN + t.CONTENIDO * 0.55, y,
         { width: t.CONTENIDO * 0.45, align: 'right' })
    y += 14

    if (saldo > 0) {
      doc.fillColor(t.NEGRO).fontSize(8).font('Helvetica-Bold')
         .text('SALDO PENDIENTE', t.MARGEN, y, { width: t.CONTENIDO * 0.55 })
      doc.fillColor(t.NEGRO).fontSize(8).font('Helvetica-Bold')
         .text(t.money(saldo), t.MARGEN + t.CONTENIDO * 0.55, y,
           { width: t.CONTENIDO * 0.45, align: 'right' })
      y += 12
    }

    t.pie(doc, y)
    doc.end()
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }) }
}

module.exports = {
  reporteVentas, reportePedidos, comprobantePedido,
  reporteClientes, reporteProveedores, reportePagos, comprobantePagosPedido,
  reporteOrdenes, comprobanteOrden, reporteDomicilios, reporteProductos,
  comprobantePedidoTirilla, comprobantePagosPedidoTirilla,
}