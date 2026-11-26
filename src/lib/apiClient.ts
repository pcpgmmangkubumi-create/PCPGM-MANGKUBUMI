import { auth } from './firebase';

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Silakan masuk dengan akun Google terlebih dahulu.');
  }
  const token = await user.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

export async function postAuthedJson<T>(url: string, body: unknown): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Permintaan gagal (${res.status})`);
  }
  return data as T;
}

export async function postPublicJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Permintaan gagal (${res.status})`);
  }
  return data as T;
}

export async function uploadTextbookFile(formData: FormData): Promise<any> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Silakan masuk dengan akun Google terlebih dahulu.');
  }
  const token = await user.getIdToken();
  const res = await fetch('/api/books/extract', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
    },
    body: formData,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Ekstraksi buku gagal (${res.status})`);
  }
  return data;
}
