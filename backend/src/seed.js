// Jàngal — one-shot idempotent seed: LND wallets, on-chain funds, the
// parent→school Lightning channel, and demo schools/students/users/fees.
import { config } from "./config.js";
import { lndSchool, lndParent, newPreimage, hashOf } from "./lnd.js";
import { waitForBitcoind, mine, rpc } from "./bitcoind.js";
import { db, q } from "./db.js";
import { newSchoolNostrKeys } from "./nostr.js";
import { xofToSat, shortId } from "./util.js";

async function ensureWallet(lnd, name) {
  try {
    const info = await lnd.getInfo();
    if (info?.identity_pubkey) return info.identity_pubkey;
  } catch {
    /* wallet not initialized / locked yet */
  }
  const res = await lnd.initWallet(config.lnd.walletPassword);
  if (res?.cipher_seed_mnemonic) {
    console.log(`[seed] ${name} wallet created (regtest demo mnemonic): ${res.cipher_seed_mnemonic.join(" ")}`);
  }
  const info = await lnd.waitReady(120000);
  return info.identity_pubkey;
}

async function fundAndMine(lnd, blocks, label) {
  const addr = (await lnd.newAddress()).address;
  await mine(blocks, addr);
  console.log(`[seed] mined ${blocks} blocks to ${label}`);
}

export async function seed() {
  const mock = process.env.LND_MODE === "mock";
  if (mock) {
    console.log("[seed] LND_MODE=mock — skipping bitcoind/LND bootstrapping");
  } else {
    console.log("[seed] waiting for bitcoind…");
    await waitForBitcoind();

    console.log("[seed] preparing LND wallets…");
    const schoolPub = await ensureWallet(lndSchool, "lnd-school");
    const parentPub = await ensureWallet(lndParent, "lnd-parent");
    console.log(`[seed] school=${schoolPub?.slice(0, 12)}… parent=${parentPub?.slice(0, 12)}…`);

    // mature coinbase for both wallets (101 blocks each)
    await fundAndMine(lndSchool, 101, "lnd-school");
    await fundAndMine(lndParent, 101, "lnd-parent");

    // peer parent -> school (school listens on 9735)
    await lndParent.connectPeer(schoolPub, "lnd-school:9735");
    console.log("[seed] peers connected");

    // open channel parent -> school so the diaspora parent can pay fees
    let haveChannel = false;
    try {
      const chans = await lndParent.listChannels();
      haveChannel = (chans.channels ?? []).some((c) => c.remote_pubkey === schoolPub && c.active);
    } catch { /* none */ }
    if (!haveChannel) {
      await lndParent.openChannel({ pubkey: schoolPub, amountSat: config.lnd.channelAmountSat });
      // confirm the channel with 6 blocks mined to the school's on-chain address
      // (bitcoin-core 27 has no default wallet, so we never call getnewaddress)
      await mine(6, (await lndSchool.newAddress()).address);
      console.log(`[seed] channel parent→school opened (${config.lnd.channelAmountSat} sats)`);
    }
  }

  // demo data (idempotent)
  if (!q.schoolById.get("school_mdm")) {
    const mdmKeys = newSchoolNostrKeys();
    const csmKeys = newSchoolNostrKeys();
    db.prepare(
      "INSERT INTO schools (id, name, city, district, lnd_alias, nostr_pubkey, nostr_privkey) VALUES (?,?,?,?,?,?,?)"
    ).run("school_mdm", "École Mame Diarra Mbaye", "Dakar", "Médina", "jangal-school-mdm", mdmKeys.pubkey, mdmKeys.privkeyHex);
    db.prepare(
      "INSERT INTO schools (id, name, city, district, lnd_alias, nostr_pubkey, nostr_privkey) VALUES (?,?,?,?,?,?,?)"
    ).run("school_csm", "Cours Sainte-Marie (annexe Ouakam)", "Dakar", "Ouakam", "jangal-school-csm", csmKeys.pubkey, csmKeys.privkeyHex);

    const insUser = db.prepare(
      "INSERT INTO users (id, role, name, locale, city, country, school_id, demo_code) VALUES (?,?,?,?,?,?,?,?)"
    );
    insUser.run("u_parent", "parent", "Ousmane Diop", "fr", "Paris", "France", null, "1111");
    insUser.run("u_family", "family", "Aïda Diop", "wo", "Dakar", "Sénégal", null, "2222");
    insUser.run("u_school_mdm", "school", "Mame Diarra Mbaye — secretariat", "fr", "Dakar", "Sénégal", "school_mdm", "3333");
    insUser.run("u_school_csm", "school", "Cours Sainte-Marie — secretariat", "fr", "Dakar", "Sénégal", "school_csm", "4444");

    const insStudent = db.prepare(
      "INSERT INTO students (id, name, class_level, school_id, guardian_user_id) VALUES (?,?,?,?,?)"
    );
    insStudent.run("s_mariama", "Mariama Diop", "CM2", "school_mdm", "u_parent");
    insStudent.run("s_ibrahima", "Ibrahim Diop", "6ème", "school_mdm", "u_parent");
    insStudent.run("s_aminata", "Aminata Sow", "CE1", "school_csm", "u_parent");
    console.log("[seed] demo schools, users and students created");
  }

  // one demo fee awaiting payment
  if (!q.feesBySchool.all("school_mdm").some((f) => f.term.includes("Trimestre 1"))) {
    const fee = {
      id: shortId("fee"),
      school_id: "school_mdm",
      student_id: "s_mariama",
      term: "Trimestre 1 2026-2027",
      class_level: "CM2",
      amount_xof: 45000,
      amount_sat: xofToSat(45000),
      memo: "Frais de scolarité — Trimestre 1",
      status: "awaiting_payment",
      r_hash: "",
      preimage: "",
      payment_request: "",
      expires_at: new Date(Date.now() + config.fees.expirySeconds * 1000).toISOString(),
    };
    const preimage = newPreimage();
    fee.preimage = preimage;
    fee.r_hash = hashOf(preimage);
    const inv = await lndSchool.addHodlInvoice({
      memo: `Jàngal — ${fee.memo} — ${fee.id}`,
      amountSat: fee.amount_sat,
      hashHex: fee.r_hash,
      expirySeconds: config.fees.expirySeconds,
    });
    fee.payment_request = inv.payment_request;
    q.insertFee.run(fee);
    console.log(`[seed] demo fee ${fee.id} created (${fee.amount_xof} XOF ≈ ${fee.amount_sat} sats)`);
  }

  console.log("[seed] done ✔");
}

// run directly: node src/seed.js
if (process.argv[1]?.endsWith("seed.js")) {
  seed()
    .then(() => process.exit(0))
    .catch((e) => {
      console.error("[seed] FAILED:", e.message);
      process.exit(1);
    });
}
