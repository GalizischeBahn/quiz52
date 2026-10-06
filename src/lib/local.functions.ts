import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const credentials = z.object({ email: z.string().trim().email(), password: z.string().min(1) });
export const localSignIn = createServerFn({ method: "POST" }).inputValidator((x) => credentials.parse(x)).handler(async ({ data }) => (await import("./local-db.server")).loginAdmin(data.email, data.password));
export const localSignUp = createServerFn({ method: "POST" }).inputValidator((x) => credentials.parse(x)).handler(async ({ data }) => ({ user: await (await import("./local-db.server")).createFirstAdmin(data.email, data.password) }));
export const localSignOut = createServerFn({ method: "POST" }).inputValidator((x) => z.object({ token: z.string() }).parse(x)).handler(async ({ data }) => { await (await import("./local-db.server")).signOut(data.token); return { success: true }; });
export const localDbQuery = createServerFn({ method: "POST" }).inputValidator((x) => z.object({ table: z.string(), action: z.string(), values: z.any().optional(), filters: z.array(z.object({ column: z.string(), op: z.string(), value: z.any() })).optional(), order: z.object({ column: z.string(), ascending: z.boolean() }).optional(), limit: z.number().optional(), onConflict: z.string().optional() }).parse(x)).handler(async ({ data }) => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const token = getRequest().headers.get("authorization")?.replace(/^Bearer /, "");
  const rows = await (await import("./local-db.server")).dbQuery(data, token);
  return { data: rows, error: null, count: rows.length };
});
export const localMediaUpload = createServerFn({ method: "POST" }).inputValidator((x) => z.object({ fileName: z.string(), mimeType: z.string(), base64: z.string() }).parse(x)).handler(async ({ data }) => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const token = getRequest().headers.get("authorization")?.replace(/^Bearer /, "");
  const url = await (await import("./local-db.server")).mediaUpload(data.fileName, data.mimeType, data.base64, token ?? "");
  return { data: { path: url }, error: null };
});
export const localWhoAmI = createServerFn({ method: "GET" }).handler(async () => {
  const { getRequest } = await import("@tanstack/react-start/server");
  const token = getRequest().headers.get("authorization")?.replace(/^Bearer /, "");
  const user = await (await import("./local-db.server")).requireAdmin(token);
  return { id: user.id, email: user.email, role: user.role };
});
