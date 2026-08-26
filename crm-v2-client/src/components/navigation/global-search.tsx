import { Search } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { Input } from "~/components/ui/input";
import { Kbd } from "~/components/ui/kbd";
import { cn } from "~/lib/utils";

/**
 * GlobalSearch — topbar search input used for quick keyword jumps.
 *
 * Keeps things conservative: pressing Enter routes to the Leads list
 * with the query pre-applied as a URL param (`?search=`), which already
 * works with the existing leads-management-page filter. No server call
 * is issued from here, so the component is safe to ship even if the
 * backend search endpoint evolves separately.
 *
 * Keyboard shortcut: Cmd/Ctrl+K focuses the input.
 */
export function GlobalSearch({
  className,
  placeholder = "Search leads, deals, schools…",
}: {
  className?: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const el = document.getElementById("global-search-input");
        (el as HTMLInputElement | null)?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const submit = () => {
    const q = value.trim();
    if (!q) return;
    navigate(`/leads?search=${encodeURIComponent(q)}`);
  };

  return (
    <div
      className={cn(
        "relative hidden md:flex items-center w-full max-w-sm",
        className,
      )}
    >
      <Search className="pointer-events-none absolute left-3 h-4 w-4 text-muted-foreground" />
      <Input
        id="global-search-input"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
        placeholder={placeholder}
        className="h-9 pl-9 pr-14 bg-muted/60 border-transparent focus-visible:bg-background focus-visible:border-input transition-colors"
        aria-label="Search the CRM"
      />
      <Kbd className="absolute right-2 hidden lg:flex text-[10px] h-5 px-1.5 pointer-events-none">
        ⌘K
      </Kbd>
    </div>
  );
}
