"use client";

import { useState, useRef } from "react";
import { Button } from "~/components/ui/button";
import { Card } from "~/components/ui/card";
import { Table } from "~/components/ui/table";
import { Upload, X, Check, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Input } from "./ui/input";
import type { Province, Region } from "~/api/schools";
import { useCSVImport, type LeadSource } from "~/api/leads";


const expectedHeaders = [
  "firstname",
  "lastname",
  "email",
  "phone",
  "company",
  "source",
  "province",
  "region",
  "city",
  "requirement",
] as const;

export type ImportedLead = {
  firstname: string;
  lastname: string;
  email: string;
  phone: string;
  requirement: string;
  company: string;
  province: Province;
  region: Region;
  city: string;
  source: LeadSource;
};

interface CSVImportProps {
  onImportComplete?: (message: string) => void;
}

export function CSVImport({ onImportComplete }: CSVImportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [csvData, setCsvData] = useState<ImportedLead[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { mutateAsync: importBulk } = useCSVImport();

  const parseCsv = (csvText: string): ImportedLead[] => {
    const lines = csvText.trim().split("\n");
    if (lines.length < 2) {
      throw new Error(
        "CSV must contain at least a header row and one data row"
      );
    }

    const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());

    // Validate headers
    const missingHeaders = expectedHeaders.filter(
      (expected) => !headers.includes(expected)
    );
    if (missingHeaders.length > 0) {
      throw new Error(`Missing required headers: ${missingHeaders.join(", ")}`);
    }

    const data: ImportedLead[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i]
        .split(",")
        .map((v) => v.trim().replace(/^"|"$/g, ""));

      if (values.length !== headers.length) {
        console.warn(
          `Row ${i + 1} has ${values.length} columns but expected ${headers.length}. Skipping.`
        );
        continue;
      }

      const lead: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (
          expectedHeaders.includes(header as (typeof expectedHeaders)[number])
        ) {
          lead[header] = values[index];
        }
      });

      data.push(lead as ImportedLead);
    }

    return data;
  };

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith(".csv")) {
      setError("Please select a CSV file");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const csvText = e.target?.result as string;
        const parsed = parseCsv(csvText);
        setCsvData(parsed);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to parse CSV");
        setCsvData([]);
      }
    };
    reader.readAsText(file);
  };

  const transformToAddLeadValues = (leads: ImportedLead[]) => {
    return leads.map((lead) => ({
      lead: {
        name: lead.requirement || `${lead.firstname} ${lead.lastname}`,
        source: lead.source,
        school_name: lead.company,
        province: lead.province,
        region: lead.region,
        city: lead.city,
      },
      contacts: [
        {
          first_name: lead.firstname,
          last_name: lead.lastname,
          email: lead.email,
          phone: lead.phone,
          role: "Other" as const,
          is_primary: true,
          preferred_contact_method: "Email" as const,
        },
      ],
    }));
  };

  const handleImport = async () => {
    if (csvData.length === 0) return;

    setIsUploading(true);
    setError(null);

    try {
      const transformedData = transformToAddLeadValues(csvData);
      await importBulk(transformedData);
      // Reset state and close modal
      setCsvData([]);
      setIsOpen(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      onImportComplete?.(`Successfully imported ${csvData.length} leads`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Import failed";
      setError(errorMessage);
      toast.error("Import failed", {
        description: errorMessage,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCancel = () => {
    setCsvData([]);
    setError(null);
    setIsOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  if (!isOpen) {
    return (
      <Button onClick={() => setIsOpen(true)} variant="outline">
        <Upload className="mr-2 h-4 w-4" />
        Import CSV
      </Button>
    );
  }

  return (
    <div className="fixed inset-0 bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/60 flex items-center justify-center z-50 p-8">
      <Card className="w-full max-w-4xl max-h-[90vh] overflow-auto m-4">
        <div className="p-6 space-y-4">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold">Import Leads from CSV</h3>
            <Button variant="ghost" size="sm" onClick={handleCancel}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          <div className="space-y-4">
            <div>
              <p className="text-sm text-muted-foreground mb-2">
                Expected CSV format:{" "}
                <strong>
                  firstname,lastname,email,phone,company
                  {/* ,source,status */}
                </strong>
              </p>
              <Input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="w-full p-2 border border-input rounded-md"
              />
            </div>

            {error && (
              <div className="flex items-center space-x-2 text-red-600 bg-red-50 p-3 rounded-md">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{error}</span>
              </div>
            )}

            {csvData.length > 0 && (
              <div className="space-y-4">
                <div className="flex items-center space-x-2 text-green-600 bg-green-50 p-3 rounded-md">
                  <Check className="h-4 w-4" />
                  <span className="text-sm">
                    Preview: {csvData.length} leads ready to import
                  </span>
                </div>

                <div className="max-h-96 overflow-auto border rounded-md">
                  <Table>
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-3 font-medium">
                          Lead Requirement
                        </th>
                        <th className="text-left p-3 font-medium">Firstname</th>
                        <th className="text-left p-3 font-medium">Lastname</th>
                        <th className="text-left p-3 font-medium">Email</th>
                        <th className="text-left p-3 font-medium">Phone</th>
                        <th className="text-left p-3 font-medium">Company</th>
                        <th className="text-left p-3 font-medium">Source</th>
                        <th className="text-left p-3 font-medium">Province</th>
                        <th className="text-left p-3 font-medium">City</th>
                        <th className="text-left p-3 font-medium">Region</th>
                      </tr>
                    </thead>
                    <tbody>
                      {csvData.slice(0, 10).map((lead, index) => (
                        <tr key={index} className="border-b">
                          <td className="p-3 max-w-30 line-clamp-2 truncate">
                            {lead.requirement}
                          </td>
                          <td className="p-3">{lead.firstname}</td>
                          <td className="p-3">{lead.lastname}</td>
                          <td className="p-3">{lead.email}</td>
                          <td className="p-3">{lead.phone}</td>
                          <td className="p-3">{lead.company}</td>
                          <td className="p-3">{lead.source}</td>
                          <td className="p-3 max-w-30 truncate">
                            {lead.province}
                          </td>
                          <td className="p-3 max-w-30 truncate">{lead.city}</td>
                          <td className="p-3">{lead.region}</td>
                        </tr>
                      ))}
                    </tbody>
                  </Table>
                  {csvData.length > 10 && (
                    <div className="p-3 text-center text-sm text-muted-foreground">
                      ... and {csvData.length - 10} more leads
                    </div>
                  )}
                </div>

                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={handleCancel}>
                    Cancel
                  </Button>
                  <Button onClick={handleImport} disabled={isUploading}>
                    {isUploading
                      ? "Importing..."
                      : `Import ${csvData.length} Leads`}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
