import type { PortfolioExecutionBoard } from "@/lib/portfolio-execution";
import type { PortfolioExecutionProgress } from "@/lib/portfolio-progress";
import Link from "next/link";

function pct(done: number, total: number) {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}

function getBucket(
  progress: PortfolioExecutionProgress | null,
  prefix: "NOW" | "NEXT" | "LATER"
) {
  return progress?.buckets.find((bucket) => bucket.prefix === prefix) ?? null;
}

export default function PortfolioExecutionBoardCard({
  board,
  progress,
}: {
  board: PortfolioExecutionBoard;
  progress: PortfolioExecutionProgress | null;
}) {
  const totalLaneProjects = board.lanes.reduce((acc, lane) => acc + lane.projects.length, 0);
  const nowBucket = getBucket(progress, "NOW");
  const nextBucket = getBucket(progress, "NEXT");
  const laterBucket = getBucket(progress, "LATER");

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
            <div className="text-muted-foreground">Lanes</div>
            <div className="font-medium">{board.lanes.length}</div>
          </div>
          <div className="rounded-md border px-3 py-2">
            <div className="text-muted-foreground">Stage gates</div>
            <div className="font-medium">{board.gates.length}</div>
          </div>
          <div className="rounded-md border px-3 py-2">
            <div className="text-muted-foreground">Lane projects</div>
            <div className="font-medium">{totalLaneProjects}</div>
          </div>
          <div className="rounded-md border px-3 py-2">
            <div className="text-muted-foreground">Now progress</div>
            <div className="font-medium">
              {nowBucket ? `${nowBucket.done}/${nowBucket.total}` : "0/0"}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Now</h3>
            <Link href="/board?prefill=NOW" className="text-xs text-blue-600 hover:underline">Open tasks</Link>
          </div>
          {nowBucket ? (
            <p className="mb-2 text-xs text-muted-foreground">
              {nowBucket.done}/{nowBucket.total} done · {nowBucket.inProgress} running · {nowBucket.failed} failed
            </p>
          ) : null}
          <ul className="space-y-1 text-xs text-muted-foreground">
            {board.queue.now.map((item) => (
              <li key={item}>{item}</li>
            ))}
            {board.queue.now.length === 0 ? <li>None</li> : null}
          </ul>
        </div>

        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Next</h3>
            <Link href="/board?prefill=NEXT" className="text-xs text-blue-600 hover:underline">Open tasks</Link>
          </div>
          {nextBucket ? (
            <p className="mb-2 text-xs text-muted-foreground">
              {nextBucket.done}/{nextBucket.total} done · {nextBucket.inProgress} running · {nextBucket.failed} failed
            </p>
          ) : null}
          <ul className="space-y-1 text-xs text-muted-foreground">
            {board.queue.next.map((item) => (
              <li key={item}>{item}</li>
            ))}
            {board.queue.next.length === 0 ? <li>None</li> : null}
          </ul>
        </div>

        <div className="rounded-lg border p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">Later</h3>
            <Link href="/board?prefill=LATER" className="text-xs text-blue-600 hover:underline">Open tasks</Link>
          </div>
          {laterBucket ? (
            <p className="mb-2 text-xs text-muted-foreground">
              {laterBucket.done}/{laterBucket.total} done · {laterBucket.inProgress} running · {laterBucket.failed} failed
            </p>
          ) : null}
          <ul className="space-y-1 text-xs text-muted-foreground">
            {board.queue.later.map((item) => (
              <li key={item}>{item}</li>
            ))}
            {board.queue.later.length === 0 ? <li>None</li> : null}
          </ul>
        </div>
      </div>

      {board.lanes.length > 0 && (
        <div className="mt-5 rounded-lg border p-3">
          <h3 className="mb-3 text-sm font-semibold">Lanes</h3>
          <div className="space-y-3">
            {board.lanes.map((lane) => {
              return (
                <div key={lane.title} className="rounded-md border p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h4 className="text-sm font-medium">{lane.title}</h4>
                    <div className="text-xs text-muted-foreground">
                      Projects {lane.projects.length}
                    </div>
                  </div>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {lane.goal.map((item) => (
                      <li key={item}>Goal: {item}</li>
                    ))}
                    {lane.projects.map((project) => {
                      const slug = project.replace(/`/g, "").replace(/\s*\(.*\)\s*$/, "");
                      return (
                        <li key={project}>
                          <Link href={`/projects/${slug}`} className="text-blue-600 hover:underline">
                            {project}
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {board.gates.length > 0 && (
        <div className="mt-5 rounded-lg border p-3">
          <h3 className="mb-3 text-sm font-semibold">Stage Gates</h3>
          <div className="space-y-3">
            {board.gates.map((gate) => (
              <div key={gate.title} className="rounded-md border p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h4 className="text-sm font-medium">{gate.title}</h4>
                  {progress ? (() => {
                    const gp = progress.gates.find((g) => g.gateTitle === gate.title);
                    if (!gp) return null;
                    return (
                      <span className="text-xs text-muted-foreground">
                        {gp.done}/{gp.total} ({pct(gp.done, gp.total)}%)
                      </span>
                    );
                  })() : null}
                </div>
                <ul className="space-y-1 text-xs text-muted-foreground">
                  {gate.mustPass.map((item) => (
                    <li key={item}>Must pass: {item}</li>
                  ))}
                  {gate.owners.map((owner) => (
                    <li key={owner}>Owner: {owner}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {board.constraints.length > 0 && (
        <div className="mt-5 rounded-lg border p-3">
          <h3 className="mb-2 text-sm font-semibold">Non-negotiable Constraints</h3>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {board.constraints.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
