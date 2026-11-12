import { useState } from "react";
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
  const [downloading, setDownloading] = useState<string | null>(null);
  const { data: existingFiles, isLoading } = useFiles({
    page: 1,
    limit: 25,
    entity_type: entity,
    entity_id: entityId,
  });

  const savedFiles = existingFiles?.data || [];

  const uploadFile = async (file: File) => {
    const body = new FormData();
    body.append("entity_type", entity);
    body.append("entity_id", entityId);
    body.append("file", file);
    const response = await apiClientAuth
      .post<{ data: FileRecord }>("/file-manager/content", body, {
        headers: { "Content-Type": undefined },
      })
      .catch((error) => {
        throw new Error(handleApiError(error));
      });
    // Metadata is already committed with the bytes: no second save request.
    void queryClient.invalidateQueries({ queryKey: ["files"] });
    return { url: response.data.data.file_url };
  };

  const downloadFile = async (file: FileRecord) => {
    setDownloading(file.id);
    try {
      const response = await apiClientAuth.get(
        `/file-manager/${file.id}/content`,
        { responseType: "blob" },
      );
      const url = URL.createObjectURL(response.data);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = file.file_name;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("Could not download this file. Please try again.");
    } finally {
      setDownloading(null);
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
                  className="flex items-center justify-between rounded-lg border p-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="text-sm font-medium">{file.file_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {file.file_type || "Unknown type"} -{" "}
                        {file.file_size ?? 0} bytes
                      </p>
                    </div>
                  </div>
                  {file.provider === "database" ? (
                    <button
                      type="button"
                      disabled={downloading !== null}
                      onClick={() => void downloadFile(file)}
                      className="text-sm text-primary underline-offset-4 hover:underline disabled:opacity-50"
                    >
                      {downloading === file.id ? "Downloading..." : "Download"}
                    </button>
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
    </div>
  );
}
