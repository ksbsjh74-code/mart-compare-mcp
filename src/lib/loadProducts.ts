import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { ProductSpec } from "../data/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PRODUCTS_DIR = path.join(__dirname, "..", "data", "products");

let cache: ProductSpec[] | null = null;

/** data/products/*.json 을 전부 읽어서 메모리에 캐싱. 서버 시작 후 첫 호출 때 한 번만 디스크를 읽는다. */
export async function loadAllProducts(): Promise<ProductSpec[]> {
  if (cache) return cache;

  const files = await readdir(PRODUCTS_DIR);
  const jsonFiles = files.filter((f) => f.endsWith(".json"));

  const all: ProductSpec[] = [];
  for (const file of jsonFiles) {
    const raw = await readFile(path.join(PRODUCTS_DIR, file), "utf-8");
    const parsed = JSON.parse(raw) as ProductSpec[];
    all.push(...parsed);
  }

  cache = all;
  return all;
}

export async function listCategories(): Promise<string[]> {
  const products = await loadAllProducts();
  return [...new Set(products.map((p) => p.category))];
}

export async function findProducts(opts: {
  category?: string;
  country?: string;
  ids?: string[];
  query?: string;
}): Promise<ProductSpec[]> {
  const products = await loadAllProducts();
  return products.filter((p) => {
    if (opts.category && p.category !== opts.category) return false;
    if (opts.country && p.country !== opts.country) return false;
    if (opts.ids && !opts.ids.includes(p.id)) return false;
    if (opts.query) {
      const q = opts.query.toLowerCase();
      const hay = `${p.name} ${p.brand}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}
