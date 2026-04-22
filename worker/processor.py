"""Task operation implementations."""
from __future__ import annotations


def process_operation(operation: str, text: str) -> str:
    op = operation.lower()
    if op == "uppercase":
        return text.upper()
    if op == "lowercase":
        return text.lower()
    if op == "reverse":
        return text[::-1]
    if op == "wordcount":
        return str(len(text.split()))
    raise ValueError(f"Unknown operation: {operation}")
