import { useMemo } from "react";
import { FileText } from "lucide-react";
import { toast } from "sonner";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { FileUpload, type BlobUploadResult } from "~/components/ui/file-upload";
import { useCreateFile, useFiles } from "~/api/files";
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
  //const [savedFiles, setSavedFiles] = useState<FileRecord[]>([])
  const createFile = useCreateFile();
  const { data: existingFiles, isLoading } = useFiles({
    page: 1,
    limit: 25,
    entity_type: entity,
    entity_id: entityId,
  });

  const savedFiles = existingFiles?.data || [];

  // Initialize savedFiles with existing files from the server

  const uploadPathname = useMemo(
    () => (file: File) => {
      const safeName = file.name.replace(/\s+/g, "-");
      return `${entity}/${entityId}/${Date.now()}-${safeName}`;
    },
    [entityId, entity],
  );

  const handleUploadComplete = async (results: BlobUploadResult[]) => {
    const payloads = results.map((result) => ({
      file_name: result.file.name,
      file_url: result.refUrl,
      provider: "vercel",
      entity_type: entity,
      entity_id: entityId,
      file_type: result.file.type || "application/octet-stream",
      file_size: result.file.size,
      metadata: {
        originalName: result.file.name,
        version: 1,
      },
    }));

    const settled = await Promise.allSettled(
      payloads.map((payload) => createFile.mutateAsync(payload)),
    );

    const successes: FileRecord[] = [];
    let failures = 0;

    settled.forEach((result) => {
      if (result.status === "fulfilled") {
        successes.push(result.value);
      } else {
        failures += 1;
      }
    });

    if (failures > 0) {
      toast.error(
        `${failures} file${failures > 1 ? "s" : ""} failed to save metadata`,
      );
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Files</CardTitle>
          <CardDescription>Upload and store deal documents</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <FileUpload
            uploadPathname={uploadPathname}
            onUploadComplete={handleUploadComplete}
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
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-4 w-full mb-2" />)
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
                  <a
                    href={file.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-sm text-primary underline-offset-4 hover:underline"
                  >
                    View
                  </a>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
