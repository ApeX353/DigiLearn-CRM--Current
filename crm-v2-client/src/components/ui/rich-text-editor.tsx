import { useCallback, useEffect, useRef, useState } from "react";
import {
  AtSign,
  Bold,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  RemoveFormatting,
  Underline,
} from "lucide-react";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "~/components/ui/popover";
import { Separator } from "~/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "~/components/ui/tooltip";
import {
  MENTION_CLASS,
  isRichTextEmpty,
  sanitizeRichText,
} from "~/lib/rich-text";
import { cn } from "~/lib/utils";

/**
 * Shared typography for the editor surface and the read-only renderer, so a
 * body looks identical while it is being written and after it is saved.
 *
 * Tailwind's preflight flattens lists, so list styling has to be restated here
 * rather than inherited.
 */
export const RICH_TEXT_PROSE = cn(
  "[&_ul]:my-1 [&_ul]:list-disc [&_ul]:pl-5",
  "[&_ol]:my-1 [&_ol]:list-decimal [&_ol]:pl-5",
  "[&_li]:my-0.5",
  "[&_p]:my-1 [&_p:first-child]:mt-0 [&_p:last-child]:mb-0",
  "[&_a]:font-medium [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2",
  "[&_b]:font-semibold [&_strong]:font-semibold",
  // Written out in full on purpose. Tailwind scans source text statically, so
  // a class built from `${MENTION_CLASS}` is never generated — the markup gets
  // the class and no styling at all.
  "[&_.crm-mention]:rounded [&_.crm-mention]:bg-primary/10",
  "[&_.crm-mention]:px-1 [&_.crm-mention]:py-px",
  "[&_.crm-mention]:font-medium [&_.crm-mention]:text-primary",
);

export interface MentionOption {
  id: string;
  name: string;
  hint?: string;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** People offered by the @ button. Hidden entirely when empty. */
  mentions?: MentionOption[];
  minHeight?: number;
  autoFocus?: boolean;
  className?: string;
  /** Tints the writing surface, e.g. the amber note pad. */
  surfaceClassName?: string;
}

type ToolbarCommand = "bold" | "italic" | "underline";

/**
 * A deliberately small rich-text editor: bold/italic/underline, links, lists,
 * @mentions and a clear-formatting escape hatch. It matches the Pipedrive note
 * editor the composer is modelled on, without pulling in an editor framework
 * for what is ultimately eight commands.
 *
 * The surface is an uncontrolled contenteditable. Rewriting `innerHTML` on
 * every keystroke would reset the caret to the start of the node on each
 * render, so the DOM owns the text and React is told about it afterwards; the
 * sync effect only writes back when the incoming value genuinely differs from
 * what is on screen (a parent reset, not the user's own typing).
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
  mentions = [],
  minHeight = 96,
  autoFocus,
  className,
  surfaceClassName,
}: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const savedRange = useRef<Range | null>(null);
  const [active, setActive] = useState<Record<ToolbarCommand, boolean>>({
    bold: false,
    italic: false,
    underline: false,
  });
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionQuery, setMentionQuery] = useState("");

  const emitChange = useCallback(() => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }, [onChange]);

  // Push external resets (parent clearing the form after a save) into the DOM,
  // but never fight the user's own typing — that value round-trips unchanged.
  useEffect(() => {
    const el = editorRef.current;
    if (el && el.innerHTML !== value) el.innerHTML = value ?? "";
  }, [value]);

  useEffect(() => {
    if (autoFocus) editorRef.current?.focus();
  }, [autoFocus]);

  // The caret has to survive a trip to a popover, so remember the last range
  // that belonged to this editor and restore it before inserting anything.
  useEffect(() => {
    const onSelectionChange = () => {
      const el = editorRef.current;
      const sel = window.getSelection();
      if (!el || !sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) return;
      savedRange.current = range.cloneRange();
      setActive({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
      });
    };
    document.addEventListener("selectionchange", onSelectionChange);
    return () =>
      document.removeEventListener("selectionchange", onSelectionChange);
  }, []);

  const restoreSelection = useCallback(() => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const sel = window.getSelection();
    if (!sel) return;
    const saved = savedRange.current;
    if (saved && el.contains(saved.commonAncestorContainer)) {
      sel.removeAllRanges();
      sel.addRange(saved);
      return;
    }
    // No usable caret (first interaction, or the range was invalidated) —
    // append at the end rather than silently dropping the insertion.
    const range = document.createRange();
    range.selectNodeContents(el);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  const exec = useCallback(
    (command: string, arg?: string) => {
      restoreSelection();
      document.execCommand(command, false, arg);
      emitChange();
      setActive({
        bold: document.queryCommandState("bold"),
        italic: document.queryCommandState("italic"),
        underline: document.queryCommandState("underline"),
      });
    },
    [emitChange, restoreSelection],
  );

  const applyLink = useCallback(() => {
    const raw = linkUrl.trim();
    if (!raw) return;
    // A bare "digilearn.co.zw" is what people actually type; treat it as https
    // rather than letting the browser resolve it as a relative path.
    const href = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
    restoreSelection();
    const sel = window.getSelection();
    const hasSelection = sel && !sel.isCollapsed;
    if (hasSelection) {
      exec("createLink", href);
    } else {
      // Nothing selected — insert the URL as its own linked text.
      exec(
        "insertHTML",
        `<a href="${href.replace(/"/g, "&quot;")}">${raw.replace(/[<>&]/g, "")}</a>&nbsp;`,
      );
    }
    setLinkUrl("");
    setLinkOpen(false);
  }, [exec, linkUrl, restoreSelection]);

  const insertMention = useCallback(
    (person: MentionOption) => {
      const safe = person.name.replace(/[<>&]/g, "");
      exec(
        "insertHTML",
        `<span class="${MENTION_CLASS}">@${safe}</span>&nbsp;`,
      );
      setMentionQuery("");
      setMentionOpen(false);
    },
    [exec],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLDivElement>) => {
      // Pasting from a browser or Word drags in styles, fonts and scripts.
      // Keep the structure we support, discard the rest.
      e.preventDefault();
      const html = e.clipboardData.getData("text/html");
      const text = e.clipboardData.getData("text/plain");
      if (html) document.execCommand("insertHTML", false, sanitizeRichText(html));
      else document.execCommand("insertText", false, text);
      emitChange();
    },
    [emitChange],
  );

  const filteredMentions = mentionQuery.trim()
    ? mentions.filter((m) =>
        `${m.name} ${m.hint ?? ""}`
          .toLowerCase()
          .includes(mentionQuery.trim().toLowerCase()),
      )
    : mentions;

  const showPlaceholder = isRichTextEmpty(value);

  return (
    <div
      className={cn(
        "rounded-md border bg-background focus-within:ring-1 focus-within:ring-ring",
        className,
      )}
    >
      <div className="relative">
        <div
          ref={editorRef}
          contentEditable
          role="textbox"
          aria-multiline="true"
          aria-label={placeholder ?? "Message body"}
          suppressContentEditableWarning
          onInput={emitChange}
          onBlur={emitChange}
          onPaste={handlePaste}
          style={{ minHeight }}
          className={cn(
            "w-full px-3 py-2 text-sm outline-none",
            RICH_TEXT_PROSE,
            surfaceClassName,
          )}
        />
        {showPlaceholder && placeholder && (
          <p
            aria-hidden
            className="pointer-events-none absolute left-3 top-2 text-sm text-muted-foreground"
          >
            {placeholder}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-0.5 border-t px-1.5 py-1">
        <ToolbarButton
          label="Bold"
          shortcut="Ctrl+B"
          icon={Bold}
          pressed={active.bold}
          onClick={() => exec("bold")}
        />
        <ToolbarButton
          label="Italic"
          shortcut="Ctrl+I"
          icon={Italic}
          pressed={active.italic}
          onClick={() => exec("italic")}
        />
        <ToolbarButton
          label="Underline"
          shortcut="Ctrl+U"
          icon={Underline}
          pressed={active.underline}
          onClick={() => exec("underline")}
        />

        <Separator orientation="vertical" className="mx-1 h-5" />

        <Popover open={linkOpen} onOpenChange={setLinkOpen}>
          <Tooltip>
            <TooltipTrigger asChild>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  // Keep the caret where it is; the popover would otherwise
                  // steal focus and collapse the selection.
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <LinkIcon className="size-3.5" />
                  <span className="sr-only">Insert link</span>
                </Button>
              </PopoverTrigger>
            </TooltipTrigger>
            <TooltipContent>Insert link</TooltipContent>
          </Tooltip>
          <PopoverContent align="start" className="w-72 p-2">
            <p className="mb-1.5 text-xs font-medium">Link to</p>
            <div className="flex gap-1.5">
              <Input
                autoFocus
                value={linkUrl}
                placeholder="https://…"
                onChange={(e) => setLinkUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyLink();
                  }
                }}
                className="h-8"
              />
              <Button
                type="button"
                size="sm"
                className="h-8"
                onClick={applyLink}
              >
                Add
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <ToolbarButton
          label="Bulleted list"
          icon={List}
          onClick={() => exec("insertUnorderedList")}
        />
        <ToolbarButton
          label="Numbered list"
          icon={ListOrdered}
          onClick={() => exec("insertOrderedList")}
        />

        {mentions.length > 0 && (
          <>
            <Separator orientation="vertical" className="mx-1 h-5" />
            <Popover open={mentionOpen} onOpenChange={setMentionOpen}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <PopoverTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onMouseDown={(e) => e.preventDefault()}
                    >
                      <AtSign className="size-3.5" />
                      <span className="sr-only">Mention a colleague</span>
                    </Button>
                  </PopoverTrigger>
                </TooltipTrigger>
                <TooltipContent>Mention a colleague</TooltipContent>
              </Tooltip>
              <PopoverContent align="start" className="w-64 p-0">
                <div className="border-b p-2">
                  <Input
                    autoFocus
                    value={mentionQuery}
                    placeholder="Search people…"
                    onChange={(e) => setMentionQuery(e.target.value)}
                    className="h-8"
                  />
                </div>
                <div className="max-h-56 overflow-y-auto p-1">
                  {filteredMentions.length === 0 ? (
                    <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                      No one matches “{mentionQuery}”
                    </p>
                  ) : (
                    filteredMentions.map((person) => (
                      <button
                        key={person.id}
                        type="button"
                        onClick={() => insertMention(person)}
                        className="flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left hover:bg-accent"
                      >
                        <span className="text-sm">{person.name}</span>
                        {person.hint && (
                          <span className="text-xs text-muted-foreground">
                            {person.hint}
                          </span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              </PopoverContent>
            </Popover>
          </>
        )}

        <Separator orientation="vertical" className="mx-1 h-5" />
        <ToolbarButton
          label="Clear formatting"
          icon={RemoveFormatting}
          onClick={() => {
            exec("removeFormat");
            exec("unlink");
          }}
        />
      </div>
    </div>
  );
}

function ToolbarButton({
  label,
  shortcut,
  icon: Icon,
  pressed,
  onClick,
}: {
  label: string;
  shortcut?: string;
  icon: React.ComponentType<{ className?: string }>;
  pressed?: boolean;
  onClick: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={label}
          aria-pressed={pressed}
          // preventDefault keeps focus (and therefore the selection) in the
          // editor, which is what execCommand operates on.
          onMouseDown={(e) => e.preventDefault()}
          onClick={onClick}
          className={cn("size-7", pressed && "bg-accent text-accent-foreground")}
        >
          <Icon className="size-3.5" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {label}
        {shortcut && (
          <span className="ml-1.5 text-muted-foreground">{shortcut}</span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * Read-only counterpart. Renders composer markup as markup and legacy plain
 * text as plain text, so the 5.5k rows written before the editor existed keep
 * their line breaks instead of collapsing into one paragraph.
 */
export function RichTextView({
  value,
  className,
}: {
  value?: string | null;
  className?: string;
}) {
  const html = value ?? "";
  if (!html.trim()) return null;

  // `looksLikeRichText` is folded into sanitize's caller rather than repeated:
  // plain text goes down the whitespace-preserving path untouched.
  if (!/<(b|strong|i|em|u|a|ul|ol|li|p|br|span|div)\b[^>]*>/i.test(html)) {
    return (
      <div className={cn("whitespace-pre-wrap", className)}>{html}</div>
    );
  }

  return (
    <div
      className={cn(RICH_TEXT_PROSE, className)}
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(html) }}
    />
  );
}
