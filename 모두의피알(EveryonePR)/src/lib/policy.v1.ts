// ✅ COPY-PASTE: src/lib/policy.v1.ts
// - 업종 자동판별(자동 + 유저 오버라이드)
// - 점수 정책(캡/컷라인/강제반려)
// - 비원고 422 하드차단(유저 메시지 단일, 내부 reason 코드 상세)

export type Industry = "general" | "medical" | "finance" | "realestate" | "diet";

export const POLICY_V1 = {
  // 1) 업종 판별 정책
  INDUSTRY: {
    // UI에서 사용자가 선택하면 이 값으로 강제(override). 없으면 auto
    DEFAULT: "general" as Industry,
    PRIORITY: ["medical", "finance", "realestate", "diet", "general"] as Industry[],
    // 업종별 키워드(2개 이상 매칭 시 해당 업종)
    KEYWORDS: {
      medical: [
        "치료", "완치", "예방", "의학", "임상", "시술", "병원", "의사", "전문의", "약", "질환",
        "통증", "회복", "부작용", "FDA", "식약처",
      ],
      finance: [
        "수익", "원금", "보장", "확정", "투자", "재테크", "코인", "주식", "선물", "레버리지",
        "승률", "수익률", "매수", "리스크", "손실",
      ],
      realestate: [
        "분양", "청약", "당첨", "시세", "호재", "개발", "착공", "입주", "전세", "월세",
        "매매", "부동산", "계약", "수수료",
      ],
      diet: [
        "다이어트", "감량", "체지방", "요요", "미용", "전후사진", "비포", "애프터", "before", "after",
        "부작용", "효과", "보장",
      ],
    } as const,
    MIN_MATCH: 2,
  },

  // 2) 점수 정책
  SCORE: {
    // 종합 합성은 score.v2에서 유지(risk 0.6 / readability 0.2 / evidence 0.2)
    CUTLINES: {
      PASS_MIN: 80,      // 합격: 80~100
      CAUTION_MIN: 60,   // 주의: 60~79
      REJECT_MAX: 59,    // 반려: 0~59
    },
    CAPS: {
      ANY_SEV5: 65,
      SEV5_GTE_2: 50,
      DEFA_MATION_ANY: 45,
      HIGH_RISK_INDUSTRY_SEV5: 40, // medical/finance 핵심 sev5 있으면
    },
    // 점수와 무관한 "강제 반려" (분쟁/법적)
    FORCE_REJECT: {
      DEFA_MATION_ANY: true, // 명예훼손 계열(sev5 포함) 있으면 무조건 반려
    },
    // high-risk industry sev5 판정에 쓰는 룰 id prefix/키워드
    HIGH_RISK_INDUSTRY: {
      INDUSTRIES: ["medical", "finance"] as Industry[],
      // 치명 룰ID prefix (의료 M*, 금융 F*) + 공통 보장/절대(일부)도 포함
      SEV5_RULE_PREFIXES: ["M", "F", "R00", "R001", "R004", "R005"] as string[],
    },
    // branding은 evidence 대체가 아니라 "별도 규칙" (지금 UI는 종합만 써도 OK)
    BRANDING: {
      ENABLE: true,
      // 상업성 과다(토큰 반복 방식보다 단순 키워드로 가볍게)
      COMMERCIAL_KEYWORDS: ["지금바로", "단독", "특가", "혜택", "마감임박", "오늘만", "무료", "최저가"],
      COMMERCIAL_MAX_HITS: 6, // 초과 시 감점
      // 톤 혼재(반말/존댓말 혼재 대략 탐지)
      TONE_MIX_REGEX: /(합니다|됩니다|하세요).*(해요|했어요|해라|한다)/s,
      // 신뢰 톤 가산 키워드
      TRUST_KEYWORDS: ["개인차", "주의", "조건", "예외", "근거", "출처", "참고"],
    },
  },

  // 3) 비원고 차단 정책(422 하드차단 + 유저메시지 단일 + 내부 reason 코드)
  BLOCK: {
    HTTP_STATUS: 422,
    // ✅ 유저 노출 메시지(단일 문구로 통일)
    USER_MESSAGE: "원고 형식이 아닙니다. 문장형 원고(PDF/DOCX)만 업로드해주세요.",
    // ✅ 내부 로그 reason 코드(악용 방지 위해 유저에게는 노출 금지)
    REASONS: {
      BUSINESS_REG: "BUSINESS_REG_PATTERN",
      TABLE_HEAVY: "TABLE_HEAVY",
      LOW_CHAR: "LOW_CHAR_COUNT",
      LOW_SENT: "LOW_SENTENCE_COUNT",
      LOW_KO: "LOW_KO_RATIO",
      OCR_REQUIRED: "OCR_REQUIRED",
      UNSUPPORTED: "UNSUPPORTED_TYPE",
    } as const,
  },
} as const;

// -----------------------------
// 업종 자동판별 (auto + override)
// -----------------------------
export function resolveIndustry(text: string, override?: Industry | null): { industry: Industry; mode: "override" | "auto" } {
  if (override && override !== "general") return { industry: override, mode: "override" };
  if (override === "general") return { industry: "general", mode: "override" };

  const t = (text || "").toLowerCase();
  const scores: Record<Industry, number> = { general: 0, medical: 0, finance: 0, realestate: 0, diet: 0 };

  for (const k of POLICY_V1.INDUSTRY.KEYWORDS.medical) if (t.includes(k.toLowerCase())) scores.medical++;
  for (const k of POLICY_V1.INDUSTRY.KEYWORDS.finance) if (t.includes(k.toLowerCase())) scores.finance++;
  for (const k of POLICY_V1.INDUSTRY.KEYWORDS.realestate) if (t.includes(k.toLowerCase())) scores.realestate++;
  for (const k of POLICY_V1.INDUSTRY.KEYWORDS.diet) if (t.includes(k.toLowerCase())) scores.diet++;

  // 최소 매칭 미만이면 general
  const candidates = (["medical", "finance", "realestate", "diet"] as Industry[])
    .filter(i => scores[i] >= POLICY_V1.INDUSTRY.MIN_MATCH);

  if (candidates.length === 0) return { industry: "general", mode: "auto" };

  // 동률이면 우선순위(리스크 큰 업종 우선)
  candidates.sort((a, b) => {
    const diff = scores[b] - scores[a];
    if (diff !== 0) return diff;
    return POLICY_V1.INDUSTRY.PRIORITY.indexOf(a) - POLICY_V1.INDUSTRY.PRIORITY.indexOf(b);
  });

  return { industry: candidates[0], mode: "auto" };
}

// -----------------------------
// 점수 캡/등급 판정
// -----------------------------
export type ScoreGrade = "PASS" | "CAUTION" | "REJECT";
export function gradeScore(totalScore: number): ScoreGrade {
  if (totalScore >= POLICY_V1.SCORE.CUTLINES.PASS_MIN) return "PASS";
  if (totalScore >= POLICY_V1.SCORE.CUTLINES.CAUTION_MIN) return "CAUTION";
  return "REJECT";
}

export function applyCaps(params: {
  total: number;
  sev5Count: number;
  hasDefamation: boolean;
  industry: Industry;
  hasHighRiskIndustrySev5: boolean;
}) {
  let cap = 100;
  if (params.hasDefamation) cap = Math.min(cap, POLICY_V1.SCORE.CAPS.DEFA_MATION_ANY);
  if (params.hasHighRiskIndustrySev5) cap = Math.min(cap, POLICY_V1.SCORE.CAPS.HIGH_RISK_INDUSTRY_SEV5);
  if (params.sev5Count >= 2) cap = Math.min(cap, POLICY_V1.SCORE.CAPS.SEV5_GTE_2);
  if (params.sev5Count >= 1) cap = Math.min(cap, POLICY_V1.SCORE.CAPS.ANY_SEV5);
  return Math.min(params.total, cap);
}

export function isForceReject(params: { hasDefamation: boolean }): boolean {
  return POLICY_V1.SCORE.FORCE_REJECT.DEFA_MATION_ANY ? params.hasDefamation : false;
}

// -----------------------------
// Branding(별도 규칙) - UI에 안 보여도 내부 품질 개선용
// -----------------------------
export function scoreBranding(text: string): { branding: number; notes: string[] } {
  if (!POLICY_V1.SCORE.BRANDING.ENABLE) return { branding: 100, notes: [] };

  const t = (text || "");
  const notes: string[] = [];
  let branding = 100;

  // 상업성 과다
  const hits = POLICY_V1.SCORE.BRANDING.COMMERCIAL_KEYWORDS.reduce((acc, kw) => acc + (t.includes(kw) ? 1 : 0), 0);
  if (hits > POLICY_V1.SCORE.BRANDING.COMMERCIAL_MAX_HITS) {
    branding -= Math.min(20, (hits - POLICY_V1.SCORE.BRANDING.COMMERCIAL_MAX_HITS) * 3);
    notes.push("상업성 키워드 과다");
  }

  // 톤 혼재
  if (POLICY_V1.SCORE.BRANDING.TONE_MIX_REGEX.test(t)) {
    branding -= 10;
    notes.push("존댓말/반말 혼재");
  }

  // 신뢰 톤 가산
  const trustHits = POLICY_V1.SCORE.BRANDING.TRUST_KEYWORDS.reduce((acc, kw) => acc + (t.includes(kw) ? 1 : 0), 0);
  if (trustHits >= 2) {
    branding += 6;
    notes.push("신뢰 톤(조건/주의/근거) 포함");
  }

  branding = Math.max(0, Math.min(100, Math.round(branding)));
  return { branding, notes };
}
