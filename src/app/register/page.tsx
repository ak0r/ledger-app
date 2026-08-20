import Link from "next/link";
import { RegisterForm } from "@/components/register-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

export default function RegisterPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          An AppUser can create and own multiple Families, each with its own isolated data.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Register</CardTitle>
        </CardHeader>
        <CardContent>
          <RegisterForm />
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="text-foreground underline underline-offset-4">
          Log in
        </Link>
      </p>
    </main>
  );
}
