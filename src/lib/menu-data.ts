import classicBurger from "@/assets/classic-burger.jpg";
import cheeseBurger from "@/assets/cheese-burger.jpg";
import chickenBurger from "@/assets/chicken-burger.jpg";
import margherita from "@/assets/margherita.jpg";
import chickenPizza from "@/assets/chicken-pizza.jpg";
import fries from "@/assets/fries.jpg";
import cola from "@/assets/cola.jpg";
import sprite from "@/assets/sprite.jpg";
import water from "@/assets/water.jpg";

/**
 * DEMO DATA — clearly separated from production data.
 * Shapes mirror the planned REST contract (GET /api/categories, GET /api/products)
 * so this module can be swapped for an API service without touching the UI.
 */

export type Category = {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  active: boolean;
};

export type Product = {
  id: string;
  categoryId?: string | undefined;
  name: string;
  slug: string;
  categorySlug: string;
  description: string;
  ingredients: string[];
  price: number; // ETB — placeholder pricing until official prices are provided
  image: string;
  available: boolean;
  featured: boolean;
};

export const categories: Category[] = [
  { id: "cat-1", slug: "burgers", name: "Burgers", tagline: "Classic favorites", active: true },
  { id: "cat-2", slug: "pizza", name: "Pizza", tagline: "Freshly prepared", active: true },
  { id: "cat-3", slug: "sides", name: "Chips & Sides", tagline: "Perfect additions", active: true },
  { id: "cat-4", slug: "drinks", name: "Soft Drinks", tagline: "Refresh yourself", active: true },
  { id: "cat-5", slug: "other", name: "Other", tagline: "Seasonal picks", active: true },
];

export const products: Product[] = [
  {
    id: "p-1",
    categoryId: "cat-1",
    name: "Classic Burger",
    slug: "classic-burger",
    categorySlug: "burgers",
    description: "Fresh beef patty, vegetables and special sauce.",
    ingredients: ["Beef patty", "Lettuce", "Tomato", "Special sauce", "Sesame bun"],
    price: 250,
    image: classicBurger,
    available: true,
    featured: true,
  },
  {
    id: "p-2",
    categoryId: "cat-1",
    name: "Cheese Burger",
    slug: "cheese-burger",
    categorySlug: "burgers",
    description: "Double beef patty layered with melted cheddar cheese.",
    ingredients: ["Beef patty", "Cheddar cheese", "Pickles", "House sauce"],
    price: 300,
    image: cheeseBurger,
    available: true,
    featured: true,
  },
  {
    id: "p-3",
    categoryId: "cat-1",
    name: "Chicken Burger",
    slug: "chicken-burger",
    categorySlug: "burgers",
    description: "Crispy chicken fillet with fresh slaw and mild mayo.",
    ingredients: ["Chicken fillet", "Cabbage slaw", "Mayo", "Brioche bun"],
    price: 280,
    image: chickenBurger,
    available: true,
    featured: true,
  },
  {
    id: "p-4",
    categoryId: "cat-2",
    name: "Margherita Pizza",
    slug: "margherita-pizza",
    categorySlug: "pizza",
    description: "Stone-baked dough, tomato sauce, mozzarella and basil.",
    ingredients: ["Pizza dough", "Tomato sauce", "Mozzarella", "Fresh basil"],
    price: 420,
    image: margherita,
    available: false,
    featured: true,
  },
  {
    id: "p-5",
    categoryId: "cat-2",
    name: "Chicken Pizza",
    slug: "chicken-pizza",
    categorySlug: "pizza",
    description: "Grilled chicken, sweet peppers and mozzarella.",
    ingredients: ["Pizza dough", "Grilled chicken", "Peppers", "Mozzarella"],
    price: 480,
    image: chickenPizza,
    available: true,
    featured: true,
  },
  {
    id: "p-6",
    categoryId: "cat-3",
    name: "French Fries",
    slug: "french-fries",
    categorySlug: "sides",
    description: "Golden, crispy and lightly salted.",
    ingredients: ["Potato", "Sunflower oil", "Sea salt"],
    price: 100,
    image: fries,
    available: true,
    featured: true,
  },
  {
    id: "p-7",
    categoryId: "cat-4",
    name: "Coca-Cola",
    slug: "coca-cola",
    categorySlug: "drinks",
    description: "Chilled 300ml bottle.",
    ingredients: [],
    price: 50,
    image: cola,
    available: true,
    featured: false,
  },
  {
    id: "p-8",
    categoryId: "cat-4",
    name: "Sprite",
    slug: "sprite",
    categorySlug: "drinks",
    description: "Chilled 300ml bottle.",
    ingredients: [],
    price: 50,
    image: sprite,
    available: true,
    featured: false,
  },
  {
    id: "p-9",
    categoryId: "cat-4",
    name: "Water",
    slug: "water",
    categorySlug: "drinks",
    description: "Still mineral water, 500ml.",
    ingredients: [],
    price: 30,
    image: water,
    available: false,
    featured: false,
  },
];

const productRegistry = new Map<string, Product>();

export function registerProduct(product: Product): void {
  productRegistry.set(product.id, product);
  if (product.slug) {
    productRegistry.set(product.slug, product);
  }
}

export function registerProducts(productList: Product[]): void {
  for (const p of productList) {
    registerProduct(p);
  }
}

export const getProduct = (id: string): Product | undefined =>
  productRegistry.get(id) || products.find((p) => p.id === id || p.slug === id);

export const getCategory = (slug: string) => categories.find((c) => c.slug === slug);

export const formatETB = (amount: number) => `${amount.toLocaleString("en-US")} ETB`;

export const promotion = {
  title: "Today's Special",
  productId: "p-2",
  headline: "Cheese Burger + French Fries",
  discountLabel: "-15%",
  description: "Our double cheddar burger paired with golden fries, for a limited time.",
  expiresLabel: "Offer valid today until 21:00",
};
