#!/bin/bash
# Jàngal demo video — voiceover generation (TTS, voice: jam, tightened for ~3:00)
set -e
cd "$(dirname "$0")"
mkdir -p vo

declare -A VO
VO[s01]="In Senegal, school fees are a family's biggest expense after food, paid largely by the diaspora, through middlemen and cash. Receipts can be faked. And money sent for school does not always become school."
VO[s02]="One command boots the whole stack. The app, the wallets, and a payment channel from Paris to Dakar, opened automatically."
VO[s03]="At the school, the secretary just pastes the fee note. The AI reads the class, the term, and the amount. Forty five thousand francs, about fifty three thousand sats."
VO[s04]="Ousmane pays from Paris. The money locks in a Lightning hold invoice. Not in our app, not in anyone's custody. School fees, or refund."
VO[s05]="Before confirming, the school photographs the enrolment receipt. AI checks it against the fee record, ninety percent match, and the photo's hash is anchored in the receipt. One tap. The school is paid in seconds."
VO[s06]="A Nostr receipt, signed by the school's key, with the proof inside. Even if Jangal disappeared, the proof stays verifiable. And the student's name stays masked."
VO[s07]="And anyone can verify it. No account, no app. The public verifier re-checks the signature, the school key, the payment hash, and re-hashes the evidence photo, live. Watch. I swap the photo behind the scenes, and the verifier catches it, without touching the browser. Tamper evident, not trust me."
VO[s08]="Restore the file, green again. And in Dakar, grandmother Aida follows it all in Wolof."
VO[s09]="If the school never confirms? Reject, instant refund. Or the hold invoice expires, and the money returns to Paris automatically. No custodian. That is Lightning doing escrow."
VO[s10]="Schools get real numbers. Settlement time, refund rate, AI proof coverage. One click to export, on a mid range phone."
VO[s11]="Jangal, Wolof for to educate. Lightning fees, Nostr receipts, AI verified evidence, Wolof UI. One hundred forty eight tests, all passing. Open source. Jerejef!"

order="s01 s02 s03 s04 s05 s06 s07 s08 s09 s10 s11"
for k in $order; do
  if [ ! -s "vo/$k.wav" ]; then
    for attempt in 1 2 3 4 5 6; do
      echo "── generating $k (attempt $attempt)"
      if z-ai tts -i "${VO[$k]}" -o "vo/$k.wav" --voice jam --speed 1.05; then
        break
      fi
      rm -f "vo/$k.wav"; sleep $((attempt * 20))
    done
    [ -s "vo/$k.wav" ] || { echo "FAILED: $k"; exit 1; }
    sleep 8
  fi
done

python3 - <<'PY'
import json, subprocess
order = "s01 s02 s03 s04 s05 s06 s07 s08 s09 s10 s11".split()
d = {}
for k in order:
    out = subprocess.run(["ffprobe","-v","error","-show_entries","format=duration",
                          "-of","csv=p=0",f"vo/{k}.wav"],capture_output=True,text=True).stdout.strip()
    d[k] = round(float(out),3)
json.dump(d, open("vo.json","w"), indent=1)
print(json.dumps(d, indent=1))
print("TOTAL VO:", round(sum(d.values()),1), "s")
PY
