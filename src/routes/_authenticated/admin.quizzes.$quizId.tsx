import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/AdminShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin/quizzes/$quizId")({
  head: () => ({
    meta: [
      { title: "Редактор запитань | Панель адміністратора" },
      { name: "description", content: "Додавання запитань, відповідей та медіа до квізу." },
      { property: "og:title", content: "Редактор запитань | Панель адміністратора" },
      { property: "og:description", content: "Додавання запитань, відповідей та медіа до квізу." },
    ],
  }),
  component: QuestionEditor,
});

type AnswerDraft = { id?: string; text: string; is_correct: boolean };

function QuestionEditor() {
  const { quizId } = Route.useParams();
  const queryClient = useQueryClient();
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [existingMedia, setExistingMedia] = useState<{ url: string | null; type: string | null }>({ url: null, type: null });
  const [answers, setAnswers] = useState<AnswerDraft[]>([
    { text: "", is_correct: true },
    { text: "", is_correct: false },
  ]);

  const [brief, setBrief] = useState({ draw_date: "", prize: "", rules: "", prize_image_url: "" });
  const [prizeImageFile, setPrizeImageFile] = useState<File | null>(null);
  const [prizeImagePreview, setPrizeImagePreview] = useState<string | null>(null);

  useEffect(() => {
    if (!prizeImageFile) {
      setPrizeImagePreview(null);
      return;
    }
    const preview = URL.createObjectURL(prizeImageFile);
    setPrizeImagePreview(preview);
    return () => URL.revokeObjectURL(preview);
  }, [prizeImageFile]);

  const quizQuery = useQuery({
    queryKey: ["admin-quiz", quizId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("quizzes")
        .select("id, title, description, draw_date, prize, rules, prize_image_url")
        .eq("id", quizId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const questionsQuery = useQuery({
    queryKey: ["admin-questions", quizId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("questions")
        .select("id, text, position, media_type, media_url, answers(id, text, is_correct, position)")
        .eq("quiz_id", quizId)
        .order("position");
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    const data = quizQuery.data;
    if (data) {
      setBrief({
        draw_date: data.draw_date ? new Date(data.draw_date).toISOString().slice(0, 16) : "",
        prize: data.prize ?? "",
        rules: data.rules ?? "",
        prize_image_url: data.prize_image_url ?? "",
      });
    }
  }, [quizQuery.data]);

  const briefMutation = useMutation({
    mutationFn: async () => {
      let prizeImageUrl = brief.prize_image_url || null;
      if (prizeImageFile) {
        const path = `${quizId}/prize-${crypto.randomUUID()}-${prizeImageFile.name}`;
        const { data, error: uploadError } = await supabase.storage.from("quiz-media").upload(path, prizeImageFile);
        if (uploadError) throw uploadError;
        prizeImageUrl = data.path;
      }
      const { error } = await supabase
        .from("quizzes")
        .update({
          draw_date: brief.draw_date ? new Date(brief.draw_date).toISOString() : null,
          prize: brief.prize.trim() || null,
          rules: brief.rules.trim() || null,
          prize_image_url: prizeImageUrl,
        })
        .eq("id", quizId);
      if (error) throw error;
    },
    onSuccess: () => {
      setPrizeImageFile(null);
      toast.success("Брифінг збережено");
      queryClient.invalidateQueries({ queryKey: ["admin-quiz", quizId] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-questions", quizId] });

  const addMutation = useMutation({
    mutationFn: async () => {
      let mediaUrl: string | null = null;
      let mediaType: string | null = null;
      if (file) {
        const path = `${quizId}/${crypto.randomUUID()}-${file.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("quiz-media")
          .upload(path, file);
        if (uploadError) throw uploadError;
        mediaUrl = uploadData.path;
        mediaType = file.type.startsWith("video") ? "video" : "image";
      }

      const position = (questionsQuery.data?.length ?? 0) + 1;
      const { data: question, error } = await supabase
        .from("questions")
        .insert({ quiz_id: quizId, text: text.trim(), position, media_url: mediaUrl, media_type: mediaType })
        .select("id")
        .single();
      if (error) throw error;

      const rows = answers
        .filter((a) => a.text.trim())
        .map((a, i) => ({
          question_id: question.id,
          text: a.text.trim(),
          is_correct: a.is_correct,
          position: i + 1,
        }));
      if (rows.length) {
        const { error: answerError } = await supabase.from("answers").insert(rows);
        if (answerError) throw answerError;
      }
    },
    onSuccess: () => {
      setText("");
      setFile(null);
      setAnswers([
        { text: "", is_correct: true },
        { text: "", is_correct: false },
      ]);
      toast.success("Запитання додано");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      if (!editingQuestionId) throw new Error("Оберіть запитання для редагування");

      let mediaUrl = existingMedia.url;
      let mediaType = existingMedia.type;
      if (file) {
        const path = `${quizId}/${crypto.randomUUID()}-${file.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from("quiz-media")
          .upload(path, file);
        if (uploadError) throw uploadError;
        mediaUrl = uploadData.path;
        mediaType = file.type.startsWith("video") ? "video" : "image";
      }

      const { error } = await supabase
        .from("questions")
        .update({ text: text.trim(), media_url: mediaUrl, media_type: mediaType })
        .eq("id", editingQuestionId);
      if (error) throw error;

      const currentAnswers = questionsQuery.data?.find((question) => question.id === editingQuestionId)?.answers ?? [];
      const keptAnswerIds = new Set(answers.filter((answer) => answer.text.trim()).flatMap((answer) => answer.id ? [answer.id] : []));

      for (const [index, answer] of answers.filter((item) => item.text.trim()).entries()) {
        const values = { text: answer.text.trim(), is_correct: answer.is_correct, position: index + 1 };
        if (answer.id) {
          const { error: answerError } = await supabase.from("answers").update(values).eq("id", answer.id);
          if (answerError) throw answerError;
        } else {
          const { error: answerError } = await supabase.from("answers").insert({ question_id: editingQuestionId, ...values });
          if (answerError) throw answerError;
        }
      }

      for (const answer of currentAnswers) {
        if (!keptAnswerIds.has(answer.id)) {
          const { error: answerError } = await supabase.from("answers").delete().eq("id", answer.id);
          if (answerError) throw answerError;
        }
      }
    },
    onSuccess: () => {
      setEditingQuestionId(null);
      setText("");
      setFile(null);
      setExistingMedia({ url: null, type: null });
      setAnswers([{ text: "", is_correct: true }, { text: "", is_correct: false }]);
      toast.success("Запитання оновлено");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const startEditing = (question: NonNullable<typeof questionsQuery.data>[number]) => {
    setEditingQuestionId(question.id);
    setText(question.text);
    setFile(null);
    setExistingMedia({ url: question.media_url ?? null, type: question.media_type ?? null });
    setAnswers(
      [...(question.answers ?? [])]
        .sort((a, b) => a.position - b.position)
        .map((answer) => ({ id: answer.id, text: answer.text, is_correct: answer.is_correct })),
    );
  };

  const cancelEditing = () => {
    setEditingQuestionId(null);
    setText("");
    setFile(null);
    setExistingMedia({ url: null, type: null });
    setAnswers([{ text: "", is_correct: true }, { text: "", is_correct: false }]);
  };

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("questions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Запитання видалено");
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <AdminShell title={quizQuery.data?.title ?? "Квіз"} eyebrow="Редактор запитань">
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-3">
          <div className="rounded-lg border border-border bg-surface p-4">
            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Брифінг перед квізом
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  Термін закінчення
                </label>
                <input
                  type="datetime-local"
                  value={brief.draw_date}
                  onChange={(event) => setBrief((p) => ({ ...p, draw_date: event.target.value }))}
                  className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 font-mono text-xs outline-none focus:border-accent"
                />
              </div>
              <div>
                <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                  Приз
                </label>
                <input
                  value={brief.prize}
                  onChange={(event) => setBrief((p) => ({ ...p, prize: event.target.value }))}
                  placeholder="Наприклад: сертифікат"
                  className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
            </div>
            <div className="mt-3">
              <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                Зображення призу
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const selected = event.target.files?.[0] ?? null;
                  if (selected && !selected.type.startsWith("image/")) {
                    toast.error("Оберіть файл зображення");
                    event.target.value = "";
                    return;
                  }
                  if (selected && selected.size > 8 * 1024 * 1024) {
                    toast.error("Розмір зображення не має перевищувати 8 МБ");
                    event.target.value = "";
                    return;
                  }
                  setPrizeImageFile(selected);
                }}
                className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-xs"
              />
              {prizeImageFile || brief.prize_image_url ? (
                <div className="mt-3">
                  <img
                    src={prizeImagePreview ?? brief.prize_image_url}
                    alt="Попередній перегляд призу"
                    className="max-h-48 rounded-md border border-border object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setPrizeImageFile(null);
                      setBrief((current) => ({ ...current, prize_image_url: "" }));
                    }}
                    className="mt-2 font-mono text-[10px] text-destructive"
                  >
                    Видалити зображення
                  </button>
                </div>
              ) : null}
            </div>
            <label className="mb-1.5 mt-3 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              Правила перемоги
            </label>
            <textarea
              value={brief.rules}
              onChange={(event) => setBrief((p) => ({ ...p, rules: event.target.value }))}
              rows={3}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
            />
            <button
              onClick={() => briefMutation.mutate()}
              disabled={briefMutation.isPending}
              className="mt-3 rounded-md bg-accent px-4 py-2 font-mono text-xs font-medium text-accent-foreground disabled:opacity-60"
            >
              Зберегти брифінг
            </button>
          </div>
          {(questionsQuery.data ?? []).map((question, index) => (
            <div key={question.id} className="rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
                    Запитання {index + 1}
                    {question.media_type ? ` · ${question.media_type}` : ""}
                  </p>
                  <p className="mt-1 font-display font-semibold">{question.text}</p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => startEditing(question)}
                    className="rounded-md border border-border px-3 py-1.5 font-mono text-[11px] text-foreground hover:border-accent"
                  >
                    Редагувати
                  </button>
                  <button
                    type="button"
                    onClick={() => deleteMutation.mutate(question.id)}
                    className="rounded-md border border-border px-3 py-1.5 font-mono text-[11px] text-destructive"
                  >
                    Видалити
                  </button>
                </div>
              </div>
              {question.media_url && question.media_type === "image" ? (
                <img
                  src={question.media_url}
                  alt={question.text}
                  className="mt-3 max-h-72 w-full rounded-md border border-border object-contain"
                />
              ) : null}
              {question.media_url && question.media_type === "video" ? (
                <video
                  src={question.media_url}
                  controls
                  className="mt-3 max-h-72 w-full rounded-md border border-border"
                />
              ) : null}
              <ul className="mt-3 space-y-1.5">
                {[...(question.answers ?? [])]
                  .sort((a, b) => a.position - b.position)
                  .map((answer) => (
                    <li
                      key={answer.id}
                      className={`rounded-md px-3 py-2 text-sm ${
                        answer.is_correct
                          ? "bg-accent-soft text-accent"
                          : "bg-surface-2 text-muted-foreground"
                      }`}
                    >
                      {answer.text}
                    </li>
                  ))}
              </ul>
            </div>
          ))}
          {questionsQuery.data?.length === 0 ? (
            <p className="rounded-lg border border-border bg-surface px-4 py-6 font-mono text-xs text-muted-foreground">
              Запитань ще немає.
            </p>
          ) : null}
        </div>

        <form
          className="h-fit rounded-lg border border-border bg-surface p-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim()) {
              toast.error("Введіть текст запитання");
              return;
            }
            const correctAnswer = answers.find((answer) => answer.is_correct);
            if (!correctAnswer?.text.trim()) {
              toast.error(
                correctAnswer
                  ? "Введіть текст у варіант, позначений правильною відповіддю"
                  : "Позначте правильну відповідь",
              );
              return;
            }
            if (answers.filter((answer) => answer.text.trim()).length < 2) {
              toast.error("Заповніть щонайменше два варіанти відповіді");
              return;
            }
            if (editingQuestionId) editMutation.mutate();
            else addMutation.mutate();
          }}
        >
          <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.15em] text-accent">
            {editingQuestionId ? "Редагувати запитання" : "Додати запитання"}
          </p>
          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Текст запитання
          </label>
          <textarea
            value={text}
            rows={3}
            maxLength={500}
            onChange={(e) => setText(e.target.value)}
            className="mb-3 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
          />

          <label className="mb-1.5 block font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Зображення або відео
          </label>
          <input
            key={editingQuestionId ?? "new-question"}
            type="file"
            accept="image/*,video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="mb-4 w-full font-mono text-[11px] text-muted-foreground"
          />
          {editingQuestionId && existingMedia.url ? (
            <div className="mb-4">
              {existingMedia.type === "video" ? (
                <video src={existingMedia.url} controls className="mb-2 max-h-56 w-full rounded-md border border-border" />
              ) : (
                <img src={existingMedia.url} alt="Медіа поточного запитання" className="mb-2 max-h-56 w-full rounded-md border border-border object-contain" />
              )}
              <button
                type="button"
                onClick={() => setExistingMedia({ url: null, type: null })}
                className="font-mono text-[10px] text-destructive"
              >
                Видалити медіа
              </button>
            </div>
          ) : null}
          {file ? <p className="-mt-2 mb-4 font-mono text-[10px] text-muted-foreground">Нове медіа: {file.name}</p> : null}

          <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
            Варіанти відповідей
          </p>
          <div className="space-y-2">
            {answers.map((answer, index) => (
              <div
                key={index}
                className={`flex items-center gap-2 rounded-md border p-1.5 ${
                  answer.is_correct ? "border-accent bg-accent-soft" : "border-transparent"
                }`}
              >
                <input
                  type="radio"
                  name="correct"
                  aria-label={`Позначити варіант ${index + 1} правильною відповіддю`}
                  checked={answer.is_correct}
                  onChange={() =>
                    setAnswers((prev) => prev.map((a, i) => ({ ...a, is_correct: i === index })))
                  }
                  className="accent-[hsl(38_78%_55%)]"
                />
                <input
                  value={answer.text}
                  maxLength={240}
                  placeholder={`Варіант ${index + 1}`}
                  onChange={(e) =>
                    setAnswers((prev) =>
                      prev.map((a, i) => (i === index ? { ...a, text: e.target.value } : a)),
                    )
                  }
                  className="flex-1 rounded-md border border-border bg-surface-2 px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setAnswers((prev) => [...prev, { text: "", is_correct: false }])}
            className="mt-2 w-full rounded-md border border-border py-2 font-mono text-[11px] text-muted-foreground hover:text-foreground"
          >
            + Ще варіант
          </button>

          <button
            type="submit"
            disabled={addMutation.isPending || editMutation.isPending}
            className="mt-4 w-full rounded-md bg-accent py-2 font-mono text-xs font-medium text-accent-foreground disabled:opacity-60"
          >
            {addMutation.isPending || editMutation.isPending
              ? "Збереження…"
              : editingQuestionId
                ? "Зберегти зміни"
                : "Додати запитання"}
          </button>
          {editingQuestionId ? (
            <button
              type="button"
              onClick={cancelEditing}
              className="mt-2 w-full rounded-md border border-border py-2 font-mono text-xs text-muted-foreground hover:text-foreground"
            >
              Скасувати редагування
            </button>
          ) : null}
        </form>
      </div>
    </AdminShell>
  );
}
