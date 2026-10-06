import { createMiddleware } from "@tanstack/react-start";

// Local admin session token is stored in this browser and attached to server functions.
export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(async ({ next }) => {
  const token = typeof localStorage === "undefined" ? null : localStorage.getItem("quiz-local-admin-session");
  return next({ headers: token ? { Authorization: `Bearer ${token}` } : {} });
});
