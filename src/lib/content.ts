export interface AboutContent {
  id: number;
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
  id: 1,
  homepage_hero_image: "/images/rekik-hero.jpg",
  about_hero_image: "/images/rekik-story.jpg",
  about_title: "Ethiopia's Finest Harvest, Artfully Roasted",
  about_description:
    "Rekik Coffee honours generations of Ethiopian coffee heritage. From the misty highlands of Yirgacheffe and Sidama to your cup, we select only specialty-grade single-origin beans, roasted with care and served with authentic Ethiopian warmth.",
  story_title: "The Rekik Coffee Legacy",
  story_content:
    "Coffee is more than our passion—it is our culture. At Rekik Coffee, we celebrate the ritual of the Ethiopian coffee ceremony while embracing modern roasting craft. Every batch is roasted in small quantities to preserve the distinct floral, citrus, and berry notes intrinsic to Ethiopia's finest heirloom varieties.",
  story_image: "/images/rekik-story.jpg",
  value_1_title: "Single-Origin Purity",
  value_1_description: "Directly sourced from trusted highland growers across Yirgacheffe, Sidama, and Guji.",
  value_2_title: "Artisanal Roasting",
  value_2_description: "Small-batch craft roasting that highlights the delicate, vibrant notes of authentic Ethiopian beans.",
  value_3_title: "Warm Ethiopian Hospitality",
  value_3_description: "Experience the timeless spirit of Buna hospitality, seamlessly paired with effortless modern ordering.",
  updated_at: "2026-10-18T00:00:00.000Z",
};

/**
 * Normalizes a raw database record into a fully-typed AboutContent object with fallback defaults.
 */
export function normalizeAboutContent(row?: Partial<AboutContent> | null): AboutContent {
  if (!row || typeof row !== "object") {
    return { ...DEFAULT_ABOUT_CONTENT };
  }

  return {
    id: 1,
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
