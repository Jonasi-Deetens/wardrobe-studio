import * as Collapsible from "@radix-ui/react-collapsible";
import { ChevronRight, Search, X } from "lucide-react";
import { useMemo } from "react";
import { cn } from "@/lib/cn";
import { useStudio } from "../store/useStudio";
import { Button } from "../ui";
import { LayoutEditor } from "./LayoutEditor";
import { matchesSearch, PARAM_GROUPS, type Param, type ParamGroup } from "./descriptors";
import { ParamControl } from "./ParamControl";

/**
 * The left pane: every parameter, grouped and collapsible, with a search box.
 *
 * Search filters the fields themselves rather than jumping to a section, because the
 * question is usually "where do I set the kerf" and the fastest answer is to show that
 * one field with nothing else around it.
 */
export function ParameterPanel() {
  const spec = useStudio((state) => state.spec);
  const search = useStudio((state) => state.search);
  const setSearch = useStudio((state) => state.setSearch);
  const openGroups = useStudio((state) => state.openGroups);
  const toggleGroup = useStudio((state) => state.toggleGroup);
  const setOpenGroups = useStudio((state) => state.setOpenGroups);

  const searching = search.trim().length > 0;

  const visible = useMemo(() => {
    const groups: { group: ParamGroup; params: Param[] }[] = [];
    for (const group of PARAM_GROUPS) {
      const params = group.params.filter(
        (param) => (param.when ? param.when(spec) : true) && matchesSearch(param, group, search),
      );
      const keepCustom = group.custom !== undefined && !searching;
      if (params.length > 0 || keepCustom) groups.push({ group, params });
    }
    return groups;
  }, [spec, search, searching]);

  const matchCount = visible.reduce((sum, entry) => sum + entry.params.length, 0);

  return (
    <div className="flex h-full min-h-0 flex-col bg-surface">
      <div className="flex items-center gap-1.5 border-b border-line px-2.5 py-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-faint" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search parameters"
            aria-label="Search parameters"
            className="h-7 w-full rounded-md border border-line bg-bg/60 pr-7 pl-7 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-accent/60 pointer-coarse:h-11 pointer-coarse:text-[16px]"
          />
          {searching ? (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute top-1/2 right-1.5 -translate-y-1/2 text-faint hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </div>
        {!searching ? (
          <Button
            variant="ghost"
            size="sm"
            className="px-2 text-[11px]"
            onClick={() =>
              setOpenGroups(
                openGroups.length === PARAM_GROUPS.length ? [] : PARAM_GROUPS.map((g) => g.id),
              )
            }
          >
            {openGroups.length === PARAM_GROUPS.length ? "Collapse" : "Expand"}
          </Button>
        ) : null}
      </div>

      {searching ? (
        <p className="border-b border-line px-3 py-1.5 text-[11px] text-faint">
          {matchCount} {matchCount === 1 ? "parameter" : "parameters"} match “{search.trim()}”
        </p>
      ) : null}

      <div className="ws-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {visible.length === 0 ? (
          <p className="px-3 py-6 text-center text-[12px] text-faint">
            Nothing matches. Try “hinge”, “kerf” or “shelf”.
          </p>
        ) : null}

        {visible.map(({ group, params }) => {
          const open = searching || openGroups.includes(group.id);
          return (
            <Collapsible.Root
              key={group.id}
              open={open}
              onOpenChange={() => !searching && toggleGroup(group.id)}
            >
              <Collapsible.Trigger
                className={cn(
                  "sticky top-0 z-10 flex w-full items-center gap-1.5 border-b border-line bg-surface/95 px-2.5 py-[7px] text-left backdrop-blur transition-colors",
                  "hover:bg-hover",
                )}
              >
                <ChevronRight
                  className={cn(
                    "size-3.5 shrink-0 text-faint transition-transform",
                    open && "rotate-90",
                  )}
                />
                <span className="text-[12px] font-medium tracking-wide text-ink uppercase">
                  {group.label}
                </span>
                <span className="ml-auto shrink-0 text-[10.5px] text-faint">
                  {group.custom ? "" : params.length}
                </span>
              </Collapsible.Trigger>
              <Collapsible.Content>
                {group.description && !searching ? (
                  <p className="px-3 pt-2 pb-1 text-[11px] leading-snug text-faint">
                    {group.description}
                  </p>
                ) : null}
                {group.custom === "layout" ? <LayoutEditor /> : null}
                <div className="divide-y divide-line/40 pb-1">
                  {params.map((param) => (
                    <ParamControl key={param.path.join(".")} param={param} />
                  ))}
                </div>
              </Collapsible.Content>
            </Collapsible.Root>
          );
        })}
      </div>
    </div>
  );
}
