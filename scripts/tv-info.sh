#!/usr/bin/env bash
# يعرض معلومات الشاشة المطلوبة لإنشاء شهادة Samsung (DUID) وإصدار Tizen.
# الاستخدام: ./scripts/tv-info.sh 192.168.1.50
set -euo pipefail

TV_IP="${1:?اكتب عنوان IP للشاشة، مثال: ./scripts/tv-info.sh 192.168.1.50}"
command -v sdb >/dev/null || { echo "✗ الأداة sdb غير موجودة. ثبّت Tizen Studio وأضف tools/ إلى PATH"; exit 1; }

sdb connect "$TV_IP:26101" >/dev/null
SERIAL="$TV_IP:26101"

echo "DUID          : $(sdb -s "$SERIAL" shell 0 getduid 2>/dev/null | tr -d '\r' || echo 'غير متاح')"
echo "اسم الجهاز     : $(sdb devices | awk -v ip="$TV_IP" '$1 ~ ip {print $3; exit}')"
sdb -s "$SERIAL" capability 2>/dev/null | tr -d '\r' | grep -E '^(platform_version|profile_name|cpu_arch):' || true
echo
echo "انسخ قيمة DUID والصقها في Certificate Manager عند إنشاء Distributor Certificate."
