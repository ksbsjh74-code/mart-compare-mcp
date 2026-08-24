import { z } from "zod";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { findProducts, listCategories } from "../lib/loadProducts.js";
import { fetchLiveData } from "../lib/liveData.js";
import type { ComparedProduct } from "../data/schema.js";

export function registerTools(server: McpServer) {
  // 1) 카테고리 목록
  server.registerTool(
    "list_categories",
    {
      title: "비교 가능한 제품 카테고리 목록",
      description:
        "현재 DB에 등록된 제품 카테고리 목록을 반환한다 (예: milk, water, canned-ham). 사용자가 어떤 카테고리를 비교할 수 있는지 모를 때 먼저 호출.",
      inputSchema: {},
    },
    async () => {
      const categories = await listCategories();
      return {
        content: [{ type: "text", text: JSON.stringify({ categories }, null, 2) }],
      };
    }
  );

  // 2) 제품 검색
  server.registerTool(
    "search_products",
    {
      title: "카테고리 내 제품 검색",
      description:
        "카테고리(및 선택적으로 국가, 검색어)로 제품 목록을 찾는다. compare_products에 넘길 id를 확인할 때 사용.",
      inputSchema: {
        category: z.string().describe("카테고리 id (예: 'milk', 'water', 'canned-ham')"),
        country: z.enum(["KR", "JP"]).optional().describe("국가 필터"),
        query: z.string().optional().describe("제품명/브랜드 검색어"),
      },
    },
    async ({ category, country, query }) => {
      const products = await findProducts({ category, country, query });
      const summary = products.map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        country: p.country,
        needsVerification: p.needsVerification ?? false,
      }));
      return {
        content: [{ type: "text", text: JSON.stringify({ products: summary }, null, 2) }],
      };
    }
  );

  // 3) 제품 비교 (핵심 툴) - 스펙은 DB에서, 가격/리뷰는 실시간으로 붙여서 반환
  server.registerTool(
    "compare_products",
    {
      title: "제품 N개 비교",
      description:
        "product_ids로 넘긴 제품들의 스펙(원산지/인증/영양정보)과 실시간 가격/리뷰 정보를 합쳐서 반환한다. " +
        "이 툴은 사실 데이터만 반환하고, 어떤 제품이 더 나은지에 대한 추천 문장은 만들지 않는다 - " +
        "추천 판단과 설명은 이 데이터를 받은 모델(호출한 AI)이 사용자 맥락에 맞게 작성해야 한다.",
      inputSchema: {
        product_ids: z
          .array(z.string())
          .min(2)
          .describe("비교할 제품 id 목록 (search_products로 먼저 확인). 2개 이상 필요."),
      },
    },
    async ({ product_ids }) => {
      const products = await findProducts({ ids: product_ids });

      const missing = product_ids.filter((id) => !products.find((p) => p.id === id));

      const compared: ComparedProduct[] = await Promise.all(
        products.map(async (p) => ({
          ...p,
          live: await fetchLiveData(p),
        }))
      );

      const result = {
        compared,
        missingIds: missing.length ? missing : undefined,
        note:
          "live 필드가 null인 항목은 아직 실시간 가격/리뷰 API가 연결되지 않은 상태 (lib/liveData.ts 참고). " +
          "needsVerification이 true인 필드는 출처가 아직 검증되지 않은 예시 데이터이므로 사실로 단정해 답변하지 말 것.",
      };

      return {
        content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      };
    }
  );
}
