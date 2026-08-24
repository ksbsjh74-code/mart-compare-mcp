import type { LiveData, ProductSpec } from "../data/schema.js";

/**
 * 실시간 가격/리뷰 조회.
 *
 * 상태: 보류 (2026-08-25). 항상 null을 반환하는 스텁이다. 절대 가짜 가격을 만들어 채우지 않는다.
 *
 * ⚠️ 네이버쇼핑 검색 API는 쓸 수 없다 - 2026-07-31부로 완전 종료됐고 공식 대체 API가 없다
 * (검색어 조합만 있던 네이버 개발자센터 "사용 API" 목록에서 "검색" 항목 자체가 사라진 것으로
 * 실제 확인함. 출처: https://waffleboard.io/blog/naver-search-api-hub-migration-guide).
 * 예전엔 이 파일에 openapi.naver.com/v1/search/shop.json 연동 코드가 있었는데, 죽은 API라서
 * 지웠다 - 살아있는 것처럼 보이는 코드를 남겨두는 게 더 헷갈린다고 판단.
 *
 * 검토했지만 채택 안 한 대안:
 * - 쿠팡파트너스 검색 API: 시간당 호출 10회 제한(3연속 403이면 계정 영구정지 위험), API 키
 *   발급에 파트너스(제휴마케팅) 가입 심사가 필요, 약관상 용도가 제휴 링크 유도라 순수 가격
 *   비교 용도로 써도 되는지 불명확 - 세 가지 다 사람이 직접 판단/가입해야 하는 부분이라 보류.
 * - 11번가 OpenAPI: 검색 결과로는 셀러(판매자) 전용 API 문서만 확인됨, 일반 상품검색 공개
 *   API 존재 여부 미확인 (robots.txt로 공식 문서 직접 확인 못 함).
 * - 楽天市場(JP): 애초에 코드 작성 안 함, JP 카테고리 제품이 1개뿐이라 우선순위 낮음.
 *
 * 다시 붙이려면: 위 API 중 하나를 사람이 직접 가입/검증한 뒤, 이 함수 안에서 country별로
 * 분기해서 구현하면 된다. LiveData 타입(../data/schema.ts)은 그대로 재사용 가능.
 */
export async function fetchLiveData(product: ProductSpec): Promise<LiveData | null> {
  void product;
  return null;
}
