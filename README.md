# mart-compare-mcp

마트에서 제품 A vs B(vs N개)를 비교/추천해주는 MCP 서버. 스펙(원산지/인증/영양정보)은
큐레이션 DB, 가격/리뷰는 실시간 조회로 붙일 수 있게 설계한 **하이브리드** 구조 - 단, 가격/리뷰
실시간 조회는 2026-08-25 기준 보류 상태다 (§3 참고).

지금은 실제로 빌드·실행·테스트·배포까지 확인된 상태다. 카테고리 5개(우유/생수/통조림햄/두부/참치캔)
샘플 데이터가 들어 있고, 3개 툴(`list_categories`/`search_products`/`compare_products`) 전부
실제로 curl로 호출해서 정상 동작 확인했다. Render에 배포돼 있고 엔드포인트는
`https://mart-compare-mcp.onrender.com/mcp` (무료 플랜이라 트래픽 없으면 슬립됨). (2026-08-25 갱신)

## 1. 로컬 실행

```bash
npm install
npm run build   # tsc 컴파일 + data/products/*.json을 dist로 복사
npm start        # http://localhost:3000/mcp 에서 대기
```

개발 중엔 `npm run dev` (tsx watch, 파일 저장 시 자동 재시작).

헬스체크: `curl http://localhost:3000/health` → `{"status":"ok"}`

## 2. 구조

```
src/
  index.ts              # Express + Streamable HTTP transport 진입점
  server.ts              # McpServer 인스턴스 생성 + 툴 등록
  tools/compareProducts.ts   # list_categories / search_products / compare_products 3개 툴
  lib/loadProducts.ts    # data/products/*.json 로더 (자체 DB)
  lib/liveData.ts        # 가격/리뷰 실시간 조회 - 현재 항상 null 반환하는 스텁 (§3 참고)
  data/schema.ts          # 제품 스펙 타입 정의
  data/products/*.json    # 카테고리별 큐레이션 데이터 (milk, water, canned-ham, tofu, tuna-can)
```

## 3. 지금 상태에서 "가짜"/"미완성"인 부분 (중요)

- **가격/리뷰는 실제로 안 붙어 있고, 당장 붙일 방법이 없다.** 원래 네이버쇼핑 검색 API로
  KR 가격을 채우려 했는데, 이 API는 **2026-07-31부로 완전 종료**됐고 공식 대체 API가 없다
  (네이버 개발자센터 "사용 API" 목록에서 "검색" 항목 자체가 사라진 걸로 실제 확인함. 출처:
  [waffleboard.io](https://waffleboard.io/blog/naver-search-api-hub-migration-guide)).
  대안으로 쿠팡파트너스 검색 API를 검토했는데, 시간당 호출 10회 제한(3연속 403이면 계정
  영구정지 위험) + 파트너스 가입 심사 필요 + 약관상 용도가 제휴 링크 유도라 순수 가격비교에
  써도 되는지 불명확, 이 세 가지 때문에 사람이 직접 판단해서 가입해야 해서 일단 보류했다.
  11번가 OpenAPI도 찾아봤지만 셀러 전용 문서만 확인됨. 楽天市場(JP) 연동은 애초에 코드도 없음.
  자세한 내용/재검토 방법은 `lib/liveData.ts` 상단 주석 참고.
- **참치캔 데이터에서 포화지방산/트랜스지방산 필드는 의도적으로 뺐다.** 식약처 API 원본 값이
  같은 제품 총 지방 함량보다 3~6배 커서(예: 지방 15g인데 포화지방산 50g) 필드 매핑 오류 또는
  원본 데이터 오류로 의심됨. 공식 문서로 AMT_NUM23/24 정의를 재확인하기 전까지 이 두 필드는
  절대 쓰지 말 것.
- **egg(계란) 카테고리는 아직 없다.** `data/staging/egg.draft.json`은 식약처 API에 "계란"으로
  검색해서 나온 20건 전부 계란쿠키/계란과자/구운계란 등 가공식품이었고, 마트에서 파는 생란(달걀
  한 판) 제품이 하나도 없어서 검수 결과 전부 버렸다. 다시 수집하려면 검색어를 "달걀"로 바꾸거나
  `FOOD_CAT1_NM`(식품대분류) 파라미터로 알가공품류를 좁혀서 재시도할 것.
- **데이터 파일에 `needsVerification: true`가 붙은 항목은 출처 검증이 안 끝난 예시 데이터.**
  compare_products 응답에도 이 사실을 note로 같이 내려주니, 이 값을 사실처럼 답변에 쓰면 안 됨.
- `certifications` 필드는 검색으로 실제 확인한 것만 넣었다 (예: 제주삼다수 먹는물연구소 ERA 인증).
  경쟁 제품에 대해 "부적합/불합격" 같은 부정적 사실은 검증 안 된 채로는 절대 넣지 않았다 —
  이런 정보는 명예훼손 소지가 있으므로, 넣으려면 반드시 식품안전나라(식약처) 공식 회수·행정처분
  정보 같은 1차 공식 소스로만 채울 것.

## 4. 카테고리/제품 추가하는 법

**수동으로 추가:**
1. `src/data/products/` 에 카테고리별 json 파일 추가 (또는 기존 파일에 항목 추가)
2. `ProductSpec` 스키마(`src/data/schema.ts`)를 따를 것 — 특히 `sources`를 반드시 채우고,
   출처를 못 찾은 값은 넣지 말고 `needsVerification: true` + notes로 남길 것
3. `npm run build` 다시 실행 (json이 dist로 복사돼야 반영됨)

**자동 수집 (1층 - 식약처 API):**

한국 제품의 존재/영양정보는 식약처 식품영양성분DB Open API로 대량 수집 가능.
**주의**: 이 API는 `foodsafetykorea.go.kr` 사이트 자체 검색이 아니라 **공공데이터포털(data.go.kr)**을
통해 신청해야 함 — foodsafetykorea.go.kr에서 검색하면 다른(링크형/L타입) 서비스가 나와서 신청이 막힘.

```bash
# 1. https://www.data.go.kr/data/15127578/openapi.do 접속
#    → "활용신청" 버튼 클릭 → 자동승인(개발계정, 트래픽 10,000/일)
# 2. 승인 후 마이페이지에서 서비스키(인증키) 확인
# 3. .env.example을 .env로 복사하고 FOODSAFETY_API_KEY 채우기
cp .env.example .env

# 4. 카테고리별로 수집 (검색어, 우리 카테고리id) - .env가 자동으로 읽혀서 이렇게만 하면 됨
npm run ingest -- 우유 milk
```

결과는 `src/data/products/`가 아니라 **`src/data/staging/milk.draft.json`에 초안으로만 저장**돼.
자동으로 반영 안 되니까, 이 파일을 열어서:
- 진짜 마트에서 파는 브랜드 제품만 골라내고 (연구용 샘플/조리식품 등 노이즈 많음)
- 브랜드명이 비어있는 항목은 채우거나 버리고
- 인증/차별점 정보(2층)는 이 스크립트가 못 채우니 따로 검색해서 보강하고

정리된 항목만 `src/data/products/milk.json`으로 옮겨 담을 것. 이 스크립트는 영양정보 초안을
빠르게 만들어주는 용도지, 검수를 대신해주지 않음.

> **검증 관련 투명하게 밝힘**: 이 API 스펙(Base URL `apis.data.go.kr/1471000/FoodNtrCpntDbInfo02`,
> 요청 파라미터, `AMT_NUM1~157` 필드명)은 실제로 data.go.kr 페이지에 브라우저로 접속해서 API
> 명세(Swagger) 화면을 직접 읽고 확인한 것. AMT_NUM 코드가 각각 무슨 영양소인지는 문서(엑셀)를
> 브라우저로 못 열어봐서, 같은 API를 이미 구현해둔 오픈소스(ISC 라이선스) 프로젝트
> [k-mfds-fooddb-mcp-server](https://github.com/slicequeue/k-mfds-fooddb-mcp-server)의
> 매핑 코드로 교차 확인했음. 실제 API 호출 자체는 이 컨테이너 네트워크가 `apis.data.go.kr`을
> 막고 있어서 (`host_not_allowed`) 여기선 못 했고, 대신 실제 응답 스키마를 그대로 흉내낸 mock으로
> 요청 조립→응답 파싱→매핑→파일 저장 전체 흐름을 검증함. **진짜 키로 첫 호출은 네가 직접 해봐야 함.**

## 5. 배포 (Render) - 완료

GitHub repo([ksbsjh74-code/mart-compare-mcp](https://github.com/ksbsjh74-code/mart-compare-mcp))
연동해서 Render Free 플랜으로 배포 완료.

- 헬스체크: `https://mart-compare-mcp.onrender.com/health`
- PlayMCP 등록용 엔드포인트: `https://mart-compare-mcp.onrender.com/mcp`
- 환경변수는 Render 대시보드 Environment 탭에서 직접 관리 (`FOODSAFETY_API_KEY`만 등록해둠 -
  ingest 스크립트는 로컬에서 돌리는 거라 사실 서버 런타임엔 필요 없음, 나중에 정리해도 됨)
- `main` 브랜치에 push하면 Render가 자동으로 재배포함
- 무료 플랜은 트래픽 없으면 슬립 상태로 들어가고 첫 요청에 콜드스타트(수십 초)가 있을 수 있음 —
  실사용 트래픽이 생기면 유료 플랜(Starter, $7/월) 전환 고려

## 6. PlayMCP 등록 절차 (2026-08 기준 확인한 내용)

1. §5에서 배포한 서버의 엔드포인트가 인터넷에서 접근 가능해야 함 (`/mcp` 경로가 POST를 받아야
   함). PlayMCP는 원격(remote) MCP 서버 등록 방식이라 로컬 stdio 서버는 그대로는 못 씀.
2. https://playmcp.kakao.com 에 카카오 계정으로 로그인
3. "MCP 서버 등록"에서 배포한 서버의 엔드포인트 URL(`https://.../mcp`) 입력
4. 처음엔 비공개(임시 등록) 상태로 본인 계정에서만 테스트 가능
5. 다른 사용자에게 공개하려면 카카오 파트너 검증 절차를 거쳐야 함 (이 부분 세부 요건은
   PlayMCP 사이트 내 "이용 가이드"에서 별도 확인 필요 — 계속 업데이트되는 영역이라
   등록 직전에 다시 확인할 것)

## 7. 다음 단계 제안

- [x] 카테고리 확장 (두부/참치캔 추가, 계란은 데이터 품질 문제로 보류)
- [x] Dockerfile/render.yaml 작성
- [x] GitHub repo 생성 + Render 배포 완료
- [x] 가격 실시간 조회 API 조사 (네이버쇼핑 종료 확인, 쿠팡파트너스/11번가 검토 후 보류)
- [ ] PlayMCP 비공개 등록 → 본인 계정으로 실제 채팅에서 호출 테스트
- [ ] egg 카테고리 재수집 (검색어 "달걀" 또는 FOOD_CAT1_NM 필터로 재시도)
- [ ] (선택) 가격 실시간 조회 재도전 - 쿠팡파트너스 가입 심사 받고 시간당 10회 제한 감안한
  캐싱 구조로 붙이거나, 11번가 공식 문서를 직접 열어봐서 일반 상품검색 API 존재 여부 확인
