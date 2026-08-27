import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  BarChart3,
  Check,
  ChevronDown,
  FolderOpen,
  Link2,
  MoreHorizontal,
  Redo2,
  Save,
  Sliders,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { useRef } from "react";
import { PRESETS } from "@/engine/spec/presets";
import { cn } from "@/lib/cn";
import { useDerived } from "../store/derived";
import { MODES, redo, undo, useStudio, useTemporal } from "../store/useStudio";
import { Button, Tooltip } from "../ui";

/**
 * The top bar: identity, mode, history and the file operations.
 *
 * The mode switcher is the spine of the app — Design, Parts, Nesting, Panel, Export is
 * the order the work actually happens in, so moving left to right through the tabs is
 * moving forward through the job. On a phone it moves to a bottom bar, where a thumb can
 * reach it, and this row keeps only what has to be at the top: the project, the two
 * drawer buttons, undo and a menu.
 */
export function TopBar({
  onSave,
  onCopyLink,
  onOpenParameters,
  onOpenSummary,
}: {
  readonly onSave: () => void;
  readonly onCopyLink: () => void;
  /** Opens the parameters drawer; only shown when the panel is not beside the work. */
  readonly onOpenParameters: () => void;
  readonly onOpenSummary: () => void;
}) {
  const mode = useStudio((state) => state.mode);
  const setMode = useStudio((state) => state.setMode);
  const name = useStudio((state) => state.spec.meta.name);
  const setValue = useStudio((state) => state.setValue);
  const loadPreset = useStudio((state) => state.loadPreset);
  const loadJson = useStudio((state) => state.loadJson);
  const addNotices = useStudio((state) => state.addNotices);
  const savedAt = useStudio((state) => state.savedAt);
  const { summary, elapsedMs } = useDerived();

  const canUndo = useTemporal((state) => state.pastStates.length > 0);
  const canRedo = useTemporal((state) => state.futureStates.length > 0);
  const fileInput = useRef<HTMLInputElement>(null);

  const openFile = (file: File): void => {
    void file.text().then(
      (text) => {
        // loadJson reports its own repairs and clears the undo history.
        loadJson(text);
      },
      (error: unknown) => {
        addNotices([
          `Could not read “${file.name}”: ${error instanceof Error ? error.message : "the file could not be opened"}.`,
        ]);
      },
    );
  };

  const status =
    summary.error + summary.warning > 0 ? (
      <Tooltip content={`${summary.error} errors, ${summary.warning} warnings`}>
        <span
          className={cn(
            "tabular flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px]",
            summary.error > 0
              ? "border-error/40 bg-error/10 text-error"
              : "border-warn/40 bg-warn/10 text-warn",
          )}
        >
          {summary.error > 0 ? <X className="size-3" /> : null}
          {summary.error + summary.warning}
        </span>
      </Tooltip>
    ) : (
      <Tooltip content={`Solved in ${elapsedMs.toFixed(1)}ms · nothing flagged`}>
        <span className="flex items-center gap-1.5 rounded-md border border-ok/30 bg-ok/10 px-2 py-1 text-[11px] text-ok">
          <Check className="size-3" />
          OK
        </span>
      </Tooltip>
    );

  const presets = (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="sm" className="px-2">
          <Sparkles className="size-3.5" />
          <span className="hidden lg:inline">Presets</span>
          <ChevronDown className="size-3" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          collisionPadding={8}
          className="z-50 w-[min(20rem,calc(100vw-1rem))] rounded-lg border border-line bg-raised p-1 shadow-2xl shadow-black/50"
        >
          <DropdownMenu.Label className="px-2 py-1.5 text-[10.5px] tracking-wide text-faint uppercase">
            Start from a known arrangement
          </DropdownMenu.Label>
          {PRESETS.map((preset) => (
            <DropdownMenu.Item
              key={preset.id}
              onSelect={() => loadPreset(preset.build(), preset.name)}
              className="cursor-pointer rounded px-2 py-2 outline-none data-[highlighted]:bg-hover"
            >
              <p className="text-[12.5px] text-ink">{preset.name}</p>
              <p className="mt-0.5 text-[11px] leading-snug text-faint">{preset.description}</p>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );

  return (
    <>
      <header className="flex h-12 shrink-0 items-center gap-1.5 border-b border-line bg-surface px-2 sm:h-11 sm:gap-2 sm:px-3">
        {/* Drawer triggers, only where the panels are not already on screen. */}
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={onOpenParameters}
          aria-label="Open parameters"
        >
          <Sliders className="size-4" />
        </Button>

        <span
          className="hidden size-6 place-items-center rounded bg-accent text-[13px] font-bold text-on-accent md:grid"
          aria-hidden
        >
          W
        </span>
        <span className="hidden text-[12.5px] font-semibold tracking-tight text-ink xl:inline">
          Wardrobe Studio
        </span>

        <div className="mx-1 hidden h-5 w-px bg-line md:block" />

        <input
          value={name}
          onChange={(event) => setValue(["meta", "name"], event.target.value)}
          aria-label="Project name"
          className="h-8 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-[16px] font-medium text-ink outline-none hover:border-line focus:border-accent/60 focus:bg-bg/60 md:w-[150px] md:flex-none md:text-[12.5px]"
        />

        {/* Inline mode tabs from md up; below that the bottom bar has them. */}
        <nav
          className="mx-auto hidden items-center gap-0.5 rounded-lg border border-line bg-bg/50 p-0.5 md:flex"
          aria-label="Mode"
        >
          {MODES.map((entry) => (
            <Tooltip key={entry.id} content={entry.hint}>
              <button
                type="button"
                onClick={() => setMode(entry.id)}
                aria-current={mode === entry.id ? "page" : undefined}
                className={cn(
                  "h-7 rounded-md px-2.5 text-[12.5px] font-medium transition-colors lg:px-3",
                  mode === entry.id
                    ? "bg-accent/18 text-accent"
                    : "text-muted hover:bg-hover hover:text-ink",
                )}
              >
                {entry.label}
              </button>
            </Tooltip>
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <div className="hidden sm:block">{status}</div>

          <div className="mx-0.5 hidden h-5 w-px bg-line sm:block" />

          <Tooltip content="Undo (Ctrl+Z)">
            <Button
              variant="ghost"
              size="icon"
              disabled={!canUndo}
              onClick={undo}
              aria-label="Undo"
              className="sm:size-7"
            >
              <Undo2 className="size-4 sm:size-3.5" />
            </Button>
          </Tooltip>
          <Tooltip content="Redo (Ctrl+Shift+Z)">
            <Button
              variant="ghost"
              size="icon"
              disabled={!canRedo}
              onClick={redo}
              aria-label="Redo"
              className="hidden sm:inline-flex sm:size-7"
            >
              <Redo2 className="size-3.5" />
            </Button>
          </Tooltip>

          <div className="mx-0.5 hidden h-5 w-px bg-line sm:block" />

          {/* Full controls from sm up; a single menu below that. */}
          <div className="hidden items-center gap-1 sm:flex">
            {presets}

            <Tooltip content="Open a project JSON file">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => fileInput.current?.click()}
                aria-label="Open project"
              >
                <FolderOpen className="size-3.5" />
              </Button>
            </Tooltip>

            <Tooltip content="Save as JSON">
              <Button variant="ghost" size="icon-sm" onClick={onSave} aria-label="Save project">
                <Save className="size-3.5" />
              </Button>
            </Tooltip>

            <Tooltip content="Copy a link that carries the whole design">
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onCopyLink}
                aria-label="Copy share link"
              >
                <Link2 className="size-3.5" />
              </Button>
            </Tooltip>
          </div>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost" size="icon" className="sm:hidden" aria-label="More actions">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={6}
                collisionPadding={8}
                className="z-50 w-[min(17rem,calc(100vw-1rem))] rounded-lg border border-line bg-raised p-1 shadow-2xl shadow-black/50"
              >
                <MenuItem icon={<Redo2 className="size-4" />} onSelect={redo} disabled={!canRedo}>
                  Redo
                </MenuItem>
                <MenuItem icon={<Save className="size-4" />} onSelect={onSave}>
                  Save project file
                </MenuItem>
                <MenuItem
                  icon={<FolderOpen className="size-4" />}
                  onSelect={() => fileInput.current?.click()}
                >
                  Open project file
                </MenuItem>
                <MenuItem icon={<Link2 className="size-4" />} onSelect={onCopyLink}>
                  Copy share link
                </MenuItem>
                <DropdownMenu.Separator className="my-1 h-px bg-line" />
                <DropdownMenu.Label className="px-2 py-1.5 text-[10.5px] tracking-wide text-faint uppercase">
                  Presets
                </DropdownMenu.Label>
                {PRESETS.map((preset) => (
                  <DropdownMenu.Item
                    key={preset.id}
                    onSelect={() => loadPreset(preset.build(), preset.name)}
                    className="cursor-pointer rounded px-2 py-2 text-[12.5px] text-ink outline-none data-[highlighted]:bg-hover"
                  >
                    {preset.name}
                  </DropdownMenu.Item>
                ))}
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>

          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) openFile(file);
              event.target.value = "";
            }}
          />

          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={onOpenSummary}
            aria-label="Open summary"
          >
            <BarChart3 className="size-4" />
          </Button>

          {savedAt ? (
            <span className="ml-1 hidden text-[10.5px] text-faint xl:inline">
              Saved {new Date(savedAt).toLocaleTimeString()}
            </span>
          ) : null}
        </div>
      </header>

      {/* A phone-sized status line, since the badge does not fit in the bar above. */}
      <div className="flex items-center gap-2 border-b border-line bg-surface/60 px-2 py-1 sm:hidden">
        {status}
        <span className="truncate text-[11px] text-faint">
          {savedAt ? `Saved ${new Date(savedAt).toLocaleTimeString()}` : "Not saved yet"}
        </span>
      </div>
    </>
  );
}

/**
 * The mode switcher as a bottom bar, for reach on a phone. It scrolls rather than
 * shrinking, so the five labels stay readable however narrow the screen is.
 */
export function ModeBar() {
  const mode = useStudio((state) => state.mode);
  const setMode = useStudio((state) => state.setMode);

  return (
    <nav
      className="ws-scroll-none flex shrink-0 overflow-x-auto border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
      aria-label="Mode"
    >
      {MODES.map((entry) => (
        <button
          key={entry.id}
          type="button"
          onClick={() => setMode(entry.id)}
          aria-current={mode === entry.id ? "page" : undefined}
          className={cn(
            "min-h-11 min-w-[4.5rem] flex-1 border-t-2 px-3 py-2 text-[12px] font-medium whitespace-nowrap transition-colors",
            mode === entry.id
              ? "border-accent bg-accent/[0.12] text-accent"
              : "border-transparent text-muted active:bg-hover",
          )}
        >
          {entry.label}
        </button>
      ))}
    </nav>
  );
}

function MenuItem({
  icon,
  onSelect,
  disabled = false,
  children,
}: {
  readonly icon: React.ReactNode;
  readonly onSelect: () => void;
  readonly disabled?: boolean;
  readonly children: React.ReactNode;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      disabled={disabled}
      className="flex cursor-pointer items-center gap-2.5 rounded px-2 py-2 text-[12.5px] text-ink outline-none data-[disabled]:pointer-events-none data-[disabled]:opacity-40 data-[highlighted]:bg-hover"
    >
      <span className="text-muted">{icon}</span>
      {children}
    </DropdownMenu.Item>
  );
}
