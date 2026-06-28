import { Suspense, lazy, type ComponentType } from "react";
import { createBrowserRouter } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";

const Home = lazy(() => import("@/pages/Home").then((m) => ({ default: m.Home })));
const Overview = lazy(() => import("@/pages/Overview").then((m) => ({ default: m.Overview })));
const HumanoidRobot = lazy(() => import("@/pages/HumanoidRobot").then((m) => ({ default: m.HumanoidRobot })));
const AICompute = lazy(() => import("@/pages/AICompute").then((m) => ({ default: m.AICompute })));
const StockBoard = lazy(() => import("@/pages/StockBoard").then((m) => ({ default: m.StockBoard })));
const AstockPeg = lazy(() => import("@/pages/AstockPeg").then((m) => ({ default: m.AstockPeg })));
const StockPick = lazy(() => import("@/pages/StockPick").then((m) => ({ default: m.StockPick })));
const Agent = lazy(() => import("@/pages/Agent").then((m) => ({ default: m.Agent })));
const RunDetail = lazy(() =>
  import("@/pages/RunDetail").then((m) => ({ default: m.RunDetail })),
);
const Compare = lazy(() =>
  import("@/pages/Compare").then((m) => ({ default: m.Compare })),
);
const Settings = lazy(() =>
  import("@/pages/Settings").then((m) => ({ default: m.Settings })),
);
const Correlation = lazy(() =>
  import("@/pages/Correlation").then((m) => ({ default: m.Correlation })),
);
const AlphaZoo = lazy(() =>
  import("@/pages/AlphaZoo").then((m) => ({ default: m.AlphaZoo })),
);
const OpportunityList = lazy(() =>
  import("@/pages/OpportunityList").then((m) => ({ default: m.OpportunityList })),
);

function PageLoader() {
  return (
    <div className="flex h-[60vh] items-center justify-center text-muted-foreground">
      Loading…
    </div>
  );
}

function wrap(Component: ComponentType) {
  return (
    <Suspense fallback={<PageLoader />}>
      <Component />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: wrap(Home) },
      { path: "/overview", element: wrap(Overview) },
      { path: "/opportunity-list", element: wrap(OpportunityList) },
      { path: "/humanoid-robot", element: wrap(HumanoidRobot) },
      { path: "/ai-compute", element: wrap(AICompute) },
      { path: "/stock-board", element: wrap(StockBoard) },
      { path: "/astock-peg", element: wrap(AstockPeg) },
      { path: "/stock-pick", element: wrap(StockPick) },
      { path: "/agent", element: wrap(Agent) },
      { path: "/settings", element: wrap(Settings) },
      { path: "/runs/:runId", element: wrap(RunDetail) },
      { path: "/compare", element: wrap(Compare) },
      { path: "/correlation", element: wrap(Correlation) },
      { path: "/alpha-zoo", element: wrap(AlphaZoo) },
      { path: "/alpha-zoo/bench", element: wrap(AlphaZoo) },
      { path: "/alpha-zoo/compare", element: wrap(AlphaZoo) },
      { path: "/alpha-zoo/:alphaId", element: wrap(AlphaZoo) },
    ],
  },
]);
