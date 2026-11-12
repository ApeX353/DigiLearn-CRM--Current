import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload, Loader2, ShieldCheck, FileSpreadsheet } from "lucide-react";
import Modal from "~/components/ui/modal";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Input } from "~/components/ui/input";
import { DateField } from "~/components/ui/date-field";
import { useImportLeadsXlsx } from "~/api/leads";
import type { ImportBatch } from "~/api/leads/import-batches";
import {
  useCampaigns,
  useCreateCampaign,
  CAMPAIGN_TYPES,
  CAMPAIGN_TYPE_LABELS,
} from "~/api/campaigns";
import type { CampaignType } from "~/api/campaigns";

interface ImportLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When launched from inside a campaign, leads get attributed to it. */
  campaignId?: string;
  campaignName?: string;
}

/**
 * Import Leads — picks an Excel file and STAGES it for approval. Nothing is
 * created in the CRM here; the server parses + dedup-checks the file into a
 * pending batch that a manager reviews and approves in the Approval Queue.
 */
export function ImportLeadsDialog({
  open,
  onOpenChange,
  campaignId,
  campaignName,
}: ImportLeadsDialogProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [batch, setBatch] = useState<ImportBatch | null>(null);
  const importXlsx = useImportLeadsXlsx();

  // Campaign link (only when NOT launched from inside a campaign):
  //   "" = none · "__new__" = create one inline · else an existing id
  const preset = !!campaignId;
  const campaignsQuery = useCampaigns();
  const createCampaign = useCreateCampaign();
  const [choice, setChoice] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState<CampaignType>("CONFERENCE");
  const [newStart, setNewStart] = useState("");

  const reset = () => {
    setFileName(null);
    setBatch(null);
    setChoice("");
    setNewName("");
    setNewStart("");
    if (fileRef.current) fileRef.current.value = "";
  };

  /** Resolve the campaign id to attribute the import to (creating one if new). */
  const resolveCampaignId = async (): Promise<string | undefined> => {
    if (preset) return campaignId;
    if (choice === "__new__") {
      if (!newName.trim() || !newStart) {
        toast.error("New campaign needs a name and start date");
        throw new Error("campaign-missing-fields");
      }
      const c = await createCampaign.mutateAsync({
        name: newName.trim(),
        type: newType,
        start_date: newStart,
      });
      return c.id;
    }
    return choice || undefined;
  };

  const handleFile = async (file: File) => {
    if (!/\.xlsx$/i.test(file.name)) {
      toast.error("Please choose an Excel (.xlsx) file");
      return;
    }
    let resolvedCampaignId: string | undefined;
    try {
      resolvedCampaignId = await resolveCampaignId();
    } catch {
      return; // a validation error was already surfaced
    }
    setFileName(file.name);
    setBatch(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || "");
      importXlsx.mutate(
        {
          file_base64: dataUrl,
          filename: file.name,
          campaign_id: resolvedCampaignId,
        },
        {
          onSuccess: (res) => {
            setBatch(res.data);
            toast.success("Import staged for approval");
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
      description={
        campaignName
          ? `Upload an Excel (.xlsx). Rows are staged for approval and attributed to "${campaignName}".`
          : "Upload an Excel (.xlsx). Rows are staged for a manager to approve before they become leads."
      }
      size="md"
    >
      <div className="space-y-4">
        {importXlsx.isPending ? (
          <div className="flex flex-col items-center justify-center gap-3 py-10">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <div className="text-sm font-medium">Staging {fileName}…</div>
            <div className="text-xs text-muted-foreground">
              Reading the file and checking for duplicates — please wait.
            </div>
          </div>
        ) : batch ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-primary">
              <ShieldCheck className="h-5 w-5" />
              <span className="font-medium">Staged for approval</span>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-green-100 text-green-800">
                {batch.importable_count} ready to import
              </Badge>
              {batch.duplicate_count > 0 && (
                <Badge className="bg-amber-100 text-amber-800">
                  {batch.duplicate_count} possible duplicate
                  {batch.duplicate_count === 1 ? "" : "s"}
                </Badge>
              )}
              <Badge variant="secondary">{batch.total_rows} rows total</Badge>
            </div>
            <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <strong>Nothing has been added to the CRM yet.</strong> Open the{" "}
              <strong>Approval Queue → Import approvals</strong> to review the
              rows (duplicates are flagged) and approve — only then are the
              leads created.
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
          <div className="space-y-4">
            {/* Campaign link (hidden when launched from inside a campaign). */}
            {!preset && (
              <div className="space-y-2 rounded-lg border p-3">
                <label className="text-sm font-medium">
                  Link to a campaign{" "}
                  <span className="font-normal text-muted-foreground">
                    (optional — leads take this as their Source campaign)
                  </span>
                </label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                  value={choice}
                  onChange={(e) => setChoice(e.target.value)}
                  data-testid="import-campaign-select"
                >
                  <option value="">No campaign</option>
                  {(campaignsQuery.data ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                  <option value="__new__">➕ Create a new campaign…</option>
                </select>
                {choice === "__new__" && (
                  <div className="space-y-2 border-t pt-2">
                    <Input
                      placeholder="Campaign name (e.g. NASH 2026)"
                      value={newName}
                      onChange={(e) => setNewName(e.target.value)}
                      data-testid="import-new-campaign-name"
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <select
                        className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm"
                        value={newType}
                        onChange={(e) =>
                          setNewType(e.target.value as CampaignType)
                        }
                      >
                        {CAMPAIGN_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {CAMPAIGN_TYPE_LABELS[t]}
                          </option>
                        ))}
                      </select>
                      <DateField
                        value={newStart}
                        onChange={setNewStart}
                        required
                      />
                    </div>
                  </div>
                )}
              </div>
            )}
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
