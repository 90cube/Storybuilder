# Validate LLM Review Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a script to deterministically validate LLM review results and assign final gate actions.

**Architecture:** A standalone Python script that reads audit and review JSONL files, performs validation checks, maps verdicts to actions, and outputs a JSONL and a Markdown report.

**Tech Stack:** Python 3 (standard library only).

---

### Task 1: Setup Validation Script

**Files:**
- Create: `tools/storybuilder/validate_timeline_review.py`

- [ ] **Step 1: Write the base script with file loading and rule constants**

```python
import json
import os
from pathlib import Path
from typing import Any, Dict, List, Set

PROJECT_ROOT = Path(__file__).resolve().parents[2]
REPORT_DIR = PROJECT_ROOT / ".omx" / "reports"
AUDIT_PATH = REPORT_DIR / "timeline-state-audit-current.jsonl"
REVIEW_PATH = REPORT_DIR / "timeline-state-llm-review-current.jsonl"
OUT_JSONL_PATH = REPORT_DIR / "timeline-state-validation-current.jsonl"
OUT_MD_PATH = REPORT_DIR / "timeline-state-validation-current.md"

PSEUDO_ERAS = {"default", "general", "unclassified", "미분류", "일반", "unanchored"}

def load_jsonl(path: Path) -> List[Dict[str, Any]]:
    if not path.exists():
        return []
    with open(path, "r", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]

def main():
    audit_data = {row["id"]: row for row in load_jsonl(AUDIT_PATH)}
    reviews = load_jsonl(REVIEW_PATH)
    
    results = []
    for review in reviews:
        results.append(validate_row(review, audit_data.get(review["id"])))
        
    write_results(results)

if __name__ == "__main__":
    # Placeholder functions to be implemented in next steps
    pass
```

- [ ] **Step 2: Implement `validate_row` logic**

```python
def validate_row(review: Dict[str, Any], audit_packet: Dict[str, Any]) -> Dict[str, Any]:
    row_id = review.get("id")
    verdict = review.get("verdict")
    confidence = review.get("confidence", 0.0)
    cited = review.get("cited_evidence", [])
    
    issues = []
    
    # 1. Basic checks
    if not row_id or not verdict:
        issues.append("MISSING_ID_OR_VERDICT")
    
    if audit_packet is None:
        issues.append("AUDIT_PACKET_NOT_FOUND")
    else:
        # 2. Verify cited evidence
        # Extract available keys from raw_evidence ids or indices
        raw_evidence = audit_packet.get("raw_evidence", [])
        # audit packet in run_timeline_llm_review.py was limited to 5
        # we should match what was actually sent to LLM if possible, 
        # but here we just check if cited keys exist in the provided packet.
        available_keys = {item.get("id") for item in raw_evidence if item.get("id")}
        
        # Also check for synthetic keys if any
        # (Though current audit doesn't seem to have them in raw_evidence list)
        
        for key in cited:
            if key not in available_keys:
                issues.append(f"UNKNOWN_EVIDENCE:{key}")
                
    # 3. Pseudo eras check
    # Check if any suggested eras or proposed timeline entries use pseudo names
    for era_row in review.get("suggested_new_states", []) + review.get("candidate_reviews", []):
        era_name = era_row.get("era") or era_row.get("state") or era_row.get("label", "")
        if str(era_name).lower() in PSEUDO_ERAS:
            issues.append(f"PSEUDO_ERA:{era_name}")

    # 4. Map Action
    action = "manual_review"
    if not issues:
        if verdict == "needs_split":
            # Check if there are valid timeline candidates
            has_timeline = any(
                r.get("candidate_type") in {"persona_state", "role_state", "form_variant"}
                for r in review.get("suggested_new_states", []) + review.get("candidate_reviews", [])
                if r.get("keep_as_timeline") or "suggested_new_states" in review # suggested are inherently keep
            )
            # Actually, the requirement says: "needs_split + valid timeline candidates -> approve_timeline_candidate"
            if has_timeline:
                action = "approve_timeline_candidate"
            else:
                action = "manual_review" # Needs split but no candidates?
        elif verdict == "same_person_no_split":
            action = "reject_noise"
        elif verdict == "noise":
            action = "reject_noise"
        elif verdict == "bad_merge":
            action = "rollback_required"
        elif verdict == "manual_review":
            action = "manual_review"
    else:
        action = "manual_review"

    return {
        "id": row_id,
        "verdict": verdict,
        "action": action,
        "confidence": confidence,
        "issues": issues,
        "review": review
    }
```

- [ ] **Step 3: Implement `write_results` (JSONL and MD)**

```python
def write_results(results: List[Dict[str, Any]]):
    # Write JSONL
    with open(OUT_JSONL_PATH, "w", encoding="utf-8") as f:
        for res in results:
            f.write(json.dumps(res, ensure_ascii=False) + "\n")
            
    # Write Markdown
    with open(OUT_MD_PATH, "w", encoding="utf-8") as f:
        f.write("# Timeline Review Validation Report\n\n")
        f.write(f"**Total rows processed:** {len(results)}\n\n")
        
        actions = {}
        for res in results:
            a = res["action"]
            actions[a] = actions.get(a, 0) + 1
            
        f.write("## Summary by Action\n\n")
        for a, count in actions.items():
            f.write(f"- **{a}**: {count}\n")
        f.write("\n")
        
        f.write("## Detailed Results\n\n")
        f.write("| ID | Verdict | Action | Issues |\n")
        f.write("| --- | --- | --- | --- |\n")
        for res in results:
            issues_str = ", ".join(res["issues"]) if res["issues"] else "None"
            f.write(f"| {res['id']} | {res['verdict']} | {res['action']} | {issues_str} |\n")
```

- [ ] **Step 4: Execute the script and verify**

Run: `python tools/storybuilder/validate_timeline_review.py`
Verify: `.omx/reports/timeline-state-validation-current.jsonl` exists and has data.
Verify: `.omx/reports/timeline-state-validation-current.md` exists and has report.

---
