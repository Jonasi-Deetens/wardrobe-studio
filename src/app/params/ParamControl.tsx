import { useStudio } from "../store/useStudio";
import { getAtPath, pathKey } from "../store/paths";
import { Field, NumberInput, Select, Switch } from "../ui";
import type { Param } from "./descriptors";

/**
 * One parameter row. The descriptor decides the control, so there is no per-field
 * component to keep in sync with the schema.
 */
export function ParamControl({ param }: { readonly param: Param }) {
  const spec = useStudio((state) => state.spec);
  const setValue = useStudio((state) => state.setValue);
  const id = `param-${pathKey(param.path)}`;
  const raw = getAtPath(spec, param.path);

  switch (param.kind) {
    case "number":
      return (
        <Field label={param.label} why={param.why} hint={param.hint} htmlFor={id}>
          <NumberInput
            id={id}
            value={typeof raw === "number" ? raw : 0}
            min={param.min}
            max={param.max}
            step={param.step ?? 1}
            coarseStep={param.coarseStep}
            unit={param.unit ?? "mm"}
            onChange={(value) => setValue(param.path, value)}
          />
        </Field>
      );

    case "nullable-number": {
      const isNull = raw === null || raw === undefined;
      return (
        <Field label={param.label} why={param.why} hint={param.hint} htmlFor={id}>
          {isNull ? (
            <button
              type="button"
              id={id}
              onClick={() => setValue(param.path, param.min)}
              className="h-7 rounded-md border border-line bg-bg/60 px-2.5 text-[12px] text-muted hover:border-line-strong hover:text-ink"
            >
              {param.emptyLabel}
            </button>
          ) : (
            <>
              <NumberInput
                id={id}
                value={typeof raw === "number" ? raw : param.min}
                min={param.min}
                max={param.max}
                step={param.step ?? 1}
                unit={param.unit ?? "mm"}
                onChange={(value) => setValue(param.path, value)}
              />
              <button
                type="button"
                onClick={() => setValue(param.path, null)}
                className="text-[11px] text-faint hover:text-accent"
                title={`Back to: ${param.emptyLabel}`}
              >
                auto
              </button>
            </>
          )}
        </Field>
      );
    }

    case "bool":
      return (
        <Field label={param.label} why={param.why} hint={param.hint} htmlFor={id}>
          <Switch
            id={id}
            label={param.label}
            checked={raw === true}
            onChange={(checked) => setValue(param.path, checked)}
          />
        </Field>
      );

    case "enum": {
      const value = typeof raw === "string" ? raw : "";
      const current = param.options.find((option) => option.value === value);
      return (
        <Field
          label={param.label}
          why={param.why}
          hint={param.hint ?? current?.hint}
          htmlFor={id}
          stacked={param.options.some((option) => option.label.length > 22)}
        >
          <Select
            id={id}
            value={value}
            options={param.options}
            onChange={(next) => setValue(param.path, next)}
            className={param.options.some((option) => option.label.length > 22) ? "max-w-none w-full" : undefined}
          />
        </Field>
      );
    }

    case "text":
      return (
        <Field label={param.label} why={param.why} hint={param.hint} htmlFor={id} stacked>
          {param.multiline ? (
            <textarea
              id={id}
              rows={2}
              value={typeof raw === "string" ? raw : ""}
              placeholder={param.placeholder}
              onChange={(event) => setValue(param.path, event.target.value)}
              className="ws-scroll w-full resize-y rounded-md border border-line bg-bg/60 px-2 py-1.5 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-accent/60"
            />
          ) : (
            <input
              id={id}
              value={typeof raw === "string" ? raw : ""}
              placeholder={param.placeholder}
              onChange={(event) => setValue(param.path, event.target.value)}
              className="h-7 w-full rounded-md border border-line bg-bg/60 px-2 text-[12.5px] text-ink outline-none placeholder:text-faint focus:border-accent/60 pointer-coarse:h-11 pointer-coarse:text-[16px]"
            />
          )}
        </Field>
      );
  }
}
