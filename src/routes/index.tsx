import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { apiMyQuizzes, apiParticipantLogin } from "@/lib/quiz.functions";
import {
  clearParticipantSession,
  getDeviceToken,
  getStoredParticipant,
  saveParticipantSession,
  type StoredParticipant,
} from "@/lib/participant-session";
import { BrandMark } from "@/lib/branding";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Вхід: підрозділ і позивний | Квіз-система" },
      {
        name: "description",
        content:
          "Увійдіть за підрозділом і позивним, щоб пройти квіз. Сесія прив'язується до вашого пристрою.",
      },
      { property: "og:title", content: "Вхід: підрозділ і позивний | Квіз-система" },
      {
        property: "og:description",
        content: "Увійдіть за підрозділом і позивним, щоб пройти квіз.",
      },
    ],
  }),
  component: ParticipantHome,
});

function ParticipantHome() {
  const [participant, setParticipant] = useState<StoredParticipant | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [unitName, setUnitName] = useState("");
  const [callsign, setCallsign] = useState("");
  const [showLoginForm, setShowLoginForm] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const login = useServerFn(apiParticipantLogin);
  const myQuizzes = useServerFn(apiMyQuizzes);

  useEffect(() => {
    setParticipant(getStoredParticipant());
    setToken(getDeviceToken());
  }, []);

  const quizzesQuery = useQuery({
    queryKey: ["my-quizzes", token],
    enabled: Boolean(token && participant && showLoginForm),
    queryFn: () => myQuizzes({ data: { deviceToken: token! } }),
  });

  useEffect(() => {
    if (!showLoginForm || !participant || !token || quizzesQuery.isLoading || quizzesQuery.isError) return;
    const quiz = quizzesQuery.data?.quizzes[0];
    if (quiz) {
      navigate({ to: "/quiz/$quizId", params: { quizId: quiz.id }, replace: true });
    }
  }, [showLoginForm, participant, token, quizzesQuery.data, quizzesQuery.isError, quizzesQuery.isLoading, navigate]);

  const loginMutation = useMutation({
    mutationFn: () =>
      login({ data: { unitName, callsign, deviceToken: getDeviceToken() } }),
    onSuccess: (result) => {
      saveParticipantSession(result.deviceToken, result.session);
      setToken(result.deviceToken);
      setParticipant(result.session);
      queryClient.invalidateQueries({ queryKey: ["my-quizzes"] });
      toast.success(`Вітаємо, ${result.session.callsign}`);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (participant && token && showLoginForm) {
    const quizzes = quizzesQuery.data?.quizzes ?? [];
    return (
      <div className="min-h-screen bg-background text-foreground">
        <div className="sticky top-0 z-20 border-b border-border bg-background/90 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-[1000px] items-center justify-between px-6">
            <BrandMark />
            <div className="flex items-center gap-3 font-mono text-[11px] text-muted-foreground">
              <span>
                {participant.callsign} · {participant.unit_name}
              </span>
              <button
                className="rounded-md border border-border bg-surface px-3 py-1.5 transition-colors hover:text-foreground"
                onClick={() => {
                  clearParticipantSession();
                  setParticipant(null);
                }}
              >
                Вийти
              </button>
            </div>
          </div>
        </div>

        <main className="mx-auto max-w-[1000px] px-6 py-8">
          <p className="font-mono text-xs text-muted-foreground">
            {quizzesQuery.isLoading
              ? "Завантаження поточного квізу…"
              : quizzes.length
                ? "Відкриваємо поточний квіз…"
                : "Наразі немає активних квізів. Спробуйте пізніше."}
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <BrandMark />
          <span className="border-l border-border pl-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Брифінг-система
          </span>
        </div>

        {!showLoginForm ? (
          <div className="rounded-lg border border-border bg-surface p-6">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.25em] text-accent">
              Перед початком
            </p>
            <h1 className="font-display text-2xl font-bold tracking-tight">
              Правила проходження квізу
            </h1>
            <ParticipantRules />
            <button
              onClick={() => setShowLoginForm(true)}
              className="mt-6 w-full rounded-md bg-accent py-2.5 font-mono text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90"
            >
              {participant && token ? "Перейти до поточного квізу" : "Продовжити до авторизації"}
            </button>
          </div>
        ) : <>
          <div className="mb-4 rounded-lg border border-border bg-surface p-6">
            <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.25em] text-accent">
              Правила проходження квізу
            </p>
            <ParticipantRules />
          </div>
          <div className="rounded-lg border border-border bg-surface p-6">
          <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.25em] text-accent">
            Крок 01
          </p>
          <h1 className="font-display text-2xl font-bold tracking-tight">
            Вхід: підрозділ і позивний
          </h1>
          <p className="mt-2 font-mono text-[11px] text-muted-foreground">Сесія прив'язується до цього пристрою.</p>

          <form
            className="mt-6 space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!unitName.trim() || !callsign.trim()) {
                toast.error("Вкажіть підрозділ і позивний");
                return;
              }
              loginMutation.mutate();
            }}
          >
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Підрозділ
              </label>
              <input
                value={unitName}
                onChange={(event) => setUnitName(event.target.value)}
                maxLength={80}
                placeholder="1-й батальйон"
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Позивний
              </label>
              <input
                value={callsign}
                onChange={(event) => setCallsign(event.target.value)}
                maxLength={40}
                placeholder="ALPHA"
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2.5 font-mono text-sm text-foreground outline-none focus:border-accent"
              />
            </div>
            <button
              type="submit"
              disabled={loginMutation.isPending}
              className="w-full rounded-md bg-accent py-2.5 font-mono text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {loginMutation.isPending ? "Вхід…" : "Увійти"}
            </button>
          </form>
          </div>
        </>}

        <div className="mt-4 text-center">
          <Link
            to="/auth"
            className="font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            Вхід для адміністратора →
          </Link>
        </div>
      </div>
    </div>
  );
}

function ParticipantRules() {
  return (
    <div className="mt-5 max-h-[55vh] space-y-5 overflow-y-auto pr-2 text-sm leading-relaxed text-muted-foreground">
      <section>
        <h2 className="font-display font-semibold text-foreground">1. Вкажи свій підрозділ</h2>
        <p className="mt-1">У полі «Підрозділ» зазнач свою реальну назву підрозділу, щоб організатори могли ідентифікувати тебе та знайти переможця після завершення квізу.</p>
        <p className="mt-2 italic">Приклади правильного заповнення:</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>1 абатр</li>
          <li>2 сабатр</li>
          <li>рота реб</li>
        </ul>
        <p className="mt-2">Не вказуй лише назву бригади, якщо форма передбачає конкретний підрозділ.</p>
        <p className="mt-2"><span className="italic">Навіщо це потрібно?</span> Щоб у разі перемоги ми могли знайти тебе, перевірити результат і передати приз.</p>
      </section>
      <section>
        <h2 className="font-display font-semibold text-foreground">2. Вкажи свій позивний</h2>
        <p className="mt-1">У полі «Позивний» вкажи саме свій військовий позивний, за яким тебе знають побратими.</p>
        <p className="mt-2 font-semibold text-foreground">Позивний — це не ім’я, не прізвище і не номер.</p>
        <p className="mt-2">Наприклад:</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Правильно: «Сокіл», «Мольфар», «Тур», «П'ятий»</li>
          <li>Неправильно: «Олександр», «Коваленко», «12345»</li>
        </ul>
        <p className="mt-2">Використовуй саме свій позивний. Не вигадуй нового та не замінюй його своїм ім’ям.</p>
        <p className="mt-2"><span className="italic">Навіщо це потрібно?</span> Позивний допоможе організаторам ідентифікувати переможця та зв’язатися з ним через відповідний підрозділ.</p>
      </section>
      <section>
        <h2 className="font-display font-semibold text-foreground">3. Пройди квіз і отримай шанс на приз</h2>
        <p className="mt-1">Відповідай на запитання квізу, перевіряй свої знання та змагайся за перемогу.</p>
        <p className="mt-2 font-semibold text-foreground">Найкращий учасник отримає приз!</p>
        <p className="mt-2">Переможцем стане учасник, який набере найбільшу кількість балів за найкоротший час.</p>
        <p className="mt-2">Щоб отримати свій приз у разі перемоги, уважно заповнюй форму авторизації: правильно вкажи підрозділ і позивний.</p>
        <p className="mt-2"><span className="font-semibold text-foreground">Увага!</span> Якщо дані вказані неправильно або за ними неможливо знайти переможця, організаторам буде складніше передати приз.</p>
        <p className="mt-2 font-semibold text-foreground">Успіхів у квізі!</p>
      </section>
    </div>
  );
}
