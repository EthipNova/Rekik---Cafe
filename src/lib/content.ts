export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates that an ID is a valid RFC 4122 UUID string.
 */
export function isValidUUID(id?: string | null): boolean {
  if (!id || typeof id !== "string") return false;
  return UUID_REGEX.test(id.trim());
}

export interface AboutContent {
  id: string;
  homepage_hero_image: string | null;
  about_hero_image: string | null;
  about_title: string;
  about_description: string;
  story_title: string;
  story_content: string;
  story_image: string | null;
  value_1_title: string;
  value_1_description: string;
  value_2_title: string;
  value_2_description: string;
  value_3_title: string;
  value_3_description: string;
  updated_at: string;
}

export type AboutContentRow = Partial<AboutContent>;

export const DEFAULT_ABOUT_CONTENT: AboutContent = {
  id: "028a78ee-094c-4334-8512-8697b747a674",
  homepage_hero_image: null,
  about_hero_image: null,
  about_title: "A neighbourhood café, thoughtfully modernised",
  about_description:
    "Rekik Café began with a simple idea: good food should be easy to enjoy. Our kitchen focuses on a short, well-made menu — burgers, stone-baked pizza, crisp sides and cold drinks — while our digital ordering platform removes the queues and the guesswork.",
  story_title: "Our Story",
  story_content:
    "Every dish is prepared to order. Every order is visible to you in real time, from the moment it's received to the moment it reaches your table, your hand or your door.",
  story_image: null,
  value_1_title: "Food we're proud of",
  value_1_description: "Prepared fresh to order, with ingredients we'd serve our own family.",
  value_2_title: "Genuine hospitality",
  value_2_description: "Whether you dine in or order ahead, the welcome is the same.",
  value_3_title: "Modern by design",
  value_3_description: "Ordering, payment and tracking are effortless on any device.",
  updated_at: "2026-09-14T00:00:00.000Z",
};

/**
 * Normalizes a raw database record into a fully-typed AboutContent object with fallback defaults.
 */
export function normalizeAboutContent(row?: Partial<AboutContent> | Record<string, any> | null): AboutContent {
  if (!row || typeof row !== "object") {
    return { ...DEFAULT_ABOUT_CONTENT };
  }

  const rowId =
    typeof row.id === "string" && row.id.trim()
      ? row.id.trim()
      : DEFAULT_ABOUT_CONTENT.id;

  return {
    id: rowId,
    homepage_hero_image:
      typeof row.homepage_hero_image === "string" && row.homepage_hero_image.trim()
        ? row.homepage_hero_image.trim()
        : null,
    about_hero_image:
      typeof row.about_hero_image === "string" && row.about_hero_image.trim()
        ? row.about_hero_image.trim()
        : null,
    about_title:
      typeof row.about_title === "string" && row.about_title.trim()
        ? row.about_title.trim()
        : DEFAULT_ABOUT_CONTENT.about_title,
    about_description:
      typeof row.about_description === "string" && row.about_description.trim()
        ? row.about_description.trim()
        : DEFAULT_ABOUT_CONTENT.about_description,
    story_title:
      typeof row.story_title === "string" && row.story_title.trim()
        ? row.story_title.trim()
        : DEFAULT_ABOUT_CONTENT.story_title,
    story_content:
      typeof row.story_content === "string" && row.story_content.trim()
        ? row.story_content.trim()
        : DEFAULT_ABOUT_CONTENT.story_content,
    story_image:
      typeof row.story_image === "string" && row.story_image.trim() ? row.story_image.trim() : null,
    value_1_title:
      typeof row.value_1_title === "string" && row.value_1_title.trim()
        ? row.value_1_title.trim()
        : DEFAULT_ABOUT_CONTENT.value_1_title,
    value_1_description:
      typeof row.value_1_description === "string" && row.value_1_description.trim()
        ? row.value_1_description.trim()
        : DEFAULT_ABOUT_CONTENT.value_1_description,
    value_2_title:
      typeof row.value_2_title === "string" && row.value_2_title.trim()
        ? row.value_2_title.trim()
        : DEFAULT_ABOUT_CONTENT.value_2_title,
    value_2_description:
      typeof row.value_2_description === "string" && row.value_2_description.trim()
        ? row.value_2_description.trim()
        : DEFAULT_ABOUT_CONTENT.value_2_description,
    value_3_title:
      typeof row.value_3_title === "string" && row.value_3_title.trim()
        ? row.value_3_title.trim()
        : DEFAULT_ABOUT_CONTENT.value_3_title,
    value_3_description:
      typeof row.value_3_description === "string" && row.value_3_description.trim()
        ? row.value_3_description.trim()
        : DEFAULT_ABOUT_CONTENT.value_3_description,
    updated_at:
      typeof row.updated_at === "string" && row.updated_at.trim()
        ? row.updated_at.trim()
        : DEFAULT_ABOUT_CONTENT.updated_at,
  };
}
