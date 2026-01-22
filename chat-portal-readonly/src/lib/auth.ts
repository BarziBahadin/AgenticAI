import { headers } from "next/headers";

export async function requireAdmin() {
  const mode = process.env.AUTH_MODE ?? "none";
  if (mode === "none") return;

  if (mode === "api_key") {
    const h = headers();
    const key = (await h).get("x-admin-key");
    if (!key || key !== process.env.ADMIN_API_KEY) throw new Error("UNAUTHORIZED");
    return;
  }

  throw new Error("AUTH_MODE_INVALID");
}
