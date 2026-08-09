import { useEffect, useState, type FormEvent } from "react";
import { api, ApiError } from "../../lib/api";
import { ROLES } from "../../lib/roles";
import type { UsuarioAcceso } from "../../lib/types";

export default function Accesos() {
  const [usuarios, setUsuarios] = useState<UsuarioAcceso[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [mostrarForm, setMostrarForm] = useState(false);

  const [nombre, setNombre] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [rol, setRol] = useState<string>("supervisor_huerta");

  function cargar() {
    api
      .get<UsuarioAcceso[]>("/rh/usuarios")
      .then(setUsuarios)
      .catch((err) => setError(err instanceof ApiError ? err.message : "No se pudo cargar."));
  }

  useEffect(cargar, []);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setMensaje(null);
    try {
      await api.post("/rh/usuarios", { nombre, username, password, rol });
      setNombre("");
      setUsername("");
      setPassword("");
      setMostrarForm(false);
      setMensaje(`Cuenta creada para ${username}.`);
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo crear la cuenta.");
    }
  }

  async function toggleActivo(u: UsuarioAcceso) {
    setError(null);
    try {
      await api.patch(`/rh/usuarios/${u.id}`, { activo: !u.activo });
      cargar();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo actualizar.");
    }
  }

  async function resetearPassword(u: UsuarioAcceso) {
    const nueva = prompt(`Nueva contraseña temporal para ${u.username}:`);
    if (!nueva) return;
    setError(null);
    try {
      await api.post(`/rh/usuarios/${u.id}/resetear-password`, { password: nueva });
      setMensaje(`Contraseña reseteada para ${u.username}.`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo resetear.");
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <button className="btn-primary" onClick={() => setMostrarForm((v) => !v)}>
          {mostrarForm ? "Cancelar" : "+ Nueva cuenta de acceso"}
        </button>
      </div>

      {mostrarForm && (
        <form onSubmit={onSubmit} className="card" style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 18 }}>
          <label className="field">
            Nombre
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} required />
          </label>
          <label className="field">
            Usuario
            <input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </label>
          <label className="field">
            Contraseña temporal
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} />
          </label>
          <label className="field">
            Rol
            <select value={rol} onChange={(e) => setRol(e.target.value)}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-primary" type="submit">
            Crear cuenta
          </button>
        </form>
      )}

      {error && <div className="tag tag-danger" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{error}</div>}
      {mensaje && <div className="tag tag-success" style={{ display: "block", padding: "8px 12px", marginBottom: 12 }}>{mensaje}</div>}

      <table>
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Usuario</th>
            <th>Rol</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {usuarios.map((u) => (
            <tr key={u.id}>
              <td>{u.nombre}</td>
              <td>{u.username}</td>
              <td>{u.rol}</td>
              <td>
                <span className={`tag ${u.activo ? "tag-success" : "tag-danger"}`}>{u.activo ? "Activo" : "Inactivo"}</span>
              </td>
              <td style={{ display: "flex", gap: 6 }}>
                <button className="btn-secondary" onClick={() => resetearPassword(u)}>
                  Resetear contraseña
                </button>
                <button className="btn-secondary" onClick={() => toggleActivo(u)}>
                  {u.activo ? "Desactivar" : "Reactivar"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
