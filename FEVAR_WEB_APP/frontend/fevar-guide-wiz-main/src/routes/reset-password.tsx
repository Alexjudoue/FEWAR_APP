import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("Les mots de passe ne correspondent pas.");
    if (password.length < 6) return setError("Mot de passe trop court (min. 6 caractères).");
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => navigate({ to: "/auth" }), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-sky-50 via-background to-blue-50 px-4 py-10">
      <div className="mx-auto max-w-md">
        <Card className="shadow-lg">
          <CardHeader>
            <CardTitle>Nouveau mot de passe</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label>Nouveau mot de passe</Label>
                <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Confirmation</Label>
                <Input type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
              </div>
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
                  <AlertTitle>Mot de passe mis à jour</AlertTitle>
                  <AlertDescription>Redirection vers la connexion…</AlertDescription>
                </Alert>
              )}
              <Button type="submit" className="w-full" disabled={loading || success}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Mettre à jour
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
