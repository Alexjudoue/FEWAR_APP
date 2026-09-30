import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Home, Target, Scissors, Shield, Layers, CheckCircle2, Info } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/protocole")({
  head: () => ({
    meta: [
      { title: "Protocole expérimental — FEVAR Planning Assistant" },
      { name: "description", content: "Protocole expérimental de fenêtrage de l'endoprothèse, étape par étape." },
    ],
  }),
  component: ProtocolePage,
});

const RESULTS_STORAGE_KEY = "fevar:last-results";

type ResultRow = {
  name: string;
  line_num: number | string;
  hole_num: number | string;
  theta_deg?: number;
  s?: number;
};

type Step = {
  id: string;
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  paragraphs: { title: string; body: string }[];
  bullets?: string[];
};

const STEPS: Step[] = [
  {
    id: "reperage",
    title: "Repérage",
    subtitle: "Identification de la zone de travail et de la référence θ = 0°",
    icon: Target,
    paragraphs: [
      { title: "1. Mise en place du pochoir", body: "L'endoprothèse est insérée dans le pochoir cylindrique calibré (grille 12 colonnes × 8 lignes). Le pochoir maintient une géométrie stable durant toute la phase de fenêtrage." },
      { title: "2. Alignement de la référence", body: "Aligner physiquement le repère θ = 0° du pochoir avec le marqueur radio-opaque de référence de l'endoprothèse. Cette référence est la source de vérité angulaire pour tous les calculs de position." },
      { title: "3. Identification des trous d'intérêt", body: "Les coordonnées (line_num, hole_num) renvoyées par le calcul sont reportées sur le pochoir. Chaque trou d'intérêt est marqué visuellement avant toute découpe." },
    ],
    bullets: ["Vérifier l'absence de torsion résiduelle de la prothèse", "Contrôler que les artères cibles correspondent bien aux trous calculés"],
  },
  {
    id: "fenetrage",
    title: "Fenêtrage",
    subtitle: "Réalisation de l'ouverture par thermocautère",
    icon: Scissors,
    paragraphs: [
      { title: "1. Préparation du thermocautère", body: "Le thermocautère est préchauffé à la température opératoire recommandée. La pointe doit être propre et alignée perpendiculairement à la surface du tissu prothétique." },
      { title: "2. Positionnement", body: "Insérer la pointe du thermocautère à travers le trou guide du pochoir correspondant au point d'intérêt. Maintenir un angle de 90° par rapport à la surface cylindrique." },
      { title: "3. Découpe", body: "Appliquer une pression douce et constante. Effectuer un mouvement circulaire pour obtenir une fenêtre nette, calibrée au diamètre du guide. Éviter toute traction latérale qui déformerait la fenêtre." },
    ],
    bullets: ["Diamètre cible de la fenêtre conforme au calibre attendu", "Bords nets, sans effilochage du tissu"],
  },
  {
    id: "renfort",
    title: "Renfort + marquage",
    subtitle: "Renforcement du bord et marquage radio-opaque",
    icon: Shield,
    paragraphs: [
      { title: "1. Pose du renfort", body: "Un anneau de renfort en fil métallique (typiquement nitinol) est suturé sur le pourtour de la fenêtre. Le renfort maintient l'ouverture circulaire et évite la déchirure progressive du tissu sous contrainte hémodynamique." },
      { title: "2. Suture", body: "Points de suture réguliers, espacés de façon homogène autour de la fenêtre. La tension de la suture doit être uniforme pour éviter toute déformation." },
      { title: "3. Marquage radio-opaque", body: "Quatre repères radio-opaques (or ou platine) sont positionnés à 0°, 90°, 180° et 270° du renfort. Ces marqueurs permettent le repérage fluoroscopique peropératoire et le cathétérisme sélectif de l'artère cible." },
    ],
    bullets: ["Renfort fermé, non torsadé, tangent à la fenêtre", "Marqueurs visibles aux 4 cardinaux"],
  },
  {
    id: "recompression",
    title: "Recompression",
    subtitle: "Remise sous contrainte de l'endoprothèse fenêtrée",
    icon: Layers,
    paragraphs: [
      { title: "1. Retrait du pochoir", body: "L'endoprothèse fenêtrée est libérée du pochoir avec précaution, en préservant l'alignement des fenêtres et des marqueurs." },
      { title: "2. Plicature contrôlée", body: "La prothèse est repliée selon les axes longitudinaux de manière à minimiser la contrainte sur les zones renforcées. Les fenêtres sont orientées de façon à rester accessibles lors du déploiement." },
      { title: "3. Recompression dans la gaine", body: "L'endoprothèse est progressivement réintroduite dans sa gaine de livraison. La compression doit être homogène, sans torsion ni pli. Vérifier la position finale des marqueurs avant fermeture définitive." },
    ],
    bullets: ["Pas de torsion résiduelle (twist test)", "Marqueurs radio-opaques bien orientés", "Gaine refermée selon spécifications"],
  },
];

function ProtocolePage() {
  const [active, setActive] = useState(0);
  const [results, setResults] = useState<ResultRow[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RESULTS_STORAGE_KEY);
      if (raw) setResults(JSON.parse(raw));
    } catch {}
  }, []);

  const step = STEPS[active];
  const Icon = step.icon;
  const hasDiagram = step.id === "reperage" || step.id === "fenetrage";

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Layers className="h-6 w-6" strokeWidth={2.2} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Protocole expérimental de fenêtrage de l'endoprothèse</h1>
              <p className="text-sm text-muted-foreground">Guide opératoire étape par étape pour la réalisation des fenêtres FEVAR</p>
            </div>
          </div>
          <Button variant="outline" asChild>
            <Link to="/"><Home className="mr-2 h-4 w-4" /> Retour à l'accueil</Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <div className="rounded-2xl border bg-card p-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {STEPS.map((s, i) => {
              const SIcon = s.icon;
              const done = i < active;
              const current = i === active;
              return (
                <button
                  key={s.id}
                  onClick={() => setActive(i)}
                  className={cn(
                    "group flex items-center gap-3 rounded-xl border p-3 text-left transition",
                    current && "border-primary bg-primary/5 shadow-sm",
                    !current && "border-transparent hover:border-border hover:bg-muted/50",
                  )}
                >
                  <div className={cn(
                    "flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold",
                    current && "bg-primary text-primary-foreground",
                    done && !current && "bg-success text-success-foreground",
                    !current && !done && "bg-muted text-muted-foreground",
                  )}>
                    {done ? <CheckCircle2 className="h-5 w-5" /> : <SIcon className="h-5 w-5" />}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs uppercase tracking-wide text-muted-foreground">Étape {i + 1}</div>
                    <div className="truncate text-sm font-semibold">{s.title}</div>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${((active + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>

        <div className={cn("grid gap-6", hasDiagram ? "lg:grid-cols-5" : "lg:grid-cols-1")}>
          <Card className={hasDiagram ? "lg:col-span-3" : ""}>
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-xl">Étape {active + 1} — {step.title}</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">{step.subtitle}</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              {step.paragraphs.map((p) => (
                <div key={p.title}>
                  <h3 className="text-sm font-semibold text-foreground">{p.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                </div>
              ))}
              {step.bullets && (
                <div className="rounded-lg border bg-muted/30 p-4">
                  <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Points de contrôle</div>
                  <ul className="mt-2 space-y-1.5">
                    {step.bullets.map((b) => (
                      <li key={b} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
                        <span>{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {step.id === "renfort" && (
                <div className="flex items-start gap-3 rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm">
                  <Info className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
                  <div>
                    <div className="font-semibold text-foreground">Validation du renfort</div>
                    <p className="mt-1 text-muted-foreground">
                      Vérifier la circularité du renfort et la visibilité fluoroscopique des 4 marqueurs cardinaux avant de passer à la recompression.
                    </p>
                  </div>
                </div>
              )}
              {step.id === "recompression" && (
                <div className="flex items-start gap-3 rounded-lg border border-success/40 bg-success/10 p-4 text-sm">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
                  <div>
                    <div className="font-semibold text-foreground">Validation finale</div>
                    <p className="mt-1 text-muted-foreground">
                      Contrôler l'absence de twist, l'orientation des marqueurs et l'intégrité de la gaine avant tout déploiement clinique.
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {hasDiagram && (
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="text-base text-muted-foreground">Schéma de principe</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-xl border bg-gradient-to-br from-slate-50 to-slate-100 p-3">
                  {step.id === "reperage" ? <StencilGridDiagram results={results} /> : <FenetrageDiagram results={results} />}
                </div>
                {step.id === "fenetrage" && (
                  <p className="mt-3 text-center text-xs text-muted-foreground">
                    {results.length > 0
                      ? `${results.length} trou${results.length > 1 ? "s" : ""} d'intérêt à fenêtrer`
                      : "Aucun résultat de calcul disponible. Lancez d'abord le calcul depuis l'accueil."}
                  </p>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4">
          <Button variant="outline" onClick={() => setActive((a) => Math.max(0, a - 1))} disabled={active === 0}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Étape précédente
          </Button>
          <Button variant="ghost" asChild>
            <Link to="/"><Home className="mr-2 h-4 w-4" /> Retour à l'accueil</Link>
          </Button>
          <Button onClick={() => setActive((a) => Math.min(STEPS.length - 1, a + 1))} disabled={active === STEPS.length - 1}>
            Étape suivante <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </main>
    </div>
  );
}

/* ---------- 2D Diagrams ---------- */

const STROKE = "#1e3a5f";
const RED = "#dc2626";
const GREEN = "#10b981";

const N_COLS = 12;
const N_LINES = 8;

function StencilGrid({ results, title }: { results: ResultRow[]; title: string }) {
  // Pochoir déplié — grille 12 colonnes × 8 lignes
  const W = 320;
  const H = 320;
  const padX = 40;
  const padTop = 50;
  const padBottom = 50;
  const gridW = W - 2 * padX;
  const gridH = H - padTop - padBottom;
  const colStep = gridW / (N_COLS - 1);
  const lineStep = gridH / (N_LINES - 1);

  const highlights = new Set(
    results
      .map((r) => `${Number(r.line_num)}-${Number(r.hole_num)}`)
      .filter((k) => !k.includes("NaN")),
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full">
      {/* Frame */}
      <rect
        x={padX - 14}
        y={padTop - 14}
        width={gridW + 28}
        height={gridH + 28}
        rx="10"
        fill="white"
        stroke={STROKE}
        strokeWidth="1.2"
      />

      {/* θ=0° reference column highlight */}
      <rect
        x={padX - 10}
        y={padTop - 10}
        width="20"
        height={gridH + 20}
        fill={GREEN}
        opacity="0.1"
      />
      <text
        x={padX}
        y={padTop - 18}
        textAnchor="middle"
        fontSize="10"
        fill={GREEN}
        fontWeight="700"
      >
        θ = 0°
      </text>

      {/* Horizontal grid lines */}
      {Array.from({ length: N_LINES }).map((_, r) => (
        <line
          key={`hl-${r}`}
          x1={padX - 6}
          y1={padTop + r * lineStep}
          x2={padX + gridW + 6}
          y2={padTop + r * lineStep}
          stroke="#cbd5e1"
          strokeWidth="0.6"
        />
      ))}
      {/* Vertical grid lines */}
      {Array.from({ length: N_COLS }).map((_, c) => (
        <line
          key={`vl-${c}`}
          x1={padX + c * colStep}
          y1={padTop - 6}
          x2={padX + c * colStep}
          y2={padTop + gridH + 6}
          stroke="#cbd5e1"
          strokeWidth="0.6"
        />
      ))}

      {/* Holes */}
      {Array.from({ length: N_LINES }).map((_, lineIdx) =>
        Array.from({ length: N_COLS }).map((_, colIdx) => {
          const cx = padX + colIdx * colStep;
          const cy = padTop + lineIdx * lineStep;
          const key = `${lineIdx + 1}-${colIdx + 1}`;
          const interest = highlights.has(key);
          return (
            <g key={key}>
              {interest && (
                <circle cx={cx} cy={cy} r="9" fill={RED} opacity="0.18" />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={interest ? 5.5 : 3.2}
                fill={interest ? RED : "white"}
                stroke={interest ? "#7f1d1d" : "#64748b"}
                strokeWidth={interest ? 1.4 : 0.8}
              />
            </g>
          );
        }),
      )}

      {/* Axis labels */}
      <text
        x={W / 2}
        y={H - 22}
        textAnchor="middle"
        fontSize="11"
        fill={STROKE}
        fontWeight="600"
      >
        {title}
      </text>
      <text x={W / 2} y={H - 8} textAnchor="middle" fontSize="9" fill="#64748b">
        12 colonnes (angle θ) × 8 lignes — 96 trous
      </text>
      <text
        x="14"
        y={H / 2}
        textAnchor="middle"
        fontSize="9"
        fill="#64748b"
        transform={`rotate(-90 14 ${H / 2})`}
      >
        Lignes
      </text>
    </svg>
  );
}

function StencilGridDiagram({ results }: { results: ResultRow[] }) {
  return <StencilGrid results={results} title="Grille 12 × 8 — trous d'intérêt en rouge" />;
}

function FenetrageDiagram({ results }: { results: ResultRow[] }) {
  return (
    <StencilGrid
      results={results}
      title={`Fenêtres à réaliser — ${results.length} trou${results.length > 1 ? "s" : ""} rouge${results.length > 1 ? "s" : ""}`}
    />
  );
}
