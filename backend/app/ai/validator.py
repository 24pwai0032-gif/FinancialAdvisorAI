"""Runtime output validation — last line of defense before a response reaches
the user. Catches ungrounded numbers, missing compliance framing, and leaks."""
from __future__ import annotations

import re
from dataclasses import dataclass

_SQL = re.compile(r"\bSELECT\s+.*\bFROM\b|\bINSERT\s+INTO\b|\bDROP\s+TABLE\b|\bUPDATE\s+\w+\s+SET\b", re.I)
_API_KEY = re.compile(r"sk-ant-[A-Za-z0-9_-]{6,}|sk-[A-Za-z0-9]{20,}")
_HAS_NUMBER = re.compile(r"\$[\d,]+(\.\d+)?|\b\d+(\.\d+)?\s*%|\b\d{3,}\b")
# Investment vocabulary that requires educational framing. Bare "fund"/"security"
# are deliberately absent: they fire on "emergency fund", "Social Security" and
# "financial security", which turned ordinary savings answers into fallbacks.
_INVESTMENT = re.compile(
    r"\b(stocks?|etfs?|bonds?|portfolios?|equit(?:y|ies)|invest(?:s|ed|ing|ments?|ors?)?|securities"
    r"|(?:mutual|index|hedge)\s+funds?|crypto(?:currenc(?:y|ies))?|bitcoin|dividends?)\b",
    re.I,
)
_DISCLAIMER = re.compile(
    r"educational|not\s+(financial\s+)?advice|consult.*(advisor|professional)|general\s+(context|education)", re.I
)


@dataclass
class ValidationResult:
    valid: bool
    reason: str | None = None


def validate_output(text: str, *, tool_calls_made: list[str]) -> ValidationResult:
    stripped = text.strip()
    if len(stripped) < 15:
        return ValidationResult(False, "RESPONSE_TOO_SHORT")
    if len(stripped) > 4000:
        return ValidationResult(False, "RESPONSE_TOO_LONG")
    if _SQL.search(text):
        return ValidationResult(False, "SQL_LEAKED")
    if _API_KEY.search(text):
        return ValidationResult(False, "API_KEY_LEAKED")
    if _INVESTMENT.search(text) and not _DISCLAIMER.search(text):
        return ValidationResult(False, "INVESTMENT_RESPONSE_MISSING_DISCLAIMER")
    # Grounding: specific numbers must be backed by at least one tool call.
    if _HAS_NUMBER.search(text) and not tool_calls_made:
        return ValidationResult(False, "NUMBERS_WITHOUT_TOOL_GROUNDING")
    return ValidationResult(True)


CORRECTION_INSTRUCTION = (
    "Your previous reply was rejected by a safety check ({reason}). Regenerate it: ground every "
    "number in a tool call, include an educational-only framing if you mention investments, never "
    "include SQL/code/keys, and keep it under 350 words."
)
