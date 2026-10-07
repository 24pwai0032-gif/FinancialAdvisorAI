"""Output-validator unit tests."""
from __future__ import annotations

from app.ai.validator import validate_output


def test_numbers_require_tool_grounding() -> None:
    ungrounded = validate_output("You have $1,234.00 in checking.", tool_calls_made=[])
    assert ungrounded.reason == "NUMBERS_WITHOUT_TOOL_GROUNDING"
    assert validate_output("You have $1,234.00 in checking.", tool_calls_made=["get_account_balances"]).valid


def test_investment_requires_disclaimer() -> None:
    bad = validate_output(
        "You should rebalance your stock portfolio toward bonds.", tool_calls_made=["get_portfolio_summary"]
    )
    assert bad.reason == "INVESTMENT_RESPONSE_MISSING_DISCLAIMER"
    ok = validate_output(
        "For educational context, a diversified stock/bond mix shifts risk; this is not financial advice.",
        tool_calls_made=["get_portfolio_summary"],
    )
    assert ok.valid


def test_savings_vocabulary_is_not_investment() -> None:
    # "fund"/"security" in a savings sense must not demand an investment disclaimer.
    for text in (
        "Your Emergency fund is 40% complete ($4,800 of $12,000), so New laptop at 75% is closest.",
        "Social Security will cover part of retirement; your checking balance is $110.",
        "Building financial security starts with your $450 food budget.",
    ):
        assert validate_output(text, tool_calls_made=["get_goals_status"]).valid, text


def test_investment_inflections_require_disclaimer() -> None:
    for text in (
        "Your investments are 47% equities across 10 holdings worth $25,446.",
        "Your securities and mutual funds total $25,446.",
        "Bitcoin is 0.5% of your holdings.",
    ):
        result = validate_output(text, tool_calls_made=["get_portfolio_summary"])
        assert result.reason == "INVESTMENT_RESPONSE_MISSING_DISCLAIMER", text


def test_sql_and_key_leaks_blocked() -> None:
    assert validate_output("Here: SELECT * FROM users WHERE 1=1", tool_calls_made=[]).reason == "SQL_LEAKED"
    assert validate_output("key is sk-ant-abc123def456ghi", tool_calls_made=[]).reason == "API_KEY_LEAKED"


def test_length_bounds() -> None:
    assert validate_output("ok", tool_calls_made=[]).reason == "RESPONSE_TOO_SHORT"
    assert validate_output("x" * 4001, tool_calls_made=[]).reason == "RESPONSE_TOO_LONG"
