/**
 * Metal sections, as they are actually sold.
 *
 * A tube is bought in a fixed set of sizes and in six-metre lengths, and that is what
 * decides the design: you cannot ask for a 35mm leg, and a 5.9m frame member wastes a
 * whole bar. So the catalogue carries the real EN 10219 range, the published mass per
 * metre, a trade price and the stock length, and the frame builders choose from it.
 *
 * Masses are the tabulated values rather than `4t(a−t)ρ`, because the corner radius on a
 * cold-formed section takes 5 to 10 per cent off a thick-walled small tube, and the weight
 * is what a fabricator quotes and what a shelf bracket has to carry.
 *
 * On sizes: square hollow section comes in 20, 25, 30, 40 and 50mm with 1.5, 2 or 3mm
 * walls; rectangular in 40x20, 50x30 and 60x40; gastronorm table legs are 38.1mm (1.5in)
 * or 42.4mm round tube. There is no 8x8 hollow bar — the smallest section anybody stocks
 * is 20x20, and a table leg wants 40x40 or 38mm round.
 */

export type ProfileShape = "square" | "rectangular" | "round" | "flat" | "angle";

export type ProfileAlloy = "mild-steel" | "stainless-304";

export type Profile = {
  readonly id: string;
  readonly name: string;
  readonly shortName: string;
  readonly shape: ProfileShape;
  readonly alloy: ProfileAlloy;
  /** Section width, across the member. The outside diameter for round tube. */
  readonly width: number;
  /** Section height. Equal to the width for square and round sections. */
  readonly height: number;
  /** Wall thickness. For flat bar and angle this is the material thickness. */
  readonly wall: number;
  readonly massPerMetre: number;
  readonly pricePerMetre: number;
  /** Length a bar is bought in, which the tube nest cuts from. */
  readonly stockLength: number;
  /** Outside corner radius, for drawing and for the fit between a tube and a panel. */
  readonly cornerRadius: number;
  /** Rendering colour, sRGB hex. */
  readonly color: string;
  readonly notes?: string;
};

/** One section in mild steel, from which the stainless version is derived. */
type Section = {
  readonly key: string;
  readonly shape: ProfileShape;
  readonly width: number;
  readonly height: number;
  readonly wall: number;
  /** Tabulated kg/m in mild steel. */
  readonly mass: number;
  readonly notes?: string;
};

const SECTIONS: readonly Section[] = [
  /* Square hollow section. 40x40x2 is the workhorse: it is the standard commercial table
     leg, and a 2mm wall takes a thread insert for a levelling foot. */
  { key: "shs-20x20x1.5", shape: "square", width: 20, height: 20, wall: 1.5, mass: 0.87 },
  { key: "shs-20x20x2", shape: "square", width: 20, height: 20, wall: 2, mass: 1.12 },
  { key: "shs-20x20x3", shape: "square", width: 20, height: 20, wall: 3, mass: 1.44 },
  { key: "shs-25x25x1.5", shape: "square", width: 25, height: 25, wall: 1.5, mass: 1.11 },
  { key: "shs-25x25x2", shape: "square", width: 25, height: 25, wall: 2, mass: 1.43 },
  { key: "shs-25x25x3", shape: "square", width: 25, height: 25, wall: 3, mass: 1.91 },
  { key: "shs-30x30x1.5", shape: "square", width: 30, height: 30, wall: 1.5, mass: 1.34 },
  { key: "shs-30x30x2", shape: "square", width: 30, height: 30, wall: 2, mass: 1.74 },
  { key: "shs-30x30x3", shape: "square", width: 30, height: 30, wall: 3, mass: 2.38 },
  { key: "shs-40x40x1.5", shape: "square", width: 40, height: 40, wall: 1.5, mass: 1.81 },
  {
    key: "shs-40x40x2",
    shape: "square",
    width: 40,
    height: 40,
    wall: 2,
    mass: 2.37,
    notes: "The standard leg for a commercial table: stiff enough at 900mm, and a 2mm wall takes an M10 foot insert.",
  },
  { key: "shs-40x40x3", shape: "square", width: 40, height: 40, wall: 3, mass: 3.3 },
  { key: "shs-50x50x1.5", shape: "square", width: 50, height: 50, wall: 1.5, mass: 2.28 },
  {
    key: "shs-50x50x2",
    shape: "square",
    width: 50,
    height: 50,
    wall: 2,
    mass: 3,
    notes: "For a bar counter, where the frame is 1050mm tall and unbraced across the front.",
  },
  { key: "shs-50x50x3", shape: "square", width: 50, height: 50, wall: 3, mass: 4.25 },

  /* Rectangular, for a rail that has to be stiff one way and thin the other. */
  { key: "rhs-40x20x1.5", shape: "rectangular", width: 40, height: 20, wall: 1.5, mass: 1.34 },
  {
    key: "rhs-40x20x2",
    shape: "rectangular",
    width: 40,
    height: 20,
    wall: 2,
    mass: 1.74,
    notes: "Laid on edge it is a rail; laid flat it is a shelf bearer that takes up almost no headroom.",
  },
  { key: "rhs-50x30x2", shape: "rectangular", width: 50, height: 30, wall: 2, mass: 2.37 },
  { key: "rhs-50x30x3", shape: "rectangular", width: 50, height: 30, wall: 3, mass: 3.3 },
  { key: "rhs-60x40x2", shape: "rectangular", width: 60, height: 40, wall: 2, mass: 2.99 },
  { key: "rhs-60x40x3", shape: "rectangular", width: 60, height: 40, wall: 3, mass: 4.25 },

  /* Round tube. 38.1mm is 1.5 inches and is the gastronorm standard, so every bullet
     foot, undershelf clamp and castor on the market fits it. */
  {
    key: "tube-38.1x1.5",
    shape: "round",
    width: 38.1,
    height: 38.1,
    wall: 1.5,
    mass: 1.35,
    notes: "1.5 inch: the size stainless kitchen fittings are made to.",
  },
  { key: "tube-38.1x2", shape: "round", width: 38.1, height: 38.1, wall: 2, mass: 1.79 },
  { key: "tube-42.4x1.5", shape: "round", width: 42.4, height: 42.4, wall: 1.5, mass: 1.51 },
  {
    key: "tube-42.4x2",
    shape: "round",
    width: 42.4,
    height: 42.4,
    wall: 2,
    mass: 1.99,
    notes: "DN32 handrail tube. Heavier than 38.1 and easier to source in stainless.",
  },

  /* Flat bar and angle: gussets, top fixing tabs and shelf ledges. */
  { key: "flat-30x5", shape: "flat", width: 30, height: 5, wall: 5, mass: 1.18 },
  { key: "flat-40x5", shape: "flat", width: 40, height: 5, wall: 5, mass: 1.57 },
  { key: "flat-50x6", shape: "flat", width: 50, height: 6, wall: 6, mass: 2.36 },
  {
    key: "angle-30x30x3",
    shape: "angle",
    width: 30,
    height: 30,
    wall: 3,
    mass: 1.36,
    notes: "Welded under a panel top it makes a ledge to screw the top down onto.",
  },
  { key: "angle-40x40x4", shape: "angle", width: 40, height: 40, wall: 4, mass: 2.42 },
];

/**
 * Trade prices, as a rate on the weight.
 *
 * Steel is sold by weight and fabricated by the metre, so a per-kilo rate reproduces the
 * shape of a real quote far better than a table of guessed per-metre prices. Stainless is
 * the multiple everyone underestimates: the same frame in 304 costs about four times as
 * much before a single cut is made.
 */
const RATE: Record<ProfileAlloy, number> = { "mild-steel": 3.2, "stainless-304": 13.5 };

/** 304 is a little denser than mild steel. */
const STAINLESS_DENSITY_FACTOR = 1.02;

const ALLOY_LABEL: Record<ProfileAlloy, string> = {
  "mild-steel": "mild steel",
  "stainless-304": "304 stainless",
};

const ALLOY_COLOR: Record<ProfileAlloy, string> = {
  /* Primed rather than bare: a mild steel frame is painted, and bare steel renders as an
     unconvincing grey next to stainless. */
  "mild-steel": "#5c6068",
  "stainless-304": "#b9bec4",
};

/** Bar length. Six metres is the trade standard for both alloys. */
const STOCK_LENGTH = 6000;

function sectionName(section: Section): string {
  switch (section.shape) {
    case "square":
      return `SHS ${section.width} × ${section.width} × ${section.wall}`;
    case "rectangular":
      return `RHS ${section.width} × ${section.height} × ${section.wall}`;
    case "round":
      return `Ø${section.width} × ${section.wall} tube`;
    case "flat":
      return `Flat bar ${section.width} × ${section.wall}`;
    case "angle":
      return `Angle ${section.width} × ${section.height} × ${section.wall}`;
  }
}

function build(section: Section, alloy: ProfileAlloy): Profile {
  const mass =
    alloy === "stainless-304"
      ? Math.round(section.mass * STAINLESS_DENSITY_FACTOR * 1000) / 1000
      : section.mass;
  const name = sectionName(section);
  return {
    id: alloy === "stainless-304" ? `${section.key}-ss` : section.key,
    name: `${name}, ${ALLOY_LABEL[alloy]}`,
    shortName: alloy === "stainless-304" ? `${name} SS` : name,
    shape: section.shape,
    alloy,
    width: section.width,
    height: section.height,
    wall: section.wall,
    massPerMetre: mass,
    pricePerMetre: Math.round(mass * RATE[alloy] * 100) / 100,
    stockLength: STOCK_LENGTH,
    /* Cold-formed hollow sections have an outside radius of about 1.5 times the wall on
       thin walls and twice it on thick ones. Solid sections have a sharp corner. */
    cornerRadius:
      section.shape === "round" || section.shape === "flat" || section.shape === "angle"
        ? 0
        : Math.round(section.wall * (section.wall >= 3 ? 2 : 1.5) * 10) / 10,
    color: ALLOY_COLOR[alloy],
    ...(section.notes === undefined ? {} : { notes: section.notes }),
  };
}

export const PROFILES: readonly Profile[] = SECTIONS.flatMap((section) => [
  build(section, "mild-steel"),
  build(section, "stainless-304"),
]);

export const PROFILE_BY_ID = new Map(PROFILES.map((profile) => [profile.id, profile]));

export function getProfile(id: string): Profile {
  const profile = PROFILE_BY_ID.get(id);
  if (!profile) throw new Error(`Unknown profile: ${id}`);
  return profile;
}

export function profilesFor(filter: {
  readonly shapes?: readonly ProfileShape[];
  readonly alloy?: ProfileAlloy;
}): readonly Profile[] {
  return PROFILES.filter(
    (profile) =>
      (!filter.shapes || filter.shapes.includes(profile.shape)) &&
      (!filter.alloy || profile.alloy === filter.alloy),
  );
}

/** The same section in the other alloy, for switching a whole frame over to stainless. */
export function inAlloy(profile: Profile, alloy: ProfileAlloy): Profile {
  if (profile.alloy === alloy) return profile;
  const key = profile.id.replace(/-ss$/, "");
  return getProfile(alloy === "stainless-304" ? `${key}-ss` : key);
}

export function massOf(profile: Profile, lengthMm: number): number {
  return (profile.massPerMetre * lengthMm) / 1000;
}

/** How far a mitre at this angle stretches a cut, per end. */
export function mitreAllowance(profile: Profile, degrees: number): number {
  const radians = (Math.abs(degrees) * Math.PI) / 180;
  if (radians < 1e-6) return 0;
  return profile.height * Math.tan(radians);
}
