import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireAdmin } from "@/lib/local-db.server";

export const requireSupabaseAuth = createMiddleware({ type: "function" }).server(async ({ next }) => {
  const token = getRequest().headers.get("authorization")?.replace(/^Bearer /, "");
  const user = await requireAdmin(token);
  return next({ context: { userId: user.id, user, isSuperAdmin: user.role === "superadmin" } });
});
