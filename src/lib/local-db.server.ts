import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

type Row = Record<string, any>;
type LocalDb = Record<string, Row[]>;
const id = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const dbPath = () => join(process.env.DATA_DIR || join(process.cwd(), "data"), "quiz-data.json");
let cache: LocalDb | undefined;
let writing = Promise.resolve();

function seed(): LocalDb {
  const unit1 = "11111111-1111-1111-1111-111111111111";
  const unit2 = "22222222-2222-2222-2222-222222222222";
  const quiz1 = "33333333-3333-3333-3333-333333333333";
  const quiz2 = "44444444-4444-4444-4444-444444444444";
  const q1 = "55555555-0000-0000-0000-000000000001";
  const q2 = "55555555-0000-0000-0000-000000000002";
  const q3 = "66666666-0000-0000-0000-000000000001";
  return {
    units: [{ id: unit1, name: "1-й батальйон", description: "Перший окремий батальйон", created_at: now() }, { id: unit2, name: "2-й батальйон", description: "Другий окремий батальйон", created_at: now() }],
    participants: [{ id: "aaaaaaaa-0000-0000-0000-000000000010", unit_id: unit1, callsign: "ALPHA", device_token: null }, { id: "aaaaaaaa-0000-0000-0000-000000000011", unit_id: unit2, callsign: "ALPHA", device_token: null }],
    quizzes: [{ id: quiz1, title: "Історичні події", description: "Базовий квіз з історії", is_published: true, is_current: false, created_at: now(), draw_date: null, prize: null, rules: null }, { id: quiz2, title: "Технічні навички", description: "Перевірка технічних знань", is_published: true, is_current: true, created_at: now(), draw_date: null, prize: null, rules: null }],
    questions: [{ id: q1, quiz_id: quiz1, text: "У якому році проголошено Незалежність України?", position: 1, media_url: null, media_type: null }, { id: q2, quiz_id: quiz1, text: "Хто був першим Президентом України?", position: 2, media_url: null, media_type: null }, { id: q3, quiz_id: quiz2, text: "Що означає абревіатура РЕБ?", position: 1, media_url: null, media_type: null }],
    answers: [
      { id: "77777777-0000-0000-0000-000000000001", question_id: q1, text: "1991", is_correct: true, position: 1 }, { id: "77777777-0000-0000-0000-000000000002", question_id: q1, text: "1996", is_correct: false, position: 2 }, { id: "77777777-0000-0000-0000-000000000003", question_id: q1, text: "1918", is_correct: false, position: 3 },
      { id: "77777777-0000-0000-0000-000000000004", question_id: q2, text: "Леонід Кравчук", is_correct: true, position: 1 }, { id: "77777777-0000-0000-0000-000000000005", question_id: q2, text: "Леонід Кучма", is_correct: false, position: 2 },
      { id: "77777777-0000-0000-0000-000000000006", question_id: q3, text: "Радіоелектронна боротьба", is_correct: true, position: 1 }, { id: "77777777-0000-0000-0000-000000000007", question_id: q3, text: "Резервний енергоблок", is_correct: false, position: 2 },
    ],
    attempts: [], responses: [], users: [], sessions: [],
    app_settings: [{ id: true, system_name: "КВІЗ 52", logo_url: null, color_background: "220 12% 5%", color_surface: "220 10% 9%", color_surface_2: "220 8% 13%", color_foreground: "40 20% 92%", color_accent: "38 78% 55%" }],
  };
}

async function persist(db: LocalDb) {
  const path = dbPath();
  await mkdir(dirname(path), { recursive: true });
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(db), { mode: 0o600 });
  await rename(temp, path);
}

export async function getDb(): Promise<LocalDb> {
  if (cache) return cache;
  let shouldPersist = false;
  try { cache = JSON.parse(await readFile(dbPath(), "utf8")); }
  catch { cache = seed(); shouldPersist = true; }
  for (const settings of cache!.app_settings ?? []) {
    if (settings.system_name === "КВІЗ-СИСТЕМА") {
      settings.system_name = "КВІЗ 52";
      shouldPersist = true;
    }
  }
  const quizzes = cache!.quizzes ?? [];
  const currentQuizzes = quizzes.filter((quiz) => quiz.is_current && quiz.is_published);
  if (quizzes.length && currentQuizzes.length !== 1) {
    const selected = currentQuizzes[0] ?? [...quizzes]
      .filter((quiz) => quiz.is_published)
      .sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")) || String(b.id).localeCompare(String(a.id)))[0];
    for (const quiz of quizzes) {
      const isCurrent = quiz === selected;
      if (quiz.is_current !== isCurrent) shouldPersist = true;
      quiz.is_current = isCurrent;
    }
  }
  if (shouldPersist) await persist(cache!);
  return cache!;
}

export async function changeDb<T>(fn: (db: LocalDb) => T): Promise<T> {
  const previous = writing;
  let release!: () => void;
  writing = new Promise<void>((resolve) => { release = resolve; });
  await previous;
  try { const db = await getDb(); const result = fn(db); await persist(db); return result; }
  finally { release(); }
}

export async function createFirstAdmin(email: string, password: string) {
  return changeDb((db) => {
    if (db.users.length) throw new Error("Адміністратор уже налаштований. Попросіть чинного адміністратора створити обліковий запис.");
    if (password.length < 8) throw new Error("Пароль має містити щонайменше 8 символів");
    const user = addUser(db, email, password, "superadmin");
    return { id: user.id, email: user.email };
  });
}

function addUser(db: LocalDb, email: string, password: string, role = "admin") {
  const normalized = email.trim().toLowerCase();
  if (db.users.some((u) => u.email === normalized)) throw new Error("Ця пошта вже зареєстрована");
  const salt = randomBytes(16).toString("hex");
  const password_hash = scryptSync(password, salt, 64).toString("hex");
  const user = { id: id(), email: normalized, salt, password_hash, role, created_at: now() };
  db.users.push(user);
  return user;
}

export async function loginAdmin(email: string, password: string) {
  return changeDb((db) => {
    const user = db.users.find((u) => u.email === email.trim().toLowerCase());
    if (!user) throw new Error("Невірна пошта або пароль");
    const actual = scryptSync(password, user.salt, 64);
    const expected = Buffer.from(user.password_hash, "hex");
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error("Невірна пошта або пароль");
    const token = randomBytes(32).toString("base64url");
    db.sessions = db.sessions.filter((s) => s.user_id !== user.id);
    db.sessions.push({ token, user_id: user.id, created_at: now() });
    return { token, user: { id: user.id, email: user.email, role: user.role } };
  });
}

export async function localAdminOperation(action: "list" | "create" | "reset" | "delete", input: { callerId: string; userId?: string; email?: string; name?: string | null } ) {
  return changeDb((db) => {
    const caller = db.users.find((u) => u.id === input.callerId);
    if (!caller || caller.role !== "superadmin") throw new Error("Доступ лише для головного адміністратора");
    if (action === "list") return db.users.map((u) => ({ id: u.id, email: u.email, name: u.name ?? null, created_at: u.created_at, roles: [u.role] }));
    if (action === "create") {
      const password = randomBytes(12).toString("base64url");
      const user = addUser(db, input.email ?? "", password);
      user.name = input.name ?? null;
      return { id: user.id, email: user.email, password };
    }
    const target = db.users.find((u) => u.id === input.userId);
    if (!target) throw new Error("Акаунт не знайдено");
    if (target.role === "superadmin") throw new Error("Головний адміністратор не може бути змінений цією дією");
    if (action === "delete") {
      if (target.id === caller.id) throw new Error("Не можна видалити власний акаунт");
      db.users = db.users.filter((u) => u.id !== target.id);
      db.sessions = db.sessions.filter((s) => s.user_id !== target.id);
      return { success: true as const };
    }
    const password = randomBytes(12).toString("base64url");
    target.salt = randomBytes(16).toString("hex");
    target.password_hash = scryptSync(password, target.salt, 64).toString("hex");
    return { password };
  });
}

export async function userForToken(token: string | null | undefined) {
  if (!token) return null;
  const db = await getDb();
  const session = db.sessions.find((s) => s.token === token);
  return session ? db.users.find((u) => u.id === session.user_id) ?? null : null;
}

export async function requireAdmin(token?: string | null) {
  const user = await userForToken(token);
  if (!user) throw new Error("Сеанс адміністратора завершився. Увійдіть знову.");
  return user;
}

export async function dbQuery(input: { table: string; action: string; values?: any; filters?: { column: string; op: string; value: any }[]; order?: { column: string; ascending: boolean }; limit?: number; onConflict?: string }, token?: string | null) {
  if (input.table !== "app_settings" || input.action !== "select") await requireAdmin(token);
  return changeDb((db) => {
    const rows = db[input.table];
    if (!rows) throw new Error(`Unknown table: ${input.table}`);
    const matches = (row: Row) => (input.filters ?? []).every((f) => {
      const value = row[f.column];
      if (f.op === "eq") return value === f.value;
      if (f.op === "ilike") return String(value ?? "").toLowerCase() === String(f.value).replaceAll("%", "").toLowerCase();
      if (f.op === "in") return f.value.includes(value);
      return false;
    });
    let result: Row[];
    if (input.action === "insert" || input.action === "upsert") {
      const items = Array.isArray(input.values) ? input.values : [input.values];
      result = items.map((value) => {
        const conflict = input.action === "upsert" && input.onConflict ? rows.find((r) => input.onConflict!.split(",").every((k) => r[k] === value[k])) : undefined;
        if (conflict) { Object.assign(conflict, value); return conflict; }
        if (input.table === "units" && rows.some((r) => r.name.toLowerCase() === String(value.name).toLowerCase())) throw new Error("Такий підрозділ уже існує");
        if (input.table === "participants" && rows.some((r) => r.unit_id === value.unit_id && r.callsign.toLowerCase() === String(value.callsign).toLowerCase())) throw new Error("Цей позивний уже додано до підрозділу");
        if (input.table === "attempts" && rows.some((r) => r.participant_id === value.participant_id && r.quiz_id === value.quiz_id)) throw new Error("Спробу для цього квізу вже створено");
        if (input.table === "responses" && rows.some((r) => r.attempt_id === value.attempt_id && r.question_id === value.question_id)) throw new Error("Відповідь на це запитання вже збережено");
        const row = { id: id(), created_at: now(), ...(input.table === "quizzes" ? { is_current: false } : {}), ...value };
        rows.push(row); return row;
      });
    } else if (input.action === "update") {
      if (input.table === "quizzes" && input.values?.is_current === true) {
        rows.forEach((row) => { row.is_current = false; });
      }
      result = rows.filter(matches);
      result.forEach((r) => {
        Object.assign(r, input.values);
        if (input.table === "quizzes" && input.values?.is_published === false) r.is_current = false;
      });
    } else if (input.action === "delete") {
      result = rows.filter(matches);
      db[input.table] = rows.filter((r) => !matches(r));
      const removedIds = new Set(result.map((r) => r.id));
      if (input.table === "quizzes") {
        const questions = db.questions.filter((q) => removedIds.has(q.quiz_id));
        const questionIds = new Set(questions.map((q) => q.id));
        const attempts = db.attempts.filter((a) => removedIds.has(a.quiz_id));
        const attemptIds = new Set(attempts.map((a) => a.id));
        db.questions = db.questions.filter((q) => !questionIds.has(q.id));
        db.answers = db.answers.filter((a) => !questionIds.has(a.question_id));
        db.responses = db.responses.filter((r) => !questionIds.has(r.question_id) && !attemptIds.has(r.attempt_id));
        db.attempts = db.attempts.filter((a) => !attemptIds.has(a.id));
      } else if (input.table === "questions") {
        db.answers = db.answers.filter((a) => !removedIds.has(a.question_id));
        db.responses = db.responses.filter((r) => !removedIds.has(r.question_id));
      } else if (input.table === "participants") {
        const attempts = db.attempts.filter((a) => removedIds.has(a.participant_id));
        const attemptIds = new Set(attempts.map((a) => a.id));
        db.attempts = db.attempts.filter((a) => !attemptIds.has(a.id));
        db.responses = db.responses.filter((r) => !attemptIds.has(r.attempt_id));
      }
    } else {
      result = rows.filter(matches);
      if (input.order) result.sort((a, b) => { const av = a[input.order!.column] ?? ""; const bv = b[input.order!.column] ?? ""; return (av < bv ? -1 : av > bv ? 1 : 0) * (input.order!.ascending ? 1 : -1); });
      if (input.limit) result = result.slice(0, input.limit);
      result = result.map((r) => enrich(db, input.table, r, input.values?.select ?? ""));
    }
    return result;
  });
}

function enrich(db: LocalDb, table: string, row: Row, selection: string): Row {
  const result = { ...row };
  if (table === "units" && selection.includes("participants(")) result.participants = db.participants.filter((p) => p.unit_id === row.id);
  if (table === "questions" && selection.includes("answers(")) result.answers = db.answers.filter((a) => a.question_id === row.id);
  if (table === "attempts" && selection.includes("quizzes(")) {
    result.quizzes = db.quizzes.find((q) => q.id === row.quiz_id) ?? null;
    const participant = db.participants.find((p) => p.id === row.participant_id);
    result.participants = participant ? { ...participant, units: db.units.find((u) => u.id === participant.unit_id) ?? null } : null;
  }
  return result;
}

export async function signOut(token: string) {
  await changeDb((db) => { db.sessions = db.sessions.filter((s) => s.token !== token); });
}

export async function mediaUpload(fileName: string, mimeType: string, base64: string, token: string) {
  await requireAdmin(token);
  return `data:${mimeType};base64,${base64}`;
}
