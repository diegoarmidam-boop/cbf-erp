import { Navigate, Route, BrowserRouter, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import Login from "./pages/Login";
import AppShell from "./layout/AppShell";
import NominaLayout from "./pages/nomina/NominaLayout";
import CapturaDelDia from "./pages/nomina/CapturaDelDia";
import CierreDelDia from "./pages/nomina/CierreDelDia";
import Asistencia from "./pages/nomina/Asistencia";
import Prestamos from "./pages/nomina/Prestamos";
import Bonos from "./pages/nomina/Bonos";
import ReporteSemanal from "./pages/nomina/ReporteSemanal";
import Catalogos from "./pages/nomina/Catalogos";
import Huertas from "./pages/unidades-produccion/Huertas";
import RHLayout from "./pages/rh/RHLayout";
import Personal from "./pages/rh/Personal";
import PersonalDetalle from "./pages/rh/PersonalDetalle";
import Puestos from "./pages/rh/Puestos";
import DoNotHire from "./pages/rh/DoNotHire";
import Accesos from "./pages/rh/Accesos";

function RutaProtegida({ children }: { children: React.ReactNode }) {
  const { autenticado } = useAuth();
  if (!autenticado) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <RutaProtegida>
                <AppShell />
              </RutaProtegida>
            }
          >
            <Route path="/" element={<Navigate to="/nomina" replace />} />

            <Route path="/nomina" element={<NominaLayout />}>
              <Route index element={<Navigate to="captura" replace />} />
              <Route path="captura" element={<CapturaDelDia />} />
              <Route path="cierre" element={<CierreDelDia />} />
              <Route path="asistencia" element={<Asistencia />} />
              <Route path="prestamos" element={<Prestamos />} />
              <Route path="bonos" element={<Bonos />} />
              <Route path="reporte" element={<ReporteSemanal />} />
              <Route path="catalogos" element={<Catalogos />} />
            </Route>

            <Route path="/rh" element={<RHLayout />}>
              <Route index element={<Navigate to="personal" replace />} />
              <Route path="personal" element={<Personal />} />
              <Route path="personal/:id" element={<PersonalDetalle />} />
              <Route path="puestos" element={<Puestos />} />
              <Route path="do-not-hire" element={<DoNotHire />} />
              <Route path="accesos" element={<Accesos />} />
            </Route>

            <Route path="/unidades_produccion" element={<Huertas />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
