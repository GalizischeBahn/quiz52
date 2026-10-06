import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { AdminShell } from "@/components/AdminShell";

export const Route = createFileRoute("/_authenticated/admin/")({
  head: () => ({
    meta: [
      { title: "Статистика квізів | Панель адміністратора" },
      { name: "description", content: "Жива статистика проходжень квізів по підрозділах." },
      { property: "og:title", content: "Статистика квізів | Панель адміністратора" },
      { property: "og:description", content: "Жива статистика проходжень квізів по підрозділах." },
    ],
  }),
  component: AdminStats,
});

type Row = {
  attempt_id: string;
  quiz_title: string;
  unit_name: string;
  callsign: string;
  score: number;
  end_time: string | null;
};

function AdminStats() {
  const queryClient = useQueryClient();

  const statsQuery = useQuery({
    queryKey: ["admin-stats"],
    refetchInterval: 5_000,
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("attempts")
        .select(
          "id, score, end_time, quizzes(title), participants(callsign, units(name))",
        )
        .order("start_time", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []).map((a) => ({
        attempt_id: a.id,
        score: a.score,
        end_time: a.end_time,
        quiz_title: (a.quizzes as { title: string } | null)?.title ?? "—",
        callsign: (a.participants as { callsign: string } | null)?.callsign ?? "—",
        unit_name:
          ((a.participants as { units: { name: string } | null } | null)?.units?.name) ?? "—",
      }));
    },
  });

  useEffect(() => {
    const timer = window.setInterval(() => {
      void queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [queryClient]);

  const rows = statsQuery.data ?? [];
  const finished = rows.filter((r) => r.end_time);
  const avg = finished.length
    ? (finished.reduce((sum, r) => sum + r.score, 0) / finished.length).toFixed(1)
    : "0";

  const byUnit = new Map<string, { count: number; score: number }>();
  for (const row of finished) {
    const entry = byUnit.get(row.unit_name) ?? { count: 0, score: 0 };
    entry.count += 1;
    entry.score += row.score;
    byUnit.set(row.unit_name, entry);
  }

  return (
    <AdminShell title="Статистика в реальному часі" eyebrow="Підсумки">
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        <StatCard label="Всього спроб" value={String(rows.length)} />
        <StatCard label="Завершено" value={String(finished.length)} />
        <StatCard label="Середній бал" value={avg} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="border-b border-border px-4 py-3 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            Останні проходження
          </div>
          <table className="w-full text-left text-sm">
            <thead className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-2 font-normal">Позивний</th>
                <th className="px-4 py-2 font-normal">Підрозділ</th>
                <th className="px-4 py-2 font-normal">Квіз</th>
                <th className="px-4 py-2 font-normal">Бал</th>
                <th className="px-4 py-2 font-normal">Статус</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-6 font-mono text-xs text-muted-foreground">
                    Даних ще немає.
                  </td>
                </tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.attempt_id} className="border-b border-border/60 last:border-0">
                    <td className="px-4 py-2.5 font-mono text-xs">{row.callsign}</td>
                    <td className="px-4 py-2.5">{row.unit_name}</td>
                    <td className="px-4 py-2.5">{row.quiz_title}</td>
                    <td className="px-4 py-2.5 font-mono text-xs">{row.score}</td>
                    <td className="px-4 py-2.5 font-mono text-[11px]">
                      {row.end_time ? (
                        <span className="text-success">Завершено</span>
                      ) : (
                        <span className="text-muted-foreground">В процесі</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.15em] text-muted-foreground">
            По підрозділах
          </p>
          <div className="space-y-3">
            {byUnit.size === 0 ? (
              <p className="font-mono text-xs text-muted-foreground">Немає завершених спроб.</p>
            ) : (
              [...byUnit.entries()].map(([unit, data]) => (
                <div key={unit}>
                  <div className="flex justify-between font-mono text-[11px]">
                    <span>{unit}</span>
                    <span className="text-muted-foreground">
                      {(data.score / data.count).toFixed(1)} серед. · {data.count}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 rounded-full bg-surface-2">
                    <div
                      className="h-1.5 rounded-full bg-accent"
                      style={{
                        width: `${Math.min(100, (data.score / data.count) * 20)}%`,
                      }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-bold">{value}</p>
    </div>
  );
}
