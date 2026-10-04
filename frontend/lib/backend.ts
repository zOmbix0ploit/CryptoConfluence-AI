const BACKEND = process.env.FASTAPI_BASE_URL || "http://localhost:8000";

export async function backendFetch(path: string, init?: RequestInit) {
  const url = `${BACKEND}${path}`;
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Backend error ${response.status}`);
  }
  return response.json();
}

export function backendWsUrl() {
  const base = BACKEND.replace(/^http/, "ws");
  return `${base}/ws`;
}
