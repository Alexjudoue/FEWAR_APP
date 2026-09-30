import { Suspense, useMemo, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment, Html } from "@react-three/drei";
import * as THREE from "three";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FileText, AlertCircle, MousePointerClick } from "lucide-react";

export type StencilResultRow = {
  name: string;
  s: number;
  theta_deg: number;
  line_num: number | string;
  hole_num: number | string;
  hole_error_height_mm: number;
  hole_error_angular_deg: number;
  stent_collision: boolean;
  stent_collision_message?: string;
  guide_text?: string;
};

const N_LINES = 8;
const N_HOLES = 12;
const RADIUS = 1.0;
const HEIGHT = 4.8;
const HOLE_OFFSET = 0.025;
const HOLE_R = 0.095;

function getHolePosition(lineNum: number, holeNum: number) {
  const y = HEIGHT / 2 - (lineNum - 1) * (HEIGHT / (N_LINES - 1));
  const theta = (2 * Math.PI * (holeNum - 1)) / N_HOLES;
  const x = (RADIUS + HOLE_OFFSET) * Math.cos(theta);
  const z = (RADIUS + HOLE_OFFSET) * Math.sin(theta);
  return { position: [x, y, z] as [number, number, number], theta };
}

function HoleMark({
  lineNum,
  holeNum,
  state,
  onClick,
}: {
  lineNum: number;
  holeNum: number;
  state: "available" | "interest" | "selected" | "collision";
  onClick?: () => void;
}) {
  const { position, theta } = getHolePosition(lineNum, holeNum);
  const quat = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(Math.cos(theta), 0, Math.sin(theta)),
    );
    return q;
  }, [theta]);

  const isInterest = state !== "available";
  const isSelected = state === "selected";
  const isCollision = state === "collision";

  const fill = isSelected
    ? "#ff2d3a"
    : isCollision
    ? "#b91c1c"
    : isInterest
    ? "#ef2b3a"
    : "#ffffff";
  const ringColor = isInterest ? (isCollision ? "#7f1d1d" : "#9b1722") : "#94a3b8";
  const r = isSelected ? HOLE_R * 1.25 : HOLE_R;

  return (
    <group position={position} quaternion={quat.toArray() as any}>
      {/* filled disc */}
      <mesh onClick={onClick && isInterest ? (e) => { e.stopPropagation(); onClick(); } : undefined}>
        <circleGeometry args={[r * 0.78, 32]} />
        <meshStandardMaterial
          color={fill}
          emissive={isInterest ? fill : "#000000"}
          emissiveIntensity={isSelected ? 0.9 : isInterest ? 0.45 : 0}
          roughness={0.5}
          metalness={0.05}
          side={THREE.DoubleSide}
        />
      </mesh>
      {/* outer ring */}
      <mesh position={[0, 0, 0.001]}>
        <ringGeometry args={[r * 0.82, r, 48]} />
        <meshBasicMaterial color={ringColor} side={THREE.DoubleSide} />
      </mesh>
      {/* selection halo */}
      {isSelected && (
        <mesh position={[0, 0, 0.002]}>
          <ringGeometry args={[r * 1.35, r * 1.95, 48]} />
          <meshBasicMaterial color="#ff2d3a" transparent opacity={0.55} side={THREE.DoubleSide} />
        </mesh>
      )}
    </group>
  );
}

function Stencil({
  highlightMap,
  selectedKey,
  onSelect,
}: {
  highlightMap: Map<string, { collision: boolean }>;
  selectedKey: string | null;
  onSelect: (key: string) => void;
}) {
  const holes = useMemo(() => {
    const arr: { line: number; hole: number; key: string }[] = [];
    for (let l = 1; l <= N_LINES; l++)
      for (let h = 1; h <= N_HOLES; h++) arr.push({ line: l, hole: h, key: `${l}-${h}` });
    return arr;
  }, []);

  // Horizontal line rings at each lineNum height
  const lineRings = useMemo(() => {
    const arr: number[] = [];
    for (let l = 1; l <= N_LINES; l++) {
      arr.push(HEIGHT / 2 - (l - 1) * (HEIGHT / (N_LINES - 1)));
    }
    return arr;
  }, []);

  return (
    <group>
      {/* Cylinder body (semi-transparent, double-sided) */}
      <mesh>
        <cylinderGeometry args={[RADIUS, RADIUS, HEIGHT, 128, 1, true]} />
        <meshStandardMaterial
          color="#eef1f5"
          roughness={0.75}
          metalness={0.05}
          transparent
          opacity={0.35}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Subtle horizontal line rings */}
      {lineRings.map((y, i) => (
        <mesh key={`lr-${i}`} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[RADIUS + 0.002, 0.005, 8, 128]} />
          <meshBasicMaterial color="#cbd5e1" transparent opacity={0.65} />
        </mesh>
      ))}

      {/* Theta = 0 vertical green line */}
      <mesh position={[RADIUS + 0.012, 0, 0]}>
        <boxGeometry args={[0.012, HEIGHT, 0.012]} />
        <meshBasicMaterial color="#16a34a" />
      </mesh>

      {/* Top + bottom rims */}
      {[HEIGHT / 2, -HEIGHT / 2].map((y, i) => (
        <mesh key={`rim-${i}`} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
          <torusGeometry args={[RADIUS, 0.015, 12, 128]} />
          <meshStandardMaterial color="#94a3b8" roughness={0.5} metalness={0.2} />
        </mesh>
      ))}

      {/* Holes */}
      {holes.map(({ line, hole, key }) => {
        const hit = highlightMap.get(key);
        const isSelected = selectedKey === key;
        const state: "available" | "interest" | "selected" | "collision" = isSelected
          ? "selected"
          : hit?.collision
          ? "collision"
          : hit
          ? "interest"
          : "available";
        return (
          <HoleMark
            key={key}
            lineNum={line}
            holeNum={hole}
            state={state}
            onClick={hit ? () => onSelect(key) : undefined}
          />
        );
      })}
    </group>
  );
}

export function StencilVisualizationCard({ results }: { results: StencilResultRow[] }) {
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideContent, setGuideContent] = useState<{ name: string; text: string } | null>(null);

  const highlightMap = useMemo(() => {
    const m = new Map<string, { collision: boolean }>();
    for (const r of results) {
      const l = Number(r.line_num);
      const h = Number(r.hole_num);
      if (Number.isFinite(l) && Number.isFinite(h)) {
        m.set(`${l}-${h}`, { collision: !!r.stent_collision });
      }
    }
    return m;
  }, [results]);

  const hasResults = results && results.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Visualisation du pochoir</CardTitle>
      </CardHeader>
      <CardContent>
        {!hasResults ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed bg-muted/30 py-16 text-center">
            <MousePointerClick className="mb-3 h-8 w-8 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Aucun trou d'intérêt à visualiser.</p>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
            {/* 3D viewer */}
            <div className="relative h-[620px] overflow-hidden rounded-xl border bg-gradient-to-b from-slate-50 to-slate-100">
              <Canvas
                dpr={[1, 2]}
                camera={{ position: [3.2, 0.8, 4.8], fov: 32 }}
                gl={{ antialias: true, alpha: true }}
              >
                <color attach="background" args={["#f5f7fa"]} />
                <ambientLight intensity={0.8} />
                <directionalLight position={[5, 8, 5]} intensity={0.9} />
                <directionalLight position={[-5, 3, -5]} intensity={0.35} />
                <Suspense fallback={<Html center><span className="text-xs text-muted-foreground">Chargement…</span></Html>}>
                  <Stencil
                    highlightMap={highlightMap}
                    selectedKey={selectedKey}
                    onSelect={setSelectedKey}
                  />
                  <Environment preset="studio" />
                </Suspense>
                <OrbitControls
                  enablePan={false}
                  minDistance={3.5}
                  maxDistance={9}
                  autoRotate
                  autoRotateSpeed={0.5}
                  target={[0, 0, 0]}
                />
              </Canvas>

              {/* Header label */}
              <div className="absolute left-3 top-3 rounded-md bg-white/85 px-2.5 py-1 text-xs font-semibold shadow-sm backdrop-blur">
                Pochoir 3D
                <span className="ml-2 font-normal text-[#16a34a]">θ = 0°</span>
              </div>

              {/* Legend */}
              <div className="absolute bottom-3 left-3 flex items-center gap-4 rounded-lg bg-white/85 px-3 py-2 text-xs shadow-sm backdrop-blur">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-white ring-1 ring-slate-400" />
                  <span className="text-muted-foreground">Disponibles</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full bg-[#ef2b3a] ring-1 ring-[#9b1722]" />
                  <span className="text-muted-foreground">Intérêt</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-block h-3 w-1 rounded-sm bg-[#16a34a]" />
                  <span className="text-muted-foreground">θ = 0°</span>
                </div>
              </div>
            </div>

            {/* Side panel */}
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground">
                Cliquez sur un trou rouge ou sur une carte pour le mettre en évidence.
              </div>
              <div className="max-h-[580px] space-y-2 overflow-y-auto pr-1">
                {results.map((r, i) => {
                  const key = `${Number(r.line_num)}-${Number(r.hole_num)}`;
                  const isSelected = selectedKey === key;
                  return (
                    <button
                      key={i}
                      onClick={() => setSelectedKey(key)}
                      className={`w-full rounded-lg border p-3 text-left transition ${
                        isSelected
                          ? "border-[#e23744] bg-[#e23744]/5 shadow-sm"
                          : "border-border bg-card hover:border-primary/40 hover:bg-muted/40"
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="font-medium">{r.name}</div>
                        {r.stent_collision && (
                          <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">
                            <AlertCircle className="mr-1 h-3 w-3" /> Collision
                          </Badge>
                        )}
                      </div>
                      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <div>Ligne: <span className="font-mono text-foreground">{r.line_num}</span></div>
                        <div>Trou: <span className="font-mono text-foreground">{r.hole_num}</span></div>
                        <div>θ: <span className="font-mono text-foreground">{Number(r.theta_deg).toFixed(1)}°</span></div>
                        <div>s: <span className="font-mono text-foreground">{Number(r.s).toFixed(2)}</span></div>
                        <div>Δh: <span className="font-mono text-foreground">{Number(r.hole_error_height_mm).toFixed(2)} mm</span></div>
                        <div>Δθ: <span className="font-mono text-foreground">{Number(r.hole_error_angular_deg).toFixed(2)}°</span></div>
                      </div>
                      {r.stent_collision && r.stent_collision_message && (
                        <div className="mt-2 text-xs text-destructive">{r.stent_collision_message}</div>
                      )}
                      <div className="mt-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            setGuideContent({ name: r.name, text: r.guide_text ?? "Aucun guide disponible." });
                            setGuideOpen(true);
                          }}
                        >
                          <FileText className="mr-1 h-4 w-4" /> Afficher le guide
                        </Button>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <Dialog open={guideOpen} onOpenChange={setGuideOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Guide — {guideContent?.name}</DialogTitle>
          </DialogHeader>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-4 text-sm">
            {guideContent?.text}
          </pre>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
