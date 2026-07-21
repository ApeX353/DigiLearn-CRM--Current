import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, Upload } from "lucide-react";
import { toast } from "sonner";
import { handleApiError } from "~/api/axios";
import {
  LEAD_SOURCES,
  type AddLeadValues,
  type LeadSource,
  useCreateLead,
  useUpdateLead,
} from "~/api/leads";
import { PROVINCES, REGIONS, type Province, type Region } from "~/api/schools";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import Modal from "~/components/ui/modal";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

interface LeadsCsvImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type DuplicateStrategy = "merge" | "allow" | "delete";

type FieldKey =
  | "lead_name"
  | "school_name"
  | "source"
  | "first_name"
  | "last_name"
  | "email"
  | "phone"
  | "province"
  | "region"
  | "city"
  | "estimated_value"
  | "notes";

type FieldMapping = Record<FieldKey, number | null>;
type MappedRecord = Record<FieldKey, string>;

interface FieldConfig {
  key: FieldKey;
  label: string;
  required: boolean;
  suggestions: string[];
  description?: string;
}

interface ParsedCsvData {
  headers: string[];
  rows: string[][];
}

interface ImportableRow {
  csvRowNumber: number;
  record: MappedRecord;
  duplicateKey: string;
}

interface PreparedImportRow {
  csvRowNumber: number;
  payload: AddLeadValues;
  record: MappedRecord;
}

interface ImportFailure {
  csvRowNumber: number;
  reason: string;
}

interface ImportedLeadResult {
  csvRowNumber: number;
  leadId: string;
  leadName: string;
  schoolName: string;
  unassigned: boolean;
}

interface ImportResultSummary {
  created: ImportedLeadResult[];
  failed: ImportFailure[];
  duplicateSummary: {
    strategy: DuplicateStrategy;
    duplicateGroups: number;
    affectedRows: number;
    removedRows: number;
    mergedGroups: number;
  };
}

const FIELD_CONFIGS: FieldConfig[] = [
  {
    key: "lead_name",
    label: "Lead Name",
    required: true,
    suggestions: ["lead_name", "lead", "name", "requirement", "deal_name"],
    description: "Used as lead title",
  },
  {
    key: "school_name",
    label: "School Name",
    required: true,
    suggestions: ["school_name", "school", "company", "institution"],
  },
  {
    key: "source",
    label: "Source",
    required: true,
    suggestions: ["source", "lead_source", "channel"],
    description: "Any unknown value defaults to Other",
  },
  {
    key: "first_name",
    label: "Contact First Name",
    required: true,
    suggestions: ["first_name", "firstname", "contact_first_name"],
  },
  {
    key: "last_name",
    label: "Contact Last Name",
    required: true,
    suggestions: ["last_name", "lastname", "contact_last_name"],
  },
  {
    key: "email",
    label: "Contact Email",
    required: false,
    suggestions: ["email", "contact_email"],
  },
  {
    key: "phone",
    label: "Contact Phone",
    required: false,
    suggestions: ["phone", "mobile", "contact_phone", "telephone"],
  },
  {
    key: "province",
    label: "Province",
    required: false,
    suggestions: ["province", "state"],
  },
  {
    key: "region",
    label: "Region",
    required: false,
    suggestions: ["region", "area", "zone"],
  },
  {
    key: "city",
    label: "City",
    required: false,
    suggestions: ["city", "town"],
  },
  {
    key: "estimated_value",
    label: "Estimated Value",
    required: false,
    suggestions: ["estimated_value", "value", "amount", "budget"],
  },
  {
    key: "notes",
    label: "Notes",
    required: false,
    suggestions: ["notes", "note", "comment", "comments"],
  },
];

const REQUIRED_FIELD_KEYS = FIELD_CONFIGS.filter((field) => field.required).map(
  (field) => field.key,
);

const EMPTY_FIELD_MAPPING: FieldMapping = {
  lead_name: null,
  school_name: null,
  source: null,
  first_name: null,
  last_name: null,
  email: null,
  phone: null,
  province: null,
  region: null,
  city: null,
  estimated_value: null,
  notes: null,
};

function normalizeHeader(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function normalizeValue(value: string): string {
  return value.trim().toLowerCase();
}

function splitCsvCells(csvText: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = "";
  let inQuotes = false;

  for (let i = 0; i < csvText.length; i += 1) {
    const char = csvText[i];
    const nextChar = csvText[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentValue += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      currentRow.push(currentValue.trim());
      currentValue = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && nextChar === "\n") {
        i += 1;
      }
      currentRow.push(currentValue.trim());
      currentValue = "";
      if (currentRow.some((cell) => cell.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
      continue;
    }

    currentValue += char;
  }

  if (currentValue.length > 0 || currentRow.length > 0) {
    currentRow.push(currentValue.trim());
    if (currentRow.some((cell) => cell.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
}

function parseCsvText(csvText: string): ParsedCsvData {
  const allRows = splitCsvCells(csvText);
  if (allRows.length < 2) {
    throw new Error(
      "CSV must include at least one header row and one data row.",
    );
  }

  const headers = allRows[0].map((header, index) => {
    const raw = header.replace(/^\uFEFF/, "").trim();
    return raw.length > 0 ? raw : `Column ${index + 1}`;
  });

  const rows = allRows.slice(1).map((row) => {
    const normalizedRow = [...row];
    if (normalizedRow.length < headers.length) {
      while (normalizedRow.length < headers.length) {
        normalizedRow.push("");
      }
    }
    if (normalizedRow.length > headers.length) {
      return normalizedRow.slice(0, headers.length);
    }
    return normalizedRow;
  });

  return { headers, rows };
}

function createDefaultMapping(headers: string[]): FieldMapping {
  const normalizedHeaders = headers.map(normalizeHeader);
  const mapping: FieldMapping = { ...EMPTY_FIELD_MAPPING };

  FIELD_CONFIGS.forEach((field) => {
    const matchIndex = normalizedHeaders.findIndex((header) =>
      field.suggestions.some((suggestion) => normalizeHeader(suggestion) === header),
    );
    mapping[field.key] = matchIndex >= 0 ? matchIndex : null;
  });

  return mapping;
}

function toMappedRecord(row: string[], mapping: FieldMapping): MappedRecord {
  const record = {} as MappedRecord;

  FIELD_CONFIGS.forEach((field) => {
    const columnIndex = mapping[field.key];
    if (columnIndex === null || columnIndex < 0) {
      record[field.key] = "";
      return;
    }
    record[field.key] = (row[columnIndex] ?? "").trim();
  });

  return record;
}

function parseSource(value: string): LeadSource {
  const normalized = normalizeValue(value);
  const source = LEAD_SOURCES.find(
    (leadSource) => normalizeValue(leadSource) === normalized,
  );
  return source ?? "Other";
}

function parseProvince(value: string): Province | undefined {
  const normalized = normalizeValue(value);
  return PROVINCES.find((province) => normalizeValue(province) === normalized);
}

function parseRegion(value: string): Region | undefined {
  const normalized = normalizeValue(value);
  return REGIONS.find((region) => normalizeValue(region) === normalized);
}

function buildDuplicateKey(record: MappedRecord, rowIndex: number): string {
  const school = normalizeValue(record.school_name);
  const email = normalizeValue(record.email);
  const phone = normalizeValue(record.phone);
  const fullName = normalizeValue(`${record.first_name} ${record.last_name}`);

  if (email.length > 0) {
    return `email:${email}|school:${school}`;
  }

  if (phone.length > 0) {
    return `phone:${phone}|school:${school}`;
  }

  if (fullName.length > 0 && school.length > 0) {
    return `name:${fullName}|school:${school}`;
  }

  return `row:${rowIndex}`;
}

function mergeRecords(records: MappedRecord[]): MappedRecord {
  const merged = { ...records[0] };

  for (let i = 1; i < records.length; i += 1) {
    const nextRecord = records[i];
    FIELD_CONFIGS.forEach((field) => {
      if (!merged[field.key] && nextRecord[field.key]) {
        merged[field.key] = nextRecord[field.key];
      }
    });
  }

  return merged;
}

function prepareRowsByDuplicateStrategy(
  rows: ImportableRow[],
  strategy: DuplicateStrategy,
): {
  rows: ImportableRow[];
  summary: ImportResultSummary["duplicateSummary"];
} {
  const groups = new Map<string, ImportableRow[]>();
  rows.forEach((row) => {
    const current = groups.get(row.duplicateKey) ?? [];
    current.push(row);
    groups.set(row.duplicateKey, current);
  });

  let duplicateGroups = 0;
  let affectedRows = 0;
  let removedRows = 0;
  let mergedGroups = 0;

  const prepared: ImportableRow[] = [];

  groups.forEach((groupRows, duplicateKey) => {
    const isDuplicateGroup =
      groupRows.length > 1 && duplicateKey.startsWith("row:") === false;

    if (isDuplicateGroup) {
      duplicateGroups += 1;
      affectedRows += groupRows.length;
    }

    if (strategy === "allow" || !isDuplicateGroup) {
      prepared.push(...groupRows);
      return;
    }

    if (strategy === "delete") {
      removedRows += groupRows.length;
      return;
    }

    mergedGroups += 1;
    removedRows += groupRows.length - 1;
    const first = groupRows[0];
    prepared.push({
      ...first,
      record: mergeRecords(groupRows.map((row) => row.record)),
    });
  });

  return {
    rows: prepared,
    summary: {
      strategy,
      duplicateGroups,
      affectedRows,
      removedRows,
      mergedGroups,
    },
  };
}

function toAddLeadPayload(record: MappedRecord): AddLeadValues | null {
  const leadName = record.lead_name.trim();
  const schoolName = record.school_name.trim();
  const firstName = record.first_name.trim();
  const lastName = record.last_name.trim();
  const source = parseSource(record.source);

  if (
    leadName.length < 2 ||
    schoolName.length < 1 ||
    firstName.length < 2 ||
    lastName.length < 2
  ) {
    return null;
  }

  const estimatedValueRaw = record.estimated_value.trim();
  const estimatedValueParsed = Number.parseFloat(estimatedValueRaw);
  const estimatedValue = Number.isFinite(estimatedValueParsed)
    ? estimatedValueParsed
    : undefined;

  return {
    lead: {
      name: leadName,
      source,
      school_name: schoolName,
      city: record.city.trim() || undefined,
      province: parseProvince(record.province),
      region: parseRegion(record.region),
      estimated_value: estimatedValue,
    },
    contacts: [
      {
        first_name: firstName,
        last_name: lastName,
        email: record.email.trim() || undefined,
        phone: record.phone.trim() || undefined,
        role: "Head",
        is_primary: true,
        preferred_contact_method: record.email.trim()
          ? "Email"
          : record.phone.trim()
            ? "Phone"
            : "Email",
      },
    ],
  };
}

function extractCreatedLeadInfo(response: unknown): {
  id?: string;
  leadName?: string;
  schoolName?: string;
} {
  if (typeof response !== "object" || response === null) {
    return {};
  }

  const direct = response as { id?: string; lead_name?: string; school?: { name?: string } };
  if (direct.id) {
    return {
      id: direct.id,
      leadName: direct.lead_name,
      schoolName: direct.school?.name,
    };
  }

  const wrapped = response as {
    data?: {
      id?: string;
      lead_name?: string;
      school?: { name?: string };
      lead?: { id?: string; lead_name?: string; school?: { name?: string } };
    };
  };

  if (wrapped.data?.lead?.id) {
    return {
      id: wrapped.data.lead.id,
      leadName: wrapped.data.lead.lead_name,
      schoolName: wrapped.data.lead.school?.name,
    };
  }

  if (wrapped.data?.id) {
    return {
      id: wrapped.data.id,
      leadName: wrapped.data.lead_name,
      schoolName: wrapped.data.school?.name,
    };
  }

  return {};
}

export function LeadsCsvImportModal({
  open,
  onOpenChange,
}: LeadsCsvImportModalProps) {
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();

  const [fileName, setFileName] = useState<string>("");
  const [csvData, setCsvData] = useState<ParsedCsvData | null>(null);
  const [fieldMapping, setFieldMapping] =
    useState<FieldMapping>(EMPTY_FIELD_MAPPING);
  const [duplicateStrategy, setDuplicateStrategy] =
    useState<DuplicateStrategy>("merge");
  const [isImporting, setIsImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResultSummary | null>(
    null,
  );

  const mappingComplete = useMemo(
    () => REQUIRED_FIELD_KEYS.every((key) => fieldMapping[key] !== null),
    [fieldMapping],
  );

  const mappedPreview = useMemo(() => {
    if (!csvData) return [];
    return csvData.rows.slice(0, 5).map((row) => toMappedRecord(row, fieldMapping));
  }, [csvData, fieldMapping]);

  const resetState = () => {
    setFileName("");
    setCsvData(null);
    setFieldMapping(EMPTY_FIELD_MAPPING);
    setDuplicateStrategy("merge");
    setIsImporting(false);
    setParseError(null);
    setImportResult(null);
  };

  const handleClose = () => {
    onOpenChange(false);
    resetState();
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith(".csv")) {
      setParseError("Please upload a CSV file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (loadEvent) => {
      try {
        const content = String(loadEvent.target?.result ?? "");
        const parsed = parseCsvText(content);
        setFileName(file.name);
        setCsvData(parsed);
        setFieldMapping(createDefaultMapping(parsed.headers));
        setParseError(null);
        setImportResult(null);
      } catch (error) {
        setParseError(
          error instanceof Error ? error.message : "Failed to parse CSV file.",
        );
        setCsvData(null);
      }
    };
    reader.readAsText(file);
  };

  const updateMapping = (fieldKey: FieldKey, selectedValue: string) => {
    setFieldMapping((previous) => ({
      ...previous,
      [fieldKey]:
        selectedValue === "__none__" ? null : Number.parseInt(selectedValue, 10),
    }));
  };

  const handleImport = async () => {
    if (!csvData) {
      toast.error("Upload a CSV file first.");
      return;
    }

    if (!mappingComplete) {
      toast.error("Map all required fields before importing.");
      return;
    }

    const importableRows: ImportableRow[] = csvData.rows.map((row, index) => {
      const record = toMappedRecord(row, fieldMapping);
      return {
        csvRowNumber: index + 2,
        record,
        duplicateKey: buildDuplicateKey(record, index),
      };
    });

    const { rows: preparedRowsByStrategy, summary: duplicateSummary } =
      prepareRowsByDuplicateStrategy(importableRows, duplicateStrategy);

    const preparedRows: PreparedImportRow[] = [];
    const failures: ImportFailure[] = [];

    preparedRowsByStrategy.forEach((importableRow) => {
      const payload = toAddLeadPayload(importableRow.record);
      if (!payload) {
        failures.push({
          csvRowNumber: importableRow.csvRowNumber,
          reason:
            "Required values are missing or invalid (Lead Name, School Name, First Name, Last Name).",
        });
        return;
      }
      preparedRows.push({
        csvRowNumber: importableRow.csvRowNumber,
        payload,
        record: importableRow.record,
      });
    });

    if (preparedRows.length === 0) {
      setImportResult({
        created: [],
        failed: failures,
        duplicateSummary,
      });
      toast.error("No valid rows available for import.");
      return;
    }

    setIsImporting(true);
    const created: ImportedLeadResult[] = [];

    for (const row of preparedRows) {
      try {
        const createResponse = await createLead.mutateAsync(row.payload);
        const createdLeadInfo = extractCreatedLeadInfo(createResponse);
        const leadId = createdLeadInfo.id;

        let unassigned = false;
        if (leadId) {
          try {
            await updateLead.mutateAsync({
              id: leadId,
              data: {
                assigned_to: null as unknown as string,
              },
            });
            unassigned = true;
          } catch (unassignError) {
            failures.push({
              csvRowNumber: row.csvRowNumber,
              reason: `Lead created but failed to clear assignment: ${handleApiError(
                unassignError,
              )}`,
            });
          }
        }

        created.push({
          csvRowNumber: row.csvRowNumber,
          leadId: leadId ?? "Unknown",
          leadName: createdLeadInfo.leadName ?? row.record.lead_name,
          schoolName: createdLeadInfo.schoolName ?? row.record.school_name,
          unassigned,
        });
      } catch (error) {
        failures.push({
          csvRowNumber: row.csvRowNumber,
          reason: handleApiError(error),
        });
      }
    }

    setImportResult({
      created,
      failed: failures,
      duplicateSummary,
    });
    setIsImporting(false);

    if (created.length > 0) {
      toast.success(`Imported ${created.length} lead${created.length > 1 ? "s" : ""}.`);
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="Import Leads from CSV"
      description="Upload a CSV, map headers to required fields, choose duplicate handling, and import."
      size="lg"
    >
      <div className="space-y-6">
        <div className="rounded-md border p-4 space-y-3">
          <p className="text-sm text-muted-foreground">
            Suggested CSV structure:{" "}
            <code className="rounded bg-muted px-1 py-0.5">
              lead_name,school_name,source,first_name,last_name,email,phone,province,region,city,estimated_value,notes
            </code>
          </p>
          <div className="space-y-2">
            <Label htmlFor="leads-csv-file">CSV File</Label>
            <Input
              id="leads-csv-file"
              type="file"
              accept=".csv,text/csv"
              onChange={handleFileChange}
            />
            {fileName ? (
              <p className="text-xs text-muted-foreground">
                Loaded: <span className="font-medium">{fileName}</span>
              </p>
            ) : null}
          </div>
          {parseError ? (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{parseError}</span>
            </div>
          ) : null}
        </div>

        {csvData ? (
          <>
            <div className="rounded-md border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-medium">Field Mapping</h4>
                <Badge variant={mappingComplete ? "default" : "secondary"}>
                  {mappingComplete ? "Ready to import" : "Required fields missing"}
                </Badge>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                {FIELD_CONFIGS.map((field) => (
                  <div key={field.key} className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Label className="text-sm">{field.label}</Label>
                      {field.required ? (
                        <Badge variant="destructive" className="text-[10px]">
                          Required
                        </Badge>
                      ) : null}
                    </div>
                    {field.description ? (
                      <p className="text-xs text-muted-foreground">
                        {field.description}
                      </p>
                    ) : null}
                    <Select
                      value={
                        fieldMapping[field.key] === null
                          ? "__none__"
                          : String(fieldMapping[field.key])
                      }
                      onValueChange={(value) => updateMapping(field.key, value)}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select CSV header" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__">Not mapped</SelectItem>
                        {csvData.headers.map((header, index) => (
                          <SelectItem key={`${header}-${index}`} value={String(index)}>
                            {header}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <h4 className="font-medium">Duplicate Handling</h4>
              <RadioGroup
                value={duplicateStrategy}
                onValueChange={(value) =>
                  setDuplicateStrategy(value as DuplicateStrategy)
                }
                className="space-y-2"
              >
                <Label className="flex items-center gap-2 text-sm font-normal">
                  <RadioGroupItem value="merge" />
                  <span>Merge Duplicates</span>
                  <Badge>Default</Badge>
                </Label>
                <Label className="flex items-center gap-2 text-sm font-normal">
                  <RadioGroupItem value="allow" />
                  <span>Allow Duplicates</span>
                </Label>
                <Label className="flex items-center gap-2 text-sm font-normal">
                  <RadioGroupItem value="delete" />
                  <span>Delete Duplicates</span>
                </Label>
              </RadioGroup>
            </div>

            <div className="rounded-md border p-4 space-y-3">
              <h4 className="font-medium">Mapped Preview ({Math.min(mappedPreview.length, 5)} rows)</h4>
              <div className="max-h-64 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Lead Name</TableHead>
                      <TableHead>School</TableHead>
                      <TableHead>Source</TableHead>
                      <TableHead>Contact</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {mappedPreview.map((row, index) => (
                      <TableRow key={`preview-${index}`}>
                        <TableCell>{row.lead_name || "-"}</TableCell>
                        <TableCell>{row.school_name || "-"}</TableCell>
                        <TableCell>{parseSource(row.source)}</TableCell>
                        <TableCell>
                          {[row.first_name, row.last_name].filter(Boolean).join(" ") || "-"}
                        </TableCell>
                        <TableCell>{row.email || "-"}</TableCell>
                        <TableCell>{row.phone || "-"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        ) : null}

        {importResult ? (
          <div className="rounded-md border p-4 space-y-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <h4 className="font-medium">Import Result</h4>
            </div>
            <div className="text-sm text-muted-foreground space-y-1">
              <p>
                Duplicate strategy:{" "}
                <span className="font-medium">{importResult.duplicateSummary.strategy}</span>
              </p>
              <p>
                Duplicate groups detected:{" "}
                <span className="font-medium">{importResult.duplicateSummary.duplicateGroups}</span>
              </p>
              <p>
                Rows affected by duplicates:{" "}
                <span className="font-medium">{importResult.duplicateSummary.affectedRows}</span>
              </p>
              <p>
                Rows removed by strategy:{" "}
                <span className="font-medium">{importResult.duplicateSummary.removedRows}</span>
              </p>
            </div>

            <div className="space-y-2">
              <h5 className="text-sm font-medium">
                Created Leads Assigned to No One (
                {importResult.created.filter((lead) => lead.unassigned).length})
              </h5>
              <div className="max-h-64 overflow-auto rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>CSV Row</TableHead>
                      <TableHead>Lead ID</TableHead>
                      <TableHead>Lead Name</TableHead>
                      <TableHead>School</TableHead>
                      <TableHead>Assigned To</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {importResult.created
                      .filter((lead) => lead.unassigned)
                      .map((lead) => (
                        <TableRow key={`${lead.csvRowNumber}-${lead.leadId}`}>
                          <TableCell>{lead.csvRowNumber}</TableCell>
                          <TableCell>{lead.leadId}</TableCell>
                          <TableCell>{lead.leadName}</TableCell>
                          <TableCell>{lead.schoolName}</TableCell>
                          <TableCell>
                            <Badge variant="secondary">Unassigned</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    {importResult.created.filter((lead) => lead.unassigned).length ===
                    0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="text-center text-muted-foreground">
                          No unassigned created leads returned.
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </div>
            </div>

            {importResult.failed.length > 0 ? (
              <div className="space-y-2">
                <h5 className="text-sm font-medium text-destructive">
                  Failed Rows ({importResult.failed.length})
                </h5>
                <div className="max-h-40 overflow-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>CSV Row</TableHead>
                        <TableHead>Reason</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {importResult.failed.map((failure, index) => (
                        <TableRow key={`${failure.csvRowNumber}-${index}`}>
                          <TableCell>{failure.csvRowNumber}</TableCell>
                          <TableCell>{failure.reason}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <div className="flex justify-between gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={isImporting}
          >
            Close
          </Button>
          <Button
            type="button"
            disabled={!csvData || !mappingComplete || isImporting}
            onClick={handleImport}
          >
            <Upload className="mr-2 h-4 w-4" />
            {isImporting ? "Importing..." : "Import CSV"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
