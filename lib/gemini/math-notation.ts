// How generated questions write maths (#75). Slide text from a PDF loses superscripts and splits
// formulas, and models then spell symbols out ("E union F intersect G", "P(Ac)"). Every Mode's
// generator instructions end with this rule so questions show real symbols.
// Pure: no imports, so scripts that load the generators with plain Node can load it.

export const MATH_NOTATION_RULE = `

MATH NOTATION
- When a question, statement, option, definition or hint contains a formula or set expression, write it with Unicode math symbols, the way a textbook prints it, never spelled out in words: "(E ∪ F) ∩ G = (E ∩ G) ∪ (F ∩ G)", "A ∩ B = ∅", "P(Aᶜ) = 1 − P(A)", "P(A | B) = P(A ∩ B) / P(B)", "0 ≤ P(A) ≤ 1", "x ∈ S", "A ⊆ B", "Σᵢ P(Aᵢ)", "n → ∞", "x²", "√n", "≠", "≈", "⇒", "⇔". BAD: "(E union F) intersect G", "P(Ac)", "A intersect B equals the empty set", "x^2", "\\cup", "$A \\cap B$".
- Rebuild symbols the extracted text lost: a complement written "Ac", "A^c" or with a stray "c" or "′" line is "Aᶜ" (or "A′" if the page uses primes); "A1, A2" are "A₁, A₂"; "Xn ... i=1" is "Σᵢ₌₁ⁿ".
- No LaTeX, no $ signs, no backslashes.
- Plain words stay words when the sentence is about the idea, not a formula: "The union of A and B contains outcomes in either set" is fine.
- Answers the student must type stay typeable words or numbers, as your other rules say; put symbols in the question, not in a typed answer.`;
