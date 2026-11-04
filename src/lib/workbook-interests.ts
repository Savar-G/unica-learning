import type { Interest } from "@/lib/learning-style";

export interface InterestWords {
  /** Plural, countable objects for generic {thing} frames, never live animals or full-size vehicles. */
  things: readonly string[];
  /** Place phrases include their article, for "at", "to", "of" and "visited". */
  places: readonly string[];
}

/**
 * Code-owned nouns for the learning card's interests (C1, D-231). G1 selects them at plan time.
 * Things fit every generic frame: a child can collect, colour, carry, give, lose, arrange and share them.
 * They fit bags, boxes, shelves and plates. Places are public venues a child can visit, never space itself,
 * a road, a construction site or a kitchen with hot equipment. No names or story sentences live here.
 * These are not replacements for specialized {things} templates, such as building a solid cube.
 */
export const WORKBOOK_INTERESTS = {
  animals: { things: ["animal stickers", "animal cards", "toy animals"], places: ["the wildlife park", "the zoo"] },
  sports: { things: ["balls", "medals", "jerseys"], places: ["the sports park", "the sports camp"] },
  space: { things: ["star stickers", "planet cards", "toy rockets"], places: ["the space museum", "the science park"] },
  cooking: { things: ["spoons", "cups", "cookie cutters"], places: ["the food fair", "the farmers market"] },
  games: { things: ["counters", "tokens", "game cards"], places: ["the games fair", "the games club"] },
  music: { things: ["bells", "shakers", "toy drums"], places: ["the music camp", "the music festival"] },
  art: { things: ["crayons", "pencils", "paint pots"], places: ["the art fair", "the art camp"] },
  nature: { things: ["shells", "pebbles", "pine cones"], places: ["the nature park", "the nature camp"] },
  vehicles: { things: ["toy cars", "toy trains", "toy trucks"], places: ["the train museum", "the transport fair"] },
  building: { things: ["blocks", "toy bricks", "toy wheels"], places: ["the model fair", "the building club"] },
} as const satisfies Record<Interest, InterestWords>;

/** Check vocabulary only. These do not extend today's generator choices. */
export const INTEREST_THINGS: readonly string[] = [...new Set(Object.values(WORKBOOK_INTERESTS).flatMap((words) => [...words.things]))];
export const INTEREST_PLACES: readonly string[] = [...new Set(Object.values(WORKBOOK_INTERESTS).flatMap((words) => [...words.places]))];
