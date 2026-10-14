export type PublicGroup = {
  id: string;
  name: string;
  slug: string;
};

async function parseJson<T>(res: Response): Promise<T> {
  const body = (await res.json().catch(() => null)) as
    | (T & { error?: string })
    | { error?: string }
    | null;
  if (!res.ok) {
    throw new Error(
      (body && "error" in body && body.error) ||
        `Request failed (${res.status})`
    );
  }
  return body as T;
}

export async function fetchPublicGroups(): Promise<PublicGroup[]> {
  const res = await fetch("/api/register?resource=groups");
  const data = await parseJson<{ groups: PublicGroup[] }>(res);
  return data.groups ?? [];
}

export async function registerAccount(input: {
  email: string;
  password: string;
  requestedGroupId: string;
}): Promise<{ userId: string }> {
  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  return parseJson<{ userId: string }>(res);
}
