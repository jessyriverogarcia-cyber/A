import clsx from "clsx";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatDate, formatTime } from "@/lib/format";
import { EmptyState, Flash, PageHeader } from "@/components/ui/backoffice";
import { SubmitButton } from "@/components/ui/SubmitButton";
import { markAllReadAction, openNotificationAction } from "./actions";

export const metadata = { title: "Notifications" };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<Record<string, string>> }) {
  const sp = await searchParams;
  const ctx = await requireUser();
  const db = await createClient();
  const { data: notes } = await db.from("notifications").select("*").eq("user_id", ctx.user_id).order("created_at", { ascending: false }).limit(100);
  const unread = (notes ?? []).filter((n) => !n.read_at).length;
  return (
    <div className="mx-auto max-w-3xl p-6 lg:p-8">
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} non lue(s)` : "Tout est lu."}
        actions={
          unread ? (
            <form action={markAllReadAction}>
              <SubmitButton variant="secondary">Tout marquer comme lu</SubmitButton>
            </form>
          ) : undefined
        }
      />
      <Flash ok={sp.ok} err={sp.err} />
      <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface" data-testid="notifications">
        {(notes ?? []).map((n) => (
          <li key={n.id}>
            <form action={openNotificationAction}>
              <input type="hidden" name="id" value={n.id} />
              <button className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-surface-2/60">
                <span className={clsx("mt-1.5 h-2 w-2 shrink-0 rounded-full", n.read_at ? "bg-transparent" : "bg-accent")} />
                <span className="min-w-0 flex-1">
                  <span className={clsx("block text-sm", !n.read_at && "font-semibold")}>{n.title}</span>
                  {n.body && <span className="block truncate text-sm text-muted">{n.body}</span>}
                </span>
                <span className="shrink-0 text-xs text-muted">{formatDate(n.created_at)} {formatTime(n.created_at)}</span>
              </button>
            </form>
          </li>
        ))}
      </ul>
      {!notes?.length && <EmptyState title="Aucune notification" />}
    </div>
  );
}
