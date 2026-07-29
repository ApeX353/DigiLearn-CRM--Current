import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2, CheckCircle2, FileSpreadsheet } from "lucide-react";
import Modal from "~/components/ui/modal";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import {
  useImportLeadsXlsx,
  type LeadImportSummary,
} from "~/api/leads";

interface ImportLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Kim's "Import Leads" flow: pick an Excel file, it uploads with a loading
 * screen, the server parses and creates the leads, and the result is shown
 * (and the leads land under New, unassigned, ready for auto-assign).
 */
export function ImportLeadsDialog({
  open,
  onOpenChange,
}: ImportLeadsDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [summary, setSummary] = useState<LeadImportSummary | null>(null);
  const importXlsx = useImportLeadsXlsx();

  const reset = () => {
    setFileName(null);
    setSummary(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const handleFile = (file: File) => {
    if (!/\.xlsx$/i.test(file.name)) {
      toast.error("Please choose an Excel (.xlsx) file");
      return;
    }
    setFileName(file.name);
    setSummary(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      importXlsx.mutate(
        { file_base64: dataUrl, filename: file.name },
        {
          onSuccess: (res) => {
            setSummary(res.data);
            toast.success(
              `Imported ${res.data.created} lead${res.data.created === 1 ? "" : "s"}`,
            );
          },
          onError: (err: any) =>
            toast.error(
              err?.response?.data?.message || "Could not import that file",
            ),
        },
      );
    };
    reader.onerror = () => toast.error("Could not read that file");
    reader.readAsDataURL(file);
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => {
        if (!importXlsx.isPending) {
          reset();
          onOpenChange(false);
        }
      }}
      title="Import Leads"
      description="Upload an Excel (.xlsx) file. Each row becomes a new, unassigned lead ready for auto-assign."
      size="md"
    >
      <div className="space-y-4">
        {/* Uploading — the loading screen */}
        {importXlsx.isPending ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-sm font-medium">Importing {fileName}…</div>
            <div className="text-xs text-muted-foreground">
              Reading the file and creating leads — please wait.
            </div>
          </div>
        ) : summary ? (
          /* Result */
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-5 w-5" />
              <span className="font-medium">Import complete</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-green-100 text-green-800">
                {summary.created} created
              </Badge>
              {summary.skipped > 0 && (
                <Badge variant="secondary">{summary.skipped} skipped</Badge>
              )}
              {summary.failed > 0 && (
                <Badge className="bg-rose-100 text-rose-800">
                  {summary.failed} failed
                </Badge>
              )}
            </div>
            {summary.rows.filter((r) => r.status !== "created").length > 0 && (
              <div className="max-h-40 overflow-auto rounded border p-2 text-xs">
                {summary.rows
                  .filter((r) => r.status !== "created")
                  .slice(0, 40)
                  .map((r) => (
                    <div key={r.row} className="text-muted-foreground">
                      Row {r.row}: {r.school} — {r.status} ({r.reason})
                    </div>
                  ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              The new leads are under <strong>New</strong>, unassigned. Filter
              to New and run auto-assign to distribute them.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={reset}>
                Import another
              </Button>
              <Button
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : (
          /* File picker */
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed py-10 hover:bg-muted/40"
              data-testid="import-leads-picker"
            >
              <FileSpreadsheet className="h-8 w-8 text-muted-foreground" />
              <span className="text-sm font-medium">
                {fileName ?? "Choose an Excel file (.xlsx)"}
              </span>
              <span className="text-xs text-muted-foreground">
                Click to browse your computer
              </span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <div className="flex justify-end">
              <Button
                onClick={() => fileRef.current?.click()}
                data-testid="import-leads-browse"
              >
                <Upload className="mr-1.5 h-4 w-4" />
                Choose file
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
