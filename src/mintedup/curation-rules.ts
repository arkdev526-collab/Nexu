/**
 * Curation constants with no server dependencies, so the curation desk (a
 * client component) can import them without dragging the store — and `node:fs`
 * — into the browser bundle.
 */

/** What a curator checks, shown beside the lot in the queue. */
export const CURATION_CHECKLIST = [
  "The object is genuinely an antique or collectible, and in the right category.",
  "Photographs show the whole object, the base or reverse, and every mark.",
  "Any maker or period claim is supported by what is visible or documented.",
  "Condition faults are declared — chips, hairlines, restoration, replacements.",
  "Dimensions and materials are present and plausible.",
  "The estimate or price is defensible against comparable sales.",
  "Nothing in the description overstates rarity, provenance or authentication.",
];
