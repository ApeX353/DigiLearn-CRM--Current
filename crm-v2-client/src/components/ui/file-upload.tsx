import * as React from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { PutBlobResult } from "@vercel/blob";
import { upload } from "@vercel/blob/client";
import { useDropzone, type Accept, type FileRejection } from "react-dropzone";
import { AlertCircle, FileText, GripVertical, Upload, X } from "lucide-react";

import { Button } from "~/components/ui/button";
import { Spinner } from "~/components/ui/spinner";
import { cn } from "~/lib/utils";
import { useAuthStore } from "~/stores/use-auth-store";

export type FileUploadItem = {
  id: string;
  file: File;
};

export type BlobUploadResult = {
  id: string;
  file: File;
  blob: PutBlobResult;
  refUrl: string;
};

type UploadStatus = "idle" | "uploading" | "success" | "error";

type UploadState = {
  status: UploadStatus;
  error?: string;
  blob?: PutBlobResult;
};

export interface FileUploadProps extends Omit<
  React.ComponentProps<"div">,
  "defaultValue"
> {
  value?: FileUploadItem[];
  defaultValue?: FileUploadItem[];
  onValueChange?: (items: FileUploadItem[]) => void;
  onFilesChange?: (files: File[]) => void;
  onDropRejected?: (rejections: FileRejection[]) => void;
  autoUpload?: boolean;
  uploadUrl?: string;
  uploadPathname?: (file: File) => string;
  onUploadComplete?: (results: BlobUploadResult[]) => void;
  onUploadError?: (error: Error, file: File) => void;
  accept?: Accept;
  maxSize?: number;
  maxFiles?: number;
  multiple?: boolean;
  disabled?: boolean;
  allowReorder?: boolean;
  allowRemove?: boolean;
  label?: string;
  subLabel?: string;
  dropzoneClassName?: string;
  listClassName?: string;
  itemClassName?: string;
}

const createId = () => {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `file_${Date.now()}_${Math.random().toString(16).slice(2)}`;
};

const formatBytes = (bytes?: number) => {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const value = bytes / Math.pow(k, i);
  const digits = value >= 10 || i === 0 ? 0 : 1;
  return `${value.toFixed(digits)} ${sizes[i]}`;
};

const formatAccept = (accept?: Accept) => {
  if (!accept) return "";
  const labels = new Set<string>();
  Object.entries(accept).forEach(([type, extensions]) => {
    if (type?.trim()) {
      labels.add(type.replace("/*", ""));
    }
    extensions?.forEach((extension) => {
      if (extension?.trim()) labels.add(extension);
    });
  });
  return Array.from(labels).join(", ");
};

const resolveUploadUrl = (override?: string) => {
  if (override) return override;
  const envUrl = import.meta.env.VITE_BLOB_UPLOAD_URL;
  if (envUrl) return envUrl;
  const apiUrl =
    import.meta.env.VITE_PUBLIC_API_URL ?? import.meta.env.VITE_API_URL;
  if (!apiUrl) return "";
  return `${apiUrl.replace(/\/$/, "")}/file-manager/upload`;
};

interface FileRowProps {
  item: FileUploadItem;
  onRemove: (id: string) => void;
  allowRemove: boolean;
  uploadState?: UploadState;
  className?: string;
}

function FileRow({
  item,
  onRemove,
  allowRemove,
  uploadState,
  className,
}: FileRowProps) {
  const statusLabel =
    uploadState?.status === "uploading"
      ? "Uploading..."
      : uploadState?.status === "success"
        ? "Uploaded"
        : uploadState?.status === "error"
          ? (uploadState.error ?? "Upload failed")
          : null;
  const statusClassName =
    uploadState?.status === "success"
      ? "text-emerald-600"
      : uploadState?.status === "error"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border bg-card p-3 shadow-xs",
        className,
      )}
    >
      <span className="inline-flex size-8 items-center justify-center rounded-md border bg-muted text-muted-foreground">
        <FileText className="size-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {item.file.name}
        </p>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {formatBytes(item.file.size)}
          </span>
          {statusLabel && (
            <span
              className={cn("inline-flex items-center gap-1", statusClassName)}
            >
              {uploadState?.status === "uploading" && (
                <Spinner className="size-3" />
              )}
              {statusLabel}
            </span>
          )}
        </div>
      </div>
      {allowRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.file.name}`}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}

function SortableFileRow({
  item,
  onRemove,
  allowRemove,
  uploadState,
  className,
}: FileRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const statusLabel =
    uploadState?.status === "uploading"
      ? "Uploading..."
      : uploadState?.status === "success"
        ? "Uploaded"
        : uploadState?.status === "error"
          ? (uploadState.error ?? "Upload failed")
          : null;
  const statusClassName =
    uploadState?.status === "success"
      ? "text-emerald-600"
      : uploadState?.status === "error"
        ? "text-destructive"
        : "text-muted-foreground";

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-3 rounded-md border bg-card p-3 shadow-xs transition-shadow",
        isDragging && "opacity-70 shadow-md",
        className,
      )}
    >
      <button
        type="button"
        className="inline-flex size-8 items-center justify-center rounded-md border bg-muted text-muted-foreground cursor-grab active:cursor-grabbing"
        {...attributes}
        {...listeners}
        aria-label={`Reorder ${item.file.name}`}
      >
        <GripVertical className="size-4" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">
          {item.file.name}
        </p>
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted-foreground">
            {formatBytes(item.file.size)}
          </span>
          {statusLabel && (
            <span
              className={cn("inline-flex items-center gap-1", statusClassName)}
            >
              {uploadState?.status === "uploading" && (
                <Spinner className="size-3" />
              )}
              {statusLabel}
            </span>
          )}
        </div>
      </div>
      {allowRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-foreground"
          onClick={() => onRemove(item.id)}
          aria-label={`Remove ${item.file.name}`}
        >
          <X className="size-4" />
        </Button>
      )}
    </div>
  );
}

export function FileUpload({
  value,
  defaultValue = [],
  onValueChange,
  onFilesChange,
  onDropRejected,
  autoUpload = true,
  uploadUrl,
  uploadPathname,
  onUploadComplete,
  onUploadError,
  accept,
  maxSize,
  maxFiles,
  multiple = true,
  disabled = false,
  allowReorder = true,
  allowRemove = true,
  label = "Drag & drop files here, or click to browse",
  subLabel,
  dropzoneClassName,
  listClassName,
  itemClassName,
  className,
  ...props
}: FileUploadProps) {
  const isControlled = value !== undefined;
  const [internalItems, setInternalItems] =
    React.useState<FileUploadItem[]>(defaultValue);
  const [rejections, setRejections] = React.useState<FileRejection[]>([]);
  const [uploadState, setUploadState] = React.useState<
    Record<string, UploadState>
  >({});
  const [uploadConfigError, setUploadConfigError] = React.useState<
    string | null
  >(null);
  const resolvedUploadUrl = React.useMemo(
    () => resolveUploadUrl(uploadUrl),
    [uploadUrl],
  );
  const items = isControlled ? (value ?? []) : internalItems;

  const updateItems = React.useCallback(
    (nextItems: FileUploadItem[]) => {
      if (!isControlled) {
        setInternalItems(nextItems);
      }
      setUploadState((prev) => {
        const next: Record<string, UploadState> = {};
        nextItems.forEach((item) => {
          if (prev[item.id]) {
            next[item.id] = prev[item.id];
          }
        });
        return next;
      });
      onValueChange?.(nextItems);
      onFilesChange?.(nextItems.map((item) => item.file));
    },
    [isControlled, onValueChange, onFilesChange],
  );

  const startUploads = React.useCallback(
    async (incomingItems: FileUploadItem[]) => {
      if (!autoUpload || incomingItems.length === 0) return;
      if (!resolvedUploadUrl) {
        setUploadConfigError(
          "Missing upload URL. Provide uploadUrl or set VITE_BLOB_UPLOAD_URL.",
        );
        return;
      }

      setUploadConfigError(null);
      setUploadState((prev) => {
        const next = { ...prev };
        incomingItems.forEach((item) => {
          next[item.id] = { status: "uploading" };
        });
        return next;
      });

      const results = await Promise.all(
        incomingItems.map(async (item) => {
          try {
            const pathname = uploadPathname
              ? uploadPathname(item.file)
              : item.file.name;
            const blob = await upload(pathname, item.file, {
              access: "public",
              handleUploadUrl: resolvedUploadUrl,
              contentType: item.file.type || undefined,
              headers: {
                Authorization: `Bearer ${useAuthStore.getState().token}`, // ✅ Pass your JWT
              },
            });
            setUploadState((prev) => ({
              ...prev,
              [item.id]: { status: "success", blob },
            }));
            return {
              id: item.id,
              file: item.file,
              blob,
              refUrl: blob.url,
            };
          } catch (error) {
            const resolvedError =
              error instanceof Error ? error : new Error("Upload failed");
            setUploadState((prev) => ({
              ...prev,
              [item.id]: { status: "error", error: resolvedError.message },
            }));
            onUploadError?.(resolvedError, item.file);
            return null;
          }
        }),
      );

      const completed = results.filter((result): result is BlobUploadResult =>
        Boolean(result),
      );
      if (completed.length > 0) {
        onUploadComplete?.(completed);
      }
    },
    [
      autoUpload,
      onUploadComplete,
      onUploadError,
      resolvedUploadUrl,
      uploadPathname,
    ],
  );

  const handleDrop = React.useCallback(
    (acceptedFiles: File[], droppedRejections: FileRejection[]) => {
      setRejections(droppedRejections);
      if (droppedRejections.length > 0) {
        onDropRejected?.(droppedRejections);
      }

      if (acceptedFiles.length === 0) return;

      const incoming = acceptedFiles.map((file) => ({
        id: createId(),
        file,
      }));

      let nextItems =
        multiple === false || maxFiles === 1
          ? incoming.slice(0, 1)
          : [...items, ...incoming];

      if (typeof maxFiles === "number" && maxFiles > 0) {
        nextItems = nextItems.slice(0, maxFiles);
      }

      const uploadCandidates = incoming.filter((item) =>
        nextItems.some((next) => next.id === item.id),
      );

      updateItems(nextItems);
      void startUploads(uploadCandidates);
    },
    [items, maxFiles, multiple, onDropRejected, startUploads, updateItems],
  );

  const acceptLabel = formatAccept(accept);
  const defaultSubLabel = React.useMemo(() => {
    const parts: string[] = [];
    if (maxFiles === 1 || multiple === false) {
      parts.push("Single file");
    } else if (maxFiles && maxFiles > 1) {
      parts.push(`Up to ${maxFiles} files`);
    }
    if (maxSize) {
      parts.push(`Max ${formatBytes(maxSize)} each`);
    }
    if (acceptLabel) {
      parts.push(`Accepted: ${acceptLabel}`);
    }
    return parts.join(" - ");
  }, [acceptLabel, maxFiles, maxSize, multiple]);

  const { getRootProps, getInputProps, isDragActive, isDragReject } =
    useDropzone({
      onDrop: handleDrop,
      accept,
      maxSize,
      maxFiles,
      multiple,
      disabled,
    });

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 6,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = React.useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = items.findIndex((item) => item.id === active.id);
      const newIndex = items.findIndex((item) => item.id === over.id);
      if (oldIndex === -1 || newIndex === -1) return;

      updateItems(arrayMove(items, oldIndex, newIndex));
    },
    [items, updateItems],
  );

  const showReorder = allowReorder && items.length > 1;

  return (
    <div className={cn("space-y-3", className)} {...props}>
      <div
        {...getRootProps({
          className: cn(
            "rounded-lg border border-dashed p-6 text-center transition-colors",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            isDragActive && "border-primary bg-primary/5",
            isDragReject && "border-destructive bg-destructive/5",
            disabled && "cursor-not-allowed opacity-60",
            dropzoneClassName,
          ),
        })}
      >
        <input {...getInputProps()} />
        <div className="flex flex-col items-center gap-2 text-sm">
          <span className="inline-flex size-10 items-center justify-center rounded-full border bg-muted text-muted-foreground">
            <Upload className="size-5" />
          </span>
          <p className="text-sm font-medium text-foreground">
            {isDragActive ? "Drop files to upload" : label}
          </p>
          {(subLabel ?? defaultSubLabel) && (
            <p className="text-xs text-muted-foreground">
              {subLabel ?? defaultSubLabel}
            </p>
          )}
        </div>
      </div>

      {rejections.length > 0 && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="size-4" />
            <span>Some files were rejected</span>
          </div>
          <ul className="mt-2 space-y-1 text-xs text-destructive">
            {rejections.map(({ file, errors }) => (
              <li key={`${file.name}-${file.lastModified}`}>
                <span className="font-medium">{file.name}</span>
                {errors.map((error) => (
                  <span key={error.code} className="block">
                    {error.message}
                  </span>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}

      {uploadConfigError && (
        <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          <div className="flex items-center gap-2 font-medium">
            <AlertCircle className="size-4" />
            <span>{uploadConfigError}</span>
          </div>
        </div>
      )}

      {items.length > 0 && (
        <div className={cn("space-y-2", listClassName)}>
          {showReorder ? (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={items.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                {items.map((item) => (
                  <SortableFileRow
                    key={item.id}
                    item={item}
                    onRemove={(id) =>
                      updateItems(items.filter((i) => i.id !== id))
                    }
                    allowRemove={allowRemove}
                    uploadState={uploadState[item.id]}
                    className={itemClassName}
                  />
                ))}
              </SortableContext>
            </DndContext>
          ) : (
            items.map((item) => (
              <FileRow
                key={item.id}
                item={item}
                onRemove={(id) => updateItems(items.filter((i) => i.id !== id))}
                allowRemove={allowRemove}
                uploadState={uploadState[item.id]}
                className={itemClassName}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}
