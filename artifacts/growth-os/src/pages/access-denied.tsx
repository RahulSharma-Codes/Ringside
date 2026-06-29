import { ShieldOff } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export default function AccessDenied() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 px-4 text-center">
      <div className="flex flex-col items-center gap-3">
        <ShieldOff className="h-12 w-12 text-destructive/70" />
        <h1 className="font-mono uppercase tracking-widest text-xl font-semibold">
          Access Denied
        </h1>
        <p className="text-sm text-muted-foreground max-w-sm">
          You don't have permission to view this page. This area is restricted to Admins only.
          Contact your administrator if you believe this is an error.
        </p>
      </div>
      <Link href="/">
        <Button variant="outline" className="font-mono text-xs uppercase tracking-wider rounded-sm">
          ← Back to Dashboard
        </Button>
      </Link>
    </div>
  );
}
