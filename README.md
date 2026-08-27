# Wardrobe Studio

A parametric wardrobe / closet configurator that runs entirely in the browser. Enter the
parameters, inspect a live 3D model, and get shop-ready output: a panel cut list, sheet
nesting diagrams, per-panel drilling drawings, a hardware bill of materials, a printable
PDF build booklet and DXF files for CNC.

No backend, no accounts. Projects live in your browser and can be exported as JSON.

## Why it is built this way

Cabinet making has well-established rules, and the app encodes them rather than leaving
them to the user:

- **European 32mm system.** Ø5mm system holes at a 32mm pitch, front row centred 37mm
  from the front edge, balanced start holes. Panels snap to the grid so hardware indexes
  correctly.
- **Load path.** The default carcase uses continuous full-height sides with the top and
  bottom captured *between* them, so vertical load is carried in shear by the side panel
  instead of by fastener heads. The back panel sits in a groove, which roughly doubles
  carcase load capacity and keeps the box square. Wall anchors go through the sides, not
  the top.
- **Hardware geometry.** Concealed hinges are laid out from real numbers: Ø35mm cup
  13mm deep, two Ø8mm fixing holes at 45mm spacing and 9.5mm offset, and overlay derived
  as `fixed distance + boring distance − plate height`.
- **Sanity limits.** An advisor flags an 18mm shelf spanning more than 800mm, a hanging
  rail over 900mm without a centre support, an internal depth too shallow for hangers,
  and similar mistakes that only show up a year after the build.

## Getting started

```bash
npm install
npm run dev
```

Then open the printed URL. `npm test` runs the engine test suite, `npm run build`
typechecks and produces a static bundle you can host anywhere.

## Architecture

```
src/
  engine/          pure TypeScript, no React and no three.js
    spec/          the parameter schema (zod), defaults, presets, migrations
    catalog/       materials, edge banding, hinges, slides, handles, rails
    solver/        spec -> bays and openings -> Part[] with machining ops
    rules/         32mm system, joinery, hinges, drawer slides
    advisor/       validation and construction advice
    cutlist/       part aggregation, BOM, sheet nesting
    drawing/       panel drawing model and SVG renderer
    export/        DXF, CSV, PDF booklet
  app/             React UI only
    ui/            small Radix-based primitives
    panels/        parameter editor, summary, cut list, nesting, panel detail
    viewport/      react-three-fiber scene
    store/         zustand store, persistence, undo/redo
```

Everything downstream of the solver reads one array of `Part` objects. Each part is a
rectangular panel with as-cut dimensions plus a list of machining operations in
panel-local coordinates, measured from one declared datum corner. That single convention
is what keeps the 3D model, the drilling drawings, the DXF and the printed booklet in
agreement.

The engine is deterministic and covered by golden-file tests, so a refactor cannot
silently move a hole.

## Units

Millimetres throughout. Angles in degrees.
