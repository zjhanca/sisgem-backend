const pool = require('../config/db');

async function estadisticas(req, res) {
  try {
    const hoy = new Date().toISOString().split('T')[0];

    const [ventasHoy, productosTop, ventasSemana, pedidosPendientes, ventasPorTipo] =
      await Promise.all([
        pool.query(
          `SELECT COUNT(*) AS total_pedidos, COALESCE(SUM(total),0) AS monto_total
           FROM pedidos WHERE DATE(fecha_pedido)=$1 AND estado_id != 3`, [hoy]
        ),
        pool.query(
          `SELECT pr.nombre, SUM(pp.cantidad) AS total_vendido
           FROM pedido_productos pp
           JOIN productos pr ON pp.producto_id = pr.id
           JOIN pedidos p ON pp.pedido_id = p.id
           WHERE p.estado_id != 3
           GROUP BY pr.nombre ORDER BY total_vendido DESC LIMIT 5`
        ),
        pool.query(
          `SELECT TO_CHAR(DATE(fecha_pedido),'DD/MM') AS dia,
                  COALESCE(SUM(total),0) AS total
           FROM pedidos
           WHERE fecha_pedido >= NOW() - INTERVAL '7 days' AND estado_id != 3
           GROUP BY DATE(fecha_pedido) ORDER BY DATE(fecha_pedido)`
        ),
        pool.query(
          `SELECT COUNT(*) AS total FROM pedidos WHERE estado_id = 1`
        ),
        pool.query(
          `SELECT tipo_venta, COALESCE(SUM(total),0) AS total, COUNT(*) AS cantidad
           FROM pedidos WHERE estado_id != 3
           GROUP BY tipo_venta`
        ),
      ]);

    res.json({
      ok: true,
      datos: {
        ventas_hoy:         ventasHoy.rows[0],
        productos_top:      productosTop.rows,
        ventas_semana:      ventasSemana.rows,
        pedidos_pendientes: pedidosPendientes.rows[0].total,
        ventas_por_tipo:    ventasPorTipo.rows,
      }
    });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function ventasMes(req, res) {
  try {
    const r = await pool.query(
      `SELECT TO_CHAR(DATE(fecha_pedido),'DD/MM') AS dia,
              COALESCE(SUM(total),0) AS total,
              COUNT(*) AS cantidad
       FROM pedidos
       WHERE DATE_TRUNC('month', fecha_pedido) = DATE_TRUNC('month', NOW())
         AND estado_id != 3
       GROUP BY DATE(fecha_pedido)
       ORDER BY DATE(fecha_pedido)`
    );
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function ventasSemana(req, res) {
  try {
    const r = await pool.query(
      `SELECT TO_CHAR(DATE(fecha_pedido),'DD/MM') AS dia,
              COALESCE(SUM(total),0) AS total,
              COUNT(*) AS cantidad
       FROM pedidos
       WHERE fecha_pedido >= NOW() - INTERVAL '7 days'
         AND estado_id != 3
       GROUP BY DATE(fecha_pedido)
       ORDER BY DATE(fecha_pedido)`
    );
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = { estadisticas, ventasMes, ventasSemana };