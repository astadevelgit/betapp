export function AdminConfigNotice() {
  return (
    <div className="rounded-xl border border-warning/30 bg-warning/10 p-4 text-sm text-warning">
      Add <code className="font-mono text-xs">SUPABASE_SERVICE_ROLE_KEY</code>{" "}
      to load live admin data and enable operational actions.
    </div>
  );
}
