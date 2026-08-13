import { useEffect, useState } from "react";

interface FechaInputProps {
  value: string; // ISO "AAAA-MM-DD", o "" si está vacío
  onChange: (iso: string) => void;
  required?: boolean;
  disabled?: boolean;
  id?: string;
}

function isoAVisible(iso: string): string {
  if (!iso) return "";
  const [anio, mes, dia] = iso.split("-");
  if (!anio || !mes || !dia) return "";
  return `${dia}/${mes}/${anio}`;
}

function esFechaValida(dia: number, mes: number, anio: number): boolean {
  if (mes < 1 || mes > 12 || dia < 1) return false;
  const diasDelMes = new Date(anio, mes, 0).getDate();
  return dia <= diasDelMes;
}

/**
 * Captura de fecha en formato DD/MM/AAAA (bloque 1, confirmado 9-ago-2026:
 * aplica también a los campos de captura, no solo a lo que se muestra en
 * pantalla) — un <input type="date"> nativo siempre se ve con el formato
 * del navegador/sistema operativo, no se puede forzar DD/MM/AAAA de forma
 * confiable entre navegadores, así que esto es un input de texto propio
 * con máscara automática de "/" y validación, que por fuera se comporta
 * igual que el date picker nativo que reemplaza: recibe y entrega la
 * fecha como ISO (AAAA-MM-DD).
 */
export default function FechaInput({ value, onChange, required, disabled, id }: FechaInputProps) {
  const [texto, setTexto] = useState(() => isoAVisible(value));

  // Si el valor ISO cambia desde afuera (ej. se precarga un formulario),
  // refleja el cambio en el texto visible.
  useEffect(() => {
    setTexto(isoAVisible(value));
  }, [value]);

  function alCambiar(e: React.ChangeEvent<HTMLInputElement>) {
    const soloDigitos = e.target.value.replace(/[^0-9]/g, "").slice(0, 8);
    let formateado = soloDigitos;
    if (soloDigitos.length > 4) {
      formateado = `${soloDigitos.slice(0, 2)}/${soloDigitos.slice(2, 4)}/${soloDigitos.slice(4)}`;
    } else if (soloDigitos.length > 2) {
      formateado = `${soloDigitos.slice(0, 2)}/${soloDigitos.slice(2)}`;
    }
    setTexto(formateado);

    if (soloDigitos.length === 8) {
      const dia = Number(soloDigitos.slice(0, 2));
      const mes = Number(soloDigitos.slice(2, 4));
      const anio = Number(soloDigitos.slice(4, 8));
      if (esFechaValida(dia, mes, anio)) {
        onChange(`${String(anio).padStart(4, "0")}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`);
        return;
      }
    }
    if (soloDigitos.length === 0) onChange("");
  }

  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      placeholder="DD/MM/AAAA"
      value={texto}
      onChange={alCambiar}
      onFocus={(e) => e.target.select()}
      required={required}
      disabled={disabled}
      maxLength={10}
    />
  );
}
