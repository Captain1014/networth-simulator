# Plan: Housing Scenario Comparison (주거 시나리오 비교)

## Executive Summary

| Perspective | Description |
|-------------|-------------|
| **Problem** | 은퇴 후 주거 결정(매수/전세/월세)이 장기 자산에 미치는 영향을 비교할 수 없어, 직감에 의존해야 함 |
| **Solution** | 최대 3개 주거 시나리오를 동시 시뮬레이션하여 순자산 궤적, 누적 비용, 손익분기점을 비교하는 기능 |
| **Function UX Effect** | 모달 UI에서 매수/전세/월세 조건을 입력하면 차트와 비교 테이블이 즉시 렌더링됨 |
| **Core Value** | 수천만~수억원 규모의 주거 결정을 데이터 기반으로 내릴 수 있게 됨 |

---

## 1. Background & Problem

현재 앱은 `lumpsum-out`(목돈 지출)과 `expense-add`(추가 지출)로 주거비를 모델링할 수 있지만:

- 시나리오를 하나만 볼 수 있어서 **매수 vs 전세 vs 월세를 동시에 비교 불가**
- 부동산 **가치 상승/하락이 반영되지 않음** (매수한 집이 자산으로 잡히지 않음)
- **손익분기점**(몇 년 이상 거주 시 매수가 유리한지)을 알 수 없음
- 전세 보증금의 **기회비용**이 계산되지 않음

## 2. Goal

이벤트 탭에 **"주거 비교"** 버튼을 추가하여, 모달에서 최대 3개 시나리오(매수/전세/월세)를 설정하고:

1. 각 시나리오별 **순자산 궤적 차트** (겹쳐서 비교)
2. **비교 요약 테이블** (특정 나이별 순자산, 누적 주거비)
3. **손익분기점** (매수가 임대보다 유리해지는 시점)

을 보여주는 기능을 구현한다.

## 3. Scope

### In Scope
- 주거 시나리오 입력 모달 UI (매수/전세/월세 3가지 타입)
- 각 시나리오를 기존 `simulate()` 위에 오버레이하여 시뮬레이션
- 비교 차트 (Chart.js 기존 인스턴스 활용)
- 비교 요약 테이블
- 손익분기점 계산
- 한국어/영어 i18n 지원
- localStorage 저장/복원

### Out of Scope
- 세금 계산 (양도세, 종부세 등의 상세 세금 시뮬레이션)
- 부동산 시장 데이터 연동

## 4. Approach

### 핵심 설계 원칙
- **기존 `simulate()` 함수를 수정하지 않는다** — 주거 시나리오는 simulate 결과를 후처리하는 별도 함수로 구현
- 기존 이벤트/시나리오 시스템과 독립적으로 동작
- 모달 기반 UI로 기존 레이아웃에 영향 없음

### 구현 방식

#### A. 데이터 모델
```javascript
// housingScenarios 배열 (최대 3개)
{
  id: 1,
  type: 'buy' | 'jeonse' | 'rent',
  name: '강남 아파트 매수',
  startAge: 51,
  // 매수
  purchasePrice: 500000,      // 매수가
  appreciationRate: 3,        // 연간 부동산 상승률 (%)
  annualMaintenance: 5000,    // 연 유지비 (재산세+관리비)
  // 매수 - 대출
  ltvRatio: 60,               // LTV 대출 비율 (%)
  loanRate: 4.5,              // 대출 이자율 (%)
  loanTerm: 30,               // 대출 기간 (년)
  loanType: 'amortizing',     // 상환방식: 'amortizing'(원리금균등) | 'interestOnly'(이자만)
  // 전세
  deposit: 300000,            // 전세 보증금
  depositRenewalRate: 3,      // 전세가 상승률 (%)
  renewalCycle: 2,            // 갱신주기 (년)
  // 월세
  monthlyRent: 1500,          // 월세
  rentDeposit: 50000,         // 보증금
  rentIncreaseRate: 3,        // 월세 상승률 (%)
}
```

#### B. 시뮬레이션 로직
1. 기존 `simulate(currentSc)` 실행하여 base rows 생성
2. 각 주거 시나리오에 대해 base rows를 복사 후:
   - **매수**: startAge에 자기자본(`purchasePrice × (1 - ltvRatio)`)만큼 invest 차감, 매년 maintenance + 대출상환액 지출 추가, 부동산 가치를 별도 트래킹, 대출 잔액 트래킹
     - **원리금균등**: `PMT = P × r / (1 - (1+r)^-n)` 매년 고정 상환
     - **이자만**: 매년 `대출잔액 × loanRate` 이자만 지출, 원금은 매도 시 일시상환
   - **전세**: startAge에 deposit만큼 invest 차감 (갱신 시 차액 추가 차감), 보증금은 나중에 회수
   - **월세**: 매년 monthlyRent * 12 지출 추가, rentDeposit만큼 invest 차감
3. 각 시나리오의 **순자산 = 투자자산 + 연금계좌 + 부동산가치 - 대출잔액**

#### C. UI 구조
- 이벤트 탭 하단에 **"🏠 주거 비교"** 버튼 추가
- 클릭 시 모달 오픈:
  - 시작 나이 입력
  - 시나리오 A/B/C 각각 타입 선택 + 조건 입력
  - "비교 실행" 버튼
- 결과: 차트 탭에 비교 차트 + 비교 테이블 렌더링

#### D. 차트
- 기존 차트 영역에 "주거 비교" 모드 추가 (단일 궤적 / 몬테카를로 / **주거 비교**)
- 시나리오별 색상 구분 (A: gold, B: teal, C: purple)

## 5. Implementation Order

| Step | Task | Files |
|------|------|-------|
| 1 | 주거 시나리오 데이터 모델 + state 관리 | `js/app.js` |
| 2 | 주거 시뮬레이션 함수 (`simulateHousing`) | `js/app.js` |
| 3 | 모달 HTML 추가 | `index.html` |
| 4 | 모달 CSS 스타일링 | `css/style.css` |
| 5 | 모달 JS (입력/저장/이벤트) | `js/app.js` |
| 6 | 비교 차트 렌더링 | `js/app.js` |
| 7 | 비교 테이블 + 손익분기점 | `js/app.js` |
| 8 | i18n (한국어/영어) | `js/app.js` |
| 9 | localStorage 저장/복원 | `js/app.js` |

## 6. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| simulate() 후처리 방식의 정확도 | 중 | 기존 simulate 결과를 deep copy 후 차감/추가하므로 원본 시뮬레이션에 영향 없음 |
| 모달 UI 복잡도 | 중 | 타입별 조건부 필드 표시로 단순화 |
| 모바일 레이아웃 | 중 | 기존 모달 스타일 재활용 (import 모달 패턴) |

## 7. Success Criteria

- [ ] 매수/전세/월세 3가지 시나리오를 동시에 비교할 수 있다
- [ ] 비교 차트에서 나이별 순자산 궤적이 겹쳐서 표시된다
- [ ] 손익분기점이 계산되어 표시된다
- [ ] 한국어/영어 모두 정상 동작한다
- [ ] 주거 시나리오 설정이 localStorage에 저장/복원된다
- [ ] 기존 시뮬레이션 기능에 영향이 없다
