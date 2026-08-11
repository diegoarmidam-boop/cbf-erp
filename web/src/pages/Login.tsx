import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { ApiError } from "../lib/api";
import logoChula from "../assets/logo-chula-brand.jpg";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      await login(username, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "No se pudo iniciar sesión.");
    } finally {
      setCargando(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "linear-gradient(160deg, var(--wine), #8a2f56)",
      }}
    >
      <form
        onSubmit={onSubmit}
        className="card"
        style={{ width: 320, display: "flex", flexDirection: "column", gap: 14 }}
      >
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 6 }}>
          <img src={logoChula} alt="Chula Brand" style={{ width: 84, height: "auto" }} />
          <h1 style={{ fontSize: 22, color: "var(--wine)" }}>CHULA</h1>
          <div style={{ fontSize: 11, letterSpacing: "0.1em", color: "var(--ink-soft)" }}>BRAND — ERP</div>
        </div>

        <label className="field">
          Usuario
          <input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
        </label>
        <label className="field">
          Contraseña
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        {error && <div style={{ color: "var(--danger)", fontSize: 12 }}>{error}</div>}

        <button className="btn-primary" type="submit" disabled={cargando}>
          {cargando ? "Entrando..." : "Entrar"}
        </button>
      </form>
    </div>
  );
}
