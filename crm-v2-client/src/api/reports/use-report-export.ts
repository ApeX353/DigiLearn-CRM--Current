import { useMutation } from "@tanstack/react-query";
import { apiClientAuth } from "~/api/axios";
import { toast } from "sonner";

interface ExportParams {
  reportType: "sales" | "pipeline" | "collections";
  format: "pdf" | "xlsx";
  dateRange?: "mtd" | "qtd" | "ytd";
  asOfDate?: string;
}

export function useReportExport() {
  return useMutation({
    mutationFn: async (params: ExportParams) => {
      const queryParams = new URLSearchParams({ format: params.format });

      if (params.dateRange) {
        queryParams.set("dateRange", params.dateRange);
      }
      if (params.asOfDate) {
        queryParams.set("as_of_date", params.asOfDate);
      }

      const response = await apiClientAuth.get(
        `/reports/export/${params.reportType}?${queryParams.toString()}`,
        { responseType: "blob" }
      );

      // Trigger browser download
      const blob = new Blob([response.data], {
        type:
          params.format === "pdf"
            ? "application/pdf"
            : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });

      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${params.reportType}-report.${params.format}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      return true;
    },
    onSuccess: () => {
      toast.success("Report downloaded successfully");
    },
    onError: () => {
      toast.error("Failed to export report");
    },
  });
}
