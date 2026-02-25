import { d1Execute, d1Query, nowIso, r2Delete } from './cloudflare_store.js';

const REVIEW_ALLOWED_EXTENSIONS = new Set(['doc', 'docx', 'pdf']);
const REVIEW_ALLOWED_MIMES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const MAX_REVIEW_FILE_BYTES = 30 * 1024 * 1024;
const REVIEW_RETENTION_DAYS = 30;

const RISK_RULES = {
  law: [
    { pattern: /(무조건|반드시|확정)/gi, penalty: 10, reason: '법적 확정 표현은 분쟁 리스크를 높일 수 있습니다.' },
    { pattern: /(완전보장|책임없음|법적문제없음)/gi, penalty: 14, reason: '법적 책임 관련 단정 표현은 수정이 필요합니다.' },
  ],
  disclosure: [
    { pattern: /(협찬|광고|유료광고|제휴)/gi, penalty: 10, reason: '광고/협찬 성격 문구는 고지 문맥을 명확히 해야 합니다.' },
    { pattern: /(임상|인증|특허|수상)/gi, penalty: 8, reason: '객관적 근거(출처/기간/기관) 표기 필요성이 큽니다.' },
  ],
  exaggeration: [
    { pattern: /(국내 ?1위|세계 ?1위|업계 ?최초|압도적|넘사벽)/gi, penalty: 10, reason: '비교우위/최상급 표현은 근거가 없으면 과장 리스크가 높습니다.' },
    { pattern: /(절대|완벽|영원히|전부 해결|100%)/gi, penalty: 12, reason: '절대/완전 표현은 과장 판단 가능성이 큽니다.' },
  ],
  defamation: [
    { pattern: /(타사|경쟁사).{0,16}(문제|허위|조작|불법|저급)/gi, penalty: 16, reason: '타사 비방/비교 비판은 분쟁 가능성이 있습니다.' },
    { pattern: /(사기|먹튀|불량|최악)/gi, penalty: 12, reason: '공격적 단정 표현은 비방 리스크를 높입니다.' },
  ],
};

const BRAND_POSITIVE_TERMS = ['근거', '자료', '출처', '확인', '사실', '공식', '검증', '신뢰'];
const BRAND_NEGATIVE_PATTERNS = [/(대박|미친|쩐다|충격|레전드)/gi, /[!]{3,}/g, /(ㅋㅋ|ㅎㅎ|ㅠㅠ)/g];
const NON_MANUSCRIPT_PATTERNS = [
  /사업자등록증/gi,
  /사업자등록번호/gi,
  /법인등록번호/gi,
  /개업연월일/gi,
  /성명\s*\(대표자\)/gi,
  /대표자\s*[:：]/gi,
  /상호\s*\(법인명\)/gi,
  /주업태/gi,
  /주종목/gi,
  /과세유형/gi,
  /발급사유/gi,
  /등록번호/gi,
  /세무서장/gi,
  /국세청/gi,
  /전자항공권/gi,
  /e-?ticket/gi,
  /itinerary/gi,
  /booking\s*reference/gi,
  /pnr/gi,
  /flight\s*no/gi,
  /passenger/gi,
  /departure/gi,
  /arrival/gi,
  /gate/gi,
  /seat/gi,
  /boarding/gi,
  /예약번호/gi,
  /탑승/gi,
  /출발지/gi,
  /도착지/gi,
  /여정/gi,
  /결성총회/gi,
  /총회/gi,
  /회의록/gi,
  /의사록/gi,
  /정관/gi,
  /의결/gi,
  /안건/gi,
  /참석자/gi,
  /참석인원/gi,
  /주주명부/gi,
  /계약서/gi,
  /견적서/gi,
  /세금계산서/gi,
  /영수증/gi,
  /송장/gi,
  /청구서/gi,
  /진단서/gi,
  /처방전/gi,
  /성적증명서/gi,
  /재학증명서/gi,
  /주민등록/gi,
  /등본/gi,
  /초본/gi,
];
const NON_MANUSCRIPT_FILENAME_PATTERNS = [
  /사업자.*등록/gi,
  /사업자등록증/gi,
  /법인등기/gi,
  /등기부등본/gi,
  /통장사본/gi,
  /신분증/gi,
  /증빙/gi,
  /항공권/gi,
  /e-?ticket/gi,
  /itinerary/gi,
  /boarding/gi,
  /회의록/gi,
  /의사록/gi,
  /결성총회/gi,
  /정관/gi,
  /계약서/gi,
  /영수증/gi,
  /세금계산서/gi,
  /invoice/gi,
];
const MANUSCRIPT_PATTERNS = [
  /보도자료/gi,
  /홍보/gi,
  /발표/gi,
  /공개/gi,
  /출시/gi,
  /도입/gi,
  /서비스/gi,
  /브랜드/gi,
  /고객/gi,
  /시장/gi,
  /전략/gi,
  /기능/gi,
  /성과/gi,
  /개선/gi,
  /제공/gi,
  /확대/gi,
  /계획/gi,
  /관계자/gi,
  /밝혔/gi,
  /전했다/gi,
  /설명했/gi,
  /announced/gi,
  /launch/gi,
  /press\s*release/gi,
];
const PRESS_RELEASE_ACTION_PATTERNS = [
  /발표했/gi,
  /공개했/gi,
  /출시했/gi,
  /도입했/gi,
  /밝혔/gi,
  /알렸/gi,
  /강조했/gi,
  /말했/gi,
  /전했/gi,
  /설명했/gi,
  /announce(d|s)?/gi,
  /launch(ed|es)?/gi,
];
const PRESS_RELEASE_ANCHOR_PATTERNS = [
  /보도자료/gi,
  /언론송출\s*원고/gi,
  /press\s*release/gi,
];
const REVIEW_POLICY = Object.freeze({
  version: '2026-02-24.7',
  suitability: Object.freeze({
    shortLineRatioMin: 0.35,
    numericHeavyRatioMin: 0.2,
    fieldKeywordRatioMin: 0.15,
    sentenceLikeRatioMax: 0.2,
    structuralStrongSignalCountMin: 4,
    manuscriptSignalMin: 2,
    minSentenceCount: 3,
    minAvgSentenceLength: 18,
    maxAvgSentenceLength: 120,
    minLongLineRatio: 0.25,
    minNarrativeEndingCount: 2,
    maxFormLikeRatio: 0.55,
    minNarrativeLineRatio: 0.45,
    minManuscriptKeywordHits: 1,
    nonManuscriptGateScoreMin: 45,
    manuscriptScoreMin: 45,
    pressReleaseMinChars: 140,
    pressReleaseMinSentences: 3,
    pressReleaseMinKeywordHits: 2,
    pressReleaseMinActionHits: 1,
    pressReleaseMinAnchorHits: 1,
    pressReleaseMinCharsStrict: 80,
    pressReleaseMinSentencesStrict: 2,
    manuscriptPassMinChars: 110,
    manuscriptPassMinSentences: 3,
    manuscriptPassMinKeywordHits: 2,
    manuscriptPassMaxFormLikeRatio: 0.68,
    manuscriptPassMaxDocSignal: 54,
    manuscriptPassMinScore: 42,
    pressReleaseMaxFormLikeRatio: 0.5,
    pressReleaseMinNarrativeLineRatio: 0.45,
    pressReleaseMinManuscriptScore: 60,
  }),
  nonManuscriptScoreClamp: Object.freeze({
    approvalMax: 12,
    riskMin: 85,
    readabilityMax: 22,
    brandingMax: 24,
  }),
});

let reviewTablesReady = false;

function normalizeText(value, maxLength = 240) {
  const text = String(value || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength);
}

function getFileExtension(fileName) {
  const name = String(fileName || '').trim().toLowerCase();
  const idx = name.lastIndexOf('.');
  if (idx < 0) return '';
  return name.slice(idx + 1);
}

function normalizeFileName(fileName) {
  const raw = String(fileName || '').trim();
  if (!raw) return 'document';
  return raw.replace(/[^\w.\-() \u3131-\u318E\uAC00-\uD7A3]/g, '_').slice(0, 180);
}

export function validateReviewFile(file) {
  if (!file || typeof file !== 'object') {
    return { ok: false, message: '검수할 원고 파일을 첨부해 주세요.' };
  }
  const fileName = normalizeFileName(file.name || '');
  const extension = getFileExtension(fileName);
  const mime = String(file.type || '').trim().toLowerCase();
  const size = Number(file.size || 0);

  if (!extension || !REVIEW_ALLOWED_EXTENSIONS.has(extension)) {
    return { ok: false, message: '지원 형식은 doc, docx, pdf 입니다.' };
  }
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, message: '파일을 다시 확인해 주세요.' };
  }
  if (size > MAX_REVIEW_FILE_BYTES) {
    return { ok: false, message: '원고 파일은 30MB 이하만 업로드할 수 있습니다.' };
  }
  if (mime && !REVIEW_ALLOWED_MIMES.has(mime) && !mime.startsWith('application/octet-stream')) {
    return { ok: false, message: '파일 MIME 유형을 확인해 주세요.' };
  }

  return {
    ok: true,
    fileName,
    extension,
    fileMime: mime || 'application/octet-stream',
    fileSize: Math.round(size),
  };
}

export function buildReviewObjectKey(reviewId, fileName) {
  const stamp = Date.now();
  return `reviews/${reviewId}/${stamp}_${normalizeFileName(fileName)}`;
}

function bytesToHex(bytes) {
  return [...bytes].map((v) => v.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(value) {
  const input = value instanceof Uint8Array ? value : new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', input);
  return bytesToHex(new Uint8Array(digest));
}

function decodeEscapedPdfString(source) {
  const out = [];
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch !== '\\') {
      out.push(ch);
      continue;
    }
    const next = source[i + 1] || '';
    if (next === 'n') {
      out.push('\n');
      i += 1;
    } else if (next === 'r') {
      out.push('\r');
      i += 1;
    } else if (next === 't') {
      out.push('\t');
      i += 1;
    } else if (next === 'b') {
      out.push('\b');
      i += 1;
    } else if (next === 'f') {
      out.push('\f');
      i += 1;
    } else if (next === '(' || next === ')' || next === '\\') {
      out.push(next);
      i += 1;
    } else if (/[0-7]/.test(next)) {
      const oct = source.slice(i + 1, i + 4).match(/^[0-7]{1,3}/)?.[0] || next;
      out.push(String.fromCharCode(parseInt(oct, 8)));
      i += oct.length;
    } else {
      out.push(next);
      i += 1;
    }
  }
  return out.join('');
}

function compactText(value) {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractPdfText(bytes) {
  const latin = new TextDecoder('latin1').decode(bytes);
  const blocks = latin.match(/BT[\s\S]*?ET/g) || [];
  const chunks = [];

  for (const block of blocks) {
    const single = [...block.matchAll(/\(([^()]*)\)\s*Tj/g)];
    for (const item of single) {
      chunks.push(decodeEscapedPdfString(item[1]));
    }
    const arrays = [...block.matchAll(/\[(.*?)\]\s*TJ/g)];
    for (const item of arrays) {
      const arrayPart = item[1] || '';
      const strings = [...arrayPart.matchAll(/\(([^()]*)\)/g)];
      for (const s of strings) {
        chunks.push(decodeEscapedPdfString(s[1]));
      }
    }
  }

  const joined = compactText(chunks.join('\n'));
  if (joined.length >= 80) return joined;

  // Fallback: printable text sweep for image-heavy/non-standard PDFs.
  const rough = new TextDecoder('utf-8', { fatal: false }).decode(bytes)
    .replace(/[^\p{L}\p{N}\p{P}\p{Zs}\n]/gu, ' ');
  return compactText(rough);
}

function readUint16LE(bytes, offset) {
  return bytes[offset] | (bytes[offset + 1] << 8);
}

function readUint32LE(bytes, offset) {
  return (
    bytes[offset]
    | (bytes[offset + 1] << 8)
    | (bytes[offset + 2] << 16)
    | (bytes[offset + 3] << 24)
  ) >>> 0;
}

function decodeZipName(nameBytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(nameBytes);
  } catch (error) {
    return new TextDecoder('latin1').decode(nameBytes);
  }
}

async function inflateZipEntry(rawBytes) {
  const methods = ['deflate-raw', 'deflate'];
  for (const method of methods) {
    try {
      const ds = new DecompressionStream(method);
      const stream = new Blob([rawBytes]).stream().pipeThrough(ds);
      const ab = await new Response(stream).arrayBuffer();
      return new Uint8Array(ab);
    } catch (error) {
    }
  }
  throw new Error('inflate_failed');
}

async function readZipEntries(bytes, wantedNames = []) {
  const names = new Set(wantedNames);
  const out = new Map();

  // End of central directory search
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i -= 1) {
    if (bytes[i] === 0x50 && bytes[i + 1] === 0x4b && bytes[i + 2] === 0x05 && bytes[i + 3] === 0x06) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return out;

  const totalEntries = readUint16LE(bytes, eocd + 10);
  const centralDirOffset = readUint32LE(bytes, eocd + 16);

  let cursor = centralDirOffset;
  for (let idx = 0; idx < totalEntries; idx += 1) {
    if (cursor + 46 > bytes.length) break;
    if (!(bytes[cursor] === 0x50 && bytes[cursor + 1] === 0x4b && bytes[cursor + 2] === 0x01 && bytes[cursor + 3] === 0x02)) {
      break;
    }
    const compression = readUint16LE(bytes, cursor + 10);
    const compressedSize = readUint32LE(bytes, cursor + 20);
    const fileNameLen = readUint16LE(bytes, cursor + 28);
    const extraLen = readUint16LE(bytes, cursor + 30);
    const commentLen = readUint16LE(bytes, cursor + 32);
    const localOffset = readUint32LE(bytes, cursor + 42);

    const nameStart = cursor + 46;
    const nameEnd = nameStart + fileNameLen;
    if (nameEnd > bytes.length) break;
    const fileName = decodeZipName(bytes.slice(nameStart, nameEnd));

    if (names.has(fileName)) {
      if (localOffset + 30 <= bytes.length
        && bytes[localOffset] === 0x50
        && bytes[localOffset + 1] === 0x4b
        && bytes[localOffset + 2] === 0x03
        && bytes[localOffset + 3] === 0x04) {
        const localNameLen = readUint16LE(bytes, localOffset + 26);
        const localExtraLen = readUint16LE(bytes, localOffset + 28);
        const dataStart = localOffset + 30 + localNameLen + localExtraLen;
        const dataEnd = dataStart + compressedSize;
        if (dataStart >= 0 && dataEnd <= bytes.length) {
          const compressed = bytes.slice(dataStart, dataEnd);
          let body;
          if (compression === 0) {
            body = compressed;
          } else if (compression === 8) {
            body = await inflateZipEntry(compressed);
          } else {
            body = null;
          }
          if (body) out.set(fileName, body);
        }
      }
    }

    cursor = nameEnd + extraLen + commentLen;
  }

  return out;
}

function decodeXmlEntities(value) {
  return String(value || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

async function extractDocxText(bytes) {
  const xmlNames = [
    'word/document.xml',
    'word/header1.xml',
    'word/header2.xml',
    'word/footer1.xml',
    'word/footer2.xml',
  ];
  const entries = await readZipEntries(bytes, xmlNames);
  if (!entries.size) return '';

  const parts = [];
  for (const name of xmlNames) {
    const body = entries.get(name);
    if (!body) continue;
    const xml = new TextDecoder('utf-8', { fatal: false }).decode(body);
    const withParagraphs = xml.replace(/<w:p\b[^>]*>/g, '\n').replace(/<w:tab\b[^>]*\/>/g, ' ');
    const textOnly = withParagraphs.replace(/<[^>]+>/g, ' ');
    parts.push(decodeXmlEntities(textOnly));
  }

  return compactText(parts.join('\n'));
}

function extractLegacyDocText(bytes) {
  // Legacy .doc is binary; do best-effort printable extraction.
  const utf = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const latin = new TextDecoder('latin1').decode(bytes);
  const pick = utf.length >= latin.length / 2 ? utf : latin;
  const cleaned = pick.replace(/[^\p{L}\p{N}\p{P}\p{Zs}\n]/gu, ' ');
  return compactText(cleaned);
}

export async function extractTextFromReviewFile(file, extension) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (extension === 'pdf') {
    return compactText(extractPdfText(bytes));
  }
  if (extension === 'docx') {
    const docx = await extractDocxText(bytes);
    if (docx.length >= 30) return docx;
    return compactText(extractLegacyDocText(bytes));
  }
  if (extension === 'doc') {
    return compactText(extractLegacyDocText(bytes));
  }
  return '';
}

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?。！？])\s+|\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function createIssue(category, severity, sentenceIndex, sentence, reason, suggestion) {
  return {
    category,
    severity,
    sentenceIndex,
    original: normalizeText(sentence, 320),
    reason: normalizeText(reason, 200),
    suggestion: normalizeText(suggestion, 320),
  };
}

function computeRisk(sentences) {
  const issues = [];
  const breakdown = { law: 0, disclosure: 0, exaggeration: 0, defamation: 0 };
  let severeCount = 0;

  for (let i = 0; i < sentences.length; i += 1) {
    const sentence = sentences[i];
    for (const category of Object.keys(RISK_RULES)) {
      const rules = RISK_RULES[category];
      for (const rule of rules) {
        const matches = sentence.match(rule.pattern) || [];
        if (!matches.length) continue;
        const penalty = Math.min(30, rule.penalty * matches.length);
        if (rule.penalty >= 12) severeCount += matches.length;
        breakdown[category] += penalty;
        issues.push(
          createIssue(
            category,
            penalty >= 12 ? '필수수정' : '권장수정',
            i + 1,
            sentence,
            rule.reason,
            '근거 출처를 명시하고 단정/과장 표현을 완화해 주세요.'
          )
        );
      }
    }
  }

  const weighted = (
    Math.min(100, breakdown.law) * 0.35
    + Math.min(100, breakdown.disclosure) * 0.25
    + Math.min(100, breakdown.exaggeration) * 0.20
    + Math.min(100, breakdown.defamation) * 0.20
  );
  const issueLoad = Math.min(40, issues.length * 6);
  const severeBoost = Math.min(30, severeCount * 8);
  const riskScore = Math.min(100, Math.round(weighted + issueLoad + severeBoost));

  return {
    riskScore,
    breakdown: {
      law: Math.round(Math.min(100, breakdown.law)),
      disclosure: Math.round(Math.min(100, breakdown.disclosure)),
      exaggeration: Math.round(Math.min(100, breakdown.exaggeration)),
      defamation: Math.round(Math.min(100, breakdown.defamation)),
    },
    issues,
  };
}

function computeReadability(text, sentences) {
  if (!sentences.length) {
    return {
      score: 0,
      penalty: 100,
      issues: [createIssue('readability', '필수수정', 0, '', '본문 텍스트를 추출하지 못했습니다.', '문서를 텍스트가 포함된 PDF 또는 DOCX로 다시 업로드해 주세요.')],
    };
  }

  let longSentenceCount = 0;
  let veryLongSentenceCount = 0;
  const sentenceSet = new Set();
  let duplicateCount = 0;

  for (let i = 0; i < sentences.length; i += 1) {
    const s = sentences[i];
    const length = s.length;
    if (length >= 120) veryLongSentenceCount += 1;
    else if (length >= 80) longSentenceCount += 1;

    const key = s.replace(/\s+/g, '').toLowerCase();
    if (sentenceSet.has(key)) duplicateCount += 1;
    else sentenceSet.add(key);
  }

  const avgLength = Math.round(text.length / Math.max(1, sentences.length));
  const duplicateRatio = duplicateCount / Math.max(1, sentences.length);

  let penalty = 0;
  if (avgLength > 70) penalty += Math.min(24, Math.round((avgLength - 70) * 0.8));
  penalty += longSentenceCount * 3;
  penalty += veryLongSentenceCount * 8;
  penalty += Math.round(duplicateRatio * 60);

  const paragraphs = text.split(/\n{2,}/).map((v) => v.trim()).filter(Boolean);
  if (paragraphs.length <= 1) penalty += 10;

  const issues = [];
  if (avgLength > 70) {
    issues.push(createIssue('readability', '권장수정', 0, '', '문장 평균 길이가 길어 가독성이 떨어질 수 있습니다.', '한 문장에 한 메시지만 남기고 접속절을 줄여 주세요.'));
  }
  if (veryLongSentenceCount > 0) {
    issues.push(createIssue('readability', '필수수정', 0, '', '120자 이상 장문 문장이 포함되어 있습니다.', '장문 문장은 2~3개 문장으로 분리해 주세요.'));
  }
  if (duplicateRatio >= 0.2) {
    issues.push(createIssue('readability', '권장수정', 0, '', '유사 문장 반복 비율이 높습니다.', '핵심 문구 1회만 유지하고 반복 문장을 제거해 주세요.'));
  }
  if (paragraphs.length <= 1) {
    issues.push(createIssue('readability', '권장수정', 0, '', '문단 구조가 단일 블록입니다.', '소제목/문단 분리로 구조를 명확히 해 주세요.'));
  }

  const safePenalty = Math.min(100, penalty);
  return {
    score: Math.max(0, 100 - safePenalty),
    penalty: safePenalty,
    issues,
  };
}

function computeBranding(text) {
  const source = String(text || '').toLowerCase();
  let plus = 0;
  let minus = 0;

  for (const term of BRAND_POSITIVE_TERMS) {
    if (source.includes(term)) plus += 6;
  }
  for (const pattern of BRAND_NEGATIVE_PATTERNS) {
    const hits = source.match(pattern) || [];
    if (!hits.length) continue;
    minus += hits.length * 8;
  }

  if (!source.includes('hwik') && !source.includes('딜리버') && !source.includes('dliver')) {
    minus += 12;
  }

  const score = Math.max(0, Math.min(100, 72 + plus - minus));
  const issues = [];

  if (minus >= 12) {
    issues.push(createIssue('branding', '권장수정', 0, '', '자극적/비격식 표현이 감지되었습니다.', '브랜드 톤에 맞게 객관적 표현으로 바꿔 주세요.'));
  }
  if (!source.includes('근거') && !source.includes('자료') && !source.includes('출처')) {
    issues.push(createIssue('branding', '권장수정', 0, '', '근거 제시형 표현이 부족합니다.', '수치/출처/검증 맥락을 추가해 신뢰도를 높여 주세요.'));
  }

  return {
    score,
    penalty: 100 - score,
    issues,
  };
}

function computeDocumentSuitability(text, sentences, options = {}) {
  const source = String(text || '');
  const normalized = source.replace(/\s+/g, ' ').trim();
  const matches = [];
  for (const pattern of NON_MANUSCRIPT_PATTERNS) {
    const hit = normalized.match(pattern);
    if (hit && hit.length) matches.push(...hit);
  }
  const fileName = String(options.fileName || '');
  const fileNameHits = [];
  for (const pattern of NON_MANUSCRIPT_FILENAME_PATTERNS) {
    const hit = fileName.match(pattern);
    if (hit && hit.length) fileNameHits.push(...hit);
  }

  const uniqueHits = [...new Set(matches.map((v) => String(v).toLowerCase()))];
  const lines = String(source || '')
    .split('\n')
    .map((v) => v.trim())
    .filter(Boolean);
  const shortLineCount = lines.filter((v) => v.length <= 18).length;
  const longLineCount = lines.filter((v) => v.length >= 28).length;
  const numericHeavyLineCount = lines.filter((line) => {
    if (!line) return false;
    const digits = (line.match(/\d/g) || []).length;
    return line.length <= 42 && digits / Math.max(1, line.length) >= 0.25;
  }).length;
  const fieldKeywordLineCount = lines.filter((line) => /(등록번호|법인등록|개업연월일|대표자|상호|업태|종목|소재지|과세유형|발급사유|세무서)/i.test(line)).length;
  const sentenceLikeCount = lines.filter((line) => /[.!?。！？]/.test(line)).length;
  const formLikeLineCount = lines.filter((line) => {
    const compact = line.replace(/\s+/g, '');
    if (!compact) return false;
    const hasFieldSep = /[:：|/]/.test(line);
    const digitRatio = ((compact.match(/\d/g) || []).length) / compact.length;
    const upperRatio = ((compact.match(/[A-Z]/g) || []).length) / compact.length;
    return hasFieldSep || digitRatio >= 0.22 || upperRatio >= 0.35;
  }).length;
  const narrativeEndingCount = sentences.filter((s) => /(다\.|요\.|습니다\.|했다\.|한다\.)$/.test(String(s || '').trim())).length;
  const manuscriptKeywordHits = [];
  for (const pattern of MANUSCRIPT_PATTERNS) {
    const hit = normalized.match(pattern);
    if (hit && hit.length) manuscriptKeywordHits.push(...hit);
  }
  const pressActionHits = [];
  for (const pattern of PRESS_RELEASE_ACTION_PATTERNS) {
    const hit = normalized.match(pattern);
    if (hit && hit.length) pressActionHits.push(...hit);
  }
  const pressAnchorHits = [];
  for (const pattern of PRESS_RELEASE_ANCHOR_PATTERNS) {
    const hit = normalized.match(pattern);
    if (hit && hit.length) pressAnchorHits.push(...hit);
  }

  const sentenceCount = Math.max(1, sentences.length);
  const lineCount = Math.max(1, lines.length);
  const shortLineRatio = shortLineCount / lineCount;
  const longLineRatio = longLineCount / lineCount;
  const numericHeavyRatio = numericHeavyLineCount / lineCount;
  const fieldKeywordRatio = fieldKeywordLineCount / lineCount;
  const sentenceLikeRatio = sentenceLikeCount / lineCount;
  const formLikeRatio = formLikeLineCount / lineCount;
  const narrativeLineRatio = sentenceLikeCount / lineCount;
  const avgSentenceLength = Math.round(normalized.length / sentenceCount);
  const fileNameSignal = fileNameHits.length > 0;
  const uniqueManuscriptHits = [...new Set(manuscriptKeywordHits.map((v) => String(v).toLowerCase()))];
  const uniquePressActionHits = [...new Set(pressActionHits.map((v) => String(v).toLowerCase()))];
  const uniquePressAnchorHits = [...new Set(pressAnchorHits.map((v) => String(v).toLowerCase()))];

  const structuralSignalCount = [
    shortLineRatio >= REVIEW_POLICY.suitability.shortLineRatioMin,
    numericHeavyRatio >= REVIEW_POLICY.suitability.numericHeavyRatioMin,
    fieldKeywordRatio >= REVIEW_POLICY.suitability.fieldKeywordRatioMin,
    sentenceLikeRatio <= REVIEW_POLICY.suitability.sentenceLikeRatioMax,
  ].filter(Boolean).length;
  const manuscriptSignalCount = [
    sentenceCount >= REVIEW_POLICY.suitability.minSentenceCount,
    avgSentenceLength >= REVIEW_POLICY.suitability.minAvgSentenceLength
      && avgSentenceLength <= REVIEW_POLICY.suitability.maxAvgSentenceLength,
    longLineRatio >= REVIEW_POLICY.suitability.minLongLineRatio,
    narrativeEndingCount >= REVIEW_POLICY.suitability.minNarrativeEndingCount,
    formLikeRatio <= REVIEW_POLICY.suitability.maxFormLikeRatio,
  ].filter(Boolean).length;
  let documentSignalScore = 0;
  documentSignalScore += Math.min(55, uniqueHits.length * 18);
  documentSignalScore += Math.min(35, fileNameHits.length * 18);
  documentSignalScore += structuralSignalCount * 8;
  if (formLikeRatio >= 0.65) documentSignalScore += 12;
  if (numericHeavyRatio >= 0.3) documentSignalScore += 10;
  if (sentenceCount <= 2) documentSignalScore += 12;
  if (manuscriptSignalCount < REVIEW_POLICY.suitability.manuscriptSignalMin) documentSignalScore += 18;
  if (uniqueManuscriptHits.length < REVIEW_POLICY.suitability.minManuscriptKeywordHits) documentSignalScore += 10;
  documentSignalScore = Math.min(100, Math.round(documentSignalScore));

  let manuscriptScore = 0;
  if (sentenceCount >= REVIEW_POLICY.suitability.minSentenceCount) manuscriptScore += 22;
  if (avgSentenceLength >= REVIEW_POLICY.suitability.minAvgSentenceLength
    && avgSentenceLength <= REVIEW_POLICY.suitability.maxAvgSentenceLength) manuscriptScore += 18;
  if (longLineRatio >= REVIEW_POLICY.suitability.minLongLineRatio) manuscriptScore += 14;
  if (narrativeEndingCount >= REVIEW_POLICY.suitability.minNarrativeEndingCount) manuscriptScore += 16;
  if (formLikeRatio <= REVIEW_POLICY.suitability.maxFormLikeRatio) manuscriptScore += 12;
  if (narrativeLineRatio >= REVIEW_POLICY.suitability.minNarrativeLineRatio) manuscriptScore += 8;
  manuscriptScore += Math.min(10, uniqueManuscriptHits.length * 4);
  manuscriptScore = Math.min(100, Math.round(manuscriptScore));

  const isPressReleaseCandidate = (
    (
      uniquePressAnchorHits.length >= REVIEW_POLICY.suitability.pressReleaseMinAnchorHits
      && uniquePressActionHits.length >= 1
      && normalized.length >= REVIEW_POLICY.suitability.pressReleaseMinCharsStrict
      && sentenceCount >= REVIEW_POLICY.suitability.pressReleaseMinSentencesStrict
      && formLikeRatio <= 0.6
    )
    || (
      normalized.length >= REVIEW_POLICY.suitability.manuscriptPassMinChars
      && sentenceCount >= REVIEW_POLICY.suitability.manuscriptPassMinSentences
      && uniqueManuscriptHits.length >= REVIEW_POLICY.suitability.manuscriptPassMinKeywordHits
      && formLikeRatio <= REVIEW_POLICY.suitability.manuscriptPassMaxFormLikeRatio
      && documentSignalScore <= REVIEW_POLICY.suitability.manuscriptPassMaxDocSignal
      && manuscriptScore >= REVIEW_POLICY.suitability.manuscriptPassMinScore
      && (uniquePressActionHits.length >= 1 || narrativeEndingCount >= 1)
    )
  );

  const strongDocumentSignal = (
    fileNameSignal
    || uniqueHits.length >= 1
    || documentSignalScore >= REVIEW_POLICY.suitability.nonManuscriptGateScoreMin
    || (
      manuscriptScore < REVIEW_POLICY.suitability.manuscriptScoreMin
      && structuralSignalCount >= REVIEW_POLICY.suitability.structuralStrongSignalCountMin
    )
    || (documentSignalScore >= 30 && manuscriptScore < 60)
  );

  const issues = [];
  if (strongDocumentSignal) {
    issues.push(
      createIssue(
        'document_type',
        '필수수정',
        0,
        '',
        '업로드한 파일은 검수 원고형 본문이 아닌 서식/증빙 문서로 판단됩니다.',
        '보도자료/홍보 원고 본문이 포함된 문서를 업로드해 주세요.'
      )
    );
  }

  return {
    isNonManuscript: strongDocumentSignal,
    matchedTerms: uniqueHits.slice(0, 8),
    matchedFileNameSignals: [...new Set(fileNameHits.map((v) => String(v).toLowerCase()))].slice(0, 4),
    matchedManuscriptSignals: uniqueManuscriptHits.slice(0, 8),
    matchedPressActionSignals: uniquePressActionHits.slice(0, 6),
    matchedPressAnchorSignals: uniquePressAnchorHits.slice(0, 4),
    manuscriptSignalCount,
    documentSignalScore,
    manuscriptScore,
    isPressReleaseCandidate,
    issues,
  };
}

function buildSummary(scores, issueCount) {
  const riskText = scores.risk >= 55 ? '리스크가 높아 즉시 수정이 필요합니다.'
    : scores.risk >= 30 ? '리스크 항목 일부를 우선 정리하면 승인 가능성이 개선됩니다.'
      : '리스크는 비교적 안정적입니다.';

  const readabilityText = scores.readability >= 75
    ? '문장 구조는 양호한 편입니다.'
    : '문장 길이/중복을 정리하면 가독성이 크게 좋아집니다.';

  return `총 ${issueCount}개 개선 포인트가 탐지되었습니다. ${riskText} ${readabilityText}`;
}

export function runRuleReview(text, options = {}) {
  const normalized = compactText(text);
  const sentences = splitSentences(normalized);

  const suitability = computeDocumentSuitability(normalized, sentences, options);
  const risk = computeRisk(sentences);
  const readability = computeReadability(normalized, sentences);
  const branding = computeBranding(normalized);

  let approval = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        100
        - (risk.riskScore * 0.45)
        - (readability.penalty * 0.35)
        - (branding.penalty * 0.20)
      )
    )
  );
  let riskScore = risk.riskScore;
  let readabilityScore = readability.score;
  let brandingScore = branding.score;

  if (suitability.isNonManuscript) {
    approval = Math.min(approval, REVIEW_POLICY.nonManuscriptScoreClamp.approvalMax);
    riskScore = Math.max(riskScore, REVIEW_POLICY.nonManuscriptScoreClamp.riskMin);
    readabilityScore = Math.min(readabilityScore, REVIEW_POLICY.nonManuscriptScoreClamp.readabilityMax);
    brandingScore = Math.min(brandingScore, REVIEW_POLICY.nonManuscriptScoreClamp.brandingMax);
  }

  const allIssues = [...suitability.issues, ...risk.issues, ...readability.issues, ...branding.issues];
  allIssues.sort((a, b) => {
    const aw = a.severity === '필수수정' ? 0 : 1;
    const bw = b.severity === '필수수정' ? 0 : 1;
    if (aw !== bw) return aw - bw;
    return (a.sentenceIndex || 0) - (b.sentenceIndex || 0);
  });

  const summary = suitability.isNonManuscript
    ? '원고형 본문 패턴이 부족한 문서로 판단되어 검수 점수가 제한되었습니다. 보도자료 본문으로 다시 업로드해 주세요.'
    : buildSummary(
      {
        risk: riskScore,
        readability: readabilityScore,
      },
      allIssues.length
    );

  return {
    scores: {
      approval,
      risk: riskScore,
      readability: readabilityScore,
      branding: brandingScore,
    },
    isNonManuscript: suitability.isNonManuscript,
    riskBreakdown: risk.breakdown,
    highlights: allIssues.slice(0, 24),
    summary,
  };
}

function plusDaysIso(days) {
  const base = new Date();
  base.setUTCDate(base.getUTCDate() + days);
  return base.toISOString();
}

export async function ensureReviewTables(env) {
  if (reviewTablesReady) return;

  await d1Execute(
    env,
    "create table if not exists review_documents (id text primary key, owner_type text not null, owner_key text not null, file_key text not null, file_name text not null, file_mime text not null default 'application/octet-stream', file_size integer not null default 0, source_text_hash text not null, created_at text not null default (datetime('now')), last_run_at text, expires_at text not null, status text not null default 'active')"
  );
  await d1Execute(env, 'create index if not exists idx_review_documents_owner on review_documents(owner_key)');
  await d1Execute(env, 'create index if not exists idx_review_documents_expires_at on review_documents(expires_at)');

  await d1Execute(
    env,
    "create table if not exists review_runs (id text primary key, review_document_id text not null, run_no integer not null, review_mode text not null default 'first', approval_score integer not null default 0, risk_score integer not null default 0, readability_score integer not null default 0, branding_score integer not null default 0, risk_breakdown_json text not null default '{}', highlights_json text not null default '[]', summary text not null default '', created_at text not null default (datetime('now')), foreign key(review_document_id) references review_documents(id) on delete cascade)"
  );
  await d1Execute(env, 'create unique index if not exists idx_review_runs_doc_run on review_runs(review_document_id, run_no)');
  await d1Execute(env, 'create index if not exists idx_review_runs_doc_id on review_runs(review_document_id)');
  await d1Execute(env, 'create index if not exists idx_review_runs_created_at on review_runs(created_at)');

  reviewTablesReady = true;
}

export async function getReviewDocumentById(env, reviewId) {
  const rows = await d1Query(
    env,
    'select id, owner_type, owner_key, file_key, file_name, file_mime, file_size, source_text_hash, created_at, last_run_at, expires_at, status from review_documents where id = ? limit 1',
    [reviewId]
  );
  return rows.length ? rows[0] : null;
}

export async function getNextRunNumber(env, reviewId) {
  const rows = await d1Query(env, 'select coalesce(max(run_no), 0) as max_run from review_runs where review_document_id = ?', [reviewId]);
  const next = Number(rows?.[0]?.max_run || 0) + 1;
  return next > 0 ? next : 1;
}

export async function upsertReviewDocument(env, payload) {
  const now = nowIso();
  const expiresAt = payload.expiresAt || plusDaysIso(REVIEW_RETENTION_DAYS);
  await d1Execute(
    env,
    'insert into review_documents (id, owner_type, owner_key, file_key, file_name, file_mime, file_size, source_text_hash, created_at, last_run_at, expires_at, status) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) on conflict(id) do update set owner_type=excluded.owner_type, owner_key=excluded.owner_key, file_key=excluded.file_key, file_name=excluded.file_name, file_mime=excluded.file_mime, file_size=excluded.file_size, source_text_hash=excluded.source_text_hash, last_run_at=excluded.last_run_at, expires_at=excluded.expires_at, status=excluded.status',
    [
      payload.id,
      payload.ownerType,
      payload.ownerKey,
      payload.fileKey,
      payload.fileName,
      payload.fileMime,
      Math.round(payload.fileSize || 0),
      payload.sourceTextHash,
      payload.createdAt || now,
      payload.lastRunAt || now,
      expiresAt,
      payload.status || 'active',
    ]
  );
}

export async function insertReviewRun(env, payload) {
  await d1Execute(
    env,
    'insert into review_runs (id, review_document_id, run_no, review_mode, approval_score, risk_score, readability_score, branding_score, risk_breakdown_json, highlights_json, summary, created_at) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    [
      payload.id,
      payload.reviewDocumentId,
      Math.round(payload.runNo || 1),
      payload.reviewMode || 'first',
      Math.round(payload.scores?.approval || 0),
      Math.round(payload.scores?.risk || 0),
      Math.round(payload.scores?.readability || 0),
      Math.round(payload.scores?.branding || 0),
      JSON.stringify(payload.riskBreakdown || {}),
      JSON.stringify(payload.highlights || []),
      normalizeText(payload.summary || '', 1500),
      payload.createdAt || nowIso(),
    ]
  );
}

export async function getReviewRuns(env, reviewId) {
  const rows = await d1Query(
    env,
    'select id, review_document_id, run_no, review_mode, approval_score, risk_score, readability_score, branding_score, risk_breakdown_json, highlights_json, summary, created_at from review_runs where review_document_id = ? order by run_no asc',
    [reviewId]
  );
  return rows.map((row) => {
    let riskBreakdown = {};
    let highlights = [];
    try {
      riskBreakdown = JSON.parse(String(row.risk_breakdown_json || '{}'));
    } catch (error) {
      riskBreakdown = {};
    }
    try {
      highlights = JSON.parse(String(row.highlights_json || '[]'));
    } catch (error) {
      highlights = [];
    }
    return {
      id: row.id,
      reviewId: row.review_document_id,
      runNo: Number(row.run_no || 1),
      reviewMode: row.review_mode || 'first',
      scores: {
        approval: Number(row.approval_score || 0),
        risk: Number(row.risk_score || 0),
        readability: Number(row.readability_score || 0),
        branding: Number(row.branding_score || 0),
      },
      riskBreakdown,
      highlights,
      summary: String(row.summary || ''),
      createdAt: row.created_at,
    };
  });
}

export async function cleanupExpiredReviews(env, limit = 20) {
  const rows = await d1Query(
    env,
    'select id, file_key from review_documents where expires_at <= ? order by expires_at asc limit ?',
    [nowIso(), Math.max(1, Math.min(200, Math.round(limit || 20)))]
  );
  if (!rows.length) return 0;

  for (const row of rows) {
    try {
      await r2Delete(env, row.file_key);
    } catch (error) {
    }
    await d1Execute(env, 'delete from review_runs where review_document_id = ?', [row.id]);
    await d1Execute(env, 'delete from review_documents where id = ?', [row.id]);
  }

  return rows.length;
}

export function getReviewRetentionDays() {
  return REVIEW_RETENTION_DAYS;
}

export function getReviewMaxFileBytes() {
  return MAX_REVIEW_FILE_BYTES;
}

export function getReviewPolicyVersion() {
  return REVIEW_POLICY.version;
}
