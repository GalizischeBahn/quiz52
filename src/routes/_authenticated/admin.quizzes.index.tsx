import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/quizzes/")({
  head: () => ({
    meta: [
      { title: "Список квізів | Панель адміністратора" },
      { name: "description", content: "Створення, публікація та видалення квізів." },
      { property: "og:title", content: "Список квізів | Панель адміністратора" },
      { property: "og:description", content: "Створення, публікація та видалення квізів." },
    ],
  }),
  component: QuizList,
});

function QuizList() {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  const quizzesQuery = useQuery({
    queryKey: ["admin-quizzes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quizzes")
        .select("id, title, description, is_published, is_current, created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-quizzes"] });

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("quizzes").insert({
        title: title.trim(),
        description: description.trim() || null,
        created_by: userData.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      setTitle("");
      setDescription("");
      toast.success("Квіз створено");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleMutation = useMutation({
    mutationFn: async (input: { id: string; is_published: boolean }) => {
      const { error } = await supabase
        .from("quizzes")
        .update({ is_published: input.is_published })
        .eq("id", input.id);
      if (error) throw error;
    },
    onSuccess: invalidate,
    onError: (error: Error) => toast.error(error.message),
  });

  const setCurrentMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("quizzes")
        .update({ is_current: true })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Поточний квіз змінено");
      invalidate();
      queryClient.invalidateQueries({ queryKey: ["my-quizzes"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("quizzes").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Квіз видалено");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AdminShell title="Квізи" eyebrow="Управління">
      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <table className="w-full text-left text-sm">
            <thead className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-normal">Назва</th>
                <th className="px-4 py-2 font-normal">Статус</th>
                <th className="px-4 py-2 font-normal text-right">Дії</th>
              </tr>
            </thead>
            <tbody>
              {(quizzesQuery.data ?? []).map((quiz) => (
                <tr key={quiz.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <Link
                      to="/admin/quizzes/$quizId"
                      params={{ quizId: quiz.id }}
                      className="font-display font-semibold hover:text-accent"
                    >
                      {quiz.title}
                    </Link>
                    <p className="font-mono text-[11px] text-muted-foreground">
                      {quiz.description ?? "—"}
                    </p>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px]">
                    <div className="flex flex-col items-start gap-1">
                      {quiz.is_published ? (
                        <span className="text-success">Опубліковано</span>
                      ) : (
                        <span className="text-muted-foreground">Чернетка</span>
                      )}
                      {quiz.is_current ? (
                        <span className="rounded bg-accent-soft px-2 py-0.5 text-accent">Поточний квіз</span>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        onClick={() => setCurrentMutation.mutate(quiz.id)}
                        disabled={quiz.is_current || !quiz.is_published || setCurrentMutation.isPending}
                        title={quiz.is_current ? "Цей квіз уже поточний" : quiz.is_published ? "Показувати цей квіз усім учасникам" : "Спочатку опублікуйте квіз"}
                        className="rounded-md border border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Зробити поточним
                      </button>
                      <button
                        onClick={() =>
                          toggleMutation.mutate({ id: quiz.id, is_published: !quiz.is_published })
                        }
                        className="rounded-md border border-border px-3 py-1.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
                      >
                        {quiz.is_published ? "Зняти" : "Опублікувати"}
                      </button>
                      <button
                        onClick={() => deleteMutation.mutate(quiz.id)}
                        className="rounded-md border border-border px-3 py-1.5 font-mono text-[11px] text-destructive"
                      >
                        Видалити
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {quizzesQuery.data?.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 font-mono text-xs text-muted-foreground">
                    Квізів ще немає.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>

        <form
          className="h-fit rounded-lg border border-border bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!title.trim()) { toast.error("Вкажіть назву"); return; }
            createMutation.mutate();
          }}
        >
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.15em] text-accent">
            Створити квіз
          </p>
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Назва
          </label>
          <input
            value={title}
            maxLength={140}
            onChange={(e) => setTitle(e.target.value)}
            className="mb-3 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Опис
          </label>
          <textarea
            value={description}
            maxLength={400}
            rows={3}
            onChange={(e) => setDescription(e.target.value)}
            className="mb-4 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="w-full rounded-md bg-accent py-2 font-mono text-xs font-medium text-accent-foreground disabled:opacity-60"
          >
            Створити квіз
          </button>
        </form>
      </div>
    </AdminShell>
  );
}
