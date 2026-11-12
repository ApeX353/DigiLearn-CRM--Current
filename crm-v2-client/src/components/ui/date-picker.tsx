"use client";

import * as React from "react";
import { format } from "date-fns";
import { CalendarIcon } from "lucide-react";

import { cn } from "~/lib/utils";
import { Button } from "~/components/ui/button";
import { Calendar } from "~/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Input } from "~/components/ui/input";

interface DatePickerProps {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
}

function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
  disabled,
  className,
  minDate,
  maxDate,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? format(value, "PPP") : <span>{placeholder}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={(date) => {
            onChange?.(date);
            setOpen(false);
          }}
          disabled={(date) => {
            if (minDate && date < minDate) return true;
            if (maxDate && date > maxDate) return true;
            return false;
          }}
          initialFocus
        />
      </PopoverContent>
    </Popover>
  );
}

interface DateTimePickerProps {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  minDate?: Date;
  maxDate?: Date;
}

function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick date and time",
  disabled,
  className,
  minDate,
  maxDate,
}: DateTimePickerProps) {
  const [open, setOpen] = React.useState(false);

  const timeValue = value
    ? `${String(value.getHours()).padStart(2, "0")}:${String(value.getMinutes()).padStart(2, "0")}`
    : "";

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) {
      onChange?.(undefined);
      return;
    }
    // Preserve time if we already have a value, otherwise use current time
    if (value) {
      date.setHours(value.getHours(), value.getMinutes());
    }
    onChange?.(date);
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const [hours, minutes] = e.target.value.split(":").map(Number);
    if (isNaN(hours) || isNaN(minutes)) return;

    const newDate = value ? new Date(value) : new Date();
    newDate.setHours(hours, minutes);
    onChange?.(newDate);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !value && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {value ? (
            format(value, "PPP 'at' h:mm a")
          ) : (
            <span>{placeholder}</span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          onSelect={handleDateSelect}
          disabled={(date) => {
            if (minDate && date < minDate) return true;
            if (maxDate && date > maxDate) return true;
            return false;
          }}
          initialFocus
        />
        <div className="border-t p-3">
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Time:</span>
            <Input
              type="time"
              value={timeValue}
              onChange={handleTimeChange}
              className="w-auto"
              disabled={disabled}
            />
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export { DatePicker, DateTimePicker };
