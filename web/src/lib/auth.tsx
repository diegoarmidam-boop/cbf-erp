import { createContext, useContext, useState, type ReactNode } from "react";
import { api, setToken, getToken } from "./api";

export interface UsuarioSesion {
  id: string;
  nombre: string;
  rol: string;
  huertaId: string | null;
}

interface LoginResponse {
  token: string;
  usuario: UsuarioSesion;
  modulosVisibles: string[];
}

interface AuthState {
  usuario: UsuarioSesion | null;
  modulosVisibles: string[];
  autenticado: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const USUARIO_KEY = "cbf_usuario";
const MODULOS_KEY = "cbf_modulos";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<UsuarioSesion | null>(() => {
    const raw = localStorage.getItem(USUARIO_KEY);
    return raw ? (JSON.parse(raw) as UsuarioSesion) : null;
  });
  const [modulosVisibles, setModulosVisibles] = useState<string[]>(() => {
    const raw = localStorage.getItem(MODULOS_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  });

  async function login(username: string, password: string) {
    const respuesta = await api.post<LoginResponse>("/auth/login", { username, password });
    setToken(respuesta.token);
    localStorage.setItem(USUARIO_KEY, JSON.stringify(respuesta.usuario));
    localStorage.setItem(MODULOS_KEY, JSON.stringify(respuesta.modulosVisibles));
    setUsuario(respuesta.usuario);
    setModulosVisibles(respuesta.modulosVisibles);
  }

  function logout() {
    setToken(null);
    localStorage.removeItem(USUARIO_KEY);
    localStorage.removeItem(MODULOS_KEY);
    setUsuario(null);
    setModulosVisibles([]);
  }

  return (
    <AuthContext.Provider value={{ usuario, modulosVisibles, autenticado: !!usuario && !!getToken(), login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>.");
  return ctx;
}
