import { useEffect, useRef, useState } from "react";
import type { AxiosProgressEvent } from "axios";
import { useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { FileUpload } from "~/components/ui/file-upload";
import { ALLOWED_CONTENT_TYPES, useFiles } from "~/api/files";
import { apiClientAuth, handleApiError } from "~/api/axios";
import type { FileEntityType, FileRecord } from "~/api/files";
import { Skeleton } from "~/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";

const previewTypes = ["application/pdf", "image/jpeg", "image/png"];
const percentage = (event: AxiosProgressEvent) =>
  event.total && event.total > 0
    ? Math.min(100, Math.max(0, Math.floor((event.loaded / event.total) * 100)))
    : null;

interface FilesTabProps {
  entityId: string;
  entity: FileEntityType;
  isReadonly?: boolean;
}

export function FilesTab({
  entityId,
  entity,
  isReadonly = false,
}: FilesTabProps) {
  const queryClient = useQueryClient();
  const [transfer, setTransfer] = useState<{
    id: string;
    purpose: "preview" | "download";
    progress: number | null;
  } | null>(null);
  const [preview, setPreview] = useState<{
    file: FileRecord;
    url?: string;
    error?: string;
  } | null>(null);
  const pending = useRef<AbortController | null>(null);
  const previewUrl = useRef<string | null>(null);
  const releasePreview = () => {
    if (previewUrl.current) URL.revokeObjectURL(previewUrl.current);
    previewUrl.current = null;
  };
  useEffect(() => {
    setPreview(null);
    setTransfer(null);
    return () => {
      pending.current?.abort();
      pending.current = null;
      releasePreview();
    };
  }, [entity, entityId]);
  const closePreview = () => {
    pending.current?.abort();
    pending.current = null;
    releasePreview();
    setPreview(null);
    setTransfer(null);
  };
  const { data: existingFiles, isLoading } = useFiles({
    page: 1,
    limit: 25,
    entity_type: entity,
    entity_id: entityId,
  });

  const savedFiles = existingFiles?.data || [];

  const uploadFile = async (
    file: File,
    onProgress?: (percent: number | null) => void,
  ) => {
    const body = new FormData();
    body.append("entity_type", entity);
    body.append("entity_id", entityId);
    body.append("file", file);
    const response = await apiClientAuth
      .post<{ data: FileRecord }>("/file-manager/content", body, {
        headers: { "Content-Type": undefined },
        onUploadProgress: (event) => onProgress?.(percentage(event)),
      })
      .catch((error) => {
        throw new Error(handleApiError(error));
      });
    // Metadata is already committed with the bytes: no second save request.
    void queryClient.invalidateQueries({ queryKey: ["files"] });
    return { url: response.data.data.file_url };
  };

  const fetchFile = async (
    file: FileRecord,
    purpose: "preview" | "download",
  ) => {
    if (pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setTransfer({ id: file.id, purpose, progress: null });
    if (purpose === "preview") {
      releasePreview();
      setPreview({ file });
    }
    try {
      const response = await apiClientAuth.get(
        `/file-manager/${file.id}/content`,
        {
          responseType: "blob",
          signal: controller.signal,
          onDownloadProgress: (event) => {
            if (!controller.signal.aborted)
              setTransfer({
                id: file.id,
                purpose,
                progress: percentage(event),
              });
          },
        },
      );
      if (controller.signal.aborted) return;
      // Never render arbitrary HTML/SVG or guess a safe type from a filename.
      if (
        purpose === "preview" &&
        (!previewTypes.includes(response.data.type) ||
          response.data.type !== file.file_type)
      ) {
        throw new Error(
          "This file type cannot be previewed safely. Please download it instead.",
        );
      }
      const url = URL.createObjectURL(response.data);
      if (purpose === "preview") {
        previewUrl.current = url;
        setPreview({ file, url });
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.file_name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      if (!controller.signal.aborted) {
        if (purpose === "preview")
          setPreview({
            file,
            error:
              "Preview unavailable. Close this window and try Download instead.",
          });
        else toast.error("Could not download this file. Please try again.");
      }
    } finally {
      if (pending.current === controller) {
        pending.current = null;
        setTransfer(null);
      }
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
          <CardDescription>
            Upload and store documents for this {entity}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileUpload
            key={`${entity}:${entityId}`}
            uploadFile={uploadFile}
            maxSize={10 * 1024 * 1024}
            accept={Object.fromEntries(
              ALLOWED_CONTENT_TYPES.map((type) => [
                type.type,
                type.extensions.map((extension) => `.${extension}`),
              ]),
            )}
            subLabel="PDF, DOCX, XLSX, JPG or PNG — up to 10 MiB per file"
            onUploadError={(error) => toast.error(error.message)}
            disabled={isReadonly}
          />
          {isReadonly && (
            <p className="text-xs text-muted-foreground">
              Upload is disabled because this {entity} is read-only.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">Recent uploads</CardTitle>
            <CardDescription>
              {savedFiles.length} file{savedFiles.length === 1 ? "" : "s"}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-4 w-full mb-2" />
            ))
          ) : savedFiles.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <FileText className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>No files uploaded yet</p>
              <p className="text-sm">
                Upload proposals, contracts, and attachments.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {savedFiles.map((file) => (
                <div
                  key={file.id}
                  className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="break-all text-sm font-medium">
                        {file.file_name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {file.file_type || "Unknown type"} -{" "}
                        {file.file_size ?? 0} bytes
                      </p>
                    </div>
                  </div>
                  {file.provider === "database" ? (
                    <div className="min-w-32 space-y-2">
                      <div className="flex gap-3">
                        {previewTypes.includes(file.file_type || "") && (
                          <button
                            type="button"
                            disabled={transfer !== null}
                            onClick={() => void fetchFile(file, "preview")}
                            className="text-sm text-primary underline-offset-4 hover:underline disabled:opacity-50"
                          >
                            Preview
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={transfer !== null}
                          onClick={() => void fetchFile(file, "download")}
                          className="text-sm text-primary underline-offset-4 hover:underline disabled:opacity-50"
                        >
                          {transfer?.id === file.id &&
                          transfer.purpose === "download"
                            ? "Downloading..."
                            : "Download"}
                        </button>
                      </div>
                      {!previewTypes.includes(file.file_type || "") && (
                        <p className="text-xs text-muted-foreground">
                          Download to view this file type
                        </p>
                      )}
                      {transfer?.id === file.id && (
                        <div className="space-y-1">
                          <progress
                            aria-label={`Download progress for ${file.file_name}`}
                            max={100}
                            value={transfer.progress ?? undefined}
                            className="h-2 w-full accent-primary"
                          />
                          <p
                            className="text-xs text-muted-foreground"
                            role="status"
                          >
                            {transfer.purpose === "preview"
                              ? "Loading preview"
                              : "Downloading"}
                            {transfer.progress == null
                              ? "..."
                              : ` ${transfer.progress}%`}
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <a
                      href={file.file_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-primary underline-offset-4 hover:underline"
                    >
                      View
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
      <Dialog
        open={preview !== null}
        onOpenChange={(open) => {
          if (!open) closePreview();
        }}
      >
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle className="break-all pr-6">
              {preview?.file.file_name || "File preview"}
            </DialogTitle>
            <DialogDescription>
              Private preview. PDFs and JPG/PNG images are supported. If your
              browser cannot display a PDF, use Download.
            </DialogDescription>
          </DialogHeader>
          {preview?.error ? (
            <p role="alert">{preview.error}</p>
          ) : preview?.url ? (
            preview.file.file_type === "application/pdf" ? (
              <iframe
                title={`Preview of ${preview.file.file_name}`}
                src={preview.url}
                className="h-[65vh] w-full rounded border"
                referrerPolicy="no-referrer"
              />
            ) : (
              <img
                alt={preview.file.file_name}
                src={preview.url}
                className="max-h-[65vh] w-full object-contain"
                onError={() =>
                  setPreview((current) =>
                    current
                      ? {
                          ...current,
                          error:
                            "Image preview unavailable. Please download the file instead.",
                        }
                      : null,
                  )
                }
              />
            )
          ) : (
            preview && (
              <div className="space-y-2 py-8" role="status">
                <p>
                  Loading preview
                  {transfer?.progress == null
                    ? "..."
                    : ` ${transfer.progress}%`}
                </p>
                <progress
                  aria-label="Preview loading progress"
                  max={100}
                  value={transfer?.progress ?? undefined}
                  className="h-2 w-full accent-primary"
                />
              </div>
            )
          )}
          {preview?.url && (
            <a
              href={preview.url}
              download={preview.file.file_name}
              className="text-sm text-primary underline"
            >
              Download this file
            </a>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
