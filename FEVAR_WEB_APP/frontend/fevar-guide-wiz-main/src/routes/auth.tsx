import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Heart, Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Connexion — FEVAR Planning Assistant" },
      { name: "description", content: "Connexion à FEVAR Planning Assistant." },
    ],
  }),
  component: AuthPage,
});

type Mode = "login" | "signup" | "reset";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/" });
      } else if (mode === "signup") {
        if (password !== confirm) throw new Error("Les mots de passe ne correspondent pas.");
        if (password.length < 6) throw new Error("Le mot de passe doit contenir au moins 6 caractères.");
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/` },
        });
        if (error) throw error;
        setSuccess(
          "Un email de confirmation vient de vous être envoyé. Veuillez confirmer votre inscription avant de vous connecter.",
        );
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setSuccess("Si un compte existe, un email de réinitialisation a été envoyé.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur d'authentification.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-background to-blue-50 px-4 py-10">
      <div className="mx-auto flex max-w-md flex-col items-center">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
            <Heart className="h-8 w-8" strokeWidth={2.2} />
          </div>
          <h1 className="text-5xl font-bold tracking-tight text-foreground">FEVAR</h1>
          <p className="mt-2 text-lg font-medium text-muted-foreground">Planning Assistant</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Planification d'anévrisme aortique en condition d'urgence
          </p>
        </div>

        <Card className="w-full shadow-lg">
          <CardHeader>
            <CardTitle className="text-center text-xl">
              {mode === "login" && "Se connecter"}
              {mode === "signup" && "Créer un compte"}
              {mode === "reset" && "Réinitialiser le mot de passe"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Adresse email</Label>
                <Input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="vous@hopital.fr"
                  autoComplete="email"
                />
              </div>

              {mode !== "reset" && (
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <Input
                    id="password"
                    type="password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                  />
                </div>
              )}

              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="confirm">Confirmation du mot de passe</Label>
                  <Input
                    id="confirm"
                    type="password"
                    required
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    autoComplete="new-password"
                  />
                </div>
              )}

              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Erreur</AlertTitle>
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              {success && (
                <Alert className="border-success/40 bg-success/10">
                  <CheckCircle2 className="h-4 w-4 text-success" />
                  <AlertTitle>Succès</AlertTitle>
                  <AlertDescription>{success}</AlertDescription>
                </Alert>
              )}

              <Button type="submit" className="h-11 w-full text-base" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Veuillez patienter…
                  </>
                ) : mode === "login" ? (
                  "Se connecter"
                ) : mode === "signup" ? (
                  "Créer mon compte"
                ) : (
                  "Envoyer le lien de réinitialisation"
                )}
              </Button>

              {mode === "login" && (
                <div className="space-y-2 pt-2 text-center text-sm">
                  <div>
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => {
                        setMode("reset");
                        setError(null);
                        setSuccess(null);
                      }}
                    >
                      Mot de passe oublié ?
                    </button>
                  </div>
                  <div className="text-muted-foreground">
                    Première utilisation ?{" "}
                    <button
                      type="button"
                      className="font-medium text-primary hover:underline"
                      onClick={() => {
                        setMode("signup");
                        setError(null);
                        setSuccess(null);
                      }}
                    >
                      Créer un compte
                    </button>
                  </div>
                </div>
              )}

              {mode !== "login" && (
                <div className="pt-2 text-center text-sm">
                  <button
                    type="button"
                    className="text-primary hover:underline"
                    onClick={() => {
                      setMode("login");
                      setError(null);
                      setSuccess(null);
                    }}
                  >
                    ← Retour à la connexion
                  </button>
                </div>
              )}
            </form>
          </CardContent>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Application médicale destinée à un usage professionnel encadré.
        </p>
      </div>
    </div>
  );
}
