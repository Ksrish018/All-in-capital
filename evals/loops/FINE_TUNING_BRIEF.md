# The Fine-Tuning Brief: Loop 2, the first email

Case 05 hand-in, filled 24 November 2026 after the measurements (PRD 24.5, 24.8 and 24.9).
The decision is **stop**: a better prompt reached the pass mark, so the stop rule says do not train.

## What are we fixing?

| Line | Answer |
|---|---|
| 1. Task | Draft the first email to a founder the fund wants to meet, in Riya's voice. |
| 2. Pass mark | 90% of the sealed test emails pass the three checks (short, one clear ask, no praise without a fact), and no founder type scores below 80%. |
| 3. Baseline today | Our first prompt (`a5-v1`) passed 0 of 20. The old system's drafts in the export passed 12 of 20 (60%). Riya's own emails passed 20 of 20, the ceiling. |

## How do we build it?

| Line | Answer |
|---|---|
| 4. Route | We would train it ourselves on a free notebook (Colab with Unsloth), so the data stays private. Hosting would follow only if it won. The fund has no cloud account and no engineer, which counts against hosting. |
| 5. Base model | A small open model of about 3 billion parameters, trained with LoRA, because Riya waits for the draft in the evening. |
| 6. Data | 56 real pairs, cleaned first: two exact copies and two off-day rows (L2-030, L2-054) removed, with reasons in `cleaning.json`. The input uses the same layout production sends (A5 v2). The output is the two lines the model writes (fact line and question). Synthetic rows were not generated, because training was not needed. |
| 7. Split | 20 sealed test rows across all three founder types (15 software, 3 services, 2 hardware), chosen before any prompt was written and hashed in `split.json`. Of the 36 training rows, 30 are for training and 6 for validation. |

## When do we stop, and is it worth it?

| Line | Answer |
|---|---|
| 8. Stop rule | Stop if the best prompt meets the pass mark. **It did.** A5 v2 passes 18 of 20 (90%) on the sealed test, and every founder type is at 80% or above: software 13 of 15, services 3 of 3, hardware 2 of 2. Its voice score is 90%, the same as Riya's own. |
| 9. Payback | About 100 drafts a month cost a few dollars. Riya sends about 17, which is about 40 minutes of editing today and about 17 minutes if every draft were perfect: around ₹400 a month at ₹1,000 an hour. A GPU host costs $300 to $600 a month. The prompt already gives the quality, so a trained model would add cost and upkeep for no measured gain. |

## Results against the baseline

| | Three checks | Voice | Software | Services | Hardware |
|---|---|---|---|---|---|
| Old system's drafts | 12 of 20 (60%) | 35% | | | |
| Our first prompt (a5-v1) | 0 of 20 (0%) | 0% | 0 of 15 | 0 of 3 | 0 of 2 |
| **Prompt in Riya's voice (a5-v2)** | **18 of 20 (90%)** | **90%** | 13 of 15 | 3 of 3 | 2 of 2 |
| Riya (ceiling) | 20 of 20 (100%) | 90% | | | |

**What changed in A5 v2.** It is written from Riya's 22 edited drafts in the training rows only.
* The model writes two lines: the number that shows customers coming back, framed as rare for the stage, and one sharp question that tests it.
* Code writes the rest: her greeting, one ask with two Tuesday or Thursday slots, the Aditya line for deeptech, and her sign-off.
* Code checks both lines and asks the model again if a line misses. If it still misses, the plain draft goes to Riya with a note saying so.

The two misses on the test set were drafts where the model wrote a number in words. Code caught them and flagged them for Riya, so nothing slipped through silently. We did not tune the prompt on those two rows, because that would leak the test set into the prompt.

**What we spent today on this work:** under $1 of model calls for the email measurements. Nothing on training, because training was not needed.

**What happens next.** The weekly email disagreement score on the Dashboard watches live drafts. If it rises above 10% for two weeks, or a new kind of founder appears and the score spikes, rerun `npm run eval:loops` and reopen this brief. New clean pairs from Riya's edits are the material for that round.
