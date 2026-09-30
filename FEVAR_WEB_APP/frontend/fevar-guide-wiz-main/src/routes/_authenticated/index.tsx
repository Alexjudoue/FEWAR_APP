import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Plus, Trash2, Upload, Play, FileText, Activity, CheckCircle2, AlertCircle, Loader2, Heart, BookOpen, ArrowRight, LogOut } from "lucide-react";
import { StencilVisualizationCard } from "@/components/StencilVisualizationCard";

export const Route = createFileRoute("/_authenticated/")({
  head: () => ({
    meta: [
      { title: "FEVAR Planning Assistant" },
      { name: "description", content: "Planification FEVAR — anévrisme de l'aorte en condition d'urgence." },
    ],
  }),
  component: FevarApp,
});

type WindowPoint = { name: string; x: number | ""; y: number | ""; z: number | "" };
type ResultRow = {
  name: string;
  s: number;
  theta_deg: number;
  line_num: number | string;
  hole_num: number | string;
  hole_error_height_mm: number;
  hole_error_angular_deg: number;
  stent_collision: boolean;
  guide_text?: string;
};
type Metadata = {
  reference_idx?: number;
  reference_s_mm?: number;
  centerline_total_length_mm?: number;
  n_centerline_points?: number;
  n_stent_points_checked?: number;
};

const RESULTS_STORAGE_KEY = "fevar:last-results";

function FevarApp() {
  const navigate = useNavigate();
  const [userEmail, setUserEmail] = useState<string>("");
  const [centerlineFile, setCenterlineFile] = useState<File | null>(null);
  const [stentFile, setStentFile] = useState<File | null>(null);
  const [referenceX, setReferenceX] = useState<number | "">("");
  const [referenceY, setReferenceY] = useState<number | "">("");
  const [referenceZ, setReferenceZ] = useState<number | "">("");
  const [windowPoints, setWindowPoints] = useState<WindowPoint[]>([
    { name: "Rénale droite", x: "", y: "", z: "" },
    { name: "Rénale gauche", x: "", y: "", z: "" },
  ]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [results, setResults] = useState<ResultRow[] | null>(null);
  const [metadata, setMetadata] = useState<Metadata | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideContent, setGuideContent] = useState<{ name: string; text: string } | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserEmail(data.user?.email ?? ""));
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  };

  const addPoint = () => setWindowPoints((p) => [...p, { name: "", x: "", y: "", z: "" }]);
  const removePoint = (i: number) => setWindowPoints((p) => p.filter((_, idx) => idx !== i));
  const updatePoint = (i: number, field: keyof WindowPoint, value: string) => {
    setWindowPoints((p) =>
      p.map((pt, idx) =>
        idx === i
          ? { ...pt, [field]: field === "name" ? value : value === "" ? "" : Number(value) }
          : pt,
      ),
    );
  };

  const handleCompute = async () => {
    setError(null);
    setSuccess(null);
    if (!centerlineFile) return setError("Le fichier centerline est obligatoire.");
    if (!stentFile) return setError("Le fichier stent est obligatoire.");
    if (referenceX === "" || referenceY === "" || referenceZ === "")
      return setError("Toutes les coordonnées de référence sont obligatoires.");

    setLoading(true);
    try {
      const formData = new FormData();
      formData.append("centerline_file", centerlineFile);
      if (stentFile) formData.append("stent_file", stentFile);
      formData.append("reference_x", String(referenceX));
      formData.append("reference_y", String(referenceY));
      formData.append("reference_z", String(referenceZ));
      formData.append("window_points_json", JSON.stringify(windowPoints));

      const response = await fetch("https://celery-snuggle-subject.ngrok-free.dev/compute", {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Erreur lors du calcul FEVAR");
      const data = await response.json();
      const res = data.results ?? [];
      setResults(res);
      setMetadata(data.metadata ?? null);
      try {
        localStorage.setItem(RESULTS_STORAGE_KEY, JSON.stringify(res));
      } catch {}
      setSuccess("Calcul effectué avec succès.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Impossible de contacter l'API. Vérifiez que le serveur FastAPI est actif.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Heart className="h-6 w-6" strokeWidth={2.2} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">FEVAR Planning Assistant</h1>
              <p className="text-sm text-muted-foreground">
                Planification d'anévrisme aortique en condition d'urgence
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {userEmail && (
              <span className="hidden text-sm text-muted-foreground md:inline">{userEmail}</span>
            )}
            <Button variant="outline" size="sm" onClick={handleSignOut}>
              <LogOut className="mr-2 h-4 w-4" /> Déconnexion
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 px-6 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <StepBadge n={1} /> Import des fichiers
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <FileField label="Centerline (obligatoire)" file={centerlineFile} onChange={setCenterlineFile} />
            <FileField label="Stent (obligatoire)" file={stentFile} onChange={setStentFile} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <StepBadge n={2} /> Référence θ = 0°
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <CoordField label="reference_x" value={referenceX} onChange={setReferenceX} />
            <CoordField label="reference_y" value={referenceY} onChange={setReferenceY} />
            <CoordField label="reference_z" value={referenceZ} onChange={setReferenceZ} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-lg">
              <StepBadge n={3} /> Points anatomiques
            </CardTitle>
            <Button onClick={addPoint} variant="outline" size="sm">
              <Plus className="mr-1 h-4 w-4" /> Ajouter un point
            </Button>
          </CardHeader>
          <CardContent>
            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Nom</TableHead>
                    <TableHead>x</TableHead>
                    <TableHead>y</TableHead>
                    <TableHead>z</TableHead>
                    <TableHead className="w-16"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {windowPoints.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <Input value={p.name} onChange={(e) => updatePoint(i, "name", e.target.value)} placeholder="Ex: Rénale droite" />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="any" value={p.x} onChange={(e) => updatePoint(i, "x", e.target.value)} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="any" value={p.y} onChange={(e) => updatePoint(i, "y", e.target.value)} />
                      </TableCell>
                      <TableCell>
                        <Input type="number" step="any" value={p.z} onChange={(e) => updatePoint(i, "z", e.target.value)} />
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="icon" onClick={() => removePoint(i)} className="text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {windowPoints.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                        Aucun point. Cliquez sur "Ajouter un point".
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Button size="lg" onClick={handleCompute} disabled={loading} className="h-14 min-w-[260px] text-base">
            {loading ? (<><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Calcul en cours…</>) : (<><Play className="mr-2 h-5 w-5" /> Lancer le calcul</>)}
          </Button>
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Erreur</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {success && !error && (
          <Alert className="border-success/40 bg-success/10 text-foreground">
            <CheckCircle2 className="h-4 w-4 text-success" />
            <AlertTitle>Succès</AlertTitle>
            <AlertDescription>{success}</AlertDescription>
          </Alert>
        )}

        {results && (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <SummaryCard icon={<Activity className="h-5 w-5" />} label="Points calculés" value={String(results.length)} />
              <SummaryCard icon={<CheckCircle2 className="h-5 w-5 text-success" />} label="Sans collision" value={String(results.filter((r) => !r.stent_collision).length)} />
              <SummaryCard icon={<AlertCircle className="h-5 w-5 text-destructive" />} label="Collisions stent" value={String(results.filter((r) => r.stent_collision).length)} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Résultats détaillés</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/50">
                        <TableHead>name</TableHead>
                        <TableHead>s</TableHead>
                        <TableHead>θ°</TableHead>
                        <TableHead>line</TableHead>
                        <TableHead>hole</TableHead>
                        <TableHead>err h (mm)</TableHead>
                        <TableHead>err θ (°)</TableHead>
                        <TableHead>collision</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {results.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell>{fmt(r.s)}</TableCell>
                          <TableCell>{fmt(r.theta_deg)}</TableCell>
                          <TableCell>{r.line_num}</TableCell>
                          <TableCell>{r.hole_num}</TableCell>
                          <TableCell>{fmt(r.hole_error_height_mm)}</TableCell>
                          <TableCell>{fmt(r.hole_error_angular_deg)}</TableCell>
                          <TableCell>
                            {r.stent_collision ? (
                              <Badge className="bg-destructive text-destructive-foreground hover:bg-destructive">Collision</Badge>
                            ) : (
                              <Badge className="bg-success text-success-foreground hover:bg-success">OK</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                setGuideContent({ name: r.name, text: r.guide_text ?? "Aucun guide disponible." });
                                setGuideOpen(true);
                              }}
                            >
                              <FileText className="mr-1 h-4 w-4" /> Guide
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {metadata && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Résumé technique</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  <MetaItem label="reference_idx" value={metadata.reference_idx} />
                  <MetaItem label="reference_s_mm" value={metadata.reference_s_mm} />
                  <MetaItem label="centerline_total_length_mm" value={metadata.centerline_total_length_mm} />
                  <MetaItem label="n_centerline_points" value={metadata.n_centerline_points} />
                  <MetaItem label="n_stent_points_checked" value={metadata.n_stent_points_checked} />
                </CardContent>
              </Card>
            )}

            <StencilVisualizationCard results={results as any} />

            <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-transparent">
              <CardContent className="flex flex-col items-start gap-4 p-6 md:flex-row md:items-center md:justify-between">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <BookOpen className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="text-lg font-semibold">Protocole expérimental détaillé</div>
                    <p className="text-sm text-muted-foreground">
                      Guide opératoire étape par étape : repérage, fenêtrage, renfort + marquage, recompression.
                    </p>
                  </div>
                </div>
                <Button asChild size="lg">
                  <Link to="/protocole">
                    Voir le protocole détaillé <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </>
        )}
      </main>

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
    </div>
  );
}

function StepBadge({ n }: { n: number }) {
  return (
    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground">
      {n}
    </span>
  );
}

function FileField({ label, file, onChange }: { label: string; file: File | null; onChange: (f: File | null) => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-input bg-muted/30 px-4 py-4 text-sm transition hover:bg-muted/60">
        <Upload className="h-5 w-5 text-primary" />
        <span className="flex-1 truncate">{file ? file.name : "Cliquez pour sélectionner un fichier"}</span>
        <input type="file" className="hidden" onChange={(e) => onChange(e.target.files?.[0] ?? null)} />
      </label>
    </div>
  );
}

function CoordField({ label, value, onChange }: { label: string; value: number | ""; onChange: (v: number | "") => void }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input type="number" step="any" value={value} onChange={(e) => onChange(e.target.value === "" ? "" : Number(e.target.value))} placeholder="0.000" />
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">{icon}</div>
        <div>
          <div className="text-sm text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold">{value}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function MetaItem({ label, value }: { label: string; value: number | string | undefined }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 font-mono text-sm">{value ?? "—"}</div>
    </div>
  );
}

function fmt(v: number | undefined | null) {
  if (v === undefined || v === null || Number.isNaN(v)) return "—";
  return typeof v === "number" ? v.toFixed(3) : String(v);
}
