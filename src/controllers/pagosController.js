const pool = require('../config/db');
const PDFDocument = require('pdfkit');

async function listar(req, res) {
  try {
    const r = await pool.query(`
      SELECT p.*, e.nombre AS estado,
        COALESCE(c.nombre || ' ' || c.apellido, ped.cliente_nombre, 'cliente ocasional') AS cliente,
        ped.total AS total_pedido,
        ped.fecha_pedido,
        ped.fecha_limite_anulacion,
        pe.nombre AS estado_venta
      FROM pagos p
      LEFT JOIN estados e ON p.estado_id=e.id
      LEFT JOIN pedidos ped ON p.pedido_id=ped.id
      LEFT JOIN estados pe ON ped.estado_id=pe.id
      LEFT JOIN clientes c ON ped.cliente_id=c.id
      ORDER BY p.id DESC
    `);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function crear(req, res) {
  const { pedido_id, monto, metodo } = req.body;
  if (!pedido_id || !monto || +monto <= 0)
    return res.status(400).json({ ok: false, mensaje: 'pedido y monto son obligatorios' });

  try {
    const ped = await pool.query(`
      SELECT p.total, e.nombre AS estado
      FROM pedidos p LEFT JOIN estados e ON p.estado_id = e.id
      WHERE p.id=$1
    `, [pedido_id]);
    if (!ped.rows.length) return res.status(404).json({ ok: false, mensaje: 'pedido no encontrado' });

    if (ped.rows[0].estado?.toLowerCase().includes('anula')) {
      return res.status(400).json({ ok: false, mensaje: 'No se puede registrar un pago: esta venta fue anulada' });
    }

    const totalPedido = +ped.rows[0].total;

    const pagadoRes = await pool.query(`
      SELECT COALESCE(SUM(monto), 0) AS pagado
      FROM pagos
      WHERE pedido_id = $1
        AND estado_id NOT IN (
          SELECT id FROM estados WHERE LOWER(nombre) LIKE '%anula%' AND tipo = 'pago'
        )
    `, [pedido_id]);
    const totalPagado = +pagadoRes.rows[0].pagado;
    const saldoPendiente = Math.max(0, totalPedido - totalPagado);

    if (+monto > saldoPendiente) {
      return res.status(400).json({
        ok: false,
        mensaje: `El monto no puede superar el saldo pendiente de $${saldoPendiente.toLocaleString('es-CO')}`
      });
    }

    if (saldoPendiente === 0) {
      return res.status(400).json({ ok: false, mensaje: 'El pedido ya está completamente pagado' });
    }

    const nuevoPagado = totalPagado + +monto;

    const estadoAbono  = await pool.query(`SELECT id FROM estados WHERE LOWER(nombre) LIKE '%abono%' AND tipo='pago' LIMIT 1`);
    const estadoPagado = await pool.query(`SELECT id FROM estados WHERE (LOWER(nombre) LIKE '%activ%' OR LOWER(nombre) LIKE '%paga%') AND tipo='pago' LIMIT 1`);

    const idAbono  = estadoAbono.rows[0]?.id  || 5;
    const idPagado = estadoPagado.rows[0]?.id || 5;

    const esCompleto = nuevoPagado >= totalPedido;
    const estado_id  = esCompleto ? idPagado : idAbono;

    const r = await pool.query(
      'INSERT INTO pagos (pedido_id, monto, metodo, estado_id) VALUES ($1,$2,$3,$4) RETURNING *',
      [pedido_id, monto, metodo || 'efectivo', estado_id]
    );

    if (esCompleto) {
      const estadoCompletado = await pool.query(
        `SELECT id FROM estados WHERE (LOWER(nombre) LIKE '%complet%' OR LOWER(nombre) LIKE '%paga%') AND tipo='pedido' LIMIT 1`
      );
      const idCompletado = estadoCompletado.rows[0]?.id || 2;
      await pool.query('UPDATE pedidos SET estado_id=$1 WHERE id=$2', [idCompletado, pedido_id]);
    }

    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function anular(req, res) {
  const { id } = req.params;
  try {
    const pago = await pool.query(`
      SELECT p.estado_id, p.pedido_id, ped.fecha_limite_anulacion
      FROM pagos p
      LEFT JOIN pedidos ped ON p.pedido_id = ped.id
      WHERE p.id=$1
    `, [id]);
    if (!pago.rows.length) return res.status(404).json({ ok: false, mensaje: 'pago no encontrado' });

    const limite = pago.rows[0].fecha_limite_anulacion;
    if (limite && new Date(limite) < new Date()) {
      return res.status(400).json({ ok: false, mensaje: 'el plazo de 72 horas de la venta ya expiró, no se puede anular este pago' });
    }

    const estadoAnulado = await pool.query(`SELECT id FROM estados WHERE LOWER(nombre) LIKE '%anula%' AND tipo='pago' LIMIT 1`);
    const idAnulado = estadoAnulado.rows[0]?.id || 6;

    if (pago.rows[0].estado_id === idAnulado)
      return res.status(400).json({ ok: false, mensaje: 'el pago ya esta anulado' });

    const r = await pool.query('UPDATE pagos SET estado_id=$1 WHERE id=$2 RETURNING *', [idAnulado, id]);
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function detalle(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(`
      SELECT p.*, e.nombre AS estado,
        COALESCE(c.nombre || ' ' || c.apellido, ped.cliente_nombre, 'ocasional') AS cliente,
        ped.fecha_pedido,
        ped.fecha_limite_anulacion
      FROM pagos p
      LEFT JOIN estados e ON p.estado_id=e.id
      LEFT JOIN pedidos ped ON p.pedido_id=ped.id
      LEFT JOIN clientes c ON ped.cliente_id=c.id
      WHERE p.id=$1
    `, [id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'pago no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function comprobante(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(`
      SELECT p.*, e.nombre AS estado,
        COALESCE(c.nombre || ' ' || c.apellido, ped.cliente_nombre, 'Cliente ocasional') AS cliente,
        c.numero_documento, c.telefono,
        ped.total AS total_pedido, ped.fecha_pedido
      FROM pagos p
      LEFT JOIN estados e ON p.estado_id = e.id
      LEFT JOIN pedidos ped ON p.pedido_id = ped.id
      LEFT JOIN clientes c ON ped.cliente_id = c.id
      WHERE p.id = $1
    `, [id]);
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'pago no encontrado' });

    const pago = r.rows[0];

    const fecha = new Date(pago.created_at || pago.fecha_pedido)
      .toLocaleString('es-CO', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });

    const doc = new PDFDocument({ margin: 40, size: [300, 420] });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="comprobante-pago-${id}.pdf"`);
    doc.pipe(res);

    const verde = '#1E9E50';
    const gris  = '#888888';
    const negro = '#1a1a1a';

    // ── Header ──────────────────────────────────────────────
    doc.fontSize(18).fillColor(verde).font('Helvetica-Bold')
      .text('SISGEM', { align: 'center' });
    doc.fontSize(8).fillColor(gris).font('Helvetica')
      .text('Sistema de Gestión para Minimercado', { align: 'center' });
    doc.moveDown(0.6);

    // Línea
    doc.moveTo(40, doc.y).lineTo(260, doc.y).strokeColor('#e5e7eb').lineWidth(1).stroke();
    doc.moveDown(0.6);

    // Título
    doc.fontSize(11).fillColor(negro).font('Helvetica-Bold')
      .text(`Comprobante de Pago #${pago.id}`, { align: 'center' });
    doc.moveDown(0.4);

    // Monto
    doc.fontSize(24).fillColor(verde).font('Helvetica-Bold')
      .text(`$${(+pago.monto).toLocaleString('es-CO')}`, { align: 'center' });
    doc.moveDown(0.3);

    // Badge estado
    doc.fontSize(9).fillColor(gris).font('Helvetica')
      .text(pago.estado || 'Pagado', { align: 'center' });
    doc.moveDown(0.8);

    // Línea
    doc.moveTo(40, doc.y).lineTo(260, doc.y).strokeColor('#e5e7eb').lineWidth(1).stroke();
    doc.moveDown(0.6);

    // ── Datos ────────────────────────────────────────────────
    const fila = (label, valor) => {
      const y = doc.y;
      doc.fontSize(8).fillColor(gris).font('Helvetica').text(label, 40, y);
      doc.fontSize(8).fillColor(negro).font('Helvetica-Bold').text(String(valor), 140, y, { width: 120, align: 'right' });
      doc.moveDown(0.55);
    };

    fila('Pedido',         `#${pago.pedido_id}`);
    fila('Cliente',        pago.cliente);
    if (pago.numero_documento) fila('Documento', pago.numero_documento);
    if (pago.telefono)         fila('Teléfono',  pago.telefono);
    fila('Método de pago', pago.metodo || 'Efectivo');
    fila('Fecha',          fecha);
    fila('Total pedido',   `$${(+pago.total_pedido).toLocaleString('es-CO')}`);

    doc.moveDown(0.4);
    // Línea
    doc.moveTo(40, doc.y).lineTo(260, doc.y).strokeColor('#e5e7eb').lineWidth(1).stroke();
    doc.moveDown(0.8);

    // ── Footer ───────────────────────────────────────────────
    doc.fontSize(7).fillColor(gris).font('Helvetica')
      .text(
        `SISGEM · Comprobante generado el ${new Date().toLocaleDateString('es-CO')}\nEste documento es válido como constancia de pago.`,
        { align: 'center', lineGap: 2 }
      );

    doc.end();
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
}

module.exports = { listar, crear, anular, detalle, comprobante };