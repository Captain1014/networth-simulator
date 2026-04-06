# Design: Housing Scenario Comparison (주거 시나리오 비교)

> References: [housing-scenario.plan.md](../../01-plan/features/housing-scenario.plan.md)

---

## 1. Data Model

### 1.1 Housing Scenario Object

```javascript
// housingScenarios 배열 — global state (accounts, events와 동일 레벨)
let housingScenarios = [];
let hsid = 0; // housing scenario ID counter

// 개별 시나리오 구조
{
  id: 1,
  type: 'buy',              // 'buy' | 'jeonse' | 'rent'
  name: '강남 아파트 매수',
  startAge: 51,              // 주거 시작 나이
  enabled: true,             // 비교에 포함 여부

  // ── buy (매수) 전용 ──
  purchasePrice: 500000,     // 매수가
  appreciationRate: 3,       // 연간 부동산 상승률 (%)
  annualMaintenance: 5000,   // 연 유지비 (재산세+관리비)
  ltvRatio: 60,              // LTV 대출 비율 (%)
  loanRate: 4.5,             // 대출 이자율 (%)
  loanTerm: 30,              // 대출 기간 (년)
  loanType: 'amortizing',   // 'amortizing' (원리금균등) | 'interestOnly' (이자만)

  // ── jeonse (전세) 전용 ──
  deposit: 300000,           // 전세 보증금
  depositRenewalRate: 3,     // 전세가 상승률 (%)
  renewalCycle: 2,           // 갱신주기 (년)

  // ── rent (월세) 전용 ──
  monthlyRent: 1500,         // 월세
  rentDeposit: 50000,        // 보증금
  rentIncreaseRate: 3,       // 월세 상승률 (%)
}
```

### 1.2 State Integration

```javascript
// 기존 state 변수들
let accounts = [];
let events = [];
let housingScenarios = [];  // 신규 추가
let hsid = 0;               // 신규 추가

// chartMode 확장
let chartMode = 'single';   // 'single' | 'montecarlo' | 'housing'  ← 'housing' 추가
let housingResult = null;    // 주거 비교 시뮬레이션 결과 캐시
```

### 1.3 localStorage 확장

`saveState()`와 `loadState()`에 `housingScenarios` 필드 추가:

```javascript
// saveState() 내 state 객체에 추가
state.housingScenarios = housingScenarios.map(h => ({ ...h }));

// loadState() 내 복원 로직 추가
if (Array.isArray(state.housingScenarios)) {
  housingScenarios = state.housingScenarios;
  hsid = housingScenarios.length ? Math.max(0, ...housingScenarios.map(h => h.id)) : 0;
}

// getStateForExport()에도 동일하게 추가
```

---

## 2. Simulation Logic

### 2.1 Core Function: `simulateHousing()`

기존 `simulate()`를 수정하지 않고, 결과를 후처리하는 독립 함수.

```javascript
/**
 * 주거 시나리오별 순자산 궤적을 계산
 * @returns {{ scenarios: Array<{ id, name, type, color, rows: Array<{ age, netWorth, propertyValue, loanBalance, cumulativeCost }> }>, breakeven: { buyVsRent?: number, buyVsJeonse?: number } }}
 */
function simulateHousing() {
  const baseRows = simulate(currentSc);
  const startAge = pN('currentAge');
  const results = [];

  for (const hs of housingScenarios) {
    if (!hs.enabled) continue;
    const rows = [];
    let invest = 0;          // baseRows 대비 invest 변동분
    let propertyValue = 0;   // 부동산 현재가치
    let loanBalance = 0;     // 대출 잔액
    let depositHeld = 0;     // 묶여있는 보증금
    let cumulativeCost = 0;  // 누적 주거비용
    let annualRent = 0;      // 현재 연 월세
    let currentDeposit = 0;  // 현재 전세 보증금

    for (let i = 0; i < baseRows.length; i++) {
      const age = baseRows[i].age;
      const baseNW = baseRows[i].totalLiquid;

      if (age === hs.startAge) {
        // 주거 시작 시점 초기화
        if (hs.type === 'buy') {
          const downPayment = hs.purchasePrice * (1 - hs.ltvRatio / 100);
          loanBalance = hs.purchasePrice * (hs.ltvRatio / 100);
          invest -= downPayment;
          propertyValue = hs.purchasePrice;
        } else if (hs.type === 'jeonse') {
          currentDeposit = hs.deposit;
          invest -= currentDeposit;
          depositHeld = currentDeposit;
        } else if (hs.type === 'rent') {
          invest -= (hs.rentDeposit || 0);
          depositHeld = hs.rentDeposit || 0;
          annualRent = (hs.monthlyRent || 0) * 12;
        }
      }

      if (age > hs.startAge) {
        if (hs.type === 'buy') {
          // 부동산 가치 상승
          propertyValue *= (1 + hs.appreciationRate / 100);
          // 유지비 지출
          invest -= hs.annualMaintenance;
          cumulativeCost += hs.annualMaintenance;
          // 대출 상환
          if (loanBalance > 0) {
            const r = hs.loanRate / 100;
            if (hs.loanType === 'amortizing') {
              const pmt = loanBalance * r / (1 - Math.pow(1 + r, -hs.loanTerm));
              const interest = loanBalance * r;
              const principal = Math.min(pmt - interest, loanBalance);
              loanBalance = Math.max(0, loanBalance - principal);
              invest -= pmt;
              cumulativeCost += pmt;
            } else {
              // interestOnly
              const interest = loanBalance * r;
              invest -= interest;
              cumulativeCost += interest;
            }
          }
        } else if (hs.type === 'jeonse') {
          // 갱신 주기마다 보증금 인상분 추가 투입
          const yearsIn = age - hs.startAge;
          if (hs.renewalCycle > 0 && yearsIn % hs.renewalCycle === 0) {
            const newDeposit = currentDeposit * (1 + hs.depositRenewalRate / 100);
            const diff = newDeposit - currentDeposit;
            invest -= diff;
            depositHeld += diff;
            cumulativeCost += diff;
            currentDeposit = newDeposit;
          }
        } else if (hs.type === 'rent') {
          // 월세 지출 + 인상
          invest -= annualRent;
          cumulativeCost += annualRent;
          annualRent *= (1 + hs.rentIncreaseRate / 100);
        }
      }

      // invest 변동분에 대한 복리 효과 (투자에서 빠진 만큼의 기회비용)
      const rr = pR('returnRate') + SC[currentSc].r / 100;
      if (age > hs.startAge) {
        invest *= (1 + rr);
      }

      // 순자산 = base 순자산 + invest 변동분 + 부동산가치 - 대출잔액
      // (depositHeld는 전세 보증금으로 묶여있지만 나중에 회수 가능하므로 순자산에 포함)
      const netWorth = baseNW + invest + propertyValue - loanBalance;

      rows.push({
        age,
        netWorth,
        propertyValue,
        loanBalance,
        depositHeld,
        cumulativeCost,
        annualCost: hs.type === 'buy'
          ? hs.annualMaintenance + (loanBalance > 0 ? loanBalance * (hs.loanRate / 100) : 0)
          : hs.type === 'rent' ? annualRent : 0,
      });
    }

    results.push({
      id: hs.id,
      name: hs.name || t('housing.scenario') + ' ' + hs.id,
      type: hs.type,
      rows,
    });
  }

  // 손익분기점 계산
  const breakeven = calcBreakeven(results);

  return { scenarios: results, breakeven };
}
```

### 2.2 Breakeven Calculation

```javascript
/**
 * 시나리오 간 순자산 역전 시점 찾기
 * buy vs rent, buy vs jeonse 쌍으로 비교
 */
function calcBreakeven(results) {
  const breakeven = {};
  const buy = results.find(r => r.type === 'buy');
  const rent = results.find(r => r.type === 'rent');
  const jeonse = results.find(r => r.type === 'jeonse');

  if (buy && rent) {
    for (let i = 0; i < buy.rows.length; i++) {
      if (buy.rows[i].netWorth >= rent.rows[i].netWorth) {
        breakeven.buyVsRent = buy.rows[i].age;
        break;
      }
    }
  }
  if (buy && jeonse) {
    for (let i = 0; i < buy.rows.length; i++) {
      if (buy.rows[i].netWorth >= jeonse.rows[i].netWorth) {
        breakeven.buyVsJeonse = buy.rows[i].age;
        break;
      }
    }
  }

  return breakeven;
}
```

---

## 3. UI Design

### 3.1 Entry Point — Chart Mode Bar

기존 차트 모드 바에 "주거 비교" 버튼 추가:

```html
<!-- 기존 chart-mode-bar에 추가 -->
<button type="button" class="sc-btn" id="chartModeHousing"
  onclick="setChartMode('housing')" data-i18n="chart.modeHousing">주거 비교</button>
```

주거 비교 모드 선택 시 기존 시나리오 바 대신 **주거 비교 컨트롤 패널** 표시:

```html
<div id="housing-controls" class="housing-controls" style="display:none">
  <button type="button" class="btn-housing-edit" onclick="openHousingModal()">
    🏠 <span data-i18n="housing.editScenarios">시나리오 설정</span>
  </button>
  <span id="housingBreakevenLabel" class="housing-breakeven"></span>
</div>
```

### 3.2 Housing Modal

기존 import-modal 패턴을 재활용한 풀 모달:

```html
<div class="import-modal-overlay" id="housingModalOverlay" style="display:none"
     onclick="if(event.target===this)closeHousingModal()">
  <div class="housing-modal">
    <div class="housing-modal-title" data-i18n="housing.modalTitle">🏠 주거 시나리오 비교</div>
    <div class="housing-modal-desc" data-i18n="housing.modalDesc">
      최대 3개 시나리오를 설정하고 장기 순자산을 비교하세요.
    </div>

    <!-- 시나리오 카드 컨테이너 -->
    <div id="housingScenarioList" class="housing-scenario-list"></div>

    <!-- 추가 버튼 (3개 미만일 때만 표시) -->
    <button type="button" class="btn-add-hs" id="btnAddHousing"
      onclick="addHousingScenario()" data-i18n="housing.add">+ 시나리오 추가</button>

    <!-- 액션 버튼 -->
    <div class="housing-modal-actions">
      <button type="button" class="btn-import-cancel"
        onclick="closeHousingModal()" data-i18n="importCancel">취소</button>
      <button type="button" class="btn-import-apply"
        onclick="runHousingComparison()" data-i18n="housing.run">비교 실행</button>
    </div>
  </div>
</div>
```

### 3.3 Scenario Card (Modal 내부)

각 시나리오는 카드 형태로 렌더링. 타입에 따라 조건부 필드 표시:

```
┌─────────────────────────────────────────────┐
│  [A] 매수 ▾    [강남 아파트 매수        ] 🗑 │
│                                             │
│  시작 나이: [51]세                           │
│                                             │
│  매수가:        [500,000]                    │
│  부동산 상승률: [3] %                        │
│  연 유지비:     [5,000]                      │
│                                             │
│  ── 대출 ──                                  │
│  LTV 비율:     [60] %                        │
│  대출 이자율:  [4.5] %                       │
│  대출 기간:    [30] 년                       │
│  상환 방식:    [원리금균등 ▾]                │
└─────────────────────────────────────────────┘
```

타입별 필드 매핑:

| 필드 | buy | jeonse | rent |
|------|:---:|:------:|:----:|
| startAge | O | O | O |
| purchasePrice | O | | |
| appreciationRate | O | | |
| annualMaintenance | O | | |
| ltvRatio | O | | |
| loanRate | O | | |
| loanTerm | O | | |
| loanType | O | | |
| deposit | | O | |
| depositRenewalRate | | O | |
| renewalCycle | | O | |
| monthlyRent | | | O |
| rentDeposit | | | O |
| rentIncreaseRate | | | O |

### 3.4 Color Scheme

| Scenario | Color | CSS Variable |
|----------|-------|-------------|
| A (첫 번째) | Gold | `var(--gold)` / `#d4a853` |
| B (두 번째) | Teal | `var(--teal)` / `#5bbfb5` |
| C (세 번째) | Purple | `#9b7fe8` |

---

## 4. Chart Rendering

### 4.1 `renderChartHousing(data)`

`renderChartMC()`와 동일한 패턴. Chart.js line chart에 시나리오별 dataset 추가:

```javascript
function renderChartHousing(data) {
  if (chartInst) chartInst.destroy();
  const ctx = document.getElementById('mainChart').getContext('2d');

  const colors = ['#d4a853', '#5bbfb5', '#9b7fe8'];
  const datasets = data.scenarios.map((sc, i) => ({
    label: sc.name,
    data: sc.rows.map(r => Math.round(r.netWorth)),
    borderColor: colors[i % 3],
    backgroundColor: i === 0 ? 'rgba(212,168,83,0.07)' : 'transparent',
    borderWidth: i === 0 ? 2.5 : 2,
    pointRadius: 0,
    pointHoverRadius: 4,
    borderDash: i === 0 ? [] : [4, 3],
    fill: i === 0,
    tension: 0.3,
  }));

  const ageSfx = t('summary.ageSuffix');
  const labels = data.scenarios[0].rows.map(r => r.age + ageSfx);

  chartInst = new Chart(ctx, {
    type: 'line',
    data: { labels, datasets },
    options: {
      // 기존 차트 옵션과 동일 (renderChart에서 복사)
      responsive: true,
      maintainAspectRatio: true,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#a0a0b8', font: { size: 10 }, boxWidth: 10, padding: 14 } },
        tooltip: {
          backgroundColor: '#1e1e27',
          borderColor: '#2c2c3a',
          borderWidth: 1,
          titleColor: '#e8e6f0',
          bodyColor: '#a0a0b8',
          padding: 10,
          callbacks: { label: c => ` ${c.dataset.label}: ${fmt(c.parsed.y)}` },
        },
      },
      scales: {
        x: { ticks: { color: '#606078', font: { size: 9 }, maxTicksLimit: 14 }, grid: { color: 'rgba(44,44,58,0.4)' } },
        y: { ticks: { color: '#606078', font: { size: 9, family: 'DM Mono' }, callback: v => fmt(v) }, grid: { color: 'rgba(44,44,58,0.4)' } },
      },
    },
  });
}
```

### 4.2 Comparison Table

차트 아래에 비교 요약 테이블 렌더링 (`#housingTable`):

```
| 항목              | A: 매수 35억  | B: 전세 5억   | C: 월세 200만 |
|-------------------|-------------|-------------|-------------|
| 초기 투입         | $140K (자기) | $300K (보증) | $50K (보증)  |
| 대출              | $360K       | —           | —           |
| 60세 순자산       | $8.2M       | $7.9M       | $7.5M       |
| 70세 순자산       | $15.1M      | $14.2M      | $13.0M      |
| 80세 순자산       | $28.3M      | $26.1M      | $23.8M      |
| 누적 주거비용     | $285K       | $45K        | $510K       |
| 손익분기점        | — (기준)    | 63세 (vs 매수) | 59세 (vs 매수) |
```

비교 테이블은 `startAge`, `startAge+10`, `startAge+20`, `startAge+30` 시점의 순자산을 표시.

---

## 5. Function Specifications

### 5.1 New Functions

| Function | Purpose | Location |
|----------|---------|----------|
| `simulateHousing()` | 주거 시나리오별 순자산 궤적 계산 | app.js |
| `calcBreakeven(results)` | 시나리오 간 손익분기점 | app.js |
| `renderChartHousing(data)` | 비교 차트 렌더링 | app.js |
| `renderHousingTable(data)` | 비교 요약 테이블 렌더링 | app.js |
| `openHousingModal()` | 모달 열기 | app.js |
| `closeHousingModal()` | 모달 닫기 | app.js |
| `renderHousingScenarioList()` | 모달 내 시나리오 카드 렌더링 | app.js |
| `addHousingScenario(type)` | 시나리오 추가 (기본 buy) | app.js |
| `removeHousingScenario(id)` | 시나리오 삭제 | app.js |
| `updateHousingScenario(id, field, value)` | 시나리오 필드 업데이트 | app.js |
| `runHousingComparison()` | 비교 실행 (모달에서 호출) | app.js |

### 5.2 Modified Functions

| Function | Change |
|----------|--------|
| `setChartMode(mode)` | `'housing'` 모드 처리 추가, housing-controls 표시/숨김 |
| `saveState()` | `housingScenarios` 저장 |
| `loadState()` | `housingScenarios` 복원 |
| `getStateForExport()` | `housingScenarios` 포함 |
| `doBackupRestore()` | `housingScenarios` 복원 |
| `renderAll()` | housing 모드일 때 `renderChartHousing` 호출 |

### 5.3 i18n Keys (추가)

```javascript
// T.ko에 추가
housing: {
  modalTitle: '🏠 주거 시나리오 비교',
  modalDesc: '최대 3개 시나리오를 설정하고 장기 순자산을 비교하세요.',
  add: '+ 시나리오 추가',
  run: '비교 실행',
  editScenarios: '시나리오 설정',
  scenario: '시나리오',
  modeHousing: '주거 비교',
  typeBuy: '🏠 매수',
  typeJeonse: '🔑 전세',
  typeRent: '💸 월세',
  startAge: '시작 나이',
  purchasePrice: '매수가',
  appreciationRate: '부동산 상승률',
  annualMaintenance: '연 유지비 (재산세+관리비)',
  ltvRatio: 'LTV 대출 비율',
  loanRate: '대출 이자율',
  loanTerm: '대출 기간',
  loanType: '상환 방식',
  loanAmortizing: '원리금균등',
  loanInterestOnly: '이자만',
  deposit: '전세 보증금',
  depositRenewalRate: '전세가 상승률',
  renewalCycle: '갱신주기',
  monthlyRent: '월세',
  rentDeposit: '보증금',
  rentIncreaseRate: '월세 상승률',
  breakeven: '손익분기점',
  breakevenBuyVsRent: '매수가 월세보다 유리해지는 시점',
  breakevenBuyVsJeonse: '매수가 전세보다 유리해지는 시점',
  noBreakeven: '기간 내 역전 없음',
  tableInitial: '초기 투입',
  tableLoan: '대출',
  tableNetWorth: '순자산',
  tableCumulCost: '누적 주거비용',
  delete: '🗑 삭제',
},

// T.en에 추가
housing: {
  modalTitle: '🏠 Housing Scenario Comparison',
  modalDesc: 'Set up to 3 scenarios and compare long-term net worth.',
  add: '+ Add scenario',
  run: 'Run comparison',
  editScenarios: 'Edit scenarios',
  scenario: 'Scenario',
  modeHousing: 'Housing',
  typeBuy: '🏠 Buy',
  typeJeonse: '🔑 Jeonse',
  typeRent: '💸 Rent',
  startAge: 'Start age',
  purchasePrice: 'Purchase price',
  appreciationRate: 'Appreciation rate',
  annualMaintenance: 'Annual maintenance',
  ltvRatio: 'LTV ratio',
  loanRate: 'Loan rate',
  loanTerm: 'Loan term',
  loanType: 'Repayment type',
  loanAmortizing: 'Amortizing',
  loanInterestOnly: 'Interest only',
  deposit: 'Jeonse deposit',
  depositRenewalRate: 'Deposit renewal rate',
  renewalCycle: 'Renewal cycle',
  monthlyRent: 'Monthly rent',
  rentDeposit: 'Deposit',
  rentIncreaseRate: 'Rent increase rate',
  breakeven: 'Breakeven',
  breakevenBuyVsRent: 'Buy becomes better than rent at',
  breakevenBuyVsJeonse: 'Buy becomes better than jeonse at',
  noBreakeven: 'No crossover in range',
  tableInitial: 'Initial outlay',
  tableLoan: 'Loan',
  tableNetWorth: 'Net worth',
  tableCumulCost: 'Cumulative housing cost',
  delete: '🗑 Delete',
},
```

---

## 6. CSS Additions

### 6.1 Housing Modal (import-modal 패턴 확장)

```css
/* housing-modal은 import-modal보다 넓음 */
.housing-modal {
  background: var(--card);
  border: 1px solid var(--border2);
  border-radius: 12px;
  padding: 24px;
  width: min(640px, 95vw);
  max-height: 85vh;
  overflow-y: auto;
  display: flex; flex-direction: column; gap: 12px;
}
.housing-modal-title { font-size: 16px; font-weight: 600; color: var(--text); }
.housing-modal-desc { font-size: 12px; color: var(--text2); }
.housing-modal-actions { display: flex; gap: 8px; justify-content: flex-end; }
```

### 6.2 Scenario Card

```css
.hs-card {
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 14px;
  display: flex; flex-direction: column; gap: 8px;
}
.hs-card-head {
  display: flex; align-items: center; gap: 8px;
}
.hs-card-head select { flex: 0 0 auto; }
.hs-card-head input { flex: 1; }
.hs-card-head .btn-del { flex: 0 0 auto; }
.hs-card-fields { display: flex; flex-direction: column; gap: 6px; }
.hs-card .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.hs-loan-section {
  border-top: 1px solid var(--border);
  padding-top: 8px;
  margin-top: 4px;
}
.hs-loan-title {
  font-size: 11px; color: var(--text3); font-weight: 500;
  margin-bottom: 4px;
}
```

### 6.3 Housing Controls & Table

```css
.housing-controls {
  display: flex; align-items: center; gap: 12px; padding: 8px 0;
}
.btn-housing-edit {
  padding: 6px 14px; font-size: 12px;
  background: var(--card); color: var(--text);
  border: 1px solid var(--border); border-radius: 6px;
  cursor: pointer; font-family: inherit;
}
.btn-housing-edit:hover { border-color: var(--gold); color: var(--gold); }
.housing-breakeven { font-size: 11px; color: var(--teal); }
.btn-add-hs {
  width: 100%; padding: 8px;
  background: transparent; color: var(--text2);
  border: 1px dashed var(--border); border-radius: 6px;
  cursor: pointer; font-family: inherit; font-size: 12px;
}
.btn-add-hs:hover { color: var(--gold); border-color: var(--gold); }

/* 비교 테이블 */
#housingTableWrap { margin-top: 12px; }
#housingTableWrap table {
  width: 100%; border-collapse: collapse; font-size: 11px;
}
#housingTableWrap th {
  text-align: left; padding: 6px 8px;
  border-bottom: 1px solid var(--border);
  color: var(--text3); font-weight: 500;
}
#housingTableWrap td {
  padding: 6px 8px;
  border-bottom: 1px solid rgba(44,44,58,0.3);
  color: var(--text2);
  font-family: var(--mono); font-size: 11px;
}
```

---

## 7. HTML Additions

### 7.1 Chart Mode Bar (index.html 수정)

`chart-mode-bar` div에 버튼 추가:

```html
<!-- 기존 몬테카를로 버튼 다음에 추가 -->
<button type="button" class="sc-btn" id="chartModeHousing"
  onclick="setChartMode('housing')" data-i18n="chart.modeHousing">주거 비교</button>
```

### 7.2 Housing Controls (chart panel 내부)

`mc-controls` div 다음에 추가:

```html
<div id="housing-controls" class="housing-controls" style="display:none">
  <button type="button" class="btn-housing-edit" onclick="openHousingModal()">
    🏠 <span data-i18n="housing.editScenarios">시나리오 설정</span>
  </button>
  <span id="housingBreakevenLabel" class="housing-breakeven"></span>
</div>
```

### 7.3 Housing Table Wrap (chart panel 하단)

`sc-bar` div 다음에 추가:

```html
<div id="housingTableWrap" style="display:none"></div>
```

### 7.4 Housing Modal (body 하단)

```html
<!-- 기존 스크립트 태그 앞에 추가 -->
<div class="import-modal-overlay" id="housingModalOverlay" style="display:none"
     onclick="if(event.target===this)closeHousingModal()">
  <div class="housing-modal" id="housingModal"></div>
</div>
```

---

## 8. Implementation Order

| Step | Task | Est. Lines |
|------|------|-----------|
| 1 | i18n keys (T.ko.housing, T.en.housing) | ~60 |
| 2 | State vars + saveState/loadState 수정 | ~25 |
| 3 | `simulateHousing()` + `calcBreakeven()` | ~100 |
| 4 | HTML additions (modal, controls, table wrap) | ~15 |
| 5 | CSS additions (modal, cards, table) | ~80 |
| 6 | Modal functions (open/close/render/add/remove/update) | ~120 |
| 7 | `setChartMode()` 수정 + `renderChartHousing()` | ~60 |
| 8 | `renderHousingTable()` + breakeven label | ~60 |
| **Total** | | **~520 lines** |

---

## 9. Edge Cases

| Case | Handling |
|------|----------|
| 시나리오 0개에서 비교 실행 | 비교 모드 유지, "시나리오를 추가하세요" 메시지 표시 |
| startAge가 현재 나이보다 작을 때 | startAge를 현재 나이로 clamp |
| LTV 100% (풀 대출) | 자기자본 = 0, 대출만으로 매수 허용 |
| LTV 0% (풀 현금) | 대출 관련 필드 숨김 |
| 대출 기간 종료 후 | loanBalance = 0, 상환액 지출 중단 |
| 시나리오 삭제 시 3개 → 2개 | 추가 버튼 다시 표시 |
| 기존 시나리오/이벤트 데이터가 없는 경우 | housing 모드 정상 동작 (base simulate는 기본값 사용) |
