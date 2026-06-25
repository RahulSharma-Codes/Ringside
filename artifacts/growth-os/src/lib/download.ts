const AUTH_TOKEN_KEY = "ig_os_auth_token";

/**
 * Fetch a file from an authenticated API endpoint and trigger a browser download.
 * Uses the stored auth token so the request passes the server's bearer-token check.
 */
export async function downloadAuthenticatedFile(
  url: string,
  filename: string,
): Promise<void> {
  const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
  const headers: Record<string, string> = {};
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(url, { headers });
  if (!res.ok) {
    throw new Error(`Export failed: ${res.status} ${res.statusText}`);
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(objectUrl);
}
