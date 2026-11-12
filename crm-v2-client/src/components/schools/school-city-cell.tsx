import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import Modal from "~/components/ui/modal";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { useSetSchoolCity } from "~/api/schools";

interface SchoolCityCellProps {
  schoolId: string;
  schoolName: string;
  city: string | null | undefined;
  className?: string;
}

/**
 * Shows the school's city, or — when none is set — a "Click here to
 * enter city" prompt that opens a small dialog. Every signed-in user
 * can fill in a missing city (owner decision 2026-07-27); changing an
 * existing one stays in Edit School for managers.
 */
export function SchoolCityCell({
  schoolId,
  schoolName,
  city,
  className,
}: SchoolCityCellProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const setCity = useSetSchoolCity();

  if (city?.trim()) {
    return <div className={className ?? "text-sm"}>{city}</div>;
  }

  const save = () => {
    const trimmed = value.trim();
    if (!trimmed) return;
    setCity.mutate(
      { id: schoolId, city: trimmed },
      {
        onSuccess: () => {
          toast.success(`City saved for ${schoolName}`);
          setOpen(false);
          setValue("");
        },
        onError: () => {
          toast.error("Could not save the city — please try again");
        },
      },
    );
  };

  return (
    <>
      <button
        type="button"
        className={`${className ?? "text-sm"} text-primary underline-offset-2 hover:underline`}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        Click here to enter city
      </button>
      <Modal
        isOpen={open}
        onClose={() => setOpen(false)}
        title="Enter city"
        description={`Which city does ${schoolName} belong to?`}
      >
        <div
          className="space-y-4"
          onClick={(e) => e.stopPropagation()}
        >
          <Input
            autoFocus
            placeholder="e.g. Gwanda"
            value={value}
            maxLength={100}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                save();
              }
            }}
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={save}
              disabled={!value.trim() || setCity.isPending}
            >
              {setCity.isPending && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}
              Save city
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
