import { changeDb, getDb } from "./local-db.server";

export type ParticipantSession = { id: string; callsign: string; unit_id: string; unit_name: string };
export type AttemptReviewItem = { question_id: string; question: string; is_correct: boolean; given: string | null; correct: string | null };
const newId = () => crypto.randomUUID();

export async function listUnits() { return (await getDb()).units.map(({ id, name }) => ({ id, name })); }

export async function loginParticipant(input: { unitName: string; callsign: string; deviceToken: string | null }) {
  const unitName = input.unitName.trim(); const callsign = input.callsign.trim();
  if (!unitName || !callsign) throw new Error("Вкажіть підрозділ і позивний");
  return changeDb((db) => {
    let unit = db.units.find((u) => u.name.toLowerCase() === unitName.toLowerCase());
    if (!unit) { unit = { id: newId(), name: unitName, description: null, created_at: new Date().toISOString() }; db.units.push(unit); }
    let participant = db.participants.find((p) => p.unit_id === unit!.id && p.callsign.toLowerCase() === callsign.toLowerCase());
    let token = input.deviceToken;
    if (participant?.device_token && participant.device_token !== token) throw new Error("Цей позивний вже прив'язано до іншого пристрою");
    if (!participant) { token ??= newId(); participant = { id: newId(), unit_id: unit.id, callsign, device_token: token }; db.participants.push(participant); }
    else if (!participant.device_token) { token ??= newId(); participant.device_token = token; }
    return { session: { id: participant.id, callsign: participant.callsign, unit_id: unit.id, unit_name: unit.name }, deviceToken: token! };
  });
}

export async function requireParticipant(token: string): Promise<ParticipantSession> {
  const db = await getDb(); const p = db.participants.find((x) => x.device_token === token);
  const unit = p && db.units.find((x) => x.id === p.unit_id);
  if (!p || !unit) throw new Error("Сесію не знайдено. Увійдіть знову.");
  return { id: p.id, callsign: p.callsign, unit_id: p.unit_id, unit_name: unit.name };
}

export async function listPublishedQuizzes(deviceToken: string) {
  const participant = await requireParticipant(deviceToken); const db = await getDb();
  return { participant, quizzes: db.quizzes.filter((q) => q.is_published && q.is_current).map((q) => ({ id: q.id, title: q.title, description: q.description, attempt: db.attempts.find((a) => a.quiz_id === q.id && a.participant_id === participant.id) ?? null })) };
}

export async function getQuizForParticipant(deviceToken: string, quizId: string) {
  const participant = await requireParticipant(deviceToken); const db = await getDb();
  const quiz = db.quizzes.find((q) => q.id === quizId && q.is_published && q.is_current);
  if (!quiz) throw new Error("Квіз недоступний");
  const questions = db.questions.filter((q) => q.quiz_id === quizId).sort((a, b) => a.position - b.position).map((q) => ({ ...q, answers: db.answers.filter((a) => a.question_id === q.id).sort((a, b) => a.position - b.position).map(({ id, text, position }) => ({ id, text, position })) }));
  const attempt = db.attempts.find((a) => a.participant_id === participant.id && a.quiz_id === quizId) ?? null;
  const responses = attempt ? db.responses.filter((r) => r.attempt_id === attempt.id).map(({ question_id, answer_id }) => ({ question_id, answer_id })) : [];
  const review = attempt?.end_time ? makeReview(db, quizId, attempt.id) : [];
  const leaderboard = attempt?.end_time ? makeLeaderboard(db, quizId, participant.id) : null;
  return { participant, quiz, questions, attempt, responses, review, leaderboard };
}

type LeaderboardEntry = { callsign: string; unit_name: string; score: number; participant_id: string };

function makeLeaderboard(db: Awaited<ReturnType<typeof getDb>>, quizId: string, participantId: string) {
  const completed = db.attempts
    .filter((attempt) => attempt.quiz_id === quizId && attempt.end_time)
    .map((attempt) => {
      const participant = db.participants.find((p) => p.id === attempt.participant_id);
      const unit = participant && db.units.find((u) => u.id === participant.unit_id);
      return participant && unit ? { attempt, participant, unit } : null;
    })
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
    .sort((a, b) => b.attempt.score - a.attempt.score || String(a.attempt.end_time).localeCompare(String(b.attempt.end_time)));
  const entries: LeaderboardEntry[] = completed.map(({ attempt, participant, unit }) => ({
    callsign: participant.callsign,
    unit_name: unit.name,
    score: attempt.score,
    participant_id: participant.id,
  }));
  return { entries: entries.slice(0, 10), participant: entries.find((entry) => entry.participant_id === participantId) ?? null, total: entries.length };
}

function makeReview(db: Awaited<ReturnType<typeof getDb>>, quizId: string, attemptId: string): AttemptReviewItem[] {
  return db.questions.filter((q) => q.quiz_id === quizId).sort((a, b) => a.position - b.position).map((q) => {
    const answers = db.answers.filter((a) => a.question_id === q.id); const response = db.responses.find((r) => r.attempt_id === attemptId && r.question_id === q.id);
    return { question_id: q.id, question: q.text, is_correct: Boolean(response?.is_correct), given: answers.find((a) => a.id === response?.answer_id)?.text ?? null, correct: answers.find((a) => a.is_correct)?.text ?? null };
  });
}

export async function startAttempt(deviceToken: string, quizId: string) {
  const participant = await requireParticipant(deviceToken);
  return changeDb((db) => {
    if (!db.quizzes.some((quiz) => quiz.id === quizId && quiz.is_published && quiz.is_current)) {
      throw new Error("Цей квіз більше не є поточним");
    }
    const old = db.attempts.find((a) => a.participant_id === participant.id && a.quiz_id === quizId);
    if (old) { if (old.end_time) throw new Error("Ви вже проходили цей квіз"); return old; }
    const attempt = { id: newId(), participant_id: participant.id, quiz_id: quizId, start_time: new Date().toISOString(), end_time: null, score: 0 }; db.attempts.push(attempt); return attempt;
  });
}

export async function saveResponse(input: { deviceToken: string; attemptId: string; questionId: string; answerId: string }) {
  const participant = await requireParticipant(input.deviceToken);
  return changeDb((db) => {
    const attempt = db.attempts.find((a) => a.id === input.attemptId && a.participant_id === participant.id);
    if (!attempt) throw new Error("Спробу не знайдено"); if (attempt.end_time) throw new Error("Спроба вже завершена");
    const answer = db.answers.find((a) => a.id === input.answerId && a.question_id === input.questionId);
    if (!answer) throw new Error("Невірна відповідь");
    const row = db.responses.find((r) => r.attempt_id === input.attemptId && r.question_id === input.questionId);
    if (row) { row.answer_id = input.answerId; row.is_correct = answer.is_correct; }
    else db.responses.push({ id: newId(), attempt_id: input.attemptId, question_id: input.questionId, answer_id: input.answerId, is_correct: answer.is_correct });
    return { success: true as const };
  });
}

export async function finishAttempt(deviceToken: string, attemptId: string) {
  const participant = await requireParticipant(deviceToken);
  return changeDb((db) => {
    const attempt = db.attempts.find((a) => a.id === attemptId && a.participant_id === participant.id);
    if (!attempt) throw new Error("Спробу не знайдено");
    attempt.end_time ??= new Date().toISOString();
    attempt.score = db.responses.filter((r) => r.attempt_id === attemptId && r.is_correct).length;
    return { attempt: { id: attempt.id, score: attempt.score, end_time: attempt.end_time }, total: db.questions.filter((q) => q.quiz_id === attempt.quiz_id).length, review: makeReview(db, attempt.quiz_id, attemptId), leaderboard: makeLeaderboard(db, attempt.quiz_id, participant.id) };
  });
}
