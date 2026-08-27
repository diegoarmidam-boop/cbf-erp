interface FechaInputProps {
  value: string; // ISO "AAAA-MM-DD", o "" si está vacío
  onChange: (iso: string) => void;
  required?: boolean;
  disabled?: boolean;
  id?: string;
}

/**
 * Selector de fecha con calendario nativo (26-ago-2026, reemplaza la
 * máscara de texto DD/MM/AAAA que tenía antes este mismo componente): se
 * toca/da clic y se elige el día, no se teclea — pedido explícito para
 * todo el sistema, además corrige de raíz el zoom automático de iOS en
 * campos de texto (un <input type="date"> no lo dispara). El formato
 * visible ahora lo decide el navegador/sistema operativo de quien lo usa
 * en vez de forzarse siempre a DD/MM/AAAA — se acepta ese cambio a cambio
 * de tener calendario real. La interfaz hacia afuera no cambia (sigue
 * recibiendo/entregando ISO AAAA-MM-DD), así que ningún otro archivo que
 * ya use este componente necesita tocarse.
 */
export default function FechaInput({ value, onChange, required, disabled, id }: FechaInputProps) {
  return (
    <input
      id={id}
      type="date"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required={required}
      disabled={disabled}
    />
  );
}
