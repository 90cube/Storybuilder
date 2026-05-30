# Build Timeline Apply Spec Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a script to generate an apply spec JSON and a Markdown report from validated timeline candidates.

**Architecture:** A Python script that reads `.omx/reports/timeline-state-validation-current.jsonl`, filters for approved candidates (action == "approve_timeline_candidate"), limits the batch size to 10, and writes the results to JSON and MD files. It must handle the case where no nodes are approved.

**Tech Stack:** Python 3.13 stdlib (json, datetime, pathlib).

---

### Task 1: Implement build_timeline_apply_spec.py

**Files:**
- Create: `tools/storybuilder/build_timeline_apply_spec.py`

- [ ] **Step 1: Create the script with core logic**

```python
import json
import os
from datetime import datetime
from pathlib import Path

VALIDATION_FILE = Path(".omx/reports/timeline-state-validation-current.jsonl")
OUTPUT_JSON = Path(".omx/reports/timeline-state-apply-spec-current.json")
OUTPUT_MD = Path(".omx/reports/timeline-state-apply-spec-current.md")
MAX_BATCH_SIZE = 10

def load_validation_results(file_path):
    results = []
    if not file_path.exists():
        return results
    with open(file_path, "r", encoding="utf-8") as f:
        for line in f:
            if line.strip():
                results.append(json.loads(line))
    return results

def map_timeline_entry(candidate):
    # This maps LLM review candidate to the final timeline entry shape
    return {
        "era": candidate.get("era", "unknown"),
        "event_refs": [],
        "sequence_range": None,
        "state": candidate.get("state", ""),
        "traits": candidate.get("traits", []),
        "speech_style": candidate.get("speech_style", ""),
        "summary": candidate.get("summary", ""),
        "evidence": [], # Evidence mapping might need audit packets if not in validation.jsonl
        "confidence": 1.0, # Default if not per candidate
        "classification": "TIMELINE_STATE"
    }

def build_apply_spec():
    all_results = load_validation_results(VALIDATION_FILE)
    approved_rows = [r for r in all_results if r.get("action") == "approve_timeline_candidate"]
    
    # Sort by confidence if available, then take first MAX_BATCH_SIZE
    approved_rows.sort(key=lambda x: x.get("confidence", 0), reverse=True)
    batch = approved_rows[:MAX_BATCH_SIZE]
    manual_follow_up = approved_rows[MAX_BATCH_SIZE:]

    items = []
    for row in batch:
        review = row.get("review", {})
        timeline_entries = []
        
        # Collect from candidate_reviews and suggested_new_states
        candidates = review.get("candidate_reviews", []) + review.get("suggested_new_states", [])
        for c in candidates:
            if c.get("keep_as_timeline") or "suggested_new_states" in review:
                 timeline_entries.append(map_timeline_entry(c))
        
        items.append({
            "id": row["id"],
            "action": "append_or_update_timeline",
            "timeline": timeline_entries
        })

    spec = {
        "label": "timeline-state-current",
        "timestamp": datetime.now().isoformat(),
        "source_file": str(VALIDATION_FILE),
        "total_approved": len(approved_rows),
        "max_nodes": MAX_BATCH_SIZE,
        "items": items
    }

    # Ensure output directory exists
    OUTPUT_JSON.parent.mkdir(parents=True, exist_ok=True)

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=2, ensure_ascii=False)
    
    write_markdown_report(spec, manual_follow_up)
    print(f"Generated {OUTPUT_JSON} and {OUTPUT_MD}")

def write_markdown_report(spec, manual_follow_up):
    with open(OUTPUT_MD, "w", encoding="utf-8") as f:
        f.write("# Timeline State Apply Spec Report\n\n")
        f.write(f"- **Timestamp:** {spec['timestamp']}\n")
        f.write(f"- **Total Approved:** {spec['total_approved']}\n")
        f.write(f"- **Batch Size:** {len(spec['items'])}\n")
        f.write(f"- **Max Batch Size:** {spec['max_nodes']}\n\n")
        
        f.write("## Applied in this Spec\n")
        if not spec["items"]:
            f.write("_No approved nodes in this batch._\n")
        else:
            for item in spec["items"]:
                f.write(f"- **{item['id']}**: {len(item['timeline'])} states\n")
        
        if manual_follow_up:
            f.write("\n## Manual Follow-up (Exceeded Batch Limit)\n")
            for row in manual_follow_up:
                f.write(f"- **{row['id']}** (Confidence: {row.get('confidence', 0)})\n")

if __name__ == \"__main__\":
    build_apply_spec()
```

- [ ] **Step 2: Run the script**

Run: `python tools/storybuilder/build_timeline_apply_spec.py`

- [ ] **Step 3: Verify outputs**

Run: `ls .omx/reports/timeline-state-apply-spec-current.*`
Expected: Both .json and .md files exist.

---

### Task 2: Final Verification

- [ ] **Step 1: Check JSON content**
- [ ] **Step 2: Check Markdown content**

---

Plan complete and saved to `docs/superpowers/plans/2026-05-18-build-timeline-apply-spec.md`.

**Approach:** Inline Execution (since it's a single surgical task).
