// controllers/pedidosController.js
const pool = require('../config/db');

async function crear(req, res) {
  const { cliente_id, tipo_venta, productos, domicilio } = req.body;
  const usuario_id = req.usuario.id;
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // calcular total
    let total = 0;
    for (const item of productos) {
      total += item.precio_unitario * item.cantidad;
    }

    // crear pedido
    const pedidoRes = await client.query(
      `INSERT INTO pedidos (cliente_id, usuario_id, tipo_venta, estado_id, total)
       VALUES ($1,$2,$3,1,$4) RETURNING id`,
      [cliente_id, usuario_id, tipo_venta, total]
    );
    const pedido_id = pedidoRes.rows[0].id;

    // insertar productos del pedido y descontar stock
    for (const item of productos) {
      const subtotal = item.precio_unitario * item.cantidad;
      await client.query(
        `INSERT INTO pedido_productos (pedido_id,producto_id,cantidad,precio_unitario,subtotal,estado_id)
         VALUES ($1,$2,$3,$4,$5,1)`,
        [pedido_id, item.producto_id, item.cantidad, item.precio_unitario, subtotal]
      );
      // descontar stock
      await client.query(
        'UPDATE productos SET stock = stock - $1 WHERE id = $2',
        [item.cantidad, item.producto_id]
      );
    }

    // si tiene domicilio, crearlo
    if (domicilio) {
      await client.query(
        `INSERT INTO domicilios (pedido_id,direccion_id,estado_id,tarifa_id,tarifa_aplicada)
         VALUES ($1,$2,1,$3,$4)`,
        [pedido_id, domicilio.direccion_id, domicilio.tarifa_id, domicilio.tarifa_aplicada]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({ ok: true, pedido_id });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ ok: false, mensaje: err.message });
  } finally {
    client.release();
  }
}

module.exports = { crear };
