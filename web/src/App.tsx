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
import UPLayout from "./pages/unidades-produccion/UPLayout";
import HuertasYCuadros from "./pages/unidades-produccion/HuertasYCuadros";
import Ciclos from "./pages/unidades-produccion/Ciclos";
import SeccionesRiego from "./pages/unidades-produccion/SeccionesRiego";
import RHLayout from "./pages/rh/RHLayout";
import Personal from "./pages/rh/Personal";
import PersonalDetalle from "./pages/rh/PersonalDetalle";
import Puestos from "./pages/rh/Puestos";
import DoNotHire from "./pages/rh/DoNotHire";
import Accesos from "./pages/rh/Accesos";
import AlmacenLayout from "./pages/almacen/AlmacenLayout";
import Catalogo from "./pages/almacen/Catalogo";
import Inventario from "./pages/almacen/Inventario";
import Movimientos from "./pages/almacen/Movimientos";
import AlmacenLocalPage from "./pages/almacen/AlmacenLocalPage";
import Solicitudes from "./pages/Solicitudes";
import ComprasLayout from "./pages/compras/ComprasLayout";
import Ordenes from "./pages/compras/Ordenes";
import Proveedores from "./pages/compras/Proveedores";
import EquiposLayout from "./pages/equipos/EquiposLayout";
import EquiposCatalogo from "./pages/equipos/Catalogo";
import Combustible from "./pages/equipos/Combustible";
import Mantenimiento from "./pages/equipos/Mantenimiento";
import UsoDiario from "./pages/equipos/UsoDiario";
import Aplicaciones from "./pages/aplicaciones/Aplicaciones";
import FertilizantesLayout from "./pages/fertilizantes/FertilizantesLayout";
import Granular from "./pages/fertilizantes/Granular";
import Fertirriego from "./pages/fertilizantes/Fertirriego";
import Riego from "./pages/riego/Riego";

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
            <Route path="/solicitudes" element={<Solicitudes />} />

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

            <Route path="/unidades_produccion" element={<UPLayout />}>
              <Route index element={<Navigate to="huertas" replace />} />
              <Route path="huertas" element={<HuertasYCuadros />} />
              <Route path="ciclos" element={<Ciclos />} />
              <Route path="riego" element={<SeccionesRiego />} />
            </Route>

            <Route path="/almacen" element={<AlmacenLayout />}>
              <Route index element={<Navigate to="catalogo" replace />} />
              <Route path="catalogo" element={<Catalogo />} />
              <Route path="inventario" element={<Inventario />} />
              <Route path="movimientos" element={<Movimientos />} />
              <Route path="local" element={<AlmacenLocalPage />} />
            </Route>

            <Route path="/compras" element={<ComprasLayout />}>
              <Route index element={<Navigate to="ordenes" replace />} />
              <Route path="ordenes" element={<Ordenes />} />
              <Route path="proveedores" element={<Proveedores />} />
            </Route>

            <Route path="/equipos" element={<EquiposLayout />}>
              <Route index element={<Navigate to="catalogo" replace />} />
              <Route path="catalogo" element={<EquiposCatalogo />} />
              <Route path="combustible" element={<Combustible />} />
              <Route path="mantenimiento" element={<Mantenimiento />} />
              <Route path="uso-diario" element={<UsoDiario />} />
            </Route>

            <Route path="/aplicaciones" element={<Aplicaciones />} />

            <Route path="/fertilizantes" element={<FertilizantesLayout />}>
              <Route index element={<Navigate to="granular" replace />} />
              <Route path="granular" element={<Granular />} />
              <Route path="fertirriego" element={<Fertirriego />} />
            </Route>

            <Route path="/riego" element={<Riego />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
