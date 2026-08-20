import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

// Bug crítico 16-ago-2026: un error de JavaScript en cualquier pantalla
// (ej. un fetch a una ruta renombrada que regresó HTML en vez de datos)
// dejaba la app en blanco sin ningún mensaje — nadie que no fuera
// programador podía reportar nada útil. React solo puede atrapar estos
// errores de render con un Error Boundary de clase (no hay equivalente con
// hooks todavía). Uno global basta: cualquier pantalla que truene muestra
// este mensaje en vez de dejar la pantalla en blanco.
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Error atrapado por ErrorBoundary:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 24, maxWidth: 520, margin: "40px auto" }}>
          <div className="card" style={{ textAlign: "center" }}>
            <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 8 }}>Algo salió mal en esta pantalla</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-soft)", marginBottom: 4 }}>
              No se pudo mostrar esta información. Repórtale esto a soporte técnico:
            </div>
            <div
              style={{
                fontSize: 11,
                fontFamily: "monospace",
                background: "var(--bg)",
                borderRadius: 8,
                padding: 10,
                margin: "10px 0",
                textAlign: "left",
                overflowX: "auto",
              }}
            >
              {this.state.error.message}
            </div>
            <button className="btn-primary" onClick={() => window.location.reload()}>
              Recargar la página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
