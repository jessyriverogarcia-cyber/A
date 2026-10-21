import { SubmitButton } from "@/components/ui/SubmitButton";
import { decideLeaveAction } from "@/app/(backoffice)/hr/actions";

/** Validation ou refus d'un congé en un clic. */
export function LeaveDecision({ id, back, testId }: { id: string; back: string; testId?: string }) {
  return (
    <form action={decideLeaveAction} className="flex gap-1">
      <input type="hidden" name="leave_id" value={id} />
      <input type="hidden" name="back" value={back} />
      <SubmitButton name="decision" value="approve" className="px-3 py-1 text-xs" testId={testId ? `${testId}-ok` : undefined}>Valider</SubmitButton>
      <SubmitButton name="decision" value="reject" variant="secondary" className="px-3 py-1 text-xs" testId={testId ? `${testId}-ko` : undefined}>Refuser</SubmitButton>
    </form>
  );
}
