"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function signIn(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const email = String(formData.get("email") || "");
      const password = String(formData.get("password") || "");
      const supabase = createSupabaseBrowserClient();

      if (!supabase) {
        router.push("/dashboard");
        return;
      }

      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        setMessage(error.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  function signUp(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const email = String(formData.get("email") || "");
      const password = String(formData.get("password") || "");
      const supabase = createSupabaseBrowserClient();

      if (!supabase) {
        router.push("/dashboard");
        return;
      }

      const { error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMessage(error.message);
        return;
      }
      setMessage("Check your email if confirmations are enabled, or sign in now.");
    });
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Sign in</CardTitle>
        <CardDescription>Use Supabase Auth, or continue into demo mode when env vars are empty.</CardDescription>
      </CardHeader>
      <form>
        <CardContent>
          <FieldGroup>
            <Field>
              <FieldLabel htmlFor="email">Email</FieldLabel>
              <Input id="email" name="email" type="email" defaultValue="demo@vaani.local" required />
            </Field>
            <Field>
              <FieldLabel htmlFor="password">Password</FieldLabel>
              <Input id="password" name="password" type="password" minLength={6} required />
              <FieldDescription>Supabase email/password auth is used when configured.</FieldDescription>
            </Field>
            {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}
          </FieldGroup>
        </CardContent>
        <CardFooter>
          <Button type="submit" formAction={signIn} disabled={isPending}>
            {isPending ? "Working..." : "Sign in"}
          </Button>
          <Button type="submit" formAction={signUp} variant="outline" disabled={isPending}>
            Create account
          </Button>
        </CardFooter>
      </form>
    </Card>
  );
}
