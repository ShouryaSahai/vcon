/**
 * Shown on every screen when a signed-in account has no workspace. Fresh
 * accounts start empty by design (row-level security), so this explains the
 * situation and points judges at the demo accounts instead of dead-ending.
 */
export function NoWorkspaceNotice() {
  return (
    <div className="mx-auto max-w-xl pt-4">
      <div className="rounded-xl border border-border bg-card p-6 shadow-(--shadow-card)">
        <p className="font-semibold text-foreground">Almost there — no workspace attached yet</p>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Workspace data is private by design (row-level security), so a fresh account starts
          empty. For the hackathon demo, use one of the{" "}
          <strong className="text-foreground">demo accounts on the login screen</strong> — or ask
          the team to attach this account (one line of trusted SQL on their side).
        </p>
      </div>
    </div>
  );
}
