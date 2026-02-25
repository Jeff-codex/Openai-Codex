// src/lib/rules.v1.ts
export type RuleCategory =
  | "exaggeration"
  | "guarantee"
  | "superlative"
  | "comparison"
  | "evidence"
  | "structure"
  | "readability"
  | "defamation"
  | "industry_medical"
  | "industry_finance"
  | "industry_realestate"
  | "industry_diet";

export type Rule = {
  rule_id: string;
  severity: 1 | 2 | 3 | 4 | 5;
  category: RuleCategory;
  // 정규식 or 키워드 조합
  pattern?: RegExp;
  keywords?: string[]; // simple include match
  // 맥락 조건: A가 존재할 때 B가 함께 있으면 발동 등
  requiresAny?: RegExp[];
  rationale: string;
  fix_template: string;
};

const rx = (s: string, flags = "gi") => new RegExp(s, flags);

// -------------------------
// 공통 30개 (R001~R030)
// -------------------------
export const COMMON_RULES_V1: Rule[] = [
  // A) 과장/보장/최상급
  {
    rule_id: "R001",
    severity: 5,
    category: "exaggeration",
    pattern: rx("(100%|무조건|완벽|절대|확실)"),
    rationale: "확정적/절대적 표현은 과장·오해 소지가 커 반려 트리거가 됩니다.",
    fix_template: "‘상황에 따라 다를 수 있습니다’, ‘도움을 줄 수 있습니다’처럼 완화 표현으로 바꾸세요.",
  },
  {
    rule_id: "R002",
    severity: 5,
    category: "superlative",
    pattern: rx("(최고|1위|유일|국내\\s*최초)"),
    rationale: "최상급/1위/최초 표기는 객관 근거(기관/기간/지표)가 없으면 고위험입니다.",
    fix_template: "‘~로 알려져 있습니다’ 또는 ‘(조사 기준/기간/출처)’를 명시하세요.",
  },
  {
    rule_id: "R003",
    severity: 4,
    category: "exaggeration",
    // 즉시/바로/단기간 + 효과/개선/해결 등의 결합
    pattern: rx("(즉시|바로|단기간)"),
    requiresAny: [rx("(효과|개선|해결|완화|회복|상승|증가|감소|성공)")],
    rationale: "짧은 시간 내 효과 단정은 과장으로 읽히기 쉽습니다.",
    fix_template: "‘개인차가 있을 수 있습니다’, ‘일정 기간 사용 시’ 등 조건을 붙이세요.",
  },
  {
    rule_id: "R004",
    severity: 5,
    category: "guarantee",
    pattern: rx("(부작용\\s*없|안전(함)?\\s*보장)"),
    rationale: "‘부작용 없음/안전 보장’은 고위험 확정 표현입니다.",
    fix_template: "‘일반적으로’, ‘개인차’, ‘주의사항’ 등 리스크 고지를 추가하세요.",
  },
  {
    rule_id: "R005",
    severity: 5,
    category: "guarantee",
    pattern: rx("(환불\\s*보장|효과\\s*보장|보장합니다)"),
    rationale: "보장/환불 보장은 조건·예외·기준이 없으면 반려 가능성이 큽니다.",
    fix_template: "보장 조건(기간/대상/절차/예외)을 명확히 기재하거나 표현을 완화하세요.",
  },
  {
    rule_id: "R006",
    severity: 3,
    category: "exaggeration",
    pattern: rx("(누구나|모든\\s*사람|전부|항상)"),
    rationale: "과도한 일반화는 신뢰를 떨어뜨리고 과장으로 해석될 수 있습니다.",
    fix_template: "‘대부분의 경우’, ‘일부 사용자’처럼 범위를 제한하세요.",
  },
  {
    rule_id: "R007",
    severity: 3,
    category: "exaggeration",
    pattern: rx("(혁명|기적|마법|충격적인|레전드)"),
    rationale: "감정 과장 표현은 광고성 과장으로 인식되기 쉽습니다.",
    fix_template: "구체 지표/근거로 대체하거나 중립적 표현으로 바꾸세요.",
  },
  {
    rule_id: "R008",
    severity: 4,
    category: "evidence",
    pattern: rx("(검증(됨|된)|입증(됨|된)|증명(됨|된))"),
    requiresAny: [
      // 출처 단서가 없을 때 위험(연도/기관/링크/논문/보고서)
      rx("(https?://|doi|논문|학회|보고서|기관|연구|\\d{4}년)"),
    ],
    // requiresAny가 "있으면" 완화인데 여기선 반대로 쓰기 어려워서
    // score.v2에서 "출처 단서가 없으면"만 페널티로 처리
    rationale: "검증/입증 표현은 출처가 없으면 신뢰·반려 리스크가 높습니다.",
    fix_template: "검증 주체(기관/연구/연도/링크)를 함께 제시하세요.",
  },
  {
    rule_id: "R009",
    severity: 4,
    category: "evidence",
    pattern: rx("(전문가\\s*추천|전문의\\s*추천|의사\\s*추천|교수\\s*추천)"),
    rationale: "권위 인용은 실명/소속/근거가 없으면 과장으로 해석될 수 있습니다.",
    fix_template: "추천 주체의 실명/소속/근거(자료/인터뷰 등)를 명시하거나 표현을 완화하세요.",
  },
  {
    rule_id: "R010",
    severity: 4,
    category: "comparison",
    pattern: rx("(타사\\s*대비|경쟁사\\s*보다|비교\\s*우위|더\\s*낫)"),
    rationale: "비교우위는 객관 근거가 없으면 반려/분쟁 리스크가 큽니다.",
    fix_template: "비교 기준(항목/측정/기간/출처)을 명시하거나 비교 표현을 제거하세요.",
  },

  // B) 사실 주장 vs 근거 부족
  {
    rule_id: "R011",
    severity: 4,
    category: "evidence",
    pattern: rx("(\\d+(?:\\.\\d+)?\\s*%|\\d+\\s*(명|건|개|회|일|주|개월|년))"),
    rationale: "수치/퍼센트는 출처·조건·기간이 없으면 신뢰·반려 리스크가 있습니다.",
    fix_template: "수치의 기준(기간/대상/측정 방식)과 출처(기관/링크)를 함께 적으세요.",
  },
  {
    rule_id: "R012",
    severity: 3,
    category: "evidence",
    pattern: rx("([가-힣A-Za-z0-9]+)\\s*로\\s*인해\\s*([가-힣A-Za-z0-9]+)\\s*(된다|됩니다)"),
    rationale: "인과 단정은 근거가 없으면 과장으로 읽힐 수 있습니다.",
    fix_template: "‘~로 볼 수 있습니다’, ‘~일 수 있습니다’로 완화하거나 근거를 추가하세요.",
  },
  {
    rule_id: "R013",
    severity: 3,
    category: "evidence",
    pattern: rx("(후기|사례|경험담|리뷰)"),
    rationale: "후기/사례는 조건(기간/상황/개인차)이 없으면 과장으로 해석될 수 있습니다.",
    fix_template: "사례의 전제(기간/상황/개인차)를 함께 명시하세요.",
  },
  {
    rule_id: "R014",
    severity: 3,
    category: "evidence",
    pattern: rx("(연구|논문|임상|학회)"),
    rationale: "연구/논문 언급은 기관/연도/링크/DOI가 없으면 신뢰가 낮아집니다.",
    fix_template: "기관/연도/논문명/링크(또는 DOI)를 함께 기재하세요.",
  },
  {
    rule_id: "R015",
    severity: 3,
    category: "evidence",
    pattern: rx("(공식|인증|인증받은|인증\\s*완료)"),
    rationale: "인증은 인증명/번호/기관이 없으면 오해 소지가 있습니다.",
    fix_template: "인증명/기관/번호(가능 시)를 명시하세요.",
  },
  {
    rule_id: "R016",
    severity: 2,
    category: "evidence",
    pattern: rx("(언론\\s*보도|방송\\s*출연|보도\\s*됨)"),
    rationale: "언론/방송 언급은 매체/날짜/링크가 없으면 신뢰가 떨어집니다.",
    fix_template: "매체명/날짜/관련 링크를 함께 제시하세요.",
  },
  {
    rule_id: "R017",
    severity: 2,
    category: "evidence",
    pattern: rx("(많은\\s*고객|폭발적\\s*반응|대박|문의\\s*폭주)"),
    rationale: "정성 표현만 있으면 과장으로 보일 수 있습니다.",
    fix_template: "가능하면 수치(기간/건수)로 구체화하거나 표현을 완화하세요.",
  },
  {
    rule_id: "R018",
    severity: 3,
    category: "evidence",
    pattern: rx("(특허|기술력|독자\\s*기술|자체\\s*기술)"),
    rationale: "특허/기술력은 무엇이 핵심인지, 근거가 없으면 신뢰가 낮습니다.",
    fix_template: "기술명/특허번호/핵심 차별점을 1~2문장으로 구체화하세요.",
  },

  // C) 가독성/구조 (R019~R025는 score.v2에서 메트릭 기반으로 처리)
  {
    rule_id: "R019",
    severity: 2,
    category: "readability",
    rationale: "문장이 과도하게 길면 가독성이 떨어집니다.",
    fix_template: "긴 문장을 2~3개로 쪼개고, 핵심 주장 먼저 배치하세요.",
  },
  {
    rule_id: "R020",
    severity: 3,
    category: "readability",
    rationale: "동일 키워드 반복이 많으면 스팸성으로 보일 수 있습니다.",
    fix_template: "반복 키워드를 줄이고 동의어/설명으로 분산하세요.",
  },
  {
    rule_id: "R021",
    severity: 2,
    category: "structure",
    rationale: "단락 구조가 없으면 읽기 어렵습니다.",
    fix_template: "문단을 ‘문제-해결-근거-CTA’로 3~5단락 구성하세요.",
  },
  {
    rule_id: "R022",
    severity: 2,
    category: "structure",
    rationale: "주어/목적/행동(CTA)이 불명확합니다.",
    fix_template: "‘누가/무엇을/왜/어떻게/지금 무엇을 해야 하는지’를 명확히 적으세요.",
  },
  {
    rule_id: "R023",
    severity: 2,
    category: "structure",
    rationale: "결론/제안(그래서 무엇을)이 부족합니다.",
    fix_template: "마지막에 ‘요약 + 다음 행동(문의/신청/확인)’을 1~2문장으로 추가하세요.",
  },
  {
    rule_id: "R024",
    severity: 2,
    category: "readability",
    pattern: rx("(매우|정말|엄청|진짜|완전)"),
    rationale: "불필요한 수식어가 많으면 광고성으로 읽힐 수 있습니다.",
    fix_template: "수식어를 줄이고 근거/구체 정보로 대체하세요.",
  },
  {
    rule_id: "R025",
    severity: 2,
    category: "readability",
    rationale: "문장 부호/띄어쓰기 오류가 많으면 신뢰가 하락합니다.",
    fix_template: "맞춤법/띄어쓰기 교정을 한 번 거친 후 제출하세요.",
  },

  // D) 명예훼손/비방/확정적 비판
  {
    rule_id: "R026",
    severity: 5,
    category: "defamation",
    pattern: rx("(사기|불법|쓰레기|먹튀|범죄)"),
    rationale: "비방/명예훼손 표현은 법적 리스크가 큽니다.",
    fix_template: "사실 확인 없는 단정/비방 표현을 제거하고 중립적 비교로 바꾸세요.",
  },
  {
    rule_id: "R027",
    severity: 5,
    category: "defamation",
    pattern: rx("(폭로|고발|반드시\\s*처벌|무조건\\s*걸림|증거\\s*있음)"),
    rationale: "확인 불가 폭로형 단정은 고위험입니다.",
    fix_template: "단정을 피하고, 사실/근거/출처가 있는 경우에만 제한적으로 표현하세요.",
  },
  {
    rule_id: "R028",
    severity: 4,
    category: "defamation",
    pattern: rx("(타사는\\s*다\\s*거짓|다\\s*사기|전부\\s*가짜)"),
    rationale: "비교 비하 표현은 분쟁 리스크가 큽니다.",
    fix_template: "타사 언급을 제거하고 자사 장점만 근거 중심으로 서술하세요.",
  },
  {
    rule_id: "R029",
    severity: 4,
    category: "defamation",
    // 상표/제품명 + 부정 키워드 간단 탐지(정교화는 v2)
    pattern: rx("([A-Za-z0-9가-힣]{2,})\\s*(은|는)?\\s*(사기|불법|별로|최악|구림|쓰레기)"),
    rationale: "특정 상표/제품을 부정적으로 지칭하면 리스크가 큽니다.",
    fix_template: "구체 상표/제품 언급을 피하거나, 객관적 사실과 출처로 제한하세요.",
  },
  {
    rule_id: "R030",
    severity: 4,
    category: "defamation",
    pattern: rx("(소송|처벌|고소|고발)"),
    rationale: "법적 위협/단정은 반려·분쟁 리스크가 있습니다.",
    fix_template: "위협성 문구를 제거하고 사실 기반 안내로 바꾸세요.",
  },
];

// -------------------------
// 업종별 20개 (v1 핵심만 빠르게)
// - 키워드/패턴 중심으로 v1 적용
// -------------------------

export const MEDICAL_RULES_V1: Rule[] = [
  { rule_id: "M001", severity: 5, category: "industry_medical", pattern: rx("(치료|완치|예방)\\s*(됩니다|된다|가능)"), rationale: "치료/완치/예방 단정은 고위험입니다.", fix_template: "‘도움을 줄 수 있습니다’, ‘개인차가 있습니다’로 완화하세요." },
  { rule_id: "M002", severity: 4, category: "industry_medical", pattern: rx("(의학적으로\\s*증명|의학적\\s*근거)"), rationale: "의학적 증명은 출처 없으면 위험합니다.", fix_template: "기관/연도/논문/링크를 명시하거나 표현을 완화하세요." },
  { rule_id: "M003", severity: 5, category: "industry_medical", pattern: rx("(부작용\\s*없|무(\\s*)부작용)"), rationale: "부작용 없음은 확정 표현입니다.", fix_template: "주의사항/개인차/부작용 가능성을 고지하세요." },
  { rule_id: "M004", severity: 4, category: "industry_medical", pattern: rx("(통증\\s*0|즉시\\s*회복|바로\\s*회복)"), rationale: "시술 효과 과장은 반려 리스크가 큽니다.", fix_template: "회복 기간은 개인차/조건을 포함해 서술하세요." },
  { rule_id: "M005", severity: 4, category: "industry_medical", pattern: rx("(before\\s*/\\s*after|전\\s*후\\s*사진|비포\\s*애프터)", "gi"), rationale: "전후사진 암시는 과장으로 해석될 수 있습니다.", fix_template: "개인차/조건을 명시하고 과장 암시를 피하세요." },
  { rule_id: "M006", severity: 3, category: "industry_medical", pattern: rx("(의사|전문의|교수)\\s*(추천|보증)"), rationale: "권위 남용은 근거가 필요합니다.", fix_template: "실명/소속/면허정보(가능 범위) 또는 표현 완화." },
  { rule_id: "M007", severity: 5, category: "industry_medical", pattern: rx("(암|당뇨|고혈압|우울|불안|아토피|치매)\\s*(치료|완치|개선)"), rationale: "특정 질환 타겟 효능 단정은 고위험입니다.", fix_template: "의학적 효능 단정을 피하고 정보 제공 수준으로 제한하세요." },
  { rule_id: "M008", severity: 3, category: "industry_medical", pattern: rx("(세포\\s*재생|면역\\s*증강|항염|항산화|디톡스)"), rationale: "과학 용어는 근거 없이 쓰면 오해 소지.", fix_template: "정확한 의미/근거/출처를 추가하거나 표현을 완화." },
  // 나머지 12개는 v1에서는 키워드로만 깔아둠(확정표현 감지)
  ...Array.from({ length: 12 }).map((_, i) => ({
    rule_id: `M${String(9 + i).padStart(3, "0")}`,
    severity: 3 as const,
    category: "industry_medical" as const,
    pattern: rx("(FDA|식약처|임상|의학|의료기기|효능|부작용)"),
    rationale: "의료/건강 관련 표현은 근거·주의 고지가 필요합니다.",
    fix_template: "기관/연도/근거 또는 개인차/주의사항을 함께 기재하세요.",
  })),
];

export const FINANCE_RULES_V1: Rule[] = [
  { rule_id: "F001", severity: 5, category: "industry_finance", pattern: rx("(수익\\s*보장|확정\\s*수익|무조건\\s*수익)"), rationale: "수익 보장은 고위험입니다.", fix_template: "‘손실 가능’, ‘변동 가능’ 고지 + 단정 제거." },
  { rule_id: "F002", severity: 5, category: "industry_finance", pattern: rx("(원금\\s*보장|손실\\s*없음|무(\\s*)손실)"), rationale: "원금/손실 없음 단정은 고위험입니다.", fix_template: "리스크 고지 필수, 단정 삭제." },
  { rule_id: "F003", severity: 5, category: "industry_finance", pattern: rx("(단기간\\s*고수익|몇\\s*배|\\d+배\\s*수익)"), rationale: "단기간 고수익 과장은 반려 리스크가 큽니다.", fix_template: "과거 사례는 조건/기간/리스크와 함께 제한적으로." },
  { rule_id: "F004", severity: 5, category: "industry_finance", pattern: rx("(매수\\s*추천|지금\\s*사라|무조건\\s*사라|확실히\\s*오른다)"), rationale: "직접 매수 권유/단정은 고위험입니다.", fix_template: "정보 제공 수준으로 완화 + 손실 가능 고지." },
  { rule_id: "F005", severity: 4, category: "industry_finance", pattern: rx("(검증된\\s*전략|승률\\s*\\d+%|확률\\s*\\d+%)"), rationale: "전략/승률 단정은 근거가 필요합니다.", fix_template: "백테스트 조건/기간/표본/리스크를 함께 기재." },
  { rule_id: "F006", severity: 3, category: "industry_finance", pattern: rx("(리스크\\s*없|안전\\s*투자)"), rationale: "리스크 부정은 오해 소지.", fix_template: "손실 가능성과 변동성을 명시." },
  ...Array.from({ length: 14 }).map((_, i) => ({
    rule_id: `F${String(7 + i).padStart(3, "0")}`,
    severity: 3 as const,
    category: "industry_finance" as const,
    pattern: rx("(레버리지|선물|마진|고수익|원금|보장|확정)"),
    rationale: "투자/재테크는 리스크·조건 고지가 필요합니다.",
    fix_template: "손실 가능/조건/기간/예외를 함께 기재하세요.",
  })),
];

export const REALESTATE_RULES_V1: Rule[] = [
  { rule_id: "RE001", severity: 5, category: "industry_realestate", pattern: rx("(확실한\\s*시세차익|무조건\\s*오른다|반드시\\s*오른다)"), rationale: "시세차익 단정은 고위험입니다.", fix_template: "‘가능성’, ‘변동’ 표현 + 근거/리스크 고지." },
  { rule_id: "RE002", severity: 5, category: "industry_realestate", pattern: rx("(청약\\s*당첨\\s*보장|당첨\\s*확정)"), rationale: "당첨 보장은 고위험입니다.", fix_template: "확정 표현 삭제, 조건/확률/변동 고지." },
  { rule_id: "RE003", severity: 4, category: "industry_realestate", pattern: rx("(개발\\s*확정|호재\\s*확정|착공\\s*확정)"), rationale: "개발/호재를 확정으로 단정하면 위험합니다.", fix_template: "공문/기관/근거 링크 또는 ‘예정/검토’로 완화." },
  { rule_id: "RE004", severity: 3, category: "industry_realestate", pattern: rx("(마감\\s*임박|오늘만|이번\\s*주\\s*마감)"), rationale: "희소성 과장은 반려 리스크가 있습니다.", fix_template: "객관적 근거(기간/수량/규정)를 명시하거나 완화." },
  ...Array.from({ length: 16 }).map((_, i) => ({
    rule_id: `RE${String(5 + i).padStart(3, "0")}`,
    severity: 3 as const,
    category: "industry_realestate" as const,
    pattern: rx("(분양|계약|수수료|확정|보장|호재|개발)"),
    rationale: "부동산은 조건/제한/리스크 고지가 중요합니다.",
    fix_template: "조건/기간/제한/예외를 함께 기재하세요.",
  })),
];

export const DIET_RULES_V1: Rule[] = [
  { rule_id: "D001", severity: 5, category: "industry_diet", pattern: rx("(한\\s*달|1\\s*개월).{0,20}(-\\s*\\d+kg|\\d+kg\\s*감량)"), rationale: "기간-감량 결과 단정은 고위험입니다.", fix_template: "개인차/조건/운동·식단 병행 등 전제를 명시하고 단정을 피하세요." },
  { rule_id: "D002", severity: 5, category: "industry_diet", pattern: rx("(먹기만\\s*하면|아무것도\\s*안\\s*해도)\\s*(빠진다|감량)"), rationale: "노력 없이 감량 단정은 과장입니다.", fix_template: "조건/개인차/권장 습관을 함께 안내하세요." },
  { rule_id: "D003", severity: 5, category: "industry_diet", pattern: rx("(요요\\s*없음|요요\\s*제로)"), rationale: "요요 없음 단정은 고위험입니다.", fix_template: "개인차/유지 방법을 안내하고 단정을 피하세요." },
  { rule_id: "D004", severity: 5, category: "industry_diet", pattern: rx("(부작용\\s*없|안전\\s*보장)"), rationale: "부작용/안전 보장은 고위험입니다.", fix_template: "주의사항/금기/개인차 고지." },
  { rule_id: "D005", severity: 4, category: "industry_diet", pattern: rx("(비포\\s*애프터|전\\s*후\\s*사진|before\\s*/\\s*after)", "gi"), rationale: "전후사진 암시는 과장으로 해석될 수 있습니다.", fix_template: "조건/개인차를 명시하고 과장 암시를 피하세요." },
  ...Array.from({ length: 15 }).map((_, i) => ({
    rule_id: `D${String(6 + i).padStart(3, "0")}`,
    severity: 3 as const,
    category: "industry_diet" as const,
    pattern: rx("(다이어트|감량|체지방|요요|부작용|효과|보장)"),
    rationale: "다이어트/미용은 결과 단정/보장 표현이 특히 위험합니다.",
    fix_template: "개인차/주의사항/조건을 명시하고 단정을 피하세요.",
  })),
];

export type Industry = "medical" | "finance" | "realestate" | "diet" | "general";

export function getRulesV1(industry: Industry): Rule[] {
  switch (industry) {
    case "medical":
      return [...COMMON_RULES_V1, ...MEDICAL_RULES_V1];
    case "finance":
      return [...COMMON_RULES_V1, ...FINANCE_RULES_V1];
    case "realestate":
      return [...COMMON_RULES_V1, ...REALESTATE_RULES_V1];
    case "diet":
      return [...COMMON_RULES_V1, ...DIET_RULES_V1];
    default:
      return [...COMMON_RULES_V1];
  }
}
