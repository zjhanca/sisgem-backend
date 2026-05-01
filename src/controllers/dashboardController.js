// controllers/dashboardController.js
const pool = require('../config/db');

async function estadisticas(req, res) {
  try {
    const hoy = new Date().toISOString().split('T')[0];

    const [ventasHoy, productosTop, ventasSemana, pedidosPendientes] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) AS total_pedidos, COALESCE(SUM(total),0) AS monto_total
         FROM pedidos WHERE DATE(fecha_pedido) = $1 AND estado_id != 5`, [hoy]
      ),
      pool.query(
        `SELECT pr.nombre, SUM(pp.cantidad) AS total_vendido
         FROM pedido_productos pp JOIN productos pr ON pp.producto_id = pr.id
         GROUP BY pr.nombre ORDER BY total_vendido DESC LIMIT 5`
      ),
      pool.query(
        `SELECT DATE(fecha_pedido) AS dia, COALESCE(SUM(total),0) AS total
         FROM pedidos WHERE fecha_pedido >= NOW() - INTERVAL '7 days' AND estado_id != 5
         GROUP BY dia ORDER BY dia`
      ),
      pool.query(`SELECT COUNT(*) AS total FROM pedidos WHERE estado_id = 1`),
    ]);

    res.json({
      ok: true,
      datos: {
        ventas_hoy: ventasHoy.rows[0],
        productos_top: productosTop.rows,
        ventas_semana: ventasSemana.rows,
        pedidos_pendientes: pedidosPendientes.rows[0].total
      }
    });
  } catch (err) {
    res.status(500).json({ ok: false, mensaje: err.message });
  }
}

module.exports = { estadisticas };
