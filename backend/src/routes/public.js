// Jàngal — PUBLIC receipt verifier (no auth).
//
// Anyone holding a receipt link (fee id) can independently verify the full
// trust chain, with zero personal data exposed:
//
//   1. nostr_signature   — the Nostr event signature verifies (id+pubkey+sig)
//   2. school_key        — the signing key is the school's registered key
//   3. payment_hash      — the receipt anchors the actual Lightning payment hash
//   4. fee_settled       — the fee really reached `settled` in the ledger
//   5. evidence_anchored — the AI-verdict photo hash recorded at upload is the
//                          same hash that was anchored in the receipt at settle
//   6. evidence_intact   — sha256(the photo on disk today) == that anchored
//                          hash — i.e. the evidence was never swapped
//
// If any link breaks, the page says so in red. That is the point: tamper
// evidence, not trust in the operator.
import crypto from "node:crypto";
import fs from "node:fs";
import { q } from "../db.js";
import { verifyReceiptEvent } from "../nostr.js";

function sha256File(p) {
  return crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
}

// Public-safe view of a settled fee's receipt + verification checks.
export function registerPublicRoutes(app) {
  app.get("/api/public/receipt/:feeId", async (req, reply) => {
    const fee = q.feeById.get(req.params.feeId);
    const receipt = q.receiptByFee.get(req.params.feeId);
    if (!fee || !receipt) return reply.code(404).send({ error: "receipt not found" });

    const event = JSON.parse(receipt.event_json);
    const content = JSON.parse(event.content);
    const proof = q.proofByFee.get(fee.id);
    const school = q.schoolById.get(fee.school_id);

    // --- independent checks (each named, each pass/fail) -------------------
    const signatureValid = verifyReceiptEvent(event);
    const checks = [
      {
        key: "nostr_signature",
        label: "Nostr signature valid",
        pass: signatureValid,
        detail: `kind ${event.kind} · pubkey ${event.pubkey.slice(0, 16)}…`,
      },
      {
        key: "school_key",
        label: "Signed by the school's registered key",
        pass: !!school && school.nostr_pubkey === event.pubkey,
        detail: school ? school.name : "school not found",
      },
      {
        key: "payment_hash",
        label: "Anchors the Lightning payment hash",
        pass: event.tags?.some(([k, v]) => k === "payment_hash" && v === fee.r_hash) ?? false,
        detail: `${fee.r_hash.slice(0, 16)}…`,
      },
      {
        key: "fee_settled",
        label: "Fee settled on the Lightning invoice",
        pass: fee.status === "settled",
        detail: `status: ${fee.status}`,
      },
    ];

    // evidence chain (only when a proof photo exists)
    let evidence = null;
    if (proof) {
      const anchored = content.proofSha256 ?? null;
      const recorded = proof.image_sha256;
      let recomputed = null;
      let filePresent = false;
      try {
        filePresent = fs.existsSync(proof.image_path);
        if (filePresent) recomputed = sha256File(proof.image_path);
      } catch {
        filePresent = false;
      }
      const anchoredMatchesRecorded = !!anchored && anchored === recorded;
      const intact = !!recomputed && recomputed === recorded;
      checks.push(
        {
          key: "evidence_anchored",
          label: "AI evidence hash anchored in the receipt",
          pass: anchoredMatchesRecorded,
          detail: anchored ? `${anchored.slice(0, 16)}…` : "no hash anchored",
        },
        {
          key: "evidence_intact",
          label: "Evidence photo unchanged since settlement (sha256 re-checked)",
          pass: intact,
          detail: filePresent
            ? `${(recomputed ?? "").slice(0, 16)}…`
            : "photo file missing — integrity cannot be proven",
        }
      );
      evidence = {
        verdict: proof.verdict,
        confidence: proof.confidence,
        model: proof.model,
        anchoredSha256: anchored,
        recomputedSha256: recomputed,
        hashChainIntact: anchoredMatchesRecorded && intact,
      };
    }

    // Public-safe payload: masked student initials (as in the receipt
    // content), school name, amounts — never full names or accounts.
    return {
      app: "jangal",
      v: 1,
      feeId: fee.id,
      receipt: {
        eventId: receipt.nostr_event_id,
        npub: content.schoolNpub,
        studentMasked: content.student,
        school: content.school,
        classLevel: content.classLevel,
        term: content.term,
        amountXof: content.amountXof,
        amountSat: content.amountSat,
        paymentHash: fee.r_hash,
        settledAt: content.settledAt,
      },
      signatureValid,
      allChecksPassed: checks.every((c) => c.pass),
      checks,
      evidence,
    };
  });
}
