/**
 * 제품 비교 스키마
 *
 * 설계 원칙:
 * - spec(스펙/인증/영양정보)은 자주 안 바뀌는 값 → 이 저장소에 큐레이션해서 보관 (자체 DB)
 * - price/review는 매번 바뀌는 값 → 이 타입에는 필드만 정의하고, 실제 값은 실시간 조회 레이어(lib/liveData.ts)에서 채움
 * - 모든 사실 정보는 sources를 반드시 남긴다. 출처 없는 값은 넣지 않는다 (추측 금지).
 */

export type Country = "KR" | "JP";

export interface Certification {
  /** 인증/평가를 준 기관 (예: "제주개발공사 먹는물연구소", "美 ERA") */
  authority: string;
  /** 등급/결과 (예: "국제숙련도평가 최우수(Laboratory of Excellence) 8년 연속") */
  result: string;
  /** 해당 기간/연도 (예: "2019-2026") */
  period?: string;
}

export interface NutritionFact {
  /** 기준량 (예: "100g당", "1캔(200g)당") */
  basis: string;
  /** 항목명: 값 (예: { "돈육함량": "90% 이상", "나트륨": "830mg", "단백질": "13g" }) */
  values: Record<string, string>;
}

export interface Source {
  title: string;
  url: string;
  /** 확인 시점 (YYYY-MM-DD). 정보가 오래되면 재검증 필요 표시용 */
  checkedAt: string;
}

export interface ProductSpec {
  id: string;
  name: string;
  brand: string;
  country: Country;
  category: string;
  /** 원산지/생산지 */
  origin?: string;
  /** 인증/평가 등급 (외부 기관 발표 기준만 - 자체 주장 문구는 넣지 않는다) */
  certifications?: Certification[];
  /** 정량 영양/성분 정보 */
  nutrition?: NutritionFact;
  /** 그 외 비교에 유의미한 특징 (제조공정, 살균방식 등) */
  notes?: string[];
  sources: Source[];
  /** 이 스펙 레코드를 마지막으로 검증/갱신한 날짜 */
  lastVerified: string;
  /** true면 아직 출처 검증이 끝나지 않은 예시/플레이스홀더 데이터 - 실서비스 전 반드시 재확인 */
  needsVerification?: boolean;
}

/** 실시간 조회 결과 (가격/리뷰) - DB에 저장하지 않고 매 호출 시 채워서 합침 */
export interface LiveData {
  price?: {
    amount: number;
    currency: "KRW" | "JPY";
    unit: string; // 예: "500ml", "200g 1캔"
    source: string;
    fetchedAt: string;
  };
  reviewSummary?: {
    averageRating?: number;
    count?: number;
    source: string;
    fetchedAt: string;
  };
}

export interface ComparedProduct extends ProductSpec {
  live: LiveData | null;
}
