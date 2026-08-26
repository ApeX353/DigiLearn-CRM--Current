import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "~/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { useAllStaff } from "~/api/staff/use-staff";
// import { useRbacStore } from "~/stores/use-rbac-store";

interface StaffComboboxProps {
  value?: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  fetchEnabled?: boolean;
}

export function StaffCombobox({
  value,
  onValueChange,
  placeholder = "Select user...",
  disabled = false,
  fetchEnabled = true,
}: StaffComboboxProps) {
  const [open, setOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  // const ability = useRbacStore(state => state.ability);

  // const cannotAssignToUser = ability.cannot('create', 'Lead', 'assigned_to');

  const { data: staffData, isLoading } = useAllStaff({
    status: "active",
    search: searchQuery || undefined,
    limit: 50,
    page: 1
  }, { enabled: fetchEnabled && !disabled });

  const staff = staffData?.data || [];
  const selectedStaff = staff.find((s) => s.id === value);

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        if (disabled) return;
        setOpen(nextOpen);
      }}
    >
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between"
          disabled={disabled}
        >
          {selectedStaff
            ? `${selectedStaff.first_name} ${selectedStaff.last_name}`
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Search users..."
            value={searchQuery}
            onValueChange={setSearchQuery}
            disabled={disabled || !fetchEnabled}
          />
          <CommandList>
            <CommandEmpty>
              {isLoading ? "Loading..." : "No user found."}
            </CommandEmpty>
            <CommandGroup>
              {staff.map((staffMember) => (
                <CommandItem
                  key={staffMember.id}
                  value={staffMember.id}
                  onSelect={(currentValue) => {
                    onValueChange(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === staffMember.id ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {staffMember.first_name} {staffMember.last_name}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {staffMember.email}
                    </span>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
