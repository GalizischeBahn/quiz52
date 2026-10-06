import { getDb, localAdminOperation } from "./local-db.server";

export async function isSuperAdmin(userId: string) {
  return (await getDb()).users.some((user) => user.id === userId && user.role === "superadmin");
}
export async function listAdmins(callerId: string) {
  return localAdminOperation("list", { callerId });
}
export async function createAdmin(callerId: string, input: { email: string; name?: string | null }) {
  return localAdminOperation("create", { callerId, email: input.email, name: input.name });
}
export async function resetAdminPassword(callerId: string, userId: string) {
  return localAdminOperation("reset", { callerId, userId });
}
export async function deleteAdmin(callerId: string, userId: string) {
  return localAdminOperation("delete", { callerId, userId });
}
