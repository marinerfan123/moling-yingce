#!/usr/bin/env node
// scripts/verify-preflight.mjs
// Preflight gate verifier for Task 00: reads all 16 evidence/ADR files,
// validates structure, required fields, and rejects placeholders.
// Exits 0 on PASS, 1 on FAIL with detailed report.

import { readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Evidence file registry ────────────────────────────────────────────
// 6 ADRs + 10 research files = 16 total
const EVIDENCE_FILES = [
  { path: "docs/adr/0001-product-scope-and-devices.md", type: "adr" },
  { path: "docs/adr/0002-canvas-renderer-and-scale.md", type: "adr" },
  { path: "docs/adr/0003-state-authority-and-projection.md", type: "adr" },
  { path: "docs/adr/0004-jobs-cost-and-orchestration.md", type: "adr" },
  { path: "docs/adr/0005-providers-region-and-retention.md", type: "adr" },
  { path: "docs/adr/0006-deployment-ci-release.md", type: "adr" },
  { path: "docs/research/provider-scorecard.md", type: "research" },
  { path: "docs/research/golden-project-manifest.md", type: "research" },
  { path: "docs/research/usability-protocol.md", type: "research" },
  { path: "docs/research/user-interview-evidence.md", type: "research" },
  { path: "docs/research/production-observation-evidence.md", type: "research" },
  { path: "docs/research/prototype-rounds-evidence.md", type: "research" },
  { path: "docs/research/brand-font-license-evidence.md", type: "research" },
  { path: "docs/research/engineering-readiness.md", type: "research" },
  { path: "docs/research/legal-operations-readiness.md", type: "research" },
  { path: "docs/research/development-freeze-record.md", type: "freeze" },
];

const REQUIRED_ADR_APPROVER_ROLES = new Set(["Product", "Engineering", "Design", "Legal", "Operations"]);

// Placeholder markers that invalidate a file
const PLACEHOLDER_MARKERS = [
  "TBD",
  "TODO",
  "FIXME",
  "PLACEHOLDER",
  "[TO BE FILLED]",
  "[TO BE COMPLETED]",
  "[PENDING]",
  "REPLACE THIS",
  "FILL IN",
];

// Stale/Draft/blocked indicators that invalidate ANY evidence file
// A real evidence file must not contain these phrases
const STALE_INDICATORS = [
  /status\s*[:=]\s*draft/i,
  /status\s*[:=]\s*blocked/i,
  /status\s*[:=]\s*in\s+progress/i,
  /\bblocked\b/i,
  /\bawaiting\b/i,
  /no\s+test\s+data/i,
  /not\s+yet\s+provisioned/i,
  /not\s+yet\s+built/i,
  /not\s+yet\s+designed/i,
  /not\s+yet\s+assigned/i,
  /not\s+yet\s+identified/i,
  /not\s+measured/i,
  /not\s+computed/i,
  /not\s+procured/i,
  /not\s+available/i,
  /not\s+drafted/i,
  /not\s+written/i,
  /not\s+defined/i,
  /not\s+found/i,
  /\[no\s+evidence\b/i,
  /\[none\]/i,
  /empty\b/i,
  /missing\b.*input/i,
  /awaiting\s+named\s+identity/i,
  /awaiting\s+real\s+evidence/i,
];

// Freeze Record required columns
const FREEZE_RECORD_COLUMNS = [
  "gateId",
  "finalDecision",
  "evidenceLinksOrSha256",
  "owner",
  "requiredApproverRoles",
  "approverIdentities",
  "approvedAt",
  "status",
  "supersedes",
  "unresolvedBlockers",
];

// Error codes used in validation output
const ERR = {
  FILE_MISSING: "FILE_MISSING",
  ADR_STATUS_MISSING: "ADR_STATUS_MISSING",
  ADR_STATUS_NOT_ACCEPTED: "ADR_STATUS_NOT_ACCEPTED",
  ADR_DATE_MISSING: "ADR_DATE_MISSING",
  ADR_DATE_INVALID: "ADR_DATE_INVALID",
  ADR_APPROVER_ROLE_MISSING: "ADR_APPROVER_ROLE_MISSING",
  ADR_APPROVER_NOT_NAMED: "ADR_APPROVER_NOT_NAMED",
  ADR_NO_LINKS_OR_CHECKSUMS: "ADR_NO_LINKS_OR_CHECKSUMS",
  PLACEHOLDER_FOUND: "PLACEHOLDER_FOUND",
  STALE_EVIDENCE: "STALE_EVIDENCE",
  RESEARCH_EMPTY_OR_PROTOCOL: "RESEARCH_EMPTY_OR_PROTOCOL",
  RESEARCH_NO_LINKS_OR_CHECKSUMS: "RESEARCH_NO_LINKS_OR_CHECKSUMS",
  RESEARCH_PROTOCOL_ONLY: "RESEARCH_PROTOCOL_ONLY",
  RESEARCH_CHECKLIST_BLOCKED: "RESEARCH_CHECKLIST_BLOCKED",
  PROVIDER_RECOVERY_MISSING: "PROVIDER_RECOVERY_MISSING",
  PROVIDER_RECOVERY_EMPTY: "PROVIDER_RECOVERY_EMPTY",
  PROVIDER_TEXT_GATE_MISSING: "PROVIDER_TEXT_GATE_MISSING",
  PROVIDER_IMAGE_GATE_MISSING: "PROVIDER_IMAGE_GATE_MISSING",
  PROVIDER_VIDEO_GATE_MISSING: "PROVIDER_VIDEO_GATE_MISSING",
  PROVIDER_TTS_GATE_MISSING: "PROVIDER_TTS_GATE_MISSING",
  PROVIDER_CLASS_BLOCKED: "PROVIDER_CLASS_BLOCKED",
  INTERVIEW_COUNT_BELOW_12: "INTERVIEW_COUNT_BELOW_12",
  PRIMARY_PERSONA_BELOW_6: "PRIMARY_PERSONA_BELOW_6",
  PERSONA_JOURNEY_INCOMPLETE: "PERSONA_JOURNEY_INCOMPLETE",
  OBSERVATION_COUNT_BELOW_3: "OBSERVATION_COUNT_BELOW_3",
  PROTOTYPE_ROUNDS_BELOW_2: "PROTOTYPE_ROUNDS_BELOW_2",
  CORE_COMPLETION_BELOW_90: "CORE_COMPLETION_BELOW_90",
  BRAND_FONT_MISSING: "BRAND_FONT_MISSING",
  ENGINEERING_READY_MISSING: "ENGINEERING_READY_MISSING",
  LEGAL_OPS_READY_MISSING: "LEGAL_OPS_READY_MISSING",
  GOLDEN_MANIFEST_MISSING: "GOLDEN_MANIFEST_MISSING",
  GOLDEN_NO_REAL_CHECKSUMS: "GOLDEN_NO_REAL_CHECKSUMS",
  FREEZE_COLUMN_MISSING: "FREEZE_COLUMN_MISSING",
  FREEZE_NO_STATUS_ROWS: "FREEZE_NO_STATUS_ROWS",
  FREEZE_BLOCKED_ROW: "FREEZE_BLOCKED_ROW",
  FREEZE_NO_LINKS_OR_CHECKSUMS: "FREEZE_NO_LINKS_OR_CHECKSUMS",
  FREEZE_NO_NAMED_APPROVERS: "FREEZE_NO_NAMED_APPROVERS",
};

// Step 4 PASS thresholds
const THRESHOLDS = {
  TOTAL_EVIDENCE_FILES: 16,
  ADR_COUNT: 6,
  INTERVIEW_COUNT: 12,
  PRIMARY_PERSONA_MIN: 6,
  OBSERVATION_COUNT: 3,
  PROTOTYPE_ROUNDS: 2,
  PROVIDER_CLASSES: ["text", "image", "video", "tts"],
  CORE_COMPLETION_PCT: 90,
};

// ── Helpers ───────────────────────────────────────────────────────────

function readFile(relativePath) {
  const fullPath = join(ROOT, relativePath);
  try {
    return readFileSync(fullPath, "utf-8");
  } catch {
    return null;
  }
}

function fileExists(relativePath) {
  const fullPath = join(ROOT, relativePath);
  try {
    const s = statSync(fullPath);
    return s.isFile();
  } catch {
    return false;
  }
}

function containsPlaceholder(text) {
  const markers = PLACEHOLDER_MARKERS.filter((m) => text.includes(m));
  return markers;
}

function matchesISODate(text) {
  return /^\d{4}-\d{2}-\d{2}$/.test(text.trim());
}

// Check for stale/Draft/blocked indicators in any file
// Returns array of matching patterns found
function findStaleIndicators(text) {
  const found = [];
  for (const pattern of STALE_INDICATORS) {
    const match = text.match(pattern);
    if (match) {
      found.push(match[0]);
    }
  }
  return found;
}

// Check if a line contains a real 64-char hex sha256 checksum
function hasRealChecksum(content) {
  return /\b[a-f0-9]{64}\b/.test(content);
}

// Check if approver line has a real named identity (not "awaiting", "none", empty)
function approverIsNamed(line) {
  const trimmed = line.trim();
  // Must have a colon/equals separating role from identity
  const sepIndex = Math.max(trimmed.indexOf(":"), trimmed.indexOf("="));
  if (sepIndex === -1) return false;
  const identity = trimmed.substring(sepIndex + 1).trim();
  // Reject empty, placeholder, or awaiting patterns
  if (!identity || identity.length < 2) return false;
  if (/^\[/.test(identity)) return false;
  if (/\b(awaiting|none|unknown|pending|blocked|draft|tbd|todo)\b/i.test(identity)) return false;
  return true;
}

// Check if content has substantive evidence (not just mentioning that something is missing)
function hasSubstantiveEvidence(content) {
  // Must have at least one real checksum OR a source link that isn't just a reference URL
  const realChecksums = hasRealChecksum(content);
  // Count non-reference links (links that aren't just documentation references)
  const linkMatches = content.match(/https?:\/\/\S+/gi) || [];
  const refLinks = linkMatches.filter((l) =>
    /nngroup\.com|interaction-design\.org|gdpr\.eu|cc\.gov\.cn|postgresql\.org|redis\.io|docker\.com|bullmq\.github\.io|creativecommons\.org/.test(
      l,
    ),
  );
  const evidenceLinks = linkMatches.filter((l) => !refLinks.includes(l));
  return realChecksums || evidenceLinks.length > 0;
}

// ── Validators ────────────────────────────────────────────────────────

function validateADR(relPath, content) {
  const errors = [];
  const lines = content.split("\n");

  // Stale evidence check — any draft/blocked/awaiting indicator fails immediately
  const stale = findStaleIndicators(content);
  if (stale.length > 0) {
    errors.push({ code: ERR.STALE_EVIDENCE, message: `contains stale indicators: ${[...new Set(stale)].join(", ")}` });
  }

  // Status: Accepted (must be exactly "Accepted", not "Draft" or anything else)
  const statusLine = lines.find((l) => /^status\s*:/i.test(l));
  if (!statusLine) {
    errors.push({ code: ERR.ADR_STATUS_MISSING, message: 'missing "Status:" field' });
  } else if (!/accepted/i.test(statusLine)) {
    errors.push({ code: ERR.ADR_STATUS_NOT_ACCEPTED, message: `Status is "${statusLine.trim()}", must be "Accepted"` });
  }

  // ISO date
  const dateLine = lines.find((l) => /^date\s*:/i.test(l));
  if (!dateLine) {
    errors.push({ code: ERR.ADR_DATE_MISSING, message: 'missing "Date:" field' });
  } else if (!matchesISODate(dateLine.split(":")[1] || "")) {
    errors.push({ code: ERR.ADR_DATE_INVALID, message: `Date is not ISO format: "${dateLine.trim()}"` });
  }

  // Approver roles — must have named identities, not "awaiting" or "[none]"
  const foundRoles = new Set();
  for (const role of REQUIRED_ADR_APPROVER_ROLES) {
    const rolePattern = new RegExp(role + "\\s*[:=]", "i");
    const approverLines = lines.filter((l) => rolePattern.test(l) && /approver/i.test(l));
    if (approverLines.length === 0) {
      // Missing entirely
    } else if (approverLines.some(approverIsNamed)) {
      foundRoles.add(role);
    }
    // If lines exist but none have named identities, they count as missing
  }
  const missingRoles = [...REQUIRED_ADR_APPROVER_ROLES].filter((r) => !foundRoles.has(r));
  if (missingRoles.length > 0) {
    errors.push({
      code: ERR.ADR_APPROVER_NOT_NAMED,
      message: `approver identities not provided for roles: ${missingRoles.join(", ")}`,
    });
  }

  // Source links or checksums — must be real evidence, not just reference URLs
  if (!hasSubstantiveEvidence(content)) {
    errors.push({
      code: ERR.ADR_NO_LINKS_OR_CHECKSUMS,
      message:
        "no substantive evidence links or artifact checksums found (documentation reference URLs are not evidence)",
    });
  }

  // Placeholders
  const placeholders = containsPlaceholder(content);
  if (placeholders.length > 0) {
    errors.push({ code: ERR.PLACEHOLDER_FOUND, message: `contains placeholder markers: ${placeholders.join(", ")}` });
  }

  return errors;
}

function validateResearch(relPath, content) {
  const errors = [];
  const lines = content.split("\n");

  // Stale evidence check — draft/blocked/awaiting fails immediately
  const stale = findStaleIndicators(content);
  if (stale.length > 0) {
    errors.push({ code: ERR.STALE_EVIDENCE, message: `contains stale indicators: ${[...new Set(stale)].join(", ")}` });
  }

  // Substance check (not just a heading)
  const nonEmptyLines = lines.filter((l) => l.trim() && !/^#+\s/.test(l) && !/^\s*[-*]\s*$/.test(l));
  if (nonEmptyLines.length < 3) {
    errors.push({
      code: ERR.RESEARCH_EMPTY_OR_PROTOCOL,
      message: "file appears empty or protocol-only (fewer than 3 content lines)",
    });
  }

  // Placeholders
  const placeholders = containsPlaceholder(content);
  if (placeholders.length > 0) {
    errors.push({ code: ERR.PLACEHOLDER_FOUND, message: `contains placeholder markers: ${placeholders.join(", ")}` });
  }

  // Per-file structured checks
  const base = relPath.replace(/.*\//, "").replace(/\.md$/, "");

  // provider-scorecard: must have real results, not blocked templates
  if (base === "provider-scorecard") {
    // Check for blocked/no test data in capability class lines
    const blockedClasses = [];
    for (const cls of THRESHOLDS.PROVIDER_CLASSES) {
      const clsRe = new RegExp(cls, "i");
      // Find lines mentioning this class
      const classLines = lines.filter((l) => clsRe.test(l.trim()) && !/^#+/.test(l.trim()));
      // Check if any class line also mentions blocked, no test data, etc.
      const hasBlockedLine = classLines.some((l) =>
        /\b(blocked|no\s+test\s+data|not\s+measured|awaiting|empty|pending)\b/i.test(l),
      );
      if (hasBlockedLine) {
        blockedClasses.push(cls);
      }
    }
    if (blockedClasses.length > 0) {
      errors.push({
        code: ERR.PROVIDER_CLASS_BLOCKED,
        message: `provider class(es) marked as blocked/no test data: ${blockedClasses.join(", ")}`,
      });
    } else {
      // Only check for positive gate evidence if not blocked
      for (const cls of THRESHOLDS.PROVIDER_CLASSES) {
        const clsRe = new RegExp(cls, "i");
        if (
          !lines.some((l) => {
            const trimmed = l.trim();
            return (
              clsRe.test(trimmed) &&
              /(accepted|pass|hard[_ ]gate.*pass|approved|selected|chosen|verified|completed|100\s+request)/i.test(
                trimmed,
              ) &&
              !/^#+/.test(trimmed)
            );
          })
        ) {
          errors.push({
            code: `PROVIDER_${cls.toUpperCase()}_GATE_MISSING`,
            message: `${cls} provider hard gate: no accepted/pass evidence with 100 request coverage`,
          });
        }
      }
    }

    // Recovery evidence must be substantive (not just describing what recovery means)
    const recoveryLines = lines.filter((l) => /recovery/i.test(l) && l.trim().length > 20 && !/^#+/.test(l));
    const hasRecoveryEvidence = recoveryLines.some((l) =>
      /(success|succeeded|completed|tested|verified|confirmed|pass|result)/i.test(l),
    );
    if (!hasRecoveryEvidence) {
      errors.push({
        code: ERR.PROVIDER_RECOVERY_EMPTY,
        message: "provider recovery section describes concepts but contains no actual test results",
      });
    }
  }

  // usability-protocol: protocol text alone is not evidence; must have measured results
  if (base === "usability-protocol") {
    const hasResults = lines.some(
      (l) =>
        /(completion\s+rate|core\s+completion|result|measured|achieved|pass\s+rate|completed.*tasks|success\s+rate)/i.test(
          l,
        ) && /\d+%/.test(l),
    );
    if (!hasResults) {
      errors.push({
        code: ERR.RESEARCH_PROTOCOL_ONLY,
        message:
          "usability protocol defined but no measured results (completion rates, pass rates, or quantitative outcomes)",
      });
    }
  }

  // user-interview-evidence: interview count + primary persona + persona-journey cells
  if (base === "user-interview-evidence") {
    const interviewCount = countInterviewParticipants(content);
    if (interviewCount < THRESHOLDS.INTERVIEW_COUNT) {
      errors.push({
        code: ERR.INTERVIEW_COUNT_BELOW_12,
        message: `interview participants ${interviewCount} < ${THRESHOLDS.INTERVIEW_COUNT}`,
      });
    }
    const primaryCount = countPrimaryPersona(content);
    if (primaryCount < THRESHOLDS.PRIMARY_PERSONA_MIN) {
      errors.push({
        code: ERR.PRIMARY_PERSONA_BELOW_6,
        message: `primary persona ${primaryCount} < ${THRESHOLDS.PRIMARY_PERSONA_MIN}`,
      });
    }
    if (!hasPersonaJourneyMatrix(content)) {
      errors.push({
        code: ERR.PERSONA_JOURNEY_INCOMPLETE,
        message: "persona-journey coverage matrix missing or incomplete",
      });
    }
  }

  // production-observation-evidence: >= 3 observations with real data
  if (base === "production-observation-evidence") {
    const obsCount = countObservations(content);
    if (obsCount < THRESHOLDS.OBSERVATION_COUNT) {
      errors.push({
        code: ERR.OBSERVATION_COUNT_BELOW_3,
        message: `observations ${obsCount} < ${THRESHOLDS.OBSERVATION_COUNT}`,
      });
    }
    // Must have real tool/cost/elapsed data (not "Unknown")
    const hasRealData =
      content.match(/tool.*\S+/i) &&
      (/\b(?:cost|price|expense)\s*[:=]\s*\$?\d/i.test(content) ||
        /\b(?:elapsed|active)\s+time\s*[:=]\s*\d/i.test(content));
    if (!hasRealData) {
      errors.push({
        code: ERR.OBSERVATION_COUNT_BELOW_3,
        message: "observation entries exist but contain no actual cost/time/tool data (only templates)",
      });
    }
  }

  // prototype-rounds-evidence: >= 2 rounds + core completion >= 90%
  if (base === "prototype-rounds-evidence") {
    const roundCount = countPrototypeRounds(content);
    if (roundCount < THRESHOLDS.PROTOTYPE_ROUNDS) {
      errors.push({
        code: ERR.PROTOTYPE_ROUNDS_BELOW_2,
        message: `prototype rounds ${roundCount} < ${THRESHOLDS.PROTOTYPE_ROUNDS}`,
      });
    }
    const corePct = extractCoreCompletion(content);
    if (corePct === null || corePct < THRESHOLDS.CORE_COMPLETION_PCT) {
      errors.push({
        code: ERR.CORE_COMPLETION_BELOW_90,
        message: `core completion ${corePct !== null ? corePct + "%" : "not found"} < ${THRESHOLDS.CORE_COMPLETION_PCT}%`,
      });
    }
  }

  // brand-font-license-evidence: brand + font license with real evidence
  if (base === "brand-font-license-evidence") {
    const hasBrand = /brand/i.test(content) && lines.some((l) => /brand/i.test(l) && l.trim().length > 15);
    const hasFont = /font/i.test(content) && /license/i.test(content);
    if (!hasBrand || !hasFont) {
      errors.push({ code: ERR.BRAND_FONT_MISSING, message: `brand=${hasBrand}, font_license=${hasFont}` });
    }
    // Must have real evidence links or checksums
    if (!hasSubstantiveEvidence(content) && !hasRealChecksum(content)) {
      errors.push({
        code: ERR.RESEARCH_NO_LINKS_OR_CHECKSUMS,
        message: "no substantive evidence links or artifact checksums for brand/font licensing",
      });
    }
  }

  // engineering-readiness: keywords present AND items must not be blocked
  if (base === "engineering-readiness") {
    const engKeywords = ["repository", "CI", "environment", "PostgreSQL", "Redis", "S3"];
    const foundEng = engKeywords.filter((kw) => new RegExp(kw, "i").test(content));
    if (foundEng.length < 4) {
      errors.push({
        code: ERR.ENGINEERING_READY_MISSING,
        message: `engineering items found: ${foundEng.join(", ")} (need >=4 of ${engKeywords.join(", ")})`,
      });
    }
    // Check if checklist items are blocked
    const blockedItems = lines.filter(
      (l) =>
        /\bblocked\b/i.test(l) &&
        /\b(repository|CI|environment|PostgreSQL|Redis|S3|CDN|OIDC|KMS|TLS|provision|infrastructure)/i.test(l),
    );
    if (blockedItems.length > 0) {
      errors.push({
        code: ERR.RESEARCH_CHECKLIST_BLOCKED,
        message: `${blockedItems.length} engineering readiness item(s) marked as blocked instead of provisioned`,
      });
    }
  }

  // legal-operations-readiness: keywords present AND items must not be blocked
  if (base === "legal-operations-readiness") {
    const legalKeywords = ["privacy", "terms", "complaint", "retention", "outage"];
    const foundLegal = legalKeywords.filter((kw) => new RegExp(kw, "i").test(content));
    if (foundLegal.length < 3) {
      errors.push({
        code: ERR.LEGAL_OPS_READY_MISSING,
        message: `legal items found: ${foundLegal.join(", ")} (need >=3 of ${legalKeywords.join(", ")})`,
      });
    }
    // Check if checklist items are blocked
    const blockedItems = lines.filter(
      (l) =>
        /\bblocked\b/i.test(l) &&
        /\b(privacy|terms|rights|label|complaint|training|outage|misbilling|retention|incident)/i.test(l),
    );
    if (blockedItems.length > 0) {
      errors.push({
        code: ERR.RESEARCH_CHECKLIST_BLOCKED,
        message: `${blockedItems.length} legal/operations item(s) marked as blocked instead of drafted`,
      });
    }
  }

  // golden-project-manifest: 3 projects with paths/sha256
  if (base === "golden-project-manifest") {
    const projectRefs = lines.filter((l) => /project/i.test(l) && /(sha256|relative[_ ]?path|source[_ ]?url)/i.test(l));
    if (projectRefs.length < 3) {
      errors.push({
        code: ERR.GOLDEN_MANIFEST_MISSING,
        message: `golden project entries with sha256/path ${projectRefs.length} < 3`,
      });
    }
    // Must have actual 64-char hex checksums, not just the word "sha256"
    if (!hasRealChecksum(content)) {
      errors.push({
        code: ERR.GOLDEN_NO_REAL_CHECKSUMS,
        message: "mentions sha256 but contains no actual 64-character hex checksums",
      });
    }
  }

  // All research files need substantive evidence links or checksums
  if (!hasSubstantiveEvidence(content)) {
    errors.push({
      code: ERR.RESEARCH_NO_LINKS_OR_CHECKSUMS,
      message:
        "no substantive evidence links or artifact checksums found (documentation reference URLs are not evidence)",
    });
  }

  return errors;
}

// ── Structured field extractors ──────────────────────────────────────

function countInterviewParticipants(content) {
  const lines = content.split("\n");
  // Count lines that look like participant entries (P-01, Participant 1, etc.)
  let count = 0;
  for (const l of lines) {
    const trimmed = l.trim();
    // Patterns: P-01, P01, Participant 1, ID: p01, | p-01, etc.
    if (/^[|]?\s*p[-_]?\d{1,3}\b/i.test(trimmed)) count++;
    // YAML-like: participant: alice
    if (/^participant\s*[:=]/i.test(trimmed)) count++;
  }
  // Fallback: count "participant" keyword lines
  if (count === 0) {
    count = lines.filter((l) => /participant/i.test(l) && !/^#+/.test(l)).length;
  }
  return count;
}

function countPrimaryPersona(content) {
  const lines = content.split("\n");
  // Count lines explicitly tagged as primary persona / qualifying
  const pp = lines.filter(
    (l) => /primary.*(persona|creator)/i.test(l) || /qualif?.*primary/i.test(l) || /persona.*primary/i.test(l),
  ).length;
  return pp;
}

function hasPersonaJourneyMatrix(content) {
  // Look for a table with persona and journey columns, with filled cells
  const lines = content.split("\n");
  const tableLines = lines.filter((l) => /^\|/.test(l.trim()));
  if (tableLines.length < 3) return false;
  // Header should mention persona and journey
  const headerFound = tableLines.some((l) => /persona/i.test(l) && /journey/i.test(l));
  if (!headerFound) return false;
  // Data rows (non-separator, non-header) should have eligible/completed
  const dataRows = tableLines.filter((l) => !/^\|?\s*-/.test(l.trim()));
  return dataRows.length >= 2;
}

function countObservations(content) {
  // Count project observation entries (Project 1, Obs-1, | proj-1, etc.)
  const lines = content.split("\n");
  let count = lines.filter((l) => {
    const t = l.trim();
    return (
      /project\s*\d/i.test(t) || /obs[-_]?\d/i.test(t) || (/project/i.test(t) && /tool|cost|elapsed|active/i.test(t))
    );
  }).length;
  if (count === 0) {
    count = lines.filter((l) => /project/i.test(l) && !/^#+/.test(l) && l.trim().length > 20).length;
  }
  return count;
}

function countPrototypeRounds(content) {
  // Count "Round 1", "Round 2", "round_1", etc.
  const lines = content.split("\n");
  return lines.filter((l) => /round\s*\d/i.test(l) || /round[-_]?\d/i.test(l)).length;
}

function extractCoreCompletion(content) {
  // Look for "core completion" or "completion rate" with a percentage
  const match =
    content.match(/core[_ ]completion[:\s]*(\d+(?:\.\d+)?)\s*%/i) ||
    content.match(/completion[_ ]rate[:\s]*(\d+(?:\.\d+)?)\s*%/i);
  return match ? parseFloat(match[1]) : null;
}

function validateFreezeRecord(relPath, content) {
  const errors = [];
  const lines = content.split("\n");

  // Stale evidence check
  const stale = findStaleIndicators(content);
  if (stale.length > 0) {
    errors.push({ code: ERR.STALE_EVIDENCE, message: `contains stale indicators: ${[...new Set(stale)].join(", ")}` });
  }

  // Required columns
  const foundColumns = new Set();
  for (const col of FREEZE_RECORD_COLUMNS) {
    if (content.toLowerCase().includes(col.toLowerCase())) {
      foundColumns.add(col);
    }
  }
  const missingCols = FREEZE_RECORD_COLUMNS.filter((c) => !foundColumns.has(c));
  if (missingCols.length > 0) {
    errors.push({ code: ERR.FREEZE_COLUMN_MISSING, message: `missing columns: ${missingCols.join(", ")}` });
  }

  // Status rows
  const statusLines = lines.filter((l) => /^status\s*:/i.test(l) || /status\s*\|/i.test(l));
  if (statusLines.length === 0) {
    errors.push({ code: ERR.FREEZE_NO_STATUS_ROWS, message: "no status rows found" });
  }

  // Blocked rows — any blocked row fails
  const blockedRows = content.split("\n").filter((l) => /blocked/i.test(l) && !/^#/.test(l) && !/^\|?\s*-/.test(l));
  if (blockedRows.length > 0) {
    errors.push({ code: ERR.FREEZE_BLOCKED_ROW, message: `${blockedRows.length} row(s) have status=blocked` });
  }

  // Approver identities must be real names, not [none] or "awaiting"
  // Skip table definition rows (lines that start with | and match column header patterns)
  const approverLines = lines.filter((l) => {
    // Exclude pipe-delimited table rows
    if (/^\s*\|/.test(l.trim())) return false;
    // Only match actual approver declarations (Approver: Name), not column name references
    return /^[-*]?\s*approver\s*[:=]/i.test(l.trim()) || /^[-*]?\s*\w+\s+approver\s*[:=]/i.test(l.trim());
  });
  const namedApprovers = approverLines.filter(approverIsNamed);
  if (namedApprovers.length === 0 && approverLines.length > 0) {
    errors.push({
      code: ERR.FREEZE_NO_NAMED_APPROVERS,
      message: "approver identities are placeholders ([none], awaiting) instead of real names",
    });
  }

  // Placeholders
  const placeholders = containsPlaceholder(content);
  if (placeholders.length > 0) {
    errors.push({ code: ERR.PLACEHOLDER_FOUND, message: `contains placeholder markers: ${placeholders.join(", ")}` });
  }

  // Evidence links or checksums — must be real evidence
  if (!hasSubstantiveEvidence(content)) {
    errors.push({
      code: ERR.FREEZE_NO_LINKS_OR_CHECKSUMS,
      message:
        "no substantive evidence links or artifact checksums found (documentation reference URLs are not evidence)",
    });
  }

  return errors;
}

// ── Main ──────────────────────────────────────────────────────────────

function main() {
  const results = [];
  let allPass = true;
  let totalPlaceholders = 0;

  console.log("=== Preflight Gate Verifier ===\n");

  for (const { path: relPath, type } of EVIDENCE_FILES) {
    const exists = fileExists(relPath);
    const fileResult = { path: relPath, type, errors: [] };

    if (!exists) {
      fileResult.errors.push({ code: ERR.FILE_MISSING, message: "FILE MISSING" });
      allPass = false;
    } else {
      const content = readFile(relPath);
      let fileErrors = [];

      if (type === "adr") {
        fileErrors = validateADR(relPath, content);
      } else if (type === "freeze") {
        fileErrors = validateFreezeRecord(relPath, content);
      } else {
        fileErrors = validateResearch(relPath, content);
      }

      if (fileErrors.length > 0) {
        fileResult.errors = fileErrors;
        allPass = false;
      }
    }

    // Count placeholders across all files
    for (const err of fileResult.errors) {
      if (err.code === ERR.PLACEHOLDER_FOUND) totalPlaceholders++;
    }

    results.push(fileResult);
  }

  // Summary counts
  const missing = results.filter((r) => r.errors.some((e) => e.code === ERR.FILE_MISSING));
  const failed = results.filter((r) => r.errors.length > 0 && !r.errors.some((e) => e.code === ERR.FILE_MISSING));
  const passed = results.filter((r) => r.errors.length === 0);

  const adrCount = results.filter((r) => r.type === "adr" && r.errors.length === 0).length;
  const researchCount = results.filter((r) => r.type === "research" && r.errors.length === 0).length;
  const freezeCount = results.filter((r) => r.type === "freeze" && r.errors.length === 0).length;
  const totalFiles = results.filter((r) => r.errors.length === 0).length;

  // Collect all error codes for summary
  const allCodes = new Set();
  for (const r of results) {
    for (const e of r.errors) {
      allCodes.add(e.code);
    }
  }

  // Print detailed results
  for (const r of results) {
    const status = r.errors.length === 0 ? "  OK" : " FAIL";
    console.log(`${status}  ${r.path}`);
    for (const err of r.errors) {
      console.log(`       - [${err.code}] ${err.message}`);
    }
  }

  // Step 4 PASS summary
  console.log("\n=== Summary ===");
  console.log(`Evidence files valid: ${totalFiles} / ${EVIDENCE_FILES.length}`);
  console.log(`ADR accepted:        ${adrCount} / ${THRESHOLDS.ADR_COUNT}`);
  console.log(`Research complete:   ${researchCount} / 10`);
  console.log(`Freeze record:       ${freezeCount > 0 ? "accepted" : "MISSING or failed"}`);
  console.log(`Missing files:       ${missing.length}`);
  console.log(`Files with errors:   ${failed.length}`);
  console.log(`Placeholders:        ${totalPlaceholders}`);

  if (!allPass) {
    console.log("\nGATE: FAILED");
    if (missing.length > 0) {
      console.log(`  ${missing.length} evidence file(s) not found.`);
    }
    if (failed.length > 0) {
      console.log(`  ${failed.length} file(s) failed validation.`);
    }
    // List distinct error codes
    if (allCodes.size > 0) {
      console.log("  Error codes:");
      for (const code of [...allCodes].sort()) {
        console.log(`    - ${code}`);
      }
    }
    process.exit(1);
  } else {
    // Step 4 PASS summary — matches blueprint exactly
    console.log("\nGATE: PASSED");
    console.log(
      `  ${totalFiles} evidence files; ${adrCount} accepted ADRs; 12 interviews; primary persona >=6; persona-journey cells complete; 3 observations; 2 prototype rounds; four provider classes hard-gated; core completion >=90%; freeze accepted; 0 placeholders`,
    );
    console.log("  Task 01 may proceed.");
    process.exit(0);
  }
}

main();
