const pool = require('../config/db');

async function estadisticas(req, res) {
  try {
    const hoy = new Date().toISOString().split('T')[0];

    const [ventasHoy, productosTop, ventasSemana, pedidosPendientes, ventasPorTipo,
           metodosPago, categoriasMasVendidas] =
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
        // Métodos de pago más usados
        pool.query(
          `SELECT COALESCE(metodo, 'efectivo') AS metodo,
                  COUNT(*) AS cantidad,
                  COALESCE(SUM(monto), 0) AS total
           FROM pagos pg
           LEFT JOIN estados e ON pg.estado_id = e.id
           WHERE NOT (LOWER(COALESCE(e.nombre,'')) LIKE '%anula%')
           GROUP BY COALESCE(metodo, 'efectivo')
           ORDER BY cantidad DESC`
        ),
        // Categorías más vendidas
        pool.query(
          `SELECT COALESCE(c.nombre, 'Sin categoría') AS categoria,
                  SUM(pp.cantidad) AS total_vendido
           FROM pedido_productos pp
           JOIN productos pr ON pp.producto_id = pr.id
           LEFT JOIN categorias c ON pr.categoria_id = c.id
           JOIN pedidos p ON pp.pedido_id = p.id
           WHERE p.estado_id != 3
           GROUP BY COALESCE(c.nombre, 'Sin categoría')
           ORDER BY total_vendido DESC
           LIMIT 6`
        ),
      ]);

    res.json({
      ok: true,
      datos: {
        ventas_hoy:             ventasHoy.rows[0],
        productos_top:          productosTop.rows,
        ventas_semana:          ventasSemana.rows,
        pedidos_pendientes:     pedidosPendientes.rows[0].total,
        ventas_por_tipo:        ventasPorTipo.rows,
        metodos_pago:           metodosPago.rows,
        categorias_mas_vendidas: categoriasMasVendidas.rows,
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