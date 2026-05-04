const pool = require('../config/db');

async function listar(req, res) {
  const { cliente_id } = req.query;
  try {
    let query = `
      SELECT d.*, de.direccion, de.ciudad, de.indicaciones,
             e.nombre AS estado,
             cl.nombre || ' ' || cl.apellido AS cliente
      FROM domicilios d
      LEFT JOIN direcciones_envio de ON d.direccion_id = de.id
      LEFT JOIN estados e ON d.estado_id = e.id
      LEFT JOIN clientes cl ON de.cliente_id = cl.id
      WHERE 1=1
    `;
    const params = [];
    if (cliente_id) {
      params.push(cliente_id);
      query += ` AND de.cliente_id = $${params.length}`;
    }
    query += ` ORDER BY d.id DESC`;
    const r = await pool.query(query, params);
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function crear(req, res) {
  const { pedido_id, direccion_id, tarifa_id, tarifa_aplicada } = req.body;
  if (!pedido_id || !direccion_id)
    return res.status(400).json({ ok: false, mensaje: 'pedido y direccion son obligatorios' });
  try {
    const existe = await pool.query(
      `SELECT id FROM domicilios WHERE pedido_id=$1`, [pedido_id]
    );
    if (existe.rows.length)
      return res.status(400).json({ ok: false, mensaje: 'el pedido ya tiene un domicilio asignado' });
    const r = await pool.query(
      `INSERT INTO domicilios (pedido_id,direccion_id,estado_id,tarifa_id,tarifa_aplicada)
       VALUES ($1,$2,7,$3,$4) RETURNING *`,
      [pedido_id, direccion_id, tarifa_id || null, tarifa_aplicada || 0]
    );
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function cambiarEstado(req, res) {
  const { id } = req.params;
  const { estado_id } = req.body;
  if (!estado_id) return res.status(400).json({ ok: false, mensaje: 'estado requerido' });
  try {
    const r = await pool.query(
      `UPDATE domicilios SET estado_id=$1 WHERE id=$2 RETURNING *`, [estado_id, id]
    );
    if (!r.rows.length)
      return res.status(404).json({ ok: false, mensaje: 'domicilio no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function listarTarifas(req, res) {
  try {
    const r = await pool.query(
      `SELECT * FROM tarifas_domicilio WHERE estado=true ORDER BY ciudad`
    );
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function crearTarifa(req, res) {
  const { ciudad, tarifa } = req.body;
  if (!ciudad?.trim()) return res.status(400).json({ ok: false, mensaje: 'la ciudad es obligatoria' });
  if (!tarifa || +tarifa <= 0) return res.status(400).json({ ok: false, mensaje: 'tarifa invalida' });
  try {
    const r = await pool.query(
      `INSERT INTO tarifas_domicilio (ciudad,tarifa) VALUES ($1,$2) RETURNING *`,
      [ciudad.trim(), tarifa]
    );
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function actualizarTarifa(req, res) {
  const { id } = req.params;
  const { ciudad, tarifa, estado } = req.body;
  try {
    const r = await pool.query(
      `UPDATE tarifas_domicilio SET ciudad=$1,tarifa=$2,estado=$3 WHERE id=$4 RETURNING *`,
      [ciudad, tarifa, estado ?? true, id]
    );
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

async function eliminarTarifa(req, res) {
  const { id } = req.params;
  try {
    await pool.query(`UPDATE tarifas_domicilio SET estado=false WHERE id=$1`, [id]);
    res.json({ ok: true, mensaje: 'tarifa desactivada' });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}

module.exports = {
  listar, crear, cambiarEstado,
  listarTarifas, crearTarifa, actualizarTarifa, eliminarTarifa
};