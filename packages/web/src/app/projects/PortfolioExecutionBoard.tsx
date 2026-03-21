import type { PortfolioExecutionBoard } from "@/lib/portfolio-execution";

function countDone(items: Array<{ done: boolean }>) {
  return items.filter((item) => item.done).length;
}

export default function PortfolioExecutionBoardCard({
  board,
}: {
  board: PortfolioExecutionBoard;
}) {
  const totalTrackTodos = board.tracks.reduce((acc, track) => acc + track.todos.length, 0);
  const totalTrackDone = board.tracks.reduce((acc, track) => acc + countDone(track.todos), 0);
  const totalGateChecks = board.tracks.reduce((acc, track) => acc + track.doneWhen.length, 0);
  const doneGateChecks = board.tracks.reduce((acc, track) => acc + countDone(track.doneWhen), 0);
  const totalAgents = board.newAgents.length;
  const doneAgents = countDone(board.newAgents);

  return (
    <section className="mb-8 rounded-xl border bg-card p-5 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">Portfolio Execution</h2>
          <p className="text-sm text-muted-foreground">
            Canonical cross-project execution board from <code>PORTFOLIO_EXECUTION.md</code>.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
          <div className="rounded-md border px-3 py-2">
            <div className="text-muted-foreground">Status</div>
            <div className="font-medium">{board.status ?? "unknown"}</div>
          </div>
          <div className="rounded-md border px-3 py-2">
            <div className="text-muted-foreground">Owner</div>
            <div className="font-medium">{board.owner ?? "unassigned"}</div>
          </div>
          <div className="rounded-md border px-3 py-2">
            <div className="text-muted-foreground">Updated</div>
            <div className="font-medium">{board.lastUpdated ?? "-"}</div>
          </div>
          <div className="rounded-md border px-3 py-2">
            <div className="text-muted-foreground">Track tasks</div>
            <div className="font-medium">{totalTrackDone}/{totalTrackTodos}</div>
          </div>
          <div className="rounded-md border px-3 py-2">
            <div className="text-muted-foreground">Completion gates</div>
            <div className="font-medium">{doneGateChecks}/{totalGateChecks}</div>
          </div>
          <div className="rounded-md border px-3 py-2">
            <div className="text-muted-foreground">New agents</div>
            <div className="font-medium">{doneAgents}/{totalAgents}</div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border p-3">
          <h3 className="mb-2 text-sm font-semibold">Critical Path</h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {board.criticalPath.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border p-3">
          <h3 className="mb-2 text-sm font-semibold">Parallel Tracks</h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {board.parallelTracks.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>

        <div className="rounded-lg border p-3">
          <h3 className="mb-2 text-sm font-semibold">Portfolio Rules</h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {board.rules.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>

      {board.tracks.length > 0 && (
        <div className="mt-5 rounded-lg border p-3">
          <h3 className="mb-3 text-sm font-semibold">Execution Tracks</h3>
          <div className="space-y-3">
            {board.tracks.map((track) => {
              const done = countDone(track.todos);
              const total = track.todos.length;
              const doneWhenDone = countDone(track.doneWhen);
              const doneWhenTotal = track.doneWhen.length;
              return (
                <div key={track.title} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-medium">{track.title}</h4>
                    <div className="text-xs text-muted-foreground">
                      Tasks {done}/{total} · Gates {doneWhenDone}/{doneWhenTotal}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
