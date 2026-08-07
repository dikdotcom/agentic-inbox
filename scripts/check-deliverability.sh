#!/usr/bin/env bash
# Check email deliverability records for a domain (SPF / DMARC / DKIM).
# Useful after enabling DKIM in the Cloudflare dashboard (Email → Email
# Routing → Settings → DKIM).
#
# Usage: bash scripts/check-deliverability.sh dika.my.id
set -uo pipefail

DOMAIN="${1:-dika.my.id}"
ok="✅"; bad="❌"; warn="⚠️"

echo "== Deliverability check for $DOMAIN =="
echo ""

# SPF
SPF=$(dig +short TXT "$DOMAIN" | tr -d '"' | grep -i '^v=spf1' || true)
if [ -n "$SPF" ]; then echo "$ok SPF: $SPF"; else echo "$bad SPF: missing (add TXT v=spf1 include:_spf.mx.cloudflare.net ~all)"; fi

# DMARC
DMARC=$(dig +short TXT "_dmarc.$DOMAIN" | tr -d '"' | grep -i '^v=DMARC1' || true)
if [ -n "$DMARC" ]; then echo "$ok DMARC: $DMARC"; else echo "$warn DMARC: missing (p=none first, then p=quarantine)"; fi

# DKIM (try common selectors)
echo "-- DKIM --"
found=0
for s in default google cf2024 cf2023 cf2025 k1 s1 s2 mail smtp; do
  val=$(dig +short TXT "${s}._domainkey.${DOMAIN}" | tr -d '"' | grep -i '^v=DKIM1' || true)
  if [ -n "$val" ]; then
    echo "$ok ${s}._domainkey present (len ${#val})"
    found=1
  fi
done
if [ "$found" = "0" ]; then
  echo "$bad No DKIM record found. Gmail/Outlook may reject or spam-filter mail."
  echo "   Fix: Cloudflare dashboard → $DOMAIN → Email → Email Routing → Settings → enable DKIM (Cloudflare auto-adds the record)."
fi

echo ""
echo "Tip: Gmail can still land new-sender mail in Spam for a while — mark 'Not spam' to build reputation."