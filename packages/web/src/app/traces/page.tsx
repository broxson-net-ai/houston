import { Nav } from "@/components/nav";
import TracesView from "./TracesView";

export const metadata = { title: "Traces — Houston" };

export default function TracesPage() {
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mb-6 space-y-1">
          <h1 className="text-3xl font-bold">Routing Traces</h1>
          <p className="text-muted-foreground text-sm">
            Plugin chain events from the OpenClaw Operating Model — classification, source selection, and captures.
          </p>
        </div>
        <TracesView />
      </div>
    </div>
  );
}
