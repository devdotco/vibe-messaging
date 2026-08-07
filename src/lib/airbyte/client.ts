const AIRBYTE_URL = process.env.AIRBYTE_URL ?? 'http://localhost:8000';
const CLIENT_ID = process.env.AIRBYTE_CLIENT_ID!;
const CLIENT_SECRET = process.env.AIRBYTE_CLIENT_SECRET!;

let cachedToken: { value: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 10_000) {
    return cachedToken.value;
  }
  const res = await fetch(`${AIRBYTE_URL}/api/public/v1/applications/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      'grant-type': 'client_credentials',
    }),
  });
  const data = await res.json();
  cachedToken = {
    value: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  };
  return cachedToken.value;
}

export async function triggerSync(connectionId: string): Promise<string> {
  const token = await getToken();
  const res = await fetch(`${AIRBYTE_URL}/api/public/v1/jobs`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ connectionId, jobType: 'sync' }),
  });
  const data = await res.json();
  return data.jobId;
}

export async function getSyncStatus(jobId: string) {
  const token = await getToken();
  const res = await fetch(`${AIRBYTE_URL}/api/public/v1/jobs/${jobId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.json();
}
