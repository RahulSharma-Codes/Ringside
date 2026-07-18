import { Link } from "wouter";
import { AlertCircle, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
      <div className="w-12 h-12 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
        <AlertCircle size={22} className="text-muted-foreground/50" />
      </div>
      <h1 className="text-xl font-bold font-sans tracking-tight text-foreground">Page not found</h1>
      <p className="text-sm font-sans text-muted-foreground mt-1.5 max-w-xs">
        This page doesn't exist or you may not have permission to access it.
      </p>
      <Link href="/">
        <Button variant="outline" size="sm" className="mt-6 gap-2 rounded-xl font-sans">
          <ArrowLeft size={14} /> Back to Dashboard
        </Button>
      </Link>
    </div>
  );
}
