const pool = require('../config/db');
 
async function listar(req, res) {
  const { cliente_id } = req.query;
  try {
    let query = `
      SELECT d.*, de.direccion, de.barrio, de.indicaciones,
             e.nombre AS estado,
             COALESCE(cl.nombre || ' ' || cl.apellido, p.cliente_nombre, 'cliente ocasional') AS cliente
      FROM domicilios d
      LEFT JOIN direcciones_envio de ON d.direccion_id = de.id
      LEFT JOIN estados e ON d.estado_id = e.id
      LEFT JOIN pedidos p ON d.pedido_id = p.id
      LEFT JOIN clientes cl ON p.cliente_id = cl.id
      WHERE 1=1
    `;
    const params = [];
    if (cliente_id) { params.push(cliente_id); query += ` AND cl.id=$${params.length}`; }
    query += ' ORDER BY d.id DESC';
    const r = await pool.query(query, params);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function crear(req, res) {
  const { pedido_id, direccion_id, direccion_manual, tarifa_id, tarifa_aplicada } = req.body;
  if (!pedido_id) return res.status(400).json({ ok: false, mensaje: 'pedido requerido' });
  if (!direccion_id && !direccion_manual?.trim())
    return res.status(400).json({ ok: false, mensaje: 'direccion requerida' });
  try {
    const existe = await pool.query('SELECT id FROM domicilios WHERE pedido_id=$1', [pedido_id]);
    if (existe.rows.length)
      return res.status(400).json({ ok: false, mensaje: 'el pedido ya tiene domicilio asignado' });
    const estPend = await pool.query("SELECT id FROM estados WHERE nombre ILIKE '%pendiente%' AND tipo='domicilio' LIMIT 1");
    const estado_id = estPend.rows[0]?.id || 7;
    const r = await pool.query(
      `INSERT INTO domicilios (pedido_id,direccion_id,direccion_manual,estado_id,tarifa_id,tarifa_aplicada)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [pedido_id, direccion_id||null, direccion_manual||null, estado_id, tarifa_id||null, tarifa_aplicada||0]
    );
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function cambiarEstado(req, res) {
  const { id } = req.params;
  const { estado_id } = req.body;
  if (!estado_id) return res.status(400).json({ ok: false, mensaje: 'estado requerido' });
  try {
    const estado = await pool.query('SELECT nombre FROM estados WHERE id=$1', [estado_id]);
    if (!estado.rows.length) return res.status(404).json({ ok: false, mensaje: 'estado no encontrado' });
    const nombre = estado.rows[0].nombre.toLowerCase();
    const permitidos = ['pendiente', 'entregado', 'anulado'];
    if (!permitidos.some(p => nombre.includes(p)))
      return res.status(400).json({ ok: false, mensaje: 'solo se permiten estados: Pendiente, Entregado, Anulado' });
    const r = await pool.query('UPDATE domicilios SET estado_id=$1 WHERE id=$2 RETURNING *', [estado_id, id]);
    // sincronizar con pedido si se entrega
    if (nombre.includes('entregado')) {
      const dom = await pool.query('SELECT pedido_id FROM domicilios WHERE id=$1', [id]);
      if (dom.rows.length) {
        const entPed = await pool.query("SELECT id FROM estados WHERE nombre='Entregado' AND tipo='pedido' LIMIT 1");
        if (entPed.rows.length) {
          await pool.query('UPDATE pedidos SET estado_id=$1 WHERE id=$2', [entPed.rows[0].id, dom.rows[0].pedido_id]);
        }
      }
    }
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function listarTarifas(req, res) {
  try {
    const r = await pool.query('SELECT * FROM tarifas_domicilio WHERE estado=true ORDER BY barrio, zona');
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function crearTarifa(req, res) {
  const { barrio, ciudad, zona, tarifa, distancia_km } = req.body;
  const nombre = barrio || ciudad;
  if (!nombre || !tarifa) return res.status(400).json({ ok: false, mensaje: 'barrio y tarifa son obligatorios' });
  try {
    const r = await pool.query(
      `INSERT INTO tarifas_domicilio (ciudad,barrio,zona,tarifa,distancia_km)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [nombre, barrio||null, zona||null, tarifa, distancia_km||null]
    );
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function actualizarTarifa(req, res) {
  const { id } = req.params;
  const { barrio, ciudad, zona, tarifa, distancia_km, estado } = req.body;
  try {
    const r = await pool.query(
      'UPDATE tarifas_domicilio SET ciudad=$1,barrio=$2,zona=$3,tarifa=$4,distancia_km=$5,estado=$6 WHERE id=$7 RETURNING *',
      [barrio||ciudad, barrio||null, zona||null, tarifa, distancia_km||null, estado??true, id]
    );
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function eliminarTarifa(req, res) {
  const { id } = req.params;
  try {
    await pool.query('UPDATE tarifas_domicilio SET estado=false WHERE id=$1', [id]);
    res.json({ ok: true, mensaje: 'tarifa desactivada' });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
module.exports = { listar, crear, cambiarEstado, listarTarifas, crearTarifa, actualizarTarifa, eliminarTarifa };
 
