#!/usr/bin/env bash
set -euo pipefail

OUT_DIR="${1:-tools/keys}"
mkdir -p "$OUT_DIR"

PRIVATE_KEY="$OUT_DIR/private.pem"
PUBLIC_KEY="$OUT_DIR/public.pem"

if [[ -f "$PRIVATE_KEY" || -f "$PUBLIC_KEY" ]]; then
  echo "[ERROR] key files already exist in $OUT_DIR. Remove them first if you want to regenerate." >&2
  exit 1
fi

openssl genpkey -algorithm RSA -out "$PRIVATE_KEY" -pkeyopt rsa_keygen_bits:2048
openssl rsa -pubout -in "$PRIVATE_KEY" -out "$PUBLIC_KEY"

chmod 600 "$PRIVATE_KEY"
chmod 644 "$PUBLIC_KEY"

echo "[OK] RSA key pair generated:"
echo "  private: $PRIVATE_KEY"
echo "  public : $PUBLIC_KEY"
