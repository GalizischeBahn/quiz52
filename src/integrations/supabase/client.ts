import { localDbQuery, localMediaUpload, localSignIn, localSignOut, localSignUp, localWhoAmI } from "@/lib/local.functions";

type Filter = { column: string; op: string; value: unknown };
const sessionKey = "quiz-local-admin-session";
const readToken = () => typeof localStorage === "undefined" ? null : localStorage.getItem(sessionKey);
const saveToken = (token: string | null) => { if (typeof localStorage !== "undefined") token ? localStorage.setItem(sessionKey, token) : localStorage.removeItem(sessionKey); };

class Query implements PromiseLike<any> {
  private action = "select";
  private values: any;
  private filters: Filter[] = [];
  private sort?: { column: string; ascending: boolean };
  private max?: number;
  private conflict?: string;
  private selection = "*";
  constructor(private table: string) {}
  select(selection = "*") { this.selection = selection; return this; }
  insert(values: any) { this.action = "insert"; this.values = values; return this; }
  update(values: any) { this.action = "update"; this.values = values; return this; }
  delete() { this.action = "delete"; return this; }
  upsert(values: any, options?: { onConflict?: string }) { this.action = "upsert"; this.values = values; this.conflict = options?.onConflict; return this; }
  eq(column: string, value: unknown) { this.filters.push({ column, op: "eq", value }); return this; }
  ilike(column: string, value: unknown) { this.filters.push({ column, op: "ilike", value }); return this; }
  in(column: string, value: unknown[]) { this.filters.push({ column, op: "in", value }); return this; }
  order(column: string, options?: { ascending?: boolean }) { this.sort = { column, ascending: options?.ascending ?? true }; return this; }
  limit(value: number) { this.max = value; return this; }
  maybeSingle() { return this.execute(true); }
  single() { return this.execute(true); }
  then<TResult1 = any, TResult2 = never>(onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null, onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null): PromiseLike<TResult1 | TResult2> { return this.execute().then(onfulfilled, onrejected); }
  private async execute(single = false): Promise<any> {
    try {
      const response = await localDbQuery({ data: { table: this.table, action: this.action, values: this.action === "select" ? { select: this.selection } : this.values, filters: this.filters, order: this.sort, limit: this.max, onConflict: this.conflict } });
      const rows = response.data ?? [];
      return { data: single ? (rows[0] ?? null) : rows, error: null, count: rows.length };
    } catch (error) { return { data: null, error: { message: (error as Error).message } }; }
  }
}

const auth = {
  async signInWithPassword(input: { email: string; password: string }) { try { const session = await localSignIn({ data: input }); saveToken(session.token); return { data: { user: session.user, session: { access_token: session.token, user: session.user } }, error: null }; } catch (error) { return { data: { user: null, session: null }, error: { message: (error as Error).message } }; } },
  async signUp(input: { email: string; password: string }) { try { const { user } = await localSignUp({ data: input }); const session = await localSignIn({ data: input }); saveToken(session.token); return { data: { user, session: { access_token: session.token, user } }, error: null }; } catch (error) { return { data: { user: null, session: null }, error: { message: (error as Error).message } }; } },
  async getSession() { const token = readToken(); if (!token) return { data: { session: null }, error: null }; try { const user = await localWhoAmI(); return { data: { session: { access_token: token, user } }, error: null }; } catch { saveToken(null); return { data: { session: null }, error: null }; } },
  async getUser() { const session = await auth.getSession(); return { data: { user: session.data.session?.user ?? null }, error: null }; },
  async signOut() { const token = readToken(); if (token) await localSignOut({ data: { token } }); saveToken(null); return { error: null }; },
};

export const supabase = {
  auth,
  from: (table: string) => new Query(table),
  storage: { from: (_bucket: string) => ({
    async upload(path: string, file: File) { try { const bytes = new Uint8Array(await file.arrayBuffer()); let binary = ""; bytes.forEach((b) => binary += String.fromCharCode(b)); const result = await localMediaUpload({ data: { fileName: path, mimeType: file.type || "application/octet-stream", base64: btoa(binary) } }); return { data: result.data, error: null }; } catch (error) { return { data: null, error: { message: (error as Error).message } }; } },
    async createSignedUrl(path: string) { return { data: { signedUrl: path }, error: null }; },
  }) },
  channel: () => ({ on: () => ({ on: () => ({ subscribe: () => ({}) }), subscribe: () => ({}) }), subscribe: () => ({}) }),
  removeChannel: () => {},
};
