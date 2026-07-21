import { useEffect, useCallback } from "react";
import type { ComposerActivityType } from "~/types/activity-composers";

interface UseActivityHotkeysOptions {
  activeType: ComposerActivityType;
  onTypeChange: (type: ComposerActivityType) => void;
  onSave: () => void;
  disabled?: boolean;
}

const TYPE_HOTKEYS: Record<string, ComposerActivityType> = {
  "1": "call",
  "2": "whatsapp",
  "3": "email",
  "4": "meeting",
  "5": "note",
  "6": "task",
};

/**
 * Hook to handle keyboard shortcuts for activity composers
 * 
 * Shortcuts:
 * - 1: Switch to Call
 * - 2: Switch to WhatsApp
 * - 3: Switch to Email
 * - 4: Switch to Meeting
 * - 5: Switch to Note
 * - 6: Switch to Task
 * - Cmd/Ctrl + Enter: Save
 */
export function useActivityHotkeys({
  activeType,
  onTypeChange,
  onSave,
  disabled = false,
}: UseActivityHotkeysOptions) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (disabled) return;

    // Don't trigger shortcuts when typing in inputs/textareas
    const target = event.target as HTMLElement;
    const isInput = 
      target.tagName === "INPUT" || 
      target.tagName === "TEXTAREA" || 
      target.isContentEditable;

    // Cmd/Ctrl + Enter to save (works even in inputs)
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      onSave();
      return;
    }

    // Number shortcuts only when not in an input
    if (isInput) return;

    const newType = TYPE_HOTKEYS[event.key];
    if (newType && newType !== activeType) {
      event.preventDefault();
      onTypeChange(newType);
    }
  }, [activeType, onTypeChange, onSave, disabled]);

  useEffect(() => {
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleKeyDown]);
}

/**
 * Get display text for keyboard shortcut hint
 */
export function getShortcutHint(type: ComposerActivityType): string {
  const keys = Object.entries(TYPE_HOTKEYS);
  const entry = keys.find(([, t]) => t === type);
  return entry ? entry[0] : "";
}

/**
 * Get save shortcut text based on platform
 */
export function getSaveShortcutText(): string {
  const isMac = typeof navigator !== "undefined" && navigator.platform.toUpperCase().indexOf("MAC") >= 0;
  return isMac ? "⌘ Enter" : "Ctrl + Enter";
}
