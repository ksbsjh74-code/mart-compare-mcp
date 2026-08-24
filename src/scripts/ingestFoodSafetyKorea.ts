/**
 * 식품의약품안전처_식품영양성분DB정보 Open API 수집 스크립트
 *
 * ⚠️ 2026-08-21 수정: 이전 버전은 오래된 블로그 예제(I2790, NUTR_CONT1~9 필드)를 기준으로
 * 작성했었는데, 실제로 공공데이터포털(data.go.kr)에서 브라우저로 API 명세를 직접 확인해보니
 * 그 엔드포인트가 아니었음. 아래가 실제로 확인한 정식 스펙:
 *
 * - 신청처: https://www.data.go.kr/data/15127578/openapi.do (공공데이터포털 - 식약처 사이트 자체 검색 아님)
 * - Base URL: http://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02
 * - 엔드포인트: GET /getFoodNtrCpntDbInq02
 * - 요청 파라미터: serviceKey, type(json), FOOD_NM_KR(식품명), MAKER_NM(제조사),
 *   FOOD_CAT1_NM(식품대분류), pageNo, numOfRows 등
 * - 응답: { header: { resultCode }, body: { items: { item: [...] }, totalCount, pageNo, numOfRows } }
 *   resultCode가 '00'이 아니면 에러. item이 1건이면 배열이 아니라 객체 하나로 올 수 있음(방어 필요).
 * - 영양성분 필드명은 AMT_NUM1~157 (예: AMT_NUM1=에너지, AMT_NUM3=단백질, AMT_NUM13=나트륨...).
 *   이 매핑표는 공식 문서(엑셀)에 있는데 브라우저로는 바로 못 열어봐서, 같은 API를 이미 구현해둔
 *   오픈소스(ISC 라이선스) 프로젝트의 매핑 코드로 교차 확인함:
 *   https://github.com/slicequeue/k-mfds-fooddb-mcp-server (src/external/mfds/types/AmtNumDataType.ts)
 *
 * 사용법:
 *   FOODSAFETY_API_KEY=발급받은키 npx tsx src/scripts/ingestFoodSafetyKorea.ts 우유 milk
 */

import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STAGING_DIR = path.join(__dirname, "..", "data", "staging");

const API_BASE = "http://apis.data.go.kr/1471000/FoodNtrCpntDbInfo02";

// AMT_NUM 매핑 - 우리 비교에 필요한 핵심 항목만 (전체 157개 중 일부).
// 출처: https://github.com/slicequeue/k-mfds-fooddb-mcp-server (ISC License)
const AMT_NUM_LABELS: Record<string, string> = {
  AMT_NUM1: "열량(kcal)",
  AMT_NUM3: "단백질(g)",
  AMT_NUM4: "지방(g)",
  AMT_NUM6: "탄수화물(g)",
  AMT_NUM7: "당류(g)",
  AMT_NUM8: "식이섬유(g)",
  AMT_NUM13: "나트륨(mg)",
  AMT_NUM22: "콜레스테롤(mg)",
  AMT_NUM23: "포화지방산(g)",
  AMT_NUM24: "트랜스지방산(g)",
};

interface FoodItem {
  FOOD_CD: string;
  FOOD_NM_KR: string;
  MAKER_NM?: string;
  SERVING_SIZE?: string;
  SUB_REF_NAME?: string;
  NATION_NM?: string; // 원산지국명
  IMP_YN?: string; // 수입여부
  RESEARCH_YMD?: string;
  [amtNum: string]: string | undefined; // AMT_NUM1..157
}

interface ApiBody {
  header: { resultCode: string; resultMsg?: string };
  body?: {
    items?: FoodItem | FoodItem[]; // 실제 응답 확인 결과: item으로 한 번 더 안 감싸져 있고 바로 배열/객체
    totalCount?: string | number;
  };
}

function asArray(item: FoodItem | FoodItem[] | undefined): FoodItem[] {
  if (!item) return [];
  return Array.isArray(item) ? item : [item];
}

async function fetchPage(
  apiKey: string,
  foodNameKr: string,
  pageNo: number,
  numOfRows: number,
  foodCat1Nm?: string
) {
  const params = new URLSearchParams({
    serviceKey: apiKey,
    type: "json",
    FOOD_NM_KR: foodNameKr,
    DB_CLASS_NM: "상용제품", // 레시피/조리식품 평균값(품목대표) 제외, 실제 판매 제품만
    pageNo: String(pageNo),
    numOfRows: String(numOfRows),
  });
  if (foodCat1Nm) params.set("FOOD_CAT1_NM", foodCat1Nm);
  const url = `${API_BASE}/getFoodNtrCpntDbInq02?${params.toString()}`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`API 호출 실패: HTTP ${res.status}`);
  }
  const data = (await res.json()) as ApiBody;
  if (data.header.resultCode !== "00") {
    throw new Error(`API 오류: ${data.header.resultCode} ${data.header.resultMsg ?? ""}`);
  }
  return {
    items: asArray(data.body?.items),
    totalCount: Number(data.body?.totalCount ?? 0),
  };
}

function toDraftSpec(row: FoodItem, category: string) {
  const values: Record<string, string> = {};
  for (const [code, label] of Object.entries(AMT_NUM_LABELS)) {
    const v = row[code];
    if (v && v.trim() !== "") values[label] = v;
  }

  return {
    id: `draft-${row.FOOD_CD}`,
    name: row.FOOD_NM_KR,
    brand: row.MAKER_NM?.trim() || "(제조사 미기재 - 확인 필요)",
    country: "KR" as const,
    category,
    origin: row.NATION_NM || undefined,
    nutrition: {
      basis: row.SERVING_SIZE ? `${row.SERVING_SIZE}당` : "제공량 미기재",
      values,
    },
    notes: [
      "식약처 식품영양성분DB(FoodNtrCpntDbInfo02) 자동 수집 - 인증/수상 등 차별점 정보는 없음, 별도로 채워야 함",
      row.IMP_YN ? `수입여부: ${row.IMP_YN}` : undefined,
      row.SUB_REF_NAME ? `원 출처 표기: ${row.SUB_REF_NAME}` : undefined,
    ].filter(Boolean),
    sources: [
      {
        title: `식약처 식품영양성분DB - ${row.FOOD_NM_KR} (FOOD_CD: ${row.FOOD_CD})`,
        url: "https://www.data.go.kr/data/15127578/openapi.do",
        checkedAt: new Date().toISOString().slice(0, 10),
      },
    ],
    lastVerified: new Date().toISOString().slice(0, 10),
    needsVerification: true, // 사람이 브랜드/카테고리 매핑 확인 전까지는 항상 true
  };
}

async function main() {
  const apiKey = process.env.FOODSAFETY_API_KEY;
  const [query, category, foodCat1Nm] = process.argv.slice(2);

  if (!apiKey) {
    console.error("환경변수 FOODSAFETY_API_KEY가 필요함. https://www.data.go.kr/data/15127578/openapi.do 에서 활용신청 후 발급.");
    process.exit(1);
  }
  if (!query || !category) {
    console.error("사용법: npx tsx src/scripts/ingestFoodSafetyKorea.ts <검색어> <카테고리id> [식품대분류명]");
    console.error("예시:   npx tsx src/scripts/ingestFoodSafetyKorea.ts 두부 tofu \"두부류 또는 묵류\"");
    process.exit(1);
  }

  console.log(`"${query}" 검색 중... (카테고리: ${category}${foodCat1Nm ? `, 대분류: ${foodCat1Nm}` : ""})`);
  const { items, totalCount } = await fetchPage(apiKey, query, 1, 200, foodCat1Nm);
  console.log(`전체 ${totalCount}건 중 ${items.length}건 수신`);

  const drafts = items.map((r) => toDraftSpec(r, category));

  await mkdir(STAGING_DIR, { recursive: true });
  const outPath = path.join(STAGING_DIR, `${category}.draft.json`);
  await writeFile(outPath, JSON.stringify(drafts, null, 2), "utf-8");

  console.log(`초안 ${drafts.length}건 저장: ${outPath}`);
  console.log("→ 이 파일을 검토해서 쓸만한 항목만 src/data/products/ 로 옮길 것 (브랜드명 정리, 인증/특징 보강 필요).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

