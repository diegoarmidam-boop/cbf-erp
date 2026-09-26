import { api, ApiError, getToken } from "./api";

/** Sube una foto de evidencia (relleno de combustible, Traslado) y devuelve su URL — V1 P3, 26-sep-2026. */
export async function subirEvidencia(archivo: File): Promise<string> {
  const form = new FormData();
  form.append("archivo", archivo);
  const token = getToken();
  const res = await fetch(`${api.apiUrl}/equipos/evidencia`, {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "No se pudo subir la foto." }));
    throw new ApiError(res.status, body.error);
  }
  const data = (await res.json()) as { url: string };
  return data.url;
}
