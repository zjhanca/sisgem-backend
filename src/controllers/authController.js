const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
 
async function login(req, res) {
  const { email, password } = req.body;
  if (!email || !password)
    return res.status(400).json({ ok: false, mensaje: 'email y contrasena son requeridos' });
  try {
    const r = await pool.query(
      `SELECT u.*, r.nombre AS rol FROM usuarios u JOIN roles r ON u.rol_id=r.id
       WHERE u.email=$1 AND u.estado=true`, [email.toLowerCase().trim()]
    );
    if (!r.rows.length) return res.status(401).json({ ok: false, mensaje: 'credenciales incorrectas' });
    const usuario = r.rows[0];
    const ok = await bcrypt.compare(password, usuario.password);
    if (!ok) return res.status(401).json({ ok: false, mensaje: 'credenciales incorrectas' });
    const token = jwt.sign(
      { id: usuario.id, email: usuario.email, rol_id: usuario.rol_id },
      process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '8h' }
    );
    const { password: _, ...datos } = usuario;
    res.json({ ok: true, token, usuario: datos });
  } catch (err) { res.status(500).json({ ok: false, mensaje: err.message }); }
}
 
async function registro(req, res) {
  const {
    nombre, apellido, email, password, telefono,
    tipo_documento, numero_documento,
    direccion, barrio
  } = req.body;
 
  if (!nombre?.trim() || !apellido?.trim() || !email?.trim() || !password)
    return res.status(400).json({ ok: false, mensaje: 'nombre, apellido, email y contrasena son obligatorios' });
  if (password.length < 6)
    return res.status(400).json({ ok: false, mensaje: 'la contrasena debe tener minimo 6 caracteres' });
 
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
 
    // verificar si ya existe
    const existe = await client.query('SELECT id FROM usuarios WHERE email=$1', [email.toLowerCase().trim()]);
    if (existe.rows.length)
      return res.status(400).json({ ok: false, mensaje: 'el correo ya esta registrado' });
 
    // rol cliente = 2 (ajustar si es diferente)
    const rolCliente = await client.query("SELECT id FROM roles WHERE LOWER(nombre) LIKE '%cliente%' LIMIT 1");
    const rol_id = rolCliente.rows[0]?.id || 2;
 
    const hash = await bcrypt.hash(password, 10);
 
    // crear usuario
    const usr = await client.query(
      `INSERT INTO usuarios (nombre,apellido,email,password,telefono,rol_id,tipo_documento,numero_documento)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id,nombre,apellido,email,rol_id`,
      [nombre.trim(), apellido.trim(), email.toLowerCase().trim(), hash,
       telefono||null, rol_id, tipo_documento||'CC', numero_documento||null]
    );
    const usuario_id = usr.rows[0].id;
 
    // crear cliente vinculado
    const cli = await client.query(
      `INSERT INTO clientes (nombre,apellido,email,telefono,tipo_documento,numero_documento)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [nombre.trim(), apellido.trim(), email.toLowerCase().trim(),
       telefono||null, tipo_documento||'CC', numero_documento||null]
    );
 
    // crear direccion si viene
    if (direccion?.trim()) {
      await client.query(
        `INSERT INTO direcciones_envio (cliente_id,direccion,barrio) VALUES ($1,$2,$3)`,
        [cli.rows[0].id, direccion.trim(), barrio||null]
      );
    }
 
    await client.query('COMMIT');
 
    const token = jwt.sign(
      { id: usuario_id, email: email.toLowerCase(), rol_id },
      process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRES || '8h' }
    );
 
    res.status(201).json({
      ok: true, token,
      usuario: { id: usuario_id, nombre: nombre.trim(), apellido: apellido.trim(), email: email.toLowerCase(), rol_id }
    });
  } catch (err) {
    await client.query('ROLLBACK');
    if (err.code === '23505') return res.status(400).json({ ok: false, mensaje: 'el correo ya esta registrado' });
    res.status(500).json({ ok: false, mensaje: err.message });
  } finally { client.release(); }
}
 
module.exports = { login, registro };
