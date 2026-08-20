import Link from "next/link";
import { LoginForm } from "@/components/login-form";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

// SQLite is a live local resource — never statically prerender a route that
// reads it (docs/06-architecture.md).
export const dynamic = "force-dynamic";

export default async function LoginPage(props: PageProps<"/login">) {
  const searchParams = await props.searchParams;
  const next = typeof searchParams.next === "string" ? searchParams.next : undefined;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-4">
      <div>
        <h1 className="text-xl font-semibold">Log in</h1>
        <p className="text-sm text-muted-foreground">Welcome back to Ledger.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Login</CardTitle>
        </CardHeader>
        <CardContent>
          <LoginForm next={next} />
        </CardContent>
      </Card>

      <p className="text-center text-sm text-muted-foreground">
        Need an account?{" "}
        <Link href="/register" className="text-foreground underline underline-offset-4">
          Register
        </Link>
      </p>
    </main>
  );
}
