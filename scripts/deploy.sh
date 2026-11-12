#!/usr/bin/env bash
# تغليف وتثبيت التطبيق على شاشة سامسونج عبر وضع المطوّر.
# المتطلبات: Tizen Studio (أداتا tizen و sdb في PATH) + ملف شهادة Samsung باسم $CERT_PROFILE
#
# الاستخدام:
#   ./scripts/deploy.sh 192.168.1.50            # تغليف + تثبيت + تشغيل
#   CERT_PROFILE=mycert ./scripts/deploy.sh 192.168.1.50
set -euo pipefail

TV_IP="${1:?اكتب عنوان IP للشاشة، مثال: ./scripts/deploy.sh 192.168.1.50}"
CERT_PROFILE="${CERT_PROFILE:-samsungtv}"
APP_ID="SmTvPro001.ProLauncher"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BUILD="$ROOT/build"

for bin in tizen sdb; do
  command -v "$bin" >/dev/null || { echo "✗ الأداة '$bin' غير موجودة. ثبّت Tizen Studio وأضف tools/ و tools/ide/bin إلى PATH"; exit 1; }
done

echo "▶ الاتصال بالشاشة $TV_IP ..."
sdb connect "$TV_IP:26101"
DEVICE="$(sdb devices | awk -v ip="$TV_IP" '$1 ~ ip {print $3; exit}')"
[ -n "$DEVICE" ] || { echo "✗ لم يتم العثور على الشاشة. تأكد من تفعيل وضع المطوّر وإدخال IP جهازك فيه"; exit 1; }

echo "▶ تجهيز ملفات البناء ..."
rm -rf "$BUILD" && mkdir -p "$BUILD"
cp -r "$ROOT/app/." "$BUILD/"

echo "▶ التغليف والتوقيع بالملف '$CERT_PROFILE' ..."
tizen package -t wgt -s "$CERT_PROFILE" -- "$BUILD"
WGT="$(ls "$BUILD"/*.wgt | head -n1)"

echo "▶ التثبيت على $DEVICE ..."
tizen install -n "$(basename "$WGT")" -t "$DEVICE" -- "$BUILD"

echo "▶ التشغيل ..."
tizen run -p "$APP_ID" -t "$DEVICE"
echo "✓ تم. يمكنك تثبيته في شريط الشاشة الرئيسية من: الزر Home ← التطبيقات ← Samsung TV Pro ← إضافة إلى الرئيسية"
