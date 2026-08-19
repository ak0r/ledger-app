import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-4 text-center">
      <h2 className="text-lg font-semibold">Page not found</h2>
      <p className="text-sm text-muted-foreground">
        That page doesn&apos;t exist, or the item it refers to may have been deleted.
      </p>
      <Link href="/" className={buttonVariants()}>
        Go home
      </Link>
    </div>
  );
}
