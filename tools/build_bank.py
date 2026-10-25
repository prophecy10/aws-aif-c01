"""Build data/questions.json and data/cards.json from the editable sources, and check every question.

Question sources: tools/staging/*.json — each file is a JSON array of questions:

  single  {"id": "2.1-07", "task": "2.1", "type": "single", "difficulty": "easy|medium|hard",
           "q": "...", "options": [4 strings], "answer": 1, "notes": [4 strings, why each option is right/wrong],
           "explain": "...", "ref": "where to verify (AWS docs page / exam guide skill)"}
  multi   same, with 5+ options, "answer": [0, 3] (2+ indices) and "Select TWO." (or THREE) in the question
  order   "options": steps already in the CORRECT order (the app shuffles them); no "answer" or "notes"
  match   "prompts": [3-7 strings], "options": [responses], "answer": [option index for each prompt]

Card sources: tools/cards/*.json — {"1.1": [{"t": title, "b": body, "x": exam trap (optional)}], ...}

Usage:  python tools/build_bank.py          build + validate (exit code 1 on any error)
        python tools/build_bank.py --check  validate only, write nothing
"""
import collections
import glob
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA = os.path.join(ROOT, "data")
TAX = json.load(open(os.path.join(DATA, "_taxonomy.json"), encoding="utf-8"))
TASKS = TAX["tasks"]
WATCH = TAX["out_of_scope_watch"]["names"]
COUNT_WORDS = {2: "TWO", 3: "THREE", 4: "FOUR"}
BANNED = re.compile(r"\b(all|none) of the above\b|\bboth [a-e] and [a-e]\b|\b[a-e] and [a-e] only\b", re.I)
ID_RE = re.compile(r"^[1-5]\.[1-4]-\d{2,3}$")

errors, warnings = [], []


def err(qid, msg):
    errors.append(f"{qid}: {msg}")


def warn(qid, msg):
    warnings.append(f"{qid}: {msg}")


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def check_strings(qid, label, items):
    if not isinstance(items, list) or not all(isinstance(x, str) and x.strip() for x in items):
        err(qid, f"{label} must be a list of non-empty strings")
        return False
    if len({norm(x) for x in items}) != len(items):
        err(qid, f"duplicate entries in {label}")
    return True


def validate(q, src):
    qid = q.get("id", f"<no id in {src}>")
    for k in ("id", "task", "type", "difficulty", "q", "options", "explain"):
        if k not in q:
            err(qid, f"missing '{k}'")
    if errors and errors[-1].startswith(f"{qid}: missing"):
        return
    if not ID_RE.match(qid):
        err(qid, "id must look like 2.1-07")
    if q["task"] not in TASKS:
        err(qid, f"unknown task {q['task']}")
    elif not qid.startswith(q["task"] + "-"):
        err(qid, f"id prefix does not match task {q['task']}")
    if q["difficulty"] not in ("easy", "medium", "hard"):
        err(qid, "difficulty must be easy, medium or hard")
    if len(q["explain"].strip()) < 40:
        err(qid, "explanation is too short to teach anything")
    if not q.get("ref"):
        warn(qid, "no 'ref' (where to verify)")
    t, opts = q["type"], q["options"]
    if not check_strings(qid, "options", opts):
        return
    blob = " ".join([q["q"]] + opts + q.get("prompts", []))
    if BANNED.search(blob):
        err(qid, "uses an 'all/none of the above' or 'A and B' style option")

    if t == "single":
        if len(opts) != 4:
            err(qid, "single-answer questions need exactly 4 options")
        if not isinstance(q.get("answer"), int) or not 0 <= q["answer"] < len(opts):
            err(qid, "answer must be an option index")
        notes_ok(q, qid)
    elif t == "multi":
        a = q.get("answer")
        if len(opts) < 5:
            err(qid, "multiple-response questions need 5 or more options")
        if not isinstance(a, list) or len(a) < 2 or len(set(a)) != len(a) or not all(isinstance(i, int) and 0 <= i < len(opts) for i in a):
            err(qid, "answer must be a list of 2+ distinct option indices")
        else:
            word = COUNT_WORDS.get(len(a))
            if not word or f"Select {word}." not in q["q"]:
                err(qid, f"question must end with 'Select {word}.' to match {len(a)} answers")
            q["answer"] = sorted(a)
        notes_ok(q, qid)
    elif t == "order":
        if not 3 <= len(opts) <= 5:
            err(qid, "ordering questions need 3 to 5 steps")
        if "answer" in q and q["answer"] != list(range(len(opts))):
            err(qid, "for ordering, list the options in the correct order and leave out 'answer'")
        q["answer"] = list(range(len(opts)))
        if "notes" in q:
            err(qid, "ordering questions do not take per-option notes")
    elif t == "match":
        p, a = q.get("prompts"), q.get("answer")
        if not check_strings(qid, "prompts", p or []):
            return
        if not 3 <= len(p) <= 7:
            err(qid, "matching questions need 3 to 7 prompts")
        if len(opts) < len(p):
            err(qid, "matching needs at least as many options as prompts")
        if not isinstance(a, list) or len(a) != len(p) or not all(isinstance(i, int) and 0 <= i < len(opts) for i in a):
            err(qid, "answer must give one option index per prompt")
        elif len(set(a)) != len(a):
            err(qid, "each option may be the answer for only one prompt")
        if "notes" in q:
            err(qid, "matching questions do not take per-option notes")
    else:
        err(qid, f"unknown type {t}")

    # A correct answer that leans on a service the v1.1 guide does not list
    correct_text = " ".join(opts[i] for i in (q["answer"] if isinstance(q.get("answer"), list) else [q.get("answer", 0)]) if isinstance(i, int) and i < len(opts))
    for name in WATCH:
        if name.lower() in (q["q"] + " " + correct_text).lower():
            warn(qid, f"mentions '{name}', which v1.1 does not list as in scope")


def notes_ok(q, qid):
    n = q.get("notes")
    if not isinstance(n, list) or len(n) != len(q["options"]) or not all(isinstance(x, str) and len(x.strip()) >= 15 for x in n):
        err(qid, "notes must give one real sentence per option")


def build_questions():
    files = sorted(glob.glob(os.path.join(ROOT, "tools", "staging", "*.json")))
    out, ids, texts = [], {}, {}
    for f in files:
        src = os.path.basename(f)
        try:
            batch = json.load(open(f, encoding="utf-8"))
        except json.JSONDecodeError as e:
            errors.append(f"{src}: invalid JSON ({e})")
            continue
        for q in batch:
            validate(q, src)
            qid = q.get("id")
            if qid in ids:
                err(qid, f"duplicate id (also in {ids[qid]})")
            ids[qid] = src
            key = norm(q.get("q", ""))
            if key in texts:
                err(qid, f"same question text as {texts[key]}")
            texts[key] = qid
            if q.get("task") in TASKS:
                q["domain"] = TASKS[q["task"]]["domain"]
            out.append(q)
    out.sort(key=lambda q: (q.get("task", ""), int(q.get("id", "0-0").split("-")[-1]) if q.get("id", "").split("-")[-1].isdigit() else 0))
    order = ["id", "domain", "task", "type", "difficulty", "q", "prompts", "options", "answer", "notes", "explain", "ref"]
    return [{k: q[k] for k in order if k in q} for q in out]


def report(qs):
    by_task = collections.Counter(q["task"] for q in qs)
    by_dom = collections.Counter(q["domain"] for q in qs)
    types = collections.Counter(q["type"] for q in qs)
    diff = collections.Counter(q["difficulty"] for q in qs)
    total = len(qs)
    print(f"\n{total} questions · types {dict(types)} · difficulty {dict(diff)}")
    print("\nDomain  weight  have  share")
    for d, info in TAX["domains"].items():
        print(f"  D{d}    {info['weight']:>3}%   {by_dom[d]:>4}  {by_dom[d] / max(total, 1) * 100:5.1f}%")
    print("\nTask  have/target")
    cov = {}
    for k, t in TASKS.items():
        flag = "" if by_task[k] >= t["target"] else "  ← below target"
        print(f"  {k}  {by_task[k]:>3}/{t['target']:<3} {t['name']}{flag}")
        cov[k] = {"have": by_task[k], "target": t["target"]}

    # Guessability checks on single-answer questions
    singles = [q for q in qs if q["type"] == "single"]
    if singles:
        longest = sum(1 for q in singles if len(q["options"][q["answer"]]) > max(len(o) for i, o in enumerate(q["options"]) if i != q["answer"]))
        pos = collections.Counter(q["answer"] for q in singles)
        share = longest / len(singles) * 100
        print(f"\nCorrect option is the strictly longest in {longest}/{len(singles)} single-answer questions ({share:.0f}%; a random option would be ~25%).")
        print(f"Answer positions in the source (the app shuffles anyway): {dict(sorted(pos.items()))}")
        if share > 35:
            warnings.append(f"BANK: correct answer is the longest option {share:.0f}% of the time; even out option lengths")
    return cov


def build_cards():
    cards = collections.defaultdict(list)
    for f in sorted(glob.glob(os.path.join(ROOT, "tools", "cards", "*.json"))):
        src = os.path.basename(f)
        for task, items in json.load(open(f, encoding="utf-8")).items():
            if task not in TASKS:
                errors.append(f"{src}: unknown task {task}")
                continue
            for c in items:
                if not c.get("t") or not c.get("b"):
                    errors.append(f"{src} {task}: card needs 't' and 'b'")
                cards[task].append({k: c[k] for k in ("t", "b", "x") if c.get(k)})
    return {"tasks": {k: cards[k] for k in TASKS if cards.get(k)}}


def main():
    check_only = "--check" in sys.argv
    qs = build_questions()
    cards = build_cards()
    cov = report(qs)
    print(f"\n{sum(len(v) for v in cards['tasks'].values())} study cards in {len(cards['tasks'])} task statements")
    for w in warnings:
        print("WARN ", w)
    for e in errors:
        print("ERROR", e)
    if errors:
        print(f"\n{len(errors)} error(s); nothing written.")
        sys.exit(1)
    if not check_only:
        meta = {"exam": "AIF-C01", "guide_version": TAX["exam"]["guide_version"], "count": len(qs)}
        with open(os.path.join(DATA, "questions.json"), "w", encoding="utf-8") as fh:
            json.dump({**meta, "questions": qs}, fh, ensure_ascii=False, separators=(",", ":"))
        with open(os.path.join(DATA, "cards.json"), "w", encoding="utf-8") as fh:
            json.dump(cards, fh, ensure_ascii=False, indent=1)
        with open(os.path.join(DATA, "_coverage.json"), "w", encoding="utf-8") as fh:
            json.dump({"total": len(qs), "tasks": cov}, fh, indent=1)
        print("\nWrote data/questions.json, data/cards.json, data/_coverage.json")


if __name__ == "__main__":
    main()
