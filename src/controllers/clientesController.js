const pool = require('../config/db');
 
async function listar(req, res) {
  try {
    const r = await pool.query('SELECT * FROM clientes ORDER BY id DESC');
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function crear(req, res) {
  const { nombre, apellido, email, telefono, tipo_documento, numero_documento } = req.body;
  if (!nombre?.trim() || !apellido?.trim())
    return res.status(400).json({ ok: false, mensaje: 'nombre y apellido son obligatorios' });
  try {
    const r = await pool.query(
      `INSERT INTO clientes (nombre,apellido,email,telefono,tipo_documento,numero_documento)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [nombre.trim(), apellido.trim(), email||null, telefono||null, tipo_documento||'CC', numero_documento||null]
    );
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) {
    if (err.code === '23505') return res.status(400).json({ ok: false, mensaje: 'el correo ya esta registrado' });
    res.status(500).json({ ok: false, mensaje: err.message });
  }
}
 
async function actualizar(req, res) {
  const { id } = req.params;
  const { nombre, apellido, email, telefono, tipo_documento, numero_documento, estado } = req.body;
  try {
    const r = await pool.query(
      `UPDATE clientes SET nombre=$1,apellido=$2,email=$3,telefono=$4,
         tipo_documento=$5,numero_documento=$6,estado=$7 WHERE id=$8 RETURNING *`,
      [nombre, apellido, email||null, telefono||null, tipo_documento||'CC', numero_documento||null, estado??true, id]
    );
    if (!r.rows.length) return res.status(404).json({ ok: false, mensaje: 'cliente no encontrado' });
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function toggleEstado(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query('UPDATE clientes SET estado=NOT estado WHERE id=$1 RETURNING *', [id]);
    res.json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function detalle(req, res) {
  const { id } = req.params;
  try {
    const cliente = await pool.query('SELECT * FROM clientes WHERE id=$1', [id]);
    if (!cliente.rows.length) return res.status(404).json({ ok: false, mensaje: 'cliente no encontrado' });
    const pedidos = await pool.query(`
      SELECT p.id, p.total, p.fecha_pedido, p.estado_id, e.nombre AS estado
      FROM pedidos p LEFT JOIN estados e ON p.estado_id=e.id
      WHERE p.cliente_id=$1 ORDER BY p.id DESC LIMIT 10
    `, [id]);
    res.json({ ok: true, datos: { ...cliente.rows[0], pedidos: pedidos.rows } });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function listarDirecciones(req, res) {
  const { id } = req.params;
  try {
    const r = await pool.query(
      'SELECT * FROM direcciones_envio WHERE cliente_id=$1 AND estado=true ORDER BY id DESC', [id]
    );
    res.json({ ok: true, datos: r.rows });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function crearDireccion(req, res) {
  const { id } = req.params;
  const { direccion, barrio, indicaciones } = req.body;
  if (!direccion?.trim()) return res.status(400).json({ ok: false, mensaje: 'la direccion es obligatoria' });
  try {
    const r = await pool.query(
      `INSERT INTO direcciones_envio (cliente_id,direccion,barrio,indicaciones)
       VALUES ($1,$2,$3,$4) RETURNING *`,
      [id, direccion.trim(), barrio||null, indicaciones||null]
    );
    res.status(201).json({ ok: true, datos: r.rows[0] });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
module.exports = { listar, crear, actualizar, toggleEstado, detalle, listarDirecciones, crearDireccion };
 
