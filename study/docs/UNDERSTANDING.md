# The Breakpoint model: a measure of how well a concept is understood

Status: built (`server/understanding.js`, tests in `test/understanding.test.js`). It decides the topic colours and the Weakspots priority.

## 1. What "understood" means here

You understand a concept when you can rebuild the chain of reasoning on your own, on a question you haven't seen before, a while after you last studied it. A chain breaks at a particular link, and *which* link breaks says what kind of understanding is missing. Study Desk already records that link: it is the step you mark with **Broke here**.

The model splits understanding into three layers, each a link type in the chain:

| Layer | Question it answers | Shows up as |
|---|---|---|
| **Why** (conceptual) | Do you know which principle governs this, and why? | teach-backs; breaks tagged *concept gap* or *wrong governing equation*; sub-topics of kind concept, derivation, assumption |
| **How** (procedural) | Can you set the method up correctly? | checkpoint steps reached; breaks tagged *sign convention* or *boundary condition*; sub-topics of kind method; mock marks |
| **Do** (execution) | Can you carry it through to the right number? | right final answers; breaks tagged *units*, *algebra/calculus slip*, *misread question* |

A concept is only as understood as its weakest layer. A perfect explanation with unit slips every time will still lose marks, and so will correct arithmetic with no idea why the method works.

## 2. Evidence

Every action you take in the app becomes one or more pieces of evidence *e*. Each has a layer *ℓ*, an outcome *y* ∈ [0, 1] (1 = it held, 0 = it broke), a weight *w*, and a time *t*.

| Action | Evidence produced |
|---|---|
| Teach-back scored *s*/5 with *g* gaps | Why: y = s/5, w = 1.5. Each gap: Why, y = 0, w = 0.3 (at most 3 gaps). |
| Checked answer, **wrong**, broke at step *k* of *n* | Steps 1…k−1: y = 1 on each step's layer, w = 0.5 each (you rebuilt them). Step k: y = 0 on the layer of the mistake you named, w = 1. Steps after k: **no evidence**: you never reached them, so they say nothing either way. |
| Checked answer, **right** | Do: y = 1, w = 1. How: y = 1, w = 0.8. Why: y = 1, w = 0.6 (a right number can come from pattern-matching, so it says least about *why*). |
| Checked answer, didn't match, not yet marked | y = 0 on all three layers, w = 0.3 each (something broke, place unknown). |
| Checkpoint disputed | No evidence. |
| Mock answer, fraction *f* of its marks | How and Do: y = f, w = 0.8. |
| Self-rating of a sub-topic (solid / shaky / stuck = 0.9 / 0.5 / 0.1) | On the sub-topic's layer: y = rating, w = 0.6 × **κ** (your calibration, §4). |

## 3. Weighting: difficulty, transfer and forgetting

Each weight is adjusted before it counts:

**Difficulty.** Let d = clamp(marks / 10, 0.5, 2).

  w_success ← w · √d    w_failure ← w / √d

Holding up on a hard question tells you more than holding up on an easy one, and breaking on an easy question tells you more than breaking on a hard one.

**Transfer.** The *r*-th success on the same question (r = 0 for the first) counts w / (1 + r). Re-solving a question you have already seen proves less than solving a new one. Failures are never discounted.

**Forgetting.** Each layer has a half-life

  h_ℓ = 10 days × (1 + S_ℓ)

where S_ℓ is the number of that layer's successes that are at least 2 days apart (spaced practice makes understanding last). Evidence from Δt days ago is weighted

  w ← w · 2^(−Δt / h_ℓ)

so understanding you don't use fades, and fades more slowly the more spaced practice you've done.

## 4. Calibration: how far to trust your own ratings

For the sub-topics in a unit that have both a self-rating *a_i* and objective evidence *o_i* (their layer posterior from everything except the self-rating):

  κ = clamp(1 − mean |a_i − o_i|, 0.2, 1)    (κ = 0.7 when there is nothing to compare yet)

If your "solid" ratings keep breaking in Check answer, your ratings count for less. If they hold up, they count for more. The app can show κ to you as "how well you know what you know".

## 5. Each layer's estimate

Starting from a neutral prior Beta(1, 1), each layer pools its weighted evidence:

  α_ℓ = 1 + Σ w·y    β_ℓ = 1 + Σ w·(1 − y)

  p_ℓ = α_ℓ / (α_ℓ + β_ℓ)    (best estimate)

  lo_ℓ = p_ℓ − 1.28 · √( p_ℓ(1 − p_ℓ) / (α_ℓ + β_ℓ + 1) )    (the value you can be 90% sure it's above)

A single lucky answer moves p a little, but barely moves lo. Only repeated, spaced, varied evidence raises lo.

## 6. Understanding: the weakest link, softly

The layers combine through a weighted power mean with a strongly negative exponent, which behaves like "the minimum, but not blind to the others":

  U = ( Σ_ℓ λ_ℓ · p_ℓ^(−4) )^(−1/4)    λ_why = 0.40, λ_how = 0.35, λ_do = 0.25

U_lo is the same formula with lo_ℓ in place of p_ℓ. The **bottleneck** is the layer with the largest term λ_ℓ · p_ℓ^(−4).

**Sub-topics to topic.** A topic's U is the power mean (exponent −2, gentler) of its sub-topics' U, together with the topic's own direct evidence. A sub-topic with no evidence enters at the prior (0.5, very uncertain), so it pulls U_lo down until it has been tried.

## 7. What the student sees

For every topic and sub-topic:

- **Understanding U** (0–100) and the **confidence floor U_lo**.
- **Colour:** green when U_lo ≥ 0.60; red when U < 0.40 or nothing has been tried; amber otherwise. (0.60 was set by running study scenarios through the model: a teach-back plus 4 different past-paper questions over two weeks reaches it; one lucky answer, or the same question solved five times, does not. At 0.70 it took about 7 answers.)
- **The bottleneck layer**, in words: "You know why, you can set it up, but the arithmetic breaks (units)."
- **Lasts about N days:** when U_lo, at the current half-lives, will fall below 0.60.
- **Best next step:** the action that would raise U_lo the most.
  - Bottleneck **Why**: teach it back.
  - Bottleneck **How**: a new past-paper question in Check answer.
  - Bottleneck **Do**: a timed question, checking units at every line.
  - **Little evidence of any kind**: try anything, because uncertainty is what's holding U_lo down.

## 8. Worked example: EMM 318 Couplings

- Yesterday: teach-back 3/5 with 2 gaps.
- Two days ago: a wrong answer on a 10-mark question, broken at step 3 of 5 with *units*.
- Today: a right answer on a different paper's 10-mark question.
- No self-rating yet.

Before forgetting (everything is recent, so the decay is under 10%), and assuming steps 1–2 were Why and How:

| Layer | α | β | p |
|---|---|---|---|
| Why | 1 + 0.9 (teach) + 0.5 (step 1) + 0.6 (right) = 3.0 | 1 + 0.6 (teach) + 0.6 (2 gaps) = 2.2 | 0.58 |
| How | 1 + 0.5 (step 2) + 0.8 (right) = 2.3 | 1.0 | 0.70 |
| Do | 1 + 1.0 (right) = 2.0 | 1 + 1.0 (units break) = 2.0 | 0.50 |

U = (0.40·0.58⁻⁴ + 0.35·0.70⁻⁴ + 0.25·0.50⁻⁴)^(−1/4) = (3.54 + 1.46 + 4.00)^(−1/4) ≈ **0.58**, so **amber**.

The bottleneck is **Do** (units). The next step: one timed coupling question, units checked at every line. A plain average of the three layers would say 0.59 and hide that the units slip is what's costing marks. The old rule would say "teach-back below 4/5" and send you to explain it again.

## 9. What is new, and what isn't

Known ideas it builds on:
- Bayesian evidence pooling (Beta–Bernoulli).
- Forgetting with a half-life that spaced practice lengthens (Ebbinghaus; Duolingo's half-life regression; FSRS).
- Layered kinds of knowing (Bloom; conceptual vs procedural knowledge).
- Metacognitive calibration.

What I believe is new:
1. **The broken step as right-censored, layer-typed evidence.** The steps before the break count for you, the break counts against one specific layer, and the steps after it count neither way.
2. **Asymmetric difficulty weighting**, together with **discounting repeat successes but never repeat failures**.
3. **Self-ratings weighted by measured calibration κ**, learned from your own record.
4. **A weakest-link power mean judged on a credible lower bound**, so "understood" means *reliably* understood, not lucky once.

I haven't found this combination in a study tool or a knowledge-tracing paper, but I can't prove no one has ever done it.

## 10. Fit with the app

- **New module:** `server/understanding.js`, pure functions with tests, using the data already stored. No new data is needed.
- **Topic colours** come from U_lo instead of the old fixed checklist (teach-back 4/5, 2 questions at 70%, sub-topics solid, no breaks this week).
- **The chip panel** (Units) shows U, the three links as bars (estimate and floor), the bottleneck and the next step.
- **Weakspot priority** is exam weight × (1 − the sub-topic's U_lo).
- **Tests:** the worked example above becomes a test, along with cases for censoring, repeats, decay and calibration.
