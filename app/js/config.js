/* إعدادات المستخدم — عدّل هنا ثم أعد التثبيت على الشاشة (./scripts/deploy.sh <TV_IP>) */
// أخبار Google News بالعربية لآخر يومين عن أي كلمة بحث
function gnews(q) {
  return 'https://news.google.com/rss/search?q=' + encodeURIComponent(q) + '+when:2d&hl=ar&gl=SA&ceid=SA:ar';
}

window.STV_CONFIG = {
  // المدينة: تُستخدم لمواقيت الصلاة والطقس
  city: 'الرياض',
  lat: 24.7136,
  lng: 46.6753,
  tz: 3,                // فرق التوقيت عن UTC (السعودية = 3)

  // مصادر الأخبار (RSS). name يظهر كشارة بجانب الخبر.
  feeds: [
    { name: 'الهلال', url: gnews('نادي الهلال') },
    { name: 'النصر', url: gnews('نادي النصر') },
    { name: 'برشلونة', url: gnews('برشلونة') },
    { name: 'ريال مدريد', url: gnews('ريال مدريد') }
  ],

  // الفرق للمباريات القادمة (معرّفات TheSportsDB)
  teams: [
    { name: 'الهلال', id: 136013 },
    { name: 'النصر', id: 136022 },
    { name: 'برشلونة', id: 133739 },
    { name: 'ريال مدريد', id: 133738 }
  ],

  // خلفية الواجهة: ضع صورة في app/img/ واكتب مسارها، مثل 'img/wallpaper.jpg'، أو رابط صورة.
  // اتركها فارغة لأفضل أداء على CU7000.
  wallpaper: ''
};
