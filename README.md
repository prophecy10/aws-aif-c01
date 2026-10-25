# AIF-C01 Practice: AWS Certified AI Practitioner

**▶ Open the site: https://prophecy10.github.io/aws-aif-c01/**

A free practice site for the **AWS Certified AI Practitioner (AIF-C01)** exam, built on **exam guide version 1.1** (published 30 April 2026). It works on phone and desktop, installs as an app, and works offline. No sign-up, no ads, and your progress stays in your own browser.

- **358 questions** covering all 14 task statements, weighted like the exam (20 / 24 / 28 / 14 / 14 %).
- **All four exam question types:** multiple choice, multiple response ("Select TWO"), ordering, and matching.
- **Every option explained:** why the right answer is right and why each wrong answer is wrong, with a pointer to the exam guide skill or AWS doc to verify it.
- **v1.1 content included:** agentic AI, MCP and A2A, multi-agent patterns, context engineering, token-based pricing, Amazon Bedrock AgentCore (Gateway, Identity, Policy), Strands Agents, Kiro, Amazon Quick, AWS Transform, Prompt Management, LLM-as-a-judge, model distillation, reinforcement fine-tuning, and hallucination grounding.
- **Exam-style distractors:** wrong options are services the exam actually confuses (Config vs CloudTrail vs Inspector, Model Cards vs AI Service Cards vs Clarify, Macie vs Guardrails PII filters), not obviously unrelated ones.

> Built with [Claude Code](https://claude.com/claude-code), guided and reviewed by the repo owner. Independent study site, not affiliated with or endorsed by Amazon Web Services.

## Sections

| Section | What it does |
|---|---|
| 🗓️ **Today's 10** | 10 questions a day across all five domains, the same set for everyone that day, with a day streak. |
| 🎯 **Exam readiness** | Your last full mocks plotted against the 700 pass mark. It says "ready to book" after two mocks in a row at 800+. |
| 📖 **Study cards** | 93 cards grouped by task statement: the fact, why it matters, and the exam trap to watch for. |
| 📚 **Practice by topic** | Pick a task statement and get up to 20 questions with instant explanations. New questions are served first, so sets do not repeat. |
| ⚡ **Quick test** | 20 questions in 28 minutes, weighted by domain. |
| 📝 **Full mock exam** | 65 questions in 90 minutes, like the real exam. Flag questions, jump around with the question palette, and resume later if you leave. |
| 🏆 **Score report** | Scaled score out of 1000 with PASS/FAIL against 700, and "Meets competencies / Needs improvement" per domain, like the real score report. |
| 🔍 **Answer review** | Every question with your answer and the explanation. Filter to wrong or flagged questions. |
| 🔁 **Mistakes** and ★ **Bookmarks** | Re-practise what you got wrong; a question leaves the list once you answer it correctly. |
| 🎯 **Weak areas** | Accuracy per task statement, weakest first. Tap one to practise it. |
| ⚙️ **Settings** | Set your exam date for a countdown, and back up or restore your progress as a file. |

The scaled score is an estimate (100 + 900 × share correct). The real exam scales scores and includes 15 unscored questions.

## Contributing

Found a wrong answer? Use **Report a mistake** under any explanation, or [open an issue](https://github.com/prophecy10/aws-aif-c01/issues) with the question ID (for example `3.1-08`) and an AWS documentation link.

To add questions:

1. Add them to the right file in `tools/staging/` (one file per task statement). The format is described at the top of `tools/build_bank.py`.
2. Run `python tools/build_bank.py`. It rebuilds `data/` and fails on mistakes such as wrong option counts, duplicate IDs or text, unknown task statements, "all of the above" options, or a "Select TWO" question with the wrong number of answers. It also reports how often the correct answer is the longest option, so answers stay hard to guess.
3. Test locally, then open a pull request.

**Accuracy first:** every answer must be verifiable in the AWS exam guide or AWS documentation.

## Run locally

```bash
python -m http.server 8000
```

Then open http://localhost:8000. Opening `index.html` directly will not work, because the questions load with `fetch()`.

## Project structure

```
├── index.html, css/, js/       # the site (plain HTML/CSS/JS, no build step)
├── sw.js, manifest.webmanifest # offline + install
├── data/
│   ├── _taxonomy.json          # v1.1 domains, task statements, targets
│   ├── questions.json          # generated: do not edit by hand
│   └── cards.json              # generated study cards
└── tools/
    ├── build_bank.py           # builds and validates the bank
    ├── staging/*.json          # editable questions, one file per task statement
    └── cards/*.json            # editable study cards
```

Hosted on GitHub Pages from the `main` branch.

## License

Code: [MIT](LICENSE). Questions, explanations, and cards: [CC BY-SA 4.0](LICENSE-CONTENT). AWS and related names are trademarks of Amazon.com, Inc. or its affiliates.
