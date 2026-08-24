import type { LiveData, ProductSpec } from "../data/schema.js";

/**
 * 실시간 가격/리뷰 조회.
 *
 * 상태:
 * - KR: 네이버쇼핑 검색 API 연동 코드는 작성했지만, 이 저장소에는 아직 키가 없어서
 *   (.env의 NAVER_SHOPPING_CLIENT_ID/SECRET 비어있음) 실제 호출 테스트는 못 했다.
 *   키를 발급받아 .env에 넣으면 바로 동작하게 만들어뒀다 - 하지만 키가 없으면
 *   지금처럼 항상 null을 반환한다 (가짜 가격을 만들어 채우지 않는다).
 * - JP: 楽天市場 상품검색 API 연동은 아직 안 함 (JP 카테고리 제품이 아직 없어서 우선순위 낮춤).
 *
 * 네이버쇼핑 검색 API 스펙 출처: 공식 문서(developers.naver.com/docs/serviceapi/search/shopping)는
 * 이 환경 네트워크 정책상 직접 못 열어봐서, 그 공식 문서를 그대로 인용/구현한 3rd-party 블로그
 * 글(예: velog.io/@cjs0097, slashpage.com/lion) 여러 개를 교차 확인해서 엔드포인트·헤더·파라미터·
 * 응답 필드명을 확정했다. **실제 키로 첫 호출은 네가 직접 검증해야 한다.**
 *
 * - Endpoint: GET https://openapi.naver.com/v1/search/shop.json
 * - Headers: X-Naver-Client-Id, X-Naver-Client-Secret
 * - Query params: query, display(최대 100), start, sort("sim"|"date"), exclude
 * - Response: { items: [{ title, link, image, lprice, hprice, mallName, productId,
 *   productType, brand, maker, category1..4 }, ...] }
 *   title에는 검색어 매칭 부분에 <b></b> 태그가 섞여 온다 (제거 필요).
 *
 * ⚠️ 한계: 이 API는 "검색어 → 최저가 상품 목록"을 주는 가격비교 API라서, 우리 DB의
 * product.name/brand로 검색했을 때 상위 결과가 정확히 동일한 제품이라는 보장이 없다
 * (용량 다른 동일 브랜드 제품이 섞여 나올 수 있음). 지금은 첫 번째 결과를 그대로 쓰는
 * 단순 매칭이므로, 실서비스 전 상품별 매칭 정확도를 검수할 것.
 * 리뷰(평점/개수)는 이 API에 없는 정보라서 reviewSummary는 항상 비워둔다 - 리뷰까지
 * 필요하면 별도로 각 몰의 리뷰 API/크롤링을 붙여야 한다.
 */

const NAVER_ENDPOINT = "https://openapi.naver.com/v1/search/shop.json";

interface NaverShopItem {
  title: string;
  link: string;
  lprice: string;
  hprice?: string;
  mallName?: string;
  productId?: string;
  productType?: string;
  brand?: string;
  maker?: string;
}

interface NaverShopResponse {
  items?: NaverShopItem[];
}

function stripTags(s: string): string {
  return s.replace(/<\/?b>/g, "");
}

/** 상품명에서 용량/단위 표기를 뽑아본다 (예: "500ml", "200g", "1캔"). 못 찾으면 상품명 전체를 그대로 둔다. */
function extractUnit(title: string): string {
  const match = title.match(/\d+(\.\d+)?\s*(ml|L|리터|g|kg|입|개입|캔|팩|병)/i);
  return match ? match[0] : title;
}

async function fetchNaverShopping(product: ProductSpec): Promise<LiveData["price"] | undefined> {
  const clientId = process.env.NAVER_SHOPPING_CLIENT_ID;
  const clientSecret = process.env.NAVER_SHOPPING_CLIENT_SECRET;
  if (!clientId || !clientSecret) return undefined;

  const query = `${product.brand} ${product.name}`;
  const params = new URLSearchParams({ query, display: "5", sort: "sim" });

  const res = await fetch(`${NAVER_ENDPOINT}?${params.toString()}`, {
    headers: {
      "X-Naver-Client-Id": clientId,
      "X-Naver-Client-Secret": clientSecret,
    },
  });

  if (!res.ok) {
    console.error(`네이버쇼핑 API 호출 실패: HTTP ${res.status} (product=${product.id})`);
    return undefined;
  }

  const data = (await res.json()) as NaverShopResponse;
  const top = data.items?.[0];
  if (!top) return undefined;

  const amount = Number(top.lprice);
  if (!Number.isFinite(amount) || amount <= 0) return undefined;

  const cleanTitle = stripTags(top.title);
  return {
    amount,
    currency: "KRW",
    unit: extractUnit(cleanTitle),
    source: top.mallName ? `네이버쇼핑 - ${top.mallName} (검색결과: "${cleanTitle}")` : "네이버쇼핑",
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchLiveData(product: ProductSpec): Promise<LiveData | null> {
  if (product.country !== "KR") {
    // 楽天市場 등 JP 실시간 조회는 아직 미구현
    return null;
  }

  const price = await fetchNaverShopping(product);
  if (!price) return null;

  return { price };
}
