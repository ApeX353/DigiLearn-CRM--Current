import type { Lead } from "~/api/leads";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";

interface NotesTabProps {
  lead: Lead;
}

export function NotesTab({ lead }: NotesTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Notes</CardTitle>
      </CardHeader>
      <CardContent>
        {lead.notes ? (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {lead.notes}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">No notes added yet.</p>
        )}
      </CardContent>
    </Card>
  );
}
