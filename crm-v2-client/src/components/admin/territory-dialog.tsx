import { useState, useEffect } from "react";
import { toast } from "sonner";
import Modal from "~/components/ui/modal";
import { Button } from "~/components/ui/button";
import { Badge } from "~/components/ui/badge";
import { Checkbox } from "~/components/ui/checkbox";
import { Label } from "~/components/ui/label";
import { useUpdateUser, type StaffUser } from "~/api/users";
import { PROVINCES } from "~/api/schools/types";

/**
 * AUTO2: which provinces a rep covers. The auto-assign engine routes a
 * lead to a rep covering the school's province first, and only falls
 * back to the whole roster when nobody covers it. The list comes from
 * the same constant the schools module uses, so spellings always match.
 */

export function parseTerritories(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
}

interface TerritoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user: StaffUser | null;
}

export function TerritoryDialog({
  open,
  onOpenChange,
  user,
}: TerritoryDialogProps) {
  const updateUser = useUpdateUser();
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (user) {
      setSelected(parseTerritories(user.territory_provinces));
    }
  }, [user]);

  const toggle = (province: string) => {
    setSelected((prev) =>
      prev.includes(province)
        ? prev.filter((p) => p !== province)
        : [...prev, province],
    );
  };

  const handleSave = async () => {
    if (!user) return;
    try {
      await updateUser.mutateAsync({
        id: user.id,
        data: { territory_provinces: selected },
      });
      toast.success(
        selected.length
          ? `${user.first_name} now covers ${selected.join(", ")}`
          : `${user.first_name} has no set territory — they compete for every lead`,
      );
      onOpenChange(false);
    } catch {
      toast.error("Failed to update territories");
    }
  };

  return (
    <Modal
      isOpen={open}
      onClose={() => onOpenChange(false)}
      title="Set Territories"
      description={
        user
          ? `Provinces ${user.first_name} ${user.last_name} covers for auto-assignment`
          : "Select provinces"
      }
      size="sm"
    >
      <div className="space-y-4">
        {user && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <span>Current:</span>
            {parseTerritories(user.territory_provinces).length > 0 ? (
              parseTerritories(user.territory_provinces).map((p) => (
                <Badge key={p} variant="outline">
                  {p}
                </Badge>
              ))
            ) : (
              <span>No territory — competes for every lead</span>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {PROVINCES.map((province) => (
            <div key={province} className="flex items-center space-x-2">
              <Checkbox
                id={`territory-${province}`}
                checked={selected.includes(province)}
                onCheckedChange={() => toggle(province)}
              />
              <Label
                htmlFor={`territory-${province}`}
                className="cursor-pointer text-sm"
              >
                {province}
              </Label>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Suggestions for a school in a covered province go to this rep
          first (whoever is least loaded among those covering it). Leave
          everything unticked to let them compete for every lead on
          workload alone.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={updateUser.isPending}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={updateUser.isPending}>
            {updateUser.isPending ? "Saving..." : "Save Territories"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
