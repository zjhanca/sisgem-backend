const pool = require('../config/db');

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
    const fecha = new Date(pago.created_at || pago.fecha_pedido).toLocaleDateString('es-CO', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; margin: 32px; color: #1a1a1a; max-width: 400px; }
  .logo { color: #1E9E50; font-size: 22px; font-weight: bold; }
  .sub  { color: #888; font-size: 11px; margin: 2px 0 20px; }
  .titulo { font-size: 15px; font-weight: bold; margin-bottom: 4px; }
  .badge { display: inline-block; padding: 2px 12px; border-radius: 20px; font-size: 11px;
           background: #d1fae5; color: #065f46; font-weight: bold; margin-bottom: 16px; }
  .monto { font-size: 28px; font-weight: bold; color: #1E9E50; margin: 12px 0 20px; }
  .fila  { display: flex; justify-content: space-between; padding: 6px 0;
           border-bottom: 1px solid #f0f0f0; font-size: 12px; }
  .label { color: #888; }
  .footer { margin-top: 28px; color: #bbb; font-size: 10px; text-align: center; }
</style></head><body>
  <div class="logo">SISGEM</div>
  <div class="sub">Sistema de Gestión para Minimercado</div>
  <div class="titulo">Comprobante de Pago #${pago.id}</div>
  <div class="badge">${pago.estado || 'Pagado'}</div>
  <div class="monto">$${(+pago.monto).toLocaleString('es-CO')}</div>
  <div class="fila"><span class="label">Pedido</span><span>#${pago.pedido_id}</span></div>
  <div class="fila"><span class="label">Cliente</span><span>${pago.cliente}</span></div>
  ${pago.numero_documento ? `<div class="fila"><span class="label">Documento</span><span>${pago.numero_documento}</span></div>` : ''}
  ${pago.telefono ? `<div class="fila"><span class="label">Teléfono</span><span>${pago.telefono}</span></div>` : ''}
  <div class="fila"><span class="label">Método de pago</span><span style="text-transform:capitalize">${pago.metodo || 'efectivo'}</span></div>
  <div class="fila"><span class="label">Fecha</span><span>${fecha}</span></div>
  <div class="fila"><span class="label">Total pedido</span><span>$${(+pago.total_pedido).toLocaleString('es-CO')}</span></div>
  <div class="footer">
    SISGEM — Comprobante generado el ${new Date().toLocaleDateString('es-CO')}<br>
    Este documento es válido como constancia de pago.
  </div>
</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="comprobante-pago-${id}.html"`);
    res.send(html);
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { listar, crear, anular, detalle, comprobante };