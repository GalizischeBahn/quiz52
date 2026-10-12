import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  apiFinishAttempt,
  apiGetQuiz,
  apiSaveResponse,
  apiStartAttempt,
} from "@/lib/quiz.functions";
import { getDeviceToken } from "@/lib/participant-session";
import { BrandMark } from "@/lib/branding";

type ReviewItem = {
  question_id: string;
  question: string;
  is_correct: boolean;
  given: string | null;
  correct: string | null;
};
type Leaderboard = {
  entries: { callsign: string; unit_name: string; score: number; participant_id: string }[];
  participant: { callsign: string; unit_name: string; score: number; participant_id: string } | null;
  total: number;
};

export const Route = createFileRoute("/quiz/$quizId")({
  head: () => ({
    meta: [
      { title: "Проходження квізу | Квіз-система" },
      { name: "description", content: "Питання за питанням: оберіть відповідь і рухайтесь далі." },
      { property: "og:title", content: "Проходження квізу | Квіз-система" },
      {
        property: "og:description",
        content: "Питання за питанням: оберіть відповідь і рухайтесь далі.",
      },
    ],
  }),
  component: QuizPage,
});

function QuizPage() {
  const { quizId } = Route.useParams();
  const navigate = useNavigate();
  const [token, setToken] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState<{
    score: number;
    total: number;
    review: ReviewItem[];
    leaderboard: Leaderboard;
  } | null>(null);

  const getQuiz = useServerFn(apiGetQuiz);
  const startAttempt = useServerFn(apiStartAttempt);
  const saveResponse = useServerFn(apiSaveResponse);
  const finishAttempt = useServerFn(apiFinishAttempt);

  useEffect(() => {
    const stored = getDeviceToken();
    if (!stored) {
      navigate({ to: "/", replace: true });
      return;
    }
    setToken(stored);
  }, [navigate]);

  const quizQuery = useQuery({
    queryKey: ["quiz", quizId, token],
    enabled: Boolean(token),
    queryFn: () => getQuiz({ data: { deviceToken: token!, quizId } }),
  });

  const attemptQuery = useQuery({
    queryKey: ["attempt", quizId, token],
    enabled:
      started && Boolean(token) && Boolean(quizQuery.data) && !quizQuery.data?.attempt?.end_time,
    queryFn: () => startAttempt({ data: { deviceToken: token!, quizId } }),
  });

  useEffect(() => {
    const existing = quizQuery.data?.responses ?? [];
    if (existing.length) {
      setSelected((prev) => {
        const next = { ...prev };
        for (const r of existing) if (r.answer_id) next[r.question_id] = r.answer_id;
        return next;
      });
    }
  }, [quizQuery.data]);

  const questions = useMemo(() => quizQuery.data?.questions ?? [], [quizQuery.data]);
  const current = questions[index];
  const attemptId = attemptQuery.data?.attempt?.id;

  const saveMutation = useMutation({
    mutationFn: (input: { questionId: string; answerId: string }) =>
      saveResponse({
        data: {
          deviceToken: token!,
          attemptId: attemptId!,
          questionId: input.questionId,
          answerId: input.answerId,
        },
      }),
    onError: (error: Error) => toast.error(error.message),
  });

  const finishMutation = useMutation({
    mutationFn: () => finishAttempt({ data: { deviceToken: token!, attemptId: attemptId! } }),
    onSuccess: (result) =>
      setFinished({
        score: result.attempt.score,
        total: result.total,
        review: result.review as ReviewItem[],
        leaderboard: result.leaderboard as Leaderboard,
      }),
    onError: (error: Error) => toast.error(error.message),
  });

  if (quizQuery.isLoading || !token) {
    return (
      <div className="grid min-h-screen place-items-center bg-background font-mono text-xs text-muted-foreground">
        Завантаження…
      </div>
    );
  }

  if (quizQuery.isError) {
    return (
      <div className="grid min-h-screen place-items-center bg-background px-6 text-center">
        <div>
          <p className="font-display text-xl font-semibold">
            {(quizQuery.error as Error).message}
          </p>
          <Link
            to="/"
            className="mt-4 inline-block rounded-md bg-accent px-4 py-2 font-mono text-xs font-medium text-accent-foreground"
          >
            До списку квізів
          </Link>
        </div>
      </div>
    );
  }

  const alreadyDone = quizQuery.data?.attempt?.end_time;
  if (finished || alreadyDone) {
    const score = finished?.score ?? quizQuery.data?.attempt?.score ?? 0;
    const total = finished?.total ?? questions.length;
    const review: ReviewItem[] =
      finished?.review ?? ((quizQuery.data?.review ?? []) as ReviewItem[]);
    const leaderboard = finished?.leaderboard ?? (quizQuery.data?.leaderboard as Leaderboard | null);
    const mistakes = review.filter((item) => !item.is_correct);
    return (
      <div className="min-h-screen bg-background px-6 py-10">
        <div className="mx-auto w-full max-w-2xl rounded-lg border border-border bg-surface p-8 text-center">
          <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent">Результат</p>
          <p className="mt-4 font-display text-5xl font-bold">
            {score}
            <span className="text-2xl text-muted-foreground">/{total}</span>
          </p>
          <p className="mt-3 font-mono text-[11px] text-muted-foreground">
            Квіз завершено. Дякуємо за проходження.
          </p>
          {leaderboard?.participant ? (
            <section className="mt-6 rounded-md border border-accent/40 bg-accent-soft p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-accent">Ваш результат</p>
              <p className="mt-2 font-display text-xl font-bold">
                {leaderboard.participant.score} балів
              </p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                Завершили квіз: {leaderboard.total}
              </p>
            </section>
          ) : null}
          {leaderboard && leaderboard.entries.length > 0 ? (
            <section className="mt-6 text-left">
              <h2 className="font-mono text-[11px] uppercase tracking-[0.2em] text-accent">Лідерборд</h2>
              <ol className="mt-3 divide-y divide-border rounded-md border border-border">
                {leaderboard.entries.map((entry) => (
                  <li key={entry.participant_id} className="flex items-center justify-between gap-3 bg-surface-2 px-3 py-2.5 text-sm">
                    <span><span className="font-semibold">{entry.callsign}</span><span className="ml-2 text-muted-foreground">· {entry.unit_name}</span></span>
                    <span className="whitespace-nowrap font-mono">{entry.score} балів</span>
                  </li>
                ))}
              </ol>
              {leaderboard.total > leaderboard.entries.length ? (
                <p className="mt-2 font-mono text-[10px] text-muted-foreground">Показано перших {leaderboard.entries.length} учасників.</p>
              ) : null}
            </section>
          ) : null}
          {mistakes.length > 0 ? (
            <div className="mt-8 text-left">
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-destructive">
                Помилки ({mistakes.length})
              </p>
              <ul className="mt-3 space-y-3">
                {mistakes.map((item) => (
                  <li
                    key={item.question_id}
                    className="rounded-md border border-border bg-surface-2 p-4"
                  >
                    <p className="font-display text-sm font-semibold">{item.question}</p>
                    <p className="mt-2 font-mono text-[11px] text-muted-foreground">
                      Ваша відповідь:{" "}
                      <span className="text-destructive">{item.given ?? "не обрано"}</span>
                    </p>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      Правильна відповідь:{" "}
                      <span className="text-good">{item.correct ?? "—"}</span>
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : review.length > 0 ? (
            <p className="mt-6 font-mono text-[11px] text-good">Жодної помилки — ідеальний результат!</p>
          ) : null}
          <Link
            to="/"
            className="mt-8 inline-block rounded-md bg-accent px-4 py-2 font-mono text-xs font-medium text-accent-foreground"
          >
            На головну
          </Link>
        </div>
      </div>
    );
  }

  const info = quizQuery.data?.quiz;
  if (!started) {
    return (
      <div className="min-h-screen bg-background px-6 py-10 text-foreground">
        <div className="mx-auto w-full max-w-2xl">
          <BrandMark className="mb-6" />
          <div className="rounded-lg border border-border bg-surface p-8">
            <p className="font-mono text-[11px] uppercase tracking-[0.25em] text-accent">
              Брифінг перед квізом
            </p>
            <h1 className="mt-3 font-display text-3xl font-bold tracking-tight">{info?.title}</h1>
            {info?.description ? (
              <p className="mt-2 text-sm text-muted-foreground">{info.description}</p>
            ) : null}

            <dl className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-md border border-border bg-surface-2 p-4">
                <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  Термін закінчення
                </dt>
                <dd className="mt-1 font-display text-lg font-semibold">
                  {info?.draw_date
                    ? new Date(info.draw_date).toLocaleString("uk-UA", {
                        dateStyle: "long",
                        timeStyle: "short",
                      })
                    : "Уточнюється"}
                </dd>
              </div>
              <div className="rounded-md border border-border bg-surface-2 p-4">
                <dt className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  Приз
                </dt>
                <dd className="mt-1 font-display text-lg font-semibold">
                  {info?.prize ?? "Уточнюється"}
                </dd>
              </div>
            </dl>
            {info?.prize_image_url ? (
              <img src={info.prize_image_url} alt={info.prize ?? "Зображення призу"} className="mt-4 max-h-80 w-full rounded-md border border-border object-contain" />
            ) : null}

            <div className="mt-8 flex items-center gap-3">
              <button
                onClick={() => setStarted(true)}
                className="rounded-md bg-accent px-6 py-2.5 font-mono text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
              >
                Розпочати
              </button>
              <Link to="/" className="font-mono text-[11px] text-muted-foreground hover:text-foreground">
                На головну
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!current) {
    return (
      <div className="grid min-h-screen place-items-center bg-background font-mono text-xs text-muted-foreground">
        У цьому квізі ще немає запитань.
      </div>
    );
  }

  const chosen = selected[current.id];
  const isLast = index === questions.length - 1;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-[900px] items-center justify-between px-6">
          <span className="font-display font-semibold tracking-tight">
            {quizQuery.data?.quiz.title}
          </span>
          <span className="font-mono text-[11px] text-muted-foreground">
            Питання {index + 1} / {questions.length}
          </span>
        </div>
      </div>

      <main className="mx-auto max-w-[900px] px-6 py-8">
        <div className="mb-6 flex gap-1.5">
          {questions.map((q, i) => (
            <span
              key={q.id}
              className={`h-1 flex-1 rounded-full ${
                i <= index ? "bg-accent" : "bg-surface-2"
              }`}
            />
          ))}
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          {current.media_url && current.media_type === "image" ? (
            <img
              src={current.media_url}
              alt={current.text}
              loading="lazy"
              className="mb-6 w-full rounded-md border border-border object-cover"
            />
          ) : null}
          {current.media_url && current.media_type === "video" ? (
            <video
              src={current.media_url}
              controls
              className="mb-6 w-full rounded-md border border-border"
            />
          ) : null}

          <h1 className="font-display text-2xl font-semibold leading-snug">{current.text}</h1>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Оберіть відповідь
          </p>

          <div className="mt-5 space-y-2">
            {current.answers.map((answer, i) => {
              const active = chosen === answer.id;
              return (
                <button
                  key={answer.id}
                  disabled={!attemptId || saveMutation.isPending}
                  onClick={() => {
                    setSelected((prev) => ({ ...prev, [current.id]: answer.id }));
                    if (attemptId) {
                      saveMutation.mutate({ questionId: current.id, answerId: answer.id });
                    }
                  }}
                  className={`flex w-full items-center gap-3 rounded-md border px-4 py-3 text-left transition-colors ${
                    active
                      ? "border-accent bg-accent-soft"
                      : "border-border bg-surface-2 hover:border-accent/40"
                  }`}
                >
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded font-mono text-[11px] ${
                      active
                        ? "bg-accent text-accent-foreground"
                        : "bg-background text-muted-foreground"
                    }`}
                  >
                    {String.fromCharCode(65 + i)}
                  </span>
                  <span className="text-sm">{answer.text}</span>
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-between">
            <button
              disabled={index === 0}
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
              className="rounded-md border border-border px-4 py-2 font-mono text-xs text-muted-foreground disabled:opacity-40"
            >
              Назад
            </button>
            {isLast ? (
              <button
                disabled={!chosen || !attemptId || saveMutation.isPending || saveMutation.isError || finishMutation.isPending}
                onClick={() => finishMutation.mutate()}
                className="rounded-md bg-accent px-5 py-2 font-mono text-xs font-medium text-accent-foreground disabled:opacity-50"
              >
                {saveMutation.isPending ? "Збереження відповіді…" : "Завершити"}
              </button>
            ) : (
              <button
                disabled={!chosen || !attemptId || saveMutation.isPending || saveMutation.isError}
                onClick={() => setIndex((i) => i + 1)}
                className="rounded-md bg-accent px-5 py-2 font-mono text-xs font-medium text-accent-foreground disabled:opacity-50"
              >
                Далі
              </button>
            )}
          </div>
          {saveMutation.isError ? (
            <p className="mt-3 text-right font-mono text-[10px] text-destructive">
              Відповідь не збережено. Оберіть відповідь ще раз, щоб повторити збереження.
            </p>
          ) : !attemptId ? (
            <p className="mt-3 text-right font-mono text-[10px] text-muted-foreground">
              Підготовка спроби…
            </p>
          ) : null}
        </div>
      </main>
    </div>
  );
}
