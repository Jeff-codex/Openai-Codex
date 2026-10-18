// src/lib/score.v2.ts
import { getRulesV1 } from "./rules.v1.ts";
import type { Rule } from "./rules.v1.ts";
import {
  POLICY_V1,
  resolveIndustry,
  applyCaps,
  isForceReject,
  gradeScore,
  scoreBranding,
  type Industry,
  type ScoreGrade,
} from "./policy.v1.ts";

export type Finding = {
  rule_id: string;
  severity: number;
  category: string;
  snippet: string;
  rationale: string;
  fix_template: string;
};

export type ScoreV2Result = {
  totalScore: number;
  subscores: {
    risk: number;
    readability: number;
    evidence: number;
    branding: number;
  };
  topFindings: Finding[];
  allFindings: Finding[];
  policy: {
    industry: Industry;
    industryMode: "override" | "auto";
    grade: ScoreGrade;
    forceReject: boolean;
    sev5Count: number;
    hasDefamation: boolean;
    hasHighRiskIndustrySev5: boolean;
  };
  meta: {
    charCount: number;
    sentenceCount: number;
    avgSentenceLen: number;
    repeatRatio: number;
    koRatio: number;
  };
};

const CATEGORY_WEIGHT: Record<string, number> = {
  exaggeration: 1.5,
  guarantee: 1.7,
  superlative: 1.4,
  comparison: 1.3,
  evidence: 1.2,
  structure: 0.9,
  readability: 0.8,
  defamation: 1.8,
  industry_medical: 1.6,
  industry_finance: 1.6,
  industry_realestate: 1.5,
  industry_diet: 1.6,
};

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function splitSentences(text: string) {
  return text
    .split(/[\.\?\!]\s+|\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function koRatio(text: string) {
  const len = text.length || 1;
  const ko = (text.match(/[가-힣]/g) || []).length;
  return ko / len;
}

function extractSnippet(text: string, index: number, length = 60) {
  const start = Math.max(0, index - 20);
  const end = Math.min(text.length, start + length);
  return text.slice(start, end).replace(/\s+/g, " ").trim();
}

function keywordRepeatRatio(text: string) {
  const tokens = (text.toLowerCase().match(/[가-힣a-z0-9]{2,}/g) || []).filter(Boolean);
  if (tokens.length < 40) return 0;
  const freq = new Map<string, number>();
  for (const token of tokens) freq.set(token, (freq.get(token) || 0) + 1);
  const top = Array.from(freq.values()).sort((a, b) => b - a).slice(0, 5);
  const topSum = top.reduce((a, b) => a + b, 0);
  return topSum / tokens.length;
}

function hasSourceCue(text: string) {
  return /(https?:\/\/|doi|논문|학회|보고서|기관|연구|\d{4}년)/i.test(text);
}

function evaluateRule(text: string, rule: Rule): Finding[] {
  const findings: Finding[] = [];

  if (rule.rule_id === "R008") {
    const m = text.match(rule.pattern!);
    if (m && !hasSourceCue(text)) {
      findings.push({
        rule_id: rule.rule_id,
        severity: rule.severity,
        category: rule.category,
        snippet: m[0],
        rationale: rule.rationale,
        fix_template: rule.fix_template,
      });
    }
    return findings;
  }

  if (rule.pattern) {
    let match: RegExpExecArray | null;
    const regex = new RegExp(
      rule.pattern.source,
      rule.pattern.flags.includes("g") ? rule.pattern.flags : `${rule.pattern.flags}g`
    );
    while ((match = regex.exec(text)) !== null) {
      if (rule.requiresAny && rule.requiresAny.length > 0) {
        const ok = rule.requiresAny.some((rx) => rx.test(text));
        if (!ok) continue;
      }
      findings.push({
        rule_id: rule.rule_id,
        severity: rule.severity,
        category: rule.category,
        snippet: extractSnippet(text, match.index),
        rationale: rule.rationale,
        fix_template: rule.fix_template,
      });
      if (findings.length >= 3) break;
    }
    return findings;
  }

  if (rule.keywords?.length) {
    for (const kw of rule.keywords) {
      const idx = text.indexOf(kw);
      if (idx < 0) continue;
      findings.push({
        rule_id: rule.rule_id,
        severity: rule.severity,
        category: rule.category,
        snippet: extractSnippet(text, idx),
        rationale: rule.rationale,
        fix_template: rule.fix_template,
      });
      break;
    }
  }

  return findings;
}

function hasHighRiskIndustrySev5(findings: Finding[], industry: Industry) {
  if (!POLICY_V1.SCORE.HIGH_RISK_INDUSTRY.INDUSTRIES.includes(industry)) return false;
  return findings.some((f) => {
    if (f.severity < 5) return false;
    return POLICY_V1.SCORE.HIGH_RISK_INDUSTRY.SEV5_RULE_PREFIXES.some((prefix) => f.rule_id.startsWith(prefix));
  });
}

export function scoreTextV2(text: string, industryOverride?: Industry | null): ScoreV2Result {
  const t = String(text || "").replace(/\u0000/g, "").trim();
  const resolved = resolveIndustry(t, industryOverride);
  const rules = getRulesV1(resolved.industry);

  const sentences = splitSentences(t);
  const avgSentenceLen = sentences.length ? t.length / Math.max(1, sentences.length) : t.length;
  const repRatio = keywordRepeatRatio(t);
  const kRatio = koRatio(t);

  const findings: Finding[] = [];

  for (const rule of rules) {
    if (rule.rule_id === "R019") {
      if (avgSentenceLen >= 40) {
        findings.push({
          rule_id: "R019",
          severity: 2,
          category: "readability",
          snippet: `평균 문장 길이 ${avgSentenceLen.toFixed(1)}자`,
          rationale: rule.rationale,
          fix_template: rule.fix_template,
        });
      }
      continue;
    }

    if (rule.rule_id === "R020") {
      if (repRatio >= 0.22) {
        findings.push({
          rule_id: "R020",
          severity: repRatio >= 0.3 ? 3 : 2,
          category: "readability",
          snippet: `상위 토큰 반복 비율 ${(repRatio * 100).toFixed(1)}%`,
          rationale: rule.rationale,
          fix_template: rule.fix_template,
        });
      }
      continue;
    }

    if (rule.rule_id === "R021") {
      const paras = t.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
      if (paras.length <= 1) {
        findings.push({
          rule_id: "R021",
          severity: 2,
          category: "structure",
          snippet: "문단 구분이 거의 없습니다.",
          rationale: rule.rationale,
          fix_template: rule.fix_template,
        });
      }
      continue;
    }

    if (rule.rule_id === "R022") {
      if (!/(문의|신청|확인|예약|구매|상담|클릭|바로가기)/.test(t)) {
        findings.push({
          rule_id: "R022",
          severity: 2,
          category: "structure",
          snippet: "행동(CTA) 단서가 약합니다.",
          rationale: rule.rationale,
          fix_template: rule.fix_template,
        });
      }
      continue;
    }

    if (rule.rule_id === "R023") {
      const tail = t.slice(Math.floor(t.length * 0.85));
      if (!/(요약|정리|결론|따라서|지금|다음|추천|제안|안내)/.test(tail)) {
        findings.push({
          rule_id: "R023",
          severity: 2,
          category: "structure",
          snippet: "마무리(요약/제안)가 약합니다.",
          rationale: rule.rationale,
          fix_template: rule.fix_template,
        });
      }
      continue;
    }

    if (rule.rule_id === "R025") {
      const weird = (t.match(/[■◆●▣□◇▲▼▶◀]{3,}/g) || []).length;
      const multiSpace = (t.match(/\s{3,}/g) || []).length;
      if (weird + multiSpace >= 3) {
        findings.push({
          rule_id: "R025",
          severity: 2,
          category: "readability",
          snippet: "서식/공백 오류가 많습니다.",
          rationale: rule.rationale,
          fix_template: rule.fix_template,
        });
      }
      continue;
    }

    findings.push(...evaluateRule(t, rule));
  }

  let riskPenalty = 0;
  let evidencePenalty = 0;
  let readPenalty = 0;

  for (const f of findings) {
    const w = CATEGORY_WEIGHT[f.category] ?? 1;
    const penalty = f.severity * 8 * w;
    if ([
      "defamation",
      "guarantee",
      "exaggeration",
      "superlative",
      "comparison",
      "industry_medical",
      "industry_finance",
      "industry_realestate",
      "industry_diet",
    ].includes(f.category)) {
      riskPenalty += penalty;
      continue;
    }
    if (f.category === "evidence") {
      evidencePenalty += penalty;
      continue;
    }
    readPenalty += penalty;
  }

  const risk = clamp(100 - riskPenalty, 0, 100);
  const evidence = clamp(100 - evidencePenalty, 0, 100);
  const readability = clamp(100 - readPenalty, 0, 100);

  const branding = scoreBranding(t);
  const rawTotal = 0.6 * risk + 0.2 * readability + 0.2 * evidence;
  let total = rawTotal * 0.9 + branding.branding * 0.1;

  if (kRatio < 0.15) total -= 8;

  const sev5Count = findings.filter((f) => f.severity >= 5).length;
  const hasDefamation = findings.some((f) => f.category === "defamation");
  const hasIndustrySev5 = hasHighRiskIndustrySev5(findings, resolved.industry);

  total = applyCaps({
    total,
    sev5Count,
    hasDefamation,
    industry: resolved.industry,
    hasHighRiskIndustrySev5: hasIndustrySev5,
  });

  const forceReject = isForceReject({ hasDefamation });
  if (forceReject) {
    total = Math.min(total, POLICY_V1.SCORE.CUTLINES.REJECT_MAX);
  }

  total = Math.round(clamp(total, 0, 100));

  const topFindings = findings
    .slice()
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 3);

  return {
    totalScore: total,
    subscores: {
      risk: Math.round(risk),
      readability: Math.round(readability),
      evidence: Math.round(evidence),
      branding: branding.branding,
    },
    topFindings,
    allFindings: findings,
    policy: {
      industry: resolved.industry,
      industryMode: resolved.mode,
      grade: gradeScore(total),
      forceReject,
      sev5Count,
      hasDefamation,
      hasHighRiskIndustrySev5: hasIndustrySev5,
    },
    meta: {
      charCount: t.length,
      sentenceCount: sentences.length,
      avgSentenceLen: Number(avgSentenceLen.toFixed(1)),
      repeatRatio: Number(repRatio.toFixed(3)),
      koRatio: Number(kRatio.toFixed(3)),
    },
  };
}
