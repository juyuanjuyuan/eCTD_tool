#!/bin/bash
# ============================================================
# eCTD Tool - Prepare util/ Directory Files
#
# Copies DTD, Schema, XSL, and valid-values files from the
# reference package to the backend's eCTD util structure.
#
# Usage:
#   ./scripts/prepare-util-files.sh
# ============================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

REFERENCE_BASE="$PROJECT_DIR/reference/eCTD技术规范V1.1附件包"
UTIL_DIR="$PROJECT_DIR/backend/ectd-util"

echo "Preparing eCTD util directory structure..."

# Create target directories
mkdir -p "$UTIL_DIR/dtd"
mkdir -p "$UTIL_DIR/style"

# ---- DTD Files ----
DTD_SOURCE="$REFERENCE_BASE/附件2-1：DTD文件"
if [ -d "$DTD_SOURCE" ]; then
  echo "Copying DTD files..."
  cp -v "$DTD_SOURCE/ich-ectd-3-2.dtd" "$UTIL_DIR/dtd/" 2>/dev/null || echo "  Warning: ich-ectd-3-2.dtd not found"
  cp -v "$DTD_SOURCE/ich-stf-v2-2.dtd" "$UTIL_DIR/dtd/" 2>/dev/null || echo "  Warning: ich-stf-v2-2.dtd not found"
else
  echo "Warning: DTD source directory not found: $DTD_SOURCE"
fi

# ---- Schema Files (XSD) ----
SCHEMA_SOURCE="$REFERENCE_BASE/附件2-2：Schema文件"
if [ -d "$SCHEMA_SOURCE" ]; then
  echo "Copying Schema files..."
  cp -v "$SCHEMA_SOURCE/cn-regional-1-0.xsd" "$UTIL_DIR/dtd/" 2>/dev/null || echo "  Warning: cn-regional-1-0.xsd not found"
  cp -v "$SCHEMA_SOURCE/xlink.xsd" "$UTIL_DIR/dtd/" 2>/dev/null || echo "  Warning: xlink.xsd not found"
  cp -v "$SCHEMA_SOURCE/xml.xsd" "$UTIL_DIR/dtd/" 2>/dev/null || echo "  Warning: xml.xsd not found"
else
  echo "Warning: Schema source directory not found: $SCHEMA_SOURCE"
fi

# ---- XSL Stylesheet Files ----
STYLE_SOURCE="$REFERENCE_BASE/附件2-3：XSL文件"
if [ -d "$STYLE_SOURCE" ]; then
  echo "Copying XSL stylesheet files..."
  cp -v "$STYLE_SOURCE/ectd-2-0.xsl" "$UTIL_DIR/style/" 2>/dev/null || echo "  Warning: ectd-2-0.xsl not found"
  cp -v "$STYLE_SOURCE/cn-regional-1-1.xsl" "$UTIL_DIR/style/" 2>/dev/null || echo "  Warning: cn-regional-1-1.xsl not found"
  cp -v "$STYLE_SOURCE/ich-stf-stylesheet-2-3.xsl" "$UTIL_DIR/style/" 2>/dev/null || echo "  Warning: ich-stf-stylesheet-2-3.xsl not found"
  cp -v "$STYLE_SOURCE/ich-stf-stylesheet-2-2a.xsl" "$UTIL_DIR/style/" 2>/dev/null || echo "  Warning: ich-stf-stylesheet-2-2a.xsl not found"
else
  echo "Warning: XSL source directory not found: $STYLE_SOURCE"
fi

# ---- STF Valid Values File ----
STF_SOURCE="$REFERENCE_BASE/附件2-6：STF标签值文件"
if [ -d "$STF_SOURCE" ]; then
  echo "Copying STF valid-values file..."
  cp -v "$STF_SOURCE/valid-values.xml" "$UTIL_DIR/style/" 2>/dev/null || echo "  Warning: valid-values.xml not found"
else
  echo "Warning: STF source directory not found: $STF_SOURCE"
fi

echo ""
echo "util directory prepared at: $UTIL_DIR"
echo "Contents:"
find "$UTIL_DIR" -type f | sort
echo ""
echo "Expected files (10 total):"
echo "  dtd/ich-ectd-3-2.dtd"
echo "  dtd/ich-stf-v2-2.dtd"
echo "  dtd/cn-regional-1-0.xsd"
echo "  dtd/xlink.xsd"
echo "  dtd/xml.xsd"
echo "  style/ectd-2-0.xsl"
echo "  style/cn-regional-1-1.xsl"
echo "  style/ich-stf-stylesheet-2-3.xsl"
echo "  style/ich-stf-stylesheet-2-2a.xsl"
echo "  style/valid-values.xml"
