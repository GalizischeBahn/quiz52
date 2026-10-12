import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Вхід адміністратора | Квіз-система" },
      { name: "description", content: "Вхід до панелі адміністратора квіз-системи за поштою і паролем." },
      { property: "og:title", content: "Вхід адміністратора | Квіз-система" },
      { property: "og:description", content: "Вхід до панелі адміністратора квіз-системи." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);

  function humanError(message: string) {
    const m = message.toLowerCase();
    if (m.includes("invalid login credentials"))
      return "Невірна пошта або пароль. Якщо акаунта ще немає — натисніть «Немає акаунта? Зареєструватись».";
    if (m.includes("weak") || m.includes("pwned"))
      return "Пароль надто простий (є у базі витоків). Оберіть складніший пароль (мін. 8 символів, літери + цифри + символи).";
    if (m.includes("already registered")) return "Ця пошта вже зареєстрована — увійдіть.";
    if (m.includes("email not confirmed")) return "Пошта не підтверджена. Перевірте лист із підтвердженням.";
    return message;
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/admin` },
        });
        if (error) throw error;
        toast.success("Акаунт створено");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      const { data } = await supabase.auth.getSession();
      if (data.session) navigate({ to: "/admin", replace: true });
      else toast.info("Підтвердіть пошту, щоб увійти");
    } catch (error) {
      toast.error(humanError((error as Error).message));
    } finally {
      setPending(false);
    }
  }


  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6 text-foreground">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid size-7 place-items-center bg-accent font-display text-sm font-bold text-accent-foreground">
            К
          </div>
          <span className="font-display font-semibold tracking-tight">КВІЗ 52</span>
          <span className="border-l border-border pl-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
            Адміністратор
          </span>
        </div>

        <div className="rounded-lg border border-border bg-surface p-6">
          <h1 className="font-display text-2xl font-bold tracking-tight">
            {mode === "signin" ? "Вхід адміністратора" : "Реєстрація адміністратора"}
          </h1>

          <form className="mt-6 space-y-4" onSubmit={submit}>
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Електронна пошта
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            </div>
            <div>
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Пароль
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-accent"
              />
            </div>
            <button
              type="submit"
              disabled={pending}
              className="w-full rounded-md bg-accent py-2.5 font-mono text-sm font-medium text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {mode === "signin" ? "Увійти" : "Створити акаунт"}
            </button>
          </form>

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-4 w-full font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
          >
            {mode === "signin" ? "Немає акаунта? Зареєструватись" : "Уже маю акаунт — увійти"}
          </button>
        </div>
      </div>
    </div>
  );
}
