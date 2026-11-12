import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClientAuth, apiErrorMessage } from "~/api/axios";
import { Button } from "~/components/ui/button";

const LIMIT = 1024 * 1024;

export async function prepareScreenshot(file: File): Promise<File> {
  if (
    !["image/png", "image/jpeg"].includes(file.type) ||
    file.size > 12 * LIMIT
  )
    throw new Error(
      "Choose a PNG/JPG screenshot smaller than 12 MiB before compression.",
    );
  const image = await createImageBitmap(file);
  try {
    if (!image.width || !image.height || image.width * image.height > 25000000)
      throw new Error(
        "Screenshot is too large. Crop it to the relevant area first.",
      );
    const scale = Math.min(1, 2048 / Math.max(image.width, image.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Screenshot processing is unavailable in this browser.");
    context.fillStyle = "white";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const encode = (type: string, quality?: number) =>
      new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (blob) =>
            blob
              ? resolve(blob)
              : reject(new Error("Cannot compress screenshot")),
          type,
          quality,
        ),
      );
    let blob = await encode("image/png");
    if (blob.size > LIMIT)
      for (const quality of [0.9, 0.8, 0.7]) {
        blob = await encode("image/jpeg", quality);
        if (blob.size <= LIMIT) break;
      }
    if (blob.size > LIMIT)
      throw new Error("Screenshot still exceeds 1 MiB. Crop it and try again.");
    return new File(
      [blob],
      `${file.name.replace(/\.[^.]*$/, "").slice(0, 170) || "screenshot"}.${blob.type === "image/png" ? "png" : "jpg"}`,
      { type: blob.type },
    );
  } finally {
    image.close();
  }
}

function LocalThumbnail({ file }: { file: File }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const value = URL.createObjectURL(file);
    setUrl(value);
    return () => URL.revokeObjectURL(value);
  }, [file]);
  return (
    <img
      src={url}
      alt={file.name}
      className="max-h-40 max-w-full rounded border object-contain"
    />
  );
}

export function ScreenshotPicker({
  files,
  onChange,
  onBusyChange,
  disabled,
}: {
  files: File[];
  onChange: (files: File[]) => void;
  onBusyChange: (busy: boolean) => void;
  disabled: boolean;
}) {
  const busy = useRef(false),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const add = async (incoming: File[]) => {
    if (disabled || busy.current) return;
    if (files.length + incoming.length > 3) {
      toast.error("Maximum three screenshots per ticket.");
      return;
    }
    busy.current = true;
    onBusyChange(true);
    try {
      const prepared: File[] = [];
      for (const file of incoming) prepared.push(await prepareScreenshot(file));
      if (alive.current) onChange([...files, ...prepared]);
    } catch (error) {
      if (alive.current)
        toast.error(
          error instanceof Error
            ? error.message
            : "Could not prepare screenshot",
        );
    } finally {
      busy.current = false;
      if (alive.current) onBusyChange(false);
    }
  };
  return (
    <section
      className="space-y-3 rounded border p-3"
      aria-label="Bug screenshots"
      onPaste={(event) => {
        const images = Array.from(event.clipboardData.files);
        if (images.length) {
          event.preventDefault();
          void add(images);
        }
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void add(Array.from(event.dataTransfer.files));
      }}
    >
      <label className="block text-sm font-medium" htmlFor="bug-screenshots">
        Screenshots (optional, up to 3)
      </label>
      <p className="text-xs text-muted-foreground">
        Paste here, drop images, or choose PNG/JPG files. Images are compressed
        to 1 MiB each. Check readability and hide private information before
        submitting.
      </p>
      <input
        id="bug-screenshots"
        type="file"
        accept="image/png,image/jpeg"
        multiple
        disabled={disabled || files.length >= 3}
        onChange={(event) => {
          void add(Array.from(event.target.files || []));
          event.target.value = "";
        }}
      />
      {files.map((file, index) => (
        <div key={`${index}-${file.name}`} className="space-y-1">
          <LocalThumbnail file={file} />
          <p className="break-all text-xs">
            {file.name} · {Math.ceil(file.size / 1024)} KB
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled}
            onClick={() => onChange(files.filter((_, i) => i !== index))}
          >
            Remove screenshot {index + 1}
          </Button>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        After 30 days in Done/Closed, management is notified to review deletion.
        Nothing is deleted automatically.
      </p>
    </section>
  );
}

interface Screenshot {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  deleted_at: string | null;
  deleted_by_name: string;
  retention_due_at: string | null;
  eligible: boolean;
}

export function BugScreenshots({ bugId }: { bugId: string }) {
  const qc = useQueryClient();
  const key = ["bug-screenshots", bugId];
  const query = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await apiClientAuth.get(`/bug-reports/${bugId}/screenshots`)).data
        .data as { items: Screenshot[]; canApproveDeletion: boolean },
  });
  const [preview, setPreview] = useState<{
    id: string;
    name: string;
    url: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [approval, setApproval] = useState<Screenshot | null>(null);
  const pending = useRef<AbortController | null>(null),
    currentUrl = useRef<string | null>(null),
    alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      pending.current?.abort();
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
    };
  }, []);
  const show = async (shot: Screenshot) => {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    try {
      const response = await apiClientAuth.get(
        `/bug-reports/${bugId}/screenshots/${shot.id}/content`,
        { responseType: "blob", signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      if (
        !["image/png", "image/jpeg"].includes(response.data.type) ||
        response.data.type !== shot.file_type
      )
        throw new Error("Unsupported image content");
      if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
      currentUrl.current = URL.createObjectURL(response.data);
      setPreview({
        id: shot.id,
        name: shot.file_name,
        url: currentUrl.current,
      });
    } catch (error) {
      if (!controller.signal.aborted)
        toast.error(apiErrorMessage(error, "Cannot load screenshot"));
    } finally {
      pending.current = null;
      if (alive.current) setBusy(false);
    }
  };
  const remove = async () => {
    if (!approval || busy) return;
    setBusy(true);
    try {
      await apiClientAuth.post(
        `/bug-reports/${bugId}/screenshots/${approval.id}/approve-deletion`,
        { confirm: true, expectedDueAt: approval.retention_due_at },
      );
      if (!alive.current) return;
      if (preview?.id === approval.id) {
        if (currentUrl.current) URL.revokeObjectURL(currentUrl.current);
        currentUrl.current = null;
        setPreview(null);
      }
      setApproval(null);
      await qc.invalidateQueries({ queryKey: key });
      toast.success(
        "Screenshot deleted. Ticket and deletion history preserved.",
      );
    } catch (error) {
      if (alive.current) {
        toast.error(apiErrorMessage(error, "Could not delete screenshot"));
        await qc.invalidateQueries({ queryKey: key });
        setApproval(null);
      }
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <section
      className="space-y-3 rounded border p-3"
      aria-label="Ticket screenshots"
    >
      <h3 className="font-medium">Screenshots</h3>
      {query.isLoading ? (
        <p>Loading screenshots…</p>
      ) : query.isError ? (
        <Button variant="outline" onClick={() => void query.refetch()}>
          Retry screenshot list
        </Button>
      ) : !query.data?.items.length ? (
        <p className="text-muted-foreground">
          No screenshots attached to this ticket.
        </p>
      ) : (
        query.data.items.map((shot) => (
          <div key={shot.id} className="space-y-1 border-b pb-2">
            <p className="break-all">
              {shot.file_name} · {Math.ceil(shot.file_size / 1024)} KB
            </p>
            {shot.deleted_at ? (
              <p className="text-xs text-muted-foreground">
                Deleted {new Date(shot.deleted_at).toLocaleString()} by{" "}
                {shot.deleted_by_name || "management"}. Ticket history retained.
              </p>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void show(shot)}
                >
                  View screenshot
                </Button>
                {shot.retention_due_at && (
                  <p className="text-xs">
                    Deletion review{" "}
                    {shot.eligible
                      ? "is available"
                      : `after ${new Date(shot.retention_due_at).toLocaleDateString()}`}
                    . Approval required.
                  </p>
                )}
                {shot.eligible && query.data?.canApproveDeletion && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={busy}
                    onClick={() => setApproval(shot)}
                  >
                    Review deletion
                  </Button>
                )}
              </>
            )}
          </div>
        ))
      )}
      {preview && (
        <div className="space-y-2">
          <img
            src={preview.url}
            alt={preview.name}
            className="max-h-[60vh] w-full object-contain"
          />
          <a
            href={preview.url}
            download={preview.name}
            className="text-primary underline"
          >
            Download screenshot
          </a>
        </div>
      )}
      {approval && (
        <div
          role="alertdialog"
          aria-label="Confirm screenshot deletion"
          className="space-y-2 rounded border border-destructive p-3"
        >
          <p>
            Delete only <strong>{approval.file_name}</strong>? Its image will be
            removed from the CRM; ticket text, notes and deletion history stay.
            Retained backups may still contain the image.
          </p>
          <Button
            variant="destructive"
            disabled={busy}
            onClick={() => void remove()}
          >
            Confirm deletion
          </Button>{" "}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => setApproval(null)}
          >
            Keep screenshot
          </Button>
        </div>
      )}
    </section>
  );
}
