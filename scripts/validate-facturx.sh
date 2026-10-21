#!/usr/bin/env bash
# Valide des factures électroniques avec les outils de référence :
#   - XML : schéma XSD Factur-X EN 16931, Schematron EN 16931, règles françaises de la réforme (BR-FR, flux 2) ;
#   - PDF : conformité PDF/A-3B (veraPDF).
# Usage : scripts/validate-facturx.sh facture.pdf|facture.xml [...]
# Prérequis : Java 11+, xmllint, Python 3, curl. Les outils sont téléchargés une fois dans ~/.cache/facturx-tools.
set -euo pipefail
T="${FACTURX_TOOLS:-$HOME/.cache/facturx-tools}"
mkdir -p "$T"
if [ ! -f "$T/saxon.jar" ]; then
  curl -fsSL -o "$T/saxon.jar" https://repo.maven.apache.org/maven2/net/sf/saxon/Saxon-HE/9.9.1-8/Saxon-HE-9.9.1-8.jar
fi
if [ ! -d "$T/xsd" ]; then
  (cd "$T" && python3 -m pip download "factur-x==7.7" --no-deps -d dl -q)
  python3 -I -c "import zipfile,glob,sys; zipfile.ZipFile(glob.glob('$T/dl/*.whl')[0]).extractall('$T/whl')"
  mv "$T/whl/facturx/xsd_and_schematron" "$T/xsd"
fi
if [ ! -x "$T/verapdf/verapdf" ]; then
  curl -fsSL -o "$T/vera.zip" https://software.verapdf.org/releases/1.28/verapdf-greenfield-1.28.2-installer.zip
  python3 -I -c "import zipfile; zipfile.ZipFile('$T/vera.zip').extractall('$T/vera-inst')"
  printf "INSTALL_PATH=%s\n" "$T/verapdf" > "$T/vera.properties"
  java -jar "$T"/vera-inst/*/verapdf-izpack-installer-*.jar -options "$T/vera.properties" >/dev/null 2>&1
fi
X="$T/xsd"
status=0
for f in "$@"; do
  echo "== $f"
  xml="$f"
  if [[ "$f" == *.pdf ]]; then
    if "$T/verapdf/verapdf" -f 3b --format xml "$f" 2>/dev/null | grep -q 'isCompliant="true"'; then echo "  PDF/A-3B : conforme"; else echo "  PDF/A-3B : NON conforme"; status=1; fi
    xml="$(mktemp --suffix=.xml)"
    python3 -I - "$f" "$xml" <<'PY'
import re, sys, zlib
data = open(sys.argv[1], "rb").read()
# Fichier joint factur-x.xml : flux de l'EmbeddedFile, compressé (FlateDecode)
for m in re.finditer(rb"/Type\s*/EmbeddedFile.*?stream\r?\n(.*?)endstream", data, re.S):
    try:
        x = zlib.decompress(m.group(1))
    except zlib.error:
        x = m.group(1)
    if b"CrossIndustryInvoice" in x:
        open(sys.argv[2], "wb").write(x); break
else:
    sys.exit("  aucun XML Factur-X joint")
PY
  fi
  if xmllint --noout --schema "$X/facturx-en16931/Factur-X_EN16931.xsd" "$xml" 2>/dev/null; then echo "  XSD EN 16931 : valide"; else echo "  XSD EN 16931 : INVALIDE"; status=1; fi
  for s in facturx-en16931/FACTUR-X_EN16931.xslt cii-schematron-fr-ctc/BR-FR-Flux2-Schematron-CII.xslt; do
    out="$(mktemp)"
    java -jar "$T/saxon.jar" -s:"$xml" -xsl:"$X/$s" -o:"$out" 2>/dev/null
    n=$(grep -c "<svrl:failed-assert" "$out" || true)
    echo "  Schematron ${s%%/*} : $n échec(s)"
    [ "$n" = "0" ] || { grep -o '<svrl:text>[^<]*' "$out" | sed 's/<svrl:text>/    - /' | head -5; status=1; }
  done
done
exit $status
