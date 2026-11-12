import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  Eye,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Share2,
  Trash2,
  User,
} from "lucide-react";
import { toast } from "sonner";
import Container from "~/components/container";
import PageHeader from "~/components/page-header";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Switch } from "~/components/ui/switch";
import { Skeleton } from "~/components/ui/skeleton";
import {
  useCreateEmailTemplate,
  useDeleteEmailTemplate,
  useEmailTemplates,
  useRenderEmailTemplate,
  useUpdateEmailTemplate,
  type EmailTemplate,
} from "~/api/email-templates";
import { useAuthStore } from "~/stores/use-auth-store";
import { handleApiError } from "~/api/axios";

type DraftForm = {
  slug: string;
  name: string;
  subject: string;
  body_html: string;
  body_text: string;
  variables: string;
  category: string;
  is_shared: boolean;
  is_active: boolean;
};

const EMPTY_DRAFT: DraftForm = {
  slug: "",
  name: "",
  subject: "",
  body_html: "",
  body_text: "",
  variables: "",
  category: "",
  is_shared: false,
  is_active: true,
};

/**
 * Normalises the comma-separated merge-var string from the form into
 * the array the server expects.  Allows the author to write either
 * `{{lead.name}}` or `lead.name` — we strip the braces for storage so
 * the variable list is useful as a picker elsewhere.
 */
function parseVariables(input: string): string[] {
  return input
    .split(/[,\n]/)
    .map((v) => v.trim().replace(/^\{\{|\}\}$/g, ""))
    .filter(Boolean);
}

function isAdminRole(roles: string[] | undefined | null): boolean {
  return !!roles && roles.includes("admin");
}

export default function EmailTemplatesPage() {
  const user = useAuthStore((s) => s.user);
  const isAdmin = isAdminRole(user?.roles);

  const { data: templates, isLoading } = useEmailTemplates();
  const createMutation = useCreateEmailTemplate();
  const updateMutation = useUpdateEmailTemplate();
  const deleteMutation = useDeleteEmailTemplate();

  const [draftOpen, setDraftOpen] = useState(false);
  const [editing, setEditing] = useState<EmailTemplate | null>(null);
  const [draft, setDraft] = useState<DraftForm>(EMPTY_DRAFT);

  const [previewTarget, setPreviewTarget] = useState<EmailTemplate | null>(
    null,
  );

  const { mine, shared } = useMemo(() => {
    const list = templates ?? [];
    return {
      mine: list.filter((t) => t.owner_user_id === user?.id),
      shared: list.filter((t) => t.owner_user_id === null),
    };
  }, [templates, user?.id]);

  const resetDraft = () => {
    setDraft(EMPTY_DRAFT);
    setEditing(null);
  };

  const openForCreate = () => {
    resetDraft();
    setDraftOpen(true);
  };

  const openForEdit = (tpl: EmailTemplate) => {
    setEditing(tpl);
    setDraft({
      slug: tpl.slug,
      name: tpl.name,
      subject: tpl.subject,
      body_html: tpl.body_html,
      body_text: tpl.body_text ?? "",
      variables: (tpl.variables ?? []).join(", "),
      category: tpl.category ?? "",
      is_shared: tpl.owner_user_id === null,
      is_active: tpl.is_active,
    });
    setDraftOpen(true);
  };

  const handleSubmit = async () => {
    if (!draft.slug.trim() || !draft.name.trim() || !draft.subject.trim()) {
      toast.error("Slug, name, and subject are required");
      return;
    }
    if (!draft.body_html.trim()) {
      toast.error("The HTML body can't be empty");
      return;
    }
    try {
      const variables = parseVariables(draft.variables);
      if (editing) {
        await updateMutation.mutateAsync({
          id: editing.id,
          data: {
            slug: draft.slug.trim(),
            name: draft.name.trim(),
            subject: draft.subject.trim(),
            body_html: draft.body_html,
            body_text: draft.body_text.trim() || undefined,
            variables: variables.length ? variables : undefined,
            category: draft.category.trim() || undefined,
            is_active: draft.is_active,
          },
        });
        toast.success("Template updated");
      } else {
        await createMutation.mutateAsync({
          slug: draft.slug.trim(),
          name: draft.name.trim(),
          subject: draft.subject.trim(),
          body_html: draft.body_html,
          body_text: draft.body_text.trim() || undefined,
          variables: variables.length ? variables : undefined,
          category: draft.category.trim() || undefined,
          is_shared: isAdmin ? draft.is_shared : false,
        });
        toast.success("Template created");
      }
      setDraftOpen(false);
      resetDraft();
    } catch (err) {
      toast.error(handleApiError(err));
    }
  };

  const handleDelete = async (tpl: EmailTemplate) => {
    // The server also re-checks ownership; the UI confirm is just a
    // friction gate, not a security control.
    if (!window.confirm(`Delete template "${tpl.name}"?`)) return;
    try {
      await deleteMutation.mutateAsync(tpl.id);
      toast.success("Template deleted");
    } catch (err) {
      toast.error(handleApiError(err));
    }
  };

  const renderTable = (rows: EmailTemplate[]) => {
    if (rows.length === 0) {
      return (
        <div className="text-center py-10 text-muted-foreground">
          <Mail className="h-8 w-8 mx-auto mb-2 opacity-50" />
          No templates here yet.
        </div>
      );
    }
    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Slug</TableHead>
            <TableHead>Subject</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Scope</TableHead>
            <TableHead>Updated</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((tpl) => {
            const canEdit = tpl.owner_user_id === user?.id || isAdmin;
            return (
              <TableRow key={tpl.id}>
                <TableCell className="font-medium">{tpl.name}</TableCell>
                <TableCell>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded">
                    {tpl.slug}
                  </code>
                </TableCell>
                <TableCell className="max-w-xs truncate" title={tpl.subject}>
                  {tpl.subject}
                </TableCell>
                <TableCell>
                  {tpl.category ? (
                    <Badge variant="outline">{tpl.category}</Badge>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {tpl.owner_user_id === null ? (
                    <Badge className="bg-indigo-100 text-indigo-800 hover:bg-indigo-100 dark:bg-indigo-900 dark:text-indigo-200">
                      <Share2 className="h-3 w-3 mr-1" /> Shared
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <User className="h-3 w-3 mr-1" /> Personal
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground text-sm">
                  {format(new Date(tpl.updated_at), "MMM dd, yyyy")}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setPreviewTarget(tpl)}
                      title="Preview rendered output"
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => openForEdit(tpl)}
                      disabled={!canEdit}
                      title={canEdit ? "Edit" : "Only the owner or an admin can edit"}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(tpl)}
                      disabled={!canEdit}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    );
  };

  return (
    <Container>
      <PageHeader
        title="Email Templates"
        subtitle="Re-usable subject + body snippets with Mustache-style merge variables"
        actions={
          <Button onClick={openForCreate}>
            <Plus className="h-4 w-4 mr-2" />
            New template
          </Button>
        }
      />

      <section className="p-4">
        {isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : (
          <Tabs defaultValue="all">
            <TabsList>
              <TabsTrigger value="all">
                All ({(templates ?? []).length})
              </TabsTrigger>
              <TabsTrigger value="mine">My templates ({mine.length})</TabsTrigger>
              <TabsTrigger value="shared">
                Organisation-wide ({shared.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="all">
              <Card>
                <CardContent className="pt-4">
                  {renderTable(templates ?? [])}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="mine">
              <Card>
                <CardContent className="pt-4">{renderTable(mine)}</CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="shared">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Share2 className="h-4 w-4" />
                    Organisation-wide templates
                  </CardTitle>
                  <CardDescription>
                    Any user can read these; only admins can create or edit them.
                  </CardDescription>
                </CardHeader>
                <CardContent>{renderTable(shared)}</CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </section>

      {/* Create / edit form */}
      <Dialog
        open={draftOpen}
        onOpenChange={(o) => {
          setDraftOpen(o);
          if (!o) resetDraft();
        }}
      >
        <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Edit template" : "New email template"}
            </DialogTitle>
            <DialogDescription>
              Use <code className="text-xs">{`{{lead.name}}`}</code>-style tags
              to pull contact / lead / deal / user data in at send time. The
              server will reject any template it can't parse.
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Name</Label>
              <Input
                id="tpl-name"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="Demo follow-up"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-slug">Slug</Label>
              <Input
                id="tpl-slug"
                value={draft.slug}
                onChange={(e) => setDraft({ ...draft, slug: e.target.value })}
                placeholder="demo-follow-up"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="tpl-subject">Subject</Label>
              <Input
                id="tpl-subject"
                value={draft.subject}
                onChange={(e) =>
                  setDraft({ ...draft, subject: e.target.value })
                }
                placeholder="Next steps after our demo, {{contact.first_name}}"
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="tpl-html">HTML body</Label>
              <Textarea
                id="tpl-html"
                value={draft.body_html}
                onChange={(e) =>
                  setDraft({ ...draft, body_html: e.target.value })
                }
                rows={10}
                className="font-mono text-xs"
                placeholder={"<p>Hi {{contact.first_name}},</p>\n<p>Thanks for your time today...</p>"}
              />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label htmlFor="tpl-text">Plain-text body (optional)</Label>
              <Textarea
                id="tpl-text"
                value={draft.body_text}
                onChange={(e) =>
                  setDraft({ ...draft, body_text: e.target.value })
                }
                rows={4}
                className="font-mono text-xs"
                placeholder="Falls back to tag-stripped HTML if blank."
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-category">Category</Label>
              <Input
                id="tpl-category"
                value={draft.category}
                onChange={(e) =>
                  setDraft({ ...draft, category: e.target.value })
                }
                placeholder="prospecting, onboarding…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-vars">Variables (comma-separated)</Label>
              <Input
                id="tpl-vars"
                value={draft.variables}
                onChange={(e) =>
                  setDraft({ ...draft, variables: e.target.value })
                }
                placeholder="contact.first_name, lead.name"
              />
            </div>

            {isAdmin && !editing && (
              <div className="flex items-center gap-2 md:col-span-2 pt-2">
                <Switch
                  id="tpl-shared"
                  checked={draft.is_shared}
                  onCheckedChange={(v) =>
                    setDraft({ ...draft, is_shared: v })
                  }
                />
                <Label htmlFor="tpl-shared" className="cursor-pointer">
                  Make this an organisation-wide template
                </Label>
              </div>
            )}

            {editing && (
              <div className="flex items-center gap-2 md:col-span-2 pt-2">
                <Switch
                  id="tpl-active"
                  checked={draft.is_active}
                  onCheckedChange={(v) =>
                    setDraft({ ...draft, is_active: v })
                  }
                />
                <Label htmlFor="tpl-active" className="cursor-pointer">
                  Active (deactivate to hide from picker without deleting)
                </Label>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setDraftOpen(false);
                resetDraft();
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={
                createMutation.isPending || updateMutation.isPending
              }
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              )}
              {editing ? "Save changes" : "Create template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview dialog */}
      <PreviewDialog
        template={previewTarget}
        onClose={() => setPreviewTarget(null)}
      />
    </Container>
  );
}

/**
 * Preview dialog calls the server's /render endpoint so authors see
 * exactly what the mail-merge will produce — no parallel JS renderer
 * means there's a single source of truth for template behaviour.
 */
function PreviewDialog({
  template,
  onClose,
}: {
  template: EmailTemplate | null;
  onClose: () => void;
}) {
  const { data, isLoading, isError, error } = useRenderEmailTemplate(
    template?.id,
    {},
    !!template,
  );

  return (
    <Dialog open={!!template} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Preview: {template?.name}</DialogTitle>
          <DialogDescription>
            Rendered with no entity context — merge variables without a
            matching record fall back to an empty string.
          </DialogDescription>
        </DialogHeader>

        {isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
        {isError && (
          <p className="text-sm text-destructive">
            {handleApiError(error)}
          </p>
        )}
        {data && (
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Subject</Label>
              <p className="font-medium">{data.subject}</p>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">HTML</Label>
              <div
                className="prose prose-sm max-w-none border rounded-md p-3 bg-card"
                // eslint-disable-next-line react/no-danger
                dangerouslySetInnerHTML={{ __html: data.body_html }}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Text</Label>
              <pre className="text-xs whitespace-pre-wrap border rounded-md p-3 bg-muted">
                {data.body_text}
              </pre>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
