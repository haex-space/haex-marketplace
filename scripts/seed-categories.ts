import { db, categories } from "../src/db/index.ts";

const defaultCategories = [
  {
    name: "Productivity",
    slug: "productivity",
    description: "Extensions that help you be more productive",
    icon: "mdi:rocket-launch",
    sortOrder: 1,
  },
  {
    name: "Security",
    slug: "security",
    description: "Password managers, encryption, and security tools",
    icon: "mdi:shield-lock",
    sortOrder: 2,
  },
  {
    name: "Finance",
    slug: "finance",
    description: "Budgeting, expense tracking, and financial tools",
    icon: "mdi:cash-multiple",
    sortOrder: 3,
  },
  {
    name: "Health",
    slug: "health",
    description: "Health tracking and wellness extensions",
    icon: "mdi:heart-pulse",
    sortOrder: 4,
  },
  {
    name: "Notes",
    slug: "notes",
    description: "Note-taking and documentation tools",
    icon: "mdi:notebook",
    sortOrder: 5,
  },
  {
    name: "Media",
    slug: "media",
    description: "Photo, video, and audio management",
    icon: "mdi:image-multiple",
    sortOrder: 6,
  },
  {
    name: "Developer Tools",
    slug: "developer-tools",
    description: "Tools for developers and power users",
    icon: "mdi:code-braces",
    sortOrder: 7,
  },
  {
    name: "Other",
    slug: "other",
    description: "Other useful extensions",
    icon: "mdi:dots-horizontal",
    sortOrder: 99,
  },
];

console.log("Seeding categories...");

for (const category of defaultCategories) {
  await db
    .insert(categories)
    .values(category)
    .onConflictDoNothing({ target: categories.slug });
  console.log(`  - ${category.name}`);
}

console.log("Done!");

process.exit(0);
