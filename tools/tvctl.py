#!/usr/bin/env python3
"""tvctl — التحكم بشاشة سامسونج (Tizen) من سطر الأوامر، بدون أي مكتبات خارجية.

مساران للاتصال:
  local  : عبر الشبكة المنزلية (WebSocket على المنفذ 8002). يجب تشغيله من جهاز على نفس شبكة الشاشة.
  cloud  : عبر SmartThings API — يعمل من أي مكان (ومنه جلسات Claude السحابية).

أمثلة:
  tvctl.py setup --ip 192.168.1.50        # ربط محلي (اضغط "سماح" على الشاشة)
  tvctl.py cloud-devices                  # عرض أجهزة SmartThings واختيار الشاشة
  tvctl.py setup --st-device <deviceId>   # ربط سحابي
  tvctl.py status
  tvctl.py key home down down ok
  tvctl.py apps
  tvctl.py launch YouTube
  tvctl.py volume 15
  tvctl.py power on|off
"""
import argparse, base64, json, os, socket, ssl, struct, sys, time, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONFIG = os.environ.get("TVCTL_CONFIG", os.path.join(ROOT, ".tv", "config.json"))
CLIENT_NAME = "SamsungTVPro"
ST_API = "https://api.smartthings.com/v1"

# أسماء مختصرة -> أكواد مفاتيح سامسونج المحلية / مفاتيح SmartThings
KEYS = {
    "up": ("KEY_UP", "UP"), "down": ("KEY_DOWN", "DOWN"), "left": ("KEY_LEFT", "LEFT"),
    "right": ("KEY_RIGHT", "RIGHT"), "ok": ("KEY_ENTER", "OK"), "enter": ("KEY_ENTER", "OK"),
    "back": ("KEY_RETURN", "BACK"), "home": ("KEY_HOME", "HOME"), "menu": ("KEY_MENU", "MENU"),
    "source": ("KEY_SOURCE", None), "volup": ("KEY_VOLUP", None), "voldown": ("KEY_VOLDOWN", None),
    "mute": ("KEY_MUTE", None), "power": ("KEY_POWER", None), "info": ("KEY_INFO", None),
    "play": ("KEY_PLAY", None), "pause": ("KEY_PAUSE", None), "stop": ("KEY_STOP", None),
    "red": ("KEY_RED", None), "green": ("KEY_GREEN", None), "yellow": ("KEY_YELLOW", None),
    "blue": ("KEY_CYAN", None), "exit": ("KEY_EXIT", None),
    **{str(d): ("KEY_%d" % d, None) for d in range(10)},
}


def die(msg, code=1):
    print("✗ " + msg, file=sys.stderr)
    sys.exit(code)


def load_cfg():
    try:
        with open(CONFIG) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def save_cfg(cfg):
    os.makedirs(os.path.dirname(CONFIG), exist_ok=True)
    with open(CONFIG, "w") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
    os.chmod(CONFIG, 0o600)


# ───────────────────────── WebSocket مبسّط (stdlib فقط) ─────────────────────────
class MiniWS:
    def __init__(self, url, timeout=10):
        assert url.startswith("wss://")
        hostport, _, path = url[6:].partition("/")
        host, _, port = hostport.partition(":")
        # الشاشة تستخدم شهادة ذاتية التوقيع على الشبكة المحلية؛ لا يمكن التحقق منها.
        ctx = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        raw = socket.create_connection((host, int(port or 443)), timeout=timeout)
        self.s = ctx.wrap_socket(raw, server_hostname=host)
        key = base64.b64encode(os.urandom(16)).decode()
        self.s.sendall((
            "GET /%s HTTP/1.1\r\nHost: %s\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
            "Sec-WebSocket-Key: %s\r\nSec-WebSocket-Version: 13\r\n\r\n" % (path, hostport, key)
        ).encode())
        head = b""
        while b"\r\n\r\n" not in head:
            chunk = self.s.recv(1024)
            if not chunk:
                raise ConnectionError("أغلقت الشاشة الاتصال أثناء المصافحة")
            head += chunk
        status = head.split(b"\r\n", 1)[0]
        if b" 101 " not in status:
            raise ConnectionError("رفض الاتصال: " + status.decode(errors="replace"))
        self.buf = head.split(b"\r\n\r\n", 1)[1]

    def _read(self, n):
        while len(self.buf) < n:
            chunk = self.s.recv(4096)
            if not chunk:
                raise ConnectionError("انقطع الاتصال")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def send(self, obj):
        data = json.dumps(obj).encode()
        n = len(data)
        hdr = bytes([0x81])
        if n < 126:
            hdr += bytes([0x80 | n])
        elif n < 65536:
            hdr += bytes([0x80 | 126]) + struct.pack(">H", n)
        else:
            hdr += bytes([0x80 | 127]) + struct.pack(">Q", n)
        mask = os.urandom(4)
        self.s.sendall(hdr + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def recv(self):
        while True:
            b1, b2 = self._read(2)
            op, n = b1 & 0x0F, b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read(8))[0]
            mask = self._read(4) if b2 & 0x80 else None
            payload = self._read(n)
            if mask:
                payload = bytes(b ^ mask[i % 4] for i, b in enumerate(payload))
            if op == 0x8:
                raise ConnectionError("أغلقت الشاشة الاتصال (قد يكون الطلب مرفوضاً على الشاشة)")
            if op == 0x9:  # ping
                continue
            if op in (0x1, 0x2):
                return json.loads(payload.decode("utf-8", "replace"))

    def close(self):
        try:
            self.s.close()
        except OSError:
            pass


# ───────────────────────────── المسار المحلي ─────────────────────────────
class Local:
    def __init__(self, cfg):
        self.cfg = cfg
        self.ip = cfg["ip"]
        self.ws = None

    def info(self):
        with urllib.request.urlopen("http://%s:8001/api/v2/" % self.ip, timeout=5) as r:
            return json.load(r)

    def connect(self, timeout=30):
        name = base64.b64encode(CLIENT_NAME.encode()).decode()
        url = "wss://%s:8002/api/v2/channels/samsung.remote.control?name=%s" % (self.ip, name)
        if self.cfg.get("token"):
            url += "&token=" + self.cfg["token"]
        self.ws = MiniWS(url, timeout=timeout)
        msg = self.ws.recv()
        if msg.get("event") == "ms.channel.unauthorized":
            die("الشاشة رفضت الاتصال. افتح الإعدادات ← عام ← مدير الأجهزة الخارجية ← قائمة الأجهزة واسمح لـ %s" % CLIENT_NAME)
        token = (msg.get("data") or {}).get("token")
        if token and token != self.cfg.get("token"):
            self.cfg["token"] = token
            save_cfg(self.cfg)
        self.ws.s.settimeout(10)

    def _ensure(self):
        if not self.ws:
            self.connect()

    def key(self, name):
        self._ensure()
        code = KEYS.get(name.lower(), (name if name.upper().startswith("KEY_") else "KEY_" + name.upper(), None))[0]
        self.ws.send({"method": "ms.remote.control", "params": {
            "Cmd": "Click", "DataOfCmd": code, "Option": "false", "TypeOfRemote": "SendRemoteKey"}})

    def apps(self):
        self._ensure()
        self.ws.send({"method": "ms.channel.emit", "params": {"event": "ed.installedApp.get", "to": "host"}})
        deadline = time.time() + 10
        while time.time() < deadline:
            msg = self.ws.recv()
            if msg.get("event") == "ed.installedApp.get":
                return [{"id": a.get("appId"), "name": a.get("name")} for a in msg["data"]["data"]]
        die("لم ترد الشاشة بقائمة التطبيقات")

    def launch(self, app_id, meta=None):
        self._ensure()
        data = {"appId": app_id, "action_type": "NATIVE_LAUNCH" if meta is None else "DEEP_LINK"}
        if meta:
            data["metaTag"] = meta
        self.ws.send({"method": "ms.channel.emit", "params": {"event": "ed.apps.launch", "to": "host", "data": data}})

    def power(self, state):
        if state == "off":
            self.key("power")
        else:
            mac = self.cfg.get("mac")
            if not mac:
                die("لا يوجد عنوان MAC محفوظ. شغّل setup --ip مرة أخرى والشاشة تعمل")
            wake_on_lan(mac)
            print("أُرسلت حزمة Wake-on-LAN. تتطلب تفعيل: الإعدادات ← عام ← الشبكة ← خبير ← التشغيل بالجوّال")

    def volume(self, value):
        steps = {"up": ["volup"], "down": ["voldown"], "mute": ["mute"]}.get(value)
        if steps is None:
            die("المسار المحلي يدعم volume up|down|mute فقط؛ لتحديد رقم استخدم المسار السحابي")
        for k in steps:
            self.key(k)

    def status(self):
        d = self.info().get("device", {})
        return {"backend": "local", "name": d.get("name"), "model": d.get("modelName"),
                "power": d.get("PowerState", "on"), "os": d.get("OS"), "firmware": d.get("firmwareVersion"),
                "ip": d.get("ip"), "mac": d.get("wifiMac")}

    def close(self):
        if self.ws:
            self.ws.close()


def wake_on_lan(mac):
    hexmac = mac.replace(":", "").replace("-", "")
    pkt = b"\xff" * 6 + bytes.fromhex(hexmac) * 16
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
    s.sendto(pkt, ("255.255.255.255", 9))
    s.close()


# ───────────────────────────── المسار السحابي ─────────────────────────────
def st_request(method, path, body=None):
    # في جلسات Claude السحابية يحقن الـ proxy التوكن الحقيقي؛ محلياً ضع SMARTTHINGS_TOKEN.
    token = os.environ.get("SMARTTHINGS_TOKEN", "proxy-injected")
    req = urllib.request.Request(ST_API + path, method=method,
                                 data=json.dumps(body).encode() if body is not None else None,
                                 headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:300]
        if e.code == 401:
            die("SmartThings رفض التوكن (401). أنشئ توكن من account.smartthings.com/tokens وضعه في SMARTTHINGS_TOKEN")
        die("SmartThings %s: %s" % (e.code, detail))


class Cloud:
    def __init__(self, cfg):
        self.dev = cfg["st_device"]

    def cmd(self, capability, command, args=None):
        c = {"component": "main", "capability": capability, "command": command}
        if args is not None:
            c["arguments"] = args
        res = st_request("POST", "/devices/%s/commands" % self.dev, {"commands": [c]})
        failed = [r for r in res.get("results", []) if r.get("status") not in ("ACCEPTED", "COMPLETED")]
        if failed:
            die("رفضت الشاشة الأمر %s.%s: %s" % (capability, command, json.dumps(failed, ensure_ascii=False)))
        return res

    def key(self, name):
        st_key = KEYS.get(name.lower(), (None, None))[1]
        if name.lower() in ("volup", "voldown", "mute"):
            return self.volume({"volup": "up", "voldown": "down", "mute": "mute"}[name.lower()])
        if name.lower() == "power":
            return self.power("off")
        if not st_key:
            # SmartThings يقبل أيضاً الأرقام وكثيراً من المفاتيح الأخرى بأسمائها (RED, SOURCE, CHUP, GUIDE...)
            st_key = {"blue": "BLUE", "red": "RED", "green": "GREEN", "yellow": "YELLOW", "source": "SOURCE",
                      "exit": "EXIT", "play": "PLAY", "pause": "PAUSE", "stop": "STOP"}.get(name.lower(), name.upper().replace("KEY_", ""))
        self.cmd("samsungvd.remoteControl", "send", [st_key, "PRESS_AND_RELEASED"])

    def apps(self):
        s = st_request("GET", "/devices/%s/status" % self.dev)
        main = s.get("components", {}).get("main", {})
        sup = main.get("custom.launchapp", {})
        print("ملاحظة: SmartThings لا يعرض قائمة التطبيقات المثبتة. استخدم معرّف التطبيق مباشرة مع launch.", file=sys.stderr)
        return sup

    def launch(self, app_id, meta=None):
        self.cmd("custom.launchapp", "launchApp", [app_id])

    def power(self, state):
        self.cmd("switch", "on" if state == "on" else "off")

    def volume(self, value):
        if value == "up":
            self.cmd("audioVolume", "volumeUp")
        elif value == "down":
            self.cmd("audioVolume", "volumeDown")
        elif value == "mute":
            self.cmd("audioMute", "mute")
        elif value == "unmute":
            self.cmd("audioMute", "unmute")
        else:
            self.cmd("audioVolume", "setVolume", [int(value)])

    def source(self, name):
        self.cmd("samsungvd.mediaInputSource", "setInputSource", [name])

    def status(self):
        s = st_request("GET", "/devices/%s/status" % self.dev)["components"]["main"]
        val = lambda cap, attr: (s.get(cap, {}).get(attr) or {}).get("value")
        return {"backend": "cloud", "power": val("switch", "switch"), "volume": val("audioVolume", "volume"),
                "mute": val("audioMute", "mute"),
                "input": val("samsungvd.mediaInputSource", "inputSource") or val("mediaInputSource", "inputSource"),
                "app": val("tvChannel", "tvChannelName")}

    def close(self):
        pass


# ───────────────────────────── الأوامر ─────────────────────────────
def pick_backend(cfg, force=None):
    want = force or cfg.get("prefer")
    if want == "cloud" or (want is None and "ip" not in cfg):
        if "st_device" not in cfg:
            die("لا يوجد ربط. شغّل: tvctl.py setup --ip <IP> (محلي) أو tvctl.py setup --st-device <ID> (سحابي)")
        return Cloud(cfg)
    if "ip" not in cfg:
        die("لا يوجد IP محفوظ. شغّل: tvctl.py setup --ip <IP>")
    if want is None and "st_device" in cfg:
        # جرّب المحلي أولاً؛ إن لم تكن الشاشة على نفس الشبكة استخدم السحابي
        try:
            socket.create_connection((cfg["ip"], 8001), timeout=2).close()
        except OSError:
            return Cloud(cfg)
    return Local(cfg)


def resolve_app(backend, query):
    if "." in query or query.isdigit() or isinstance(backend, Cloud):
        return query
    q = query.lower()
    for a in backend.apps():
        if (a["name"] or "").lower() == q:
            return a["id"]
    for a in backend.apps():
        if q in (a["name"] or "").lower():
            return a["id"]
    die("لم أجد تطبيقاً باسم '%s'. شغّل: tvctl.py apps" % query)


def main():
    p = argparse.ArgumentParser(prog="tvctl", description="التحكم بشاشة سامسونج")
    p.add_argument("--via", choices=["local", "cloud"], help="فرض مسار اتصال معيّن")
    p.add_argument("--json", action="store_true", help="إخراج JSON")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("setup", help="حفظ إعدادات الربط")
    s.add_argument("--ip")
    s.add_argument("--st-device", help="معرّف الشاشة في SmartThings")
    s.add_argument("--prefer", choices=["local", "cloud", "auto"])
    sub.add_parser("cloud-devices", help="عرض أجهزة SmartThings")
    sub.add_parser("status", help="حالة الشاشة")
    k = sub.add_parser("key", help="إرسال مفاتيح ريموت بالتتابع")
    k.add_argument("keys", nargs="+")
    k.add_argument("--delay", type=float, default=0.4)
    sub.add_parser("apps", help="قائمة التطبيقات المثبتة (محلي)")
    l = sub.add_parser("launch", help="تشغيل تطبيق بالاسم أو المعرّف")
    l.add_argument("app")
    u = sub.add_parser("open-url", help="فتح رابط في متصفح الشاشة (محلي)")
    u.add_argument("url")
    pw = sub.add_parser("power")
    pw.add_argument("state", choices=["on", "off"])
    v = sub.add_parser("volume", help="up | down | mute | unmute | رقم 0-100")
    v.add_argument("value")
    sr = sub.add_parser("source", help="تغيير المصدر (سحابي): HDMI1, HDMI2, dtv ...")
    sr.add_argument("name")
    a = p.parse_args()

    cfg = load_cfg()
    out = lambda obj: print(json.dumps(obj, ensure_ascii=False, indent=None if a.json else 2))

    if a.cmd == "setup":
        if a.ip:
            cfg["ip"] = a.ip
        if a.st_device:
            cfg["st_device"] = a.st_device
        if a.prefer:
            cfg.pop("prefer", None) if a.prefer == "auto" else cfg.__setitem__("prefer", a.prefer)
        save_cfg(cfg)
        if a.ip:
            loc = Local(cfg)
            try:
                info = loc.info()["device"]
            except OSError as e:
                die("لا يمكن الوصول إلى %s:8001 (%s). تأكد أن الشاشة تعمل وعلى نفس الشبكة" % (a.ip, e))
            cfg["mac"] = info.get("wifiMac")
            save_cfg(cfg)
            print("وُجدت الشاشة: %s (%s). وافق على طلب الاتصال الظاهر على الشاشة خلال 30 ثانية..." % (info.get("name"), info.get("modelName")))
            loc.connect(timeout=30)
            loc.close()
            print("✓ تم الربط المحلي وحُفظ التوكن في %s" % CONFIG)
        if a.st_device:
            out(Cloud(cfg).status())
            print("✓ تم الربط السحابي")
        return

    if a.cmd == "cloud-devices":
        items = st_request("GET", "/devices").get("items", [])
        out([{"deviceId": d["deviceId"], "name": d.get("label") or d.get("name"),
              "type": d.get("ocf", {}).get("ocfDeviceType") or d.get("deviceTypeName")} for d in items])
        return

    b = pick_backend(cfg, a.via)
    try:
        if a.cmd == "status":
            out(b.status())
        elif a.cmd == "key":
            for i, key in enumerate(a.keys):
                if i:
                    time.sleep(a.delay)
                b.key(key)
            print("✓ أُرسلت: " + " ".join(a.keys))
        elif a.cmd == "apps":
            out(b.apps())
        elif a.cmd == "launch":
            app_id = resolve_app(b, a.app)
            b.launch(app_id)
            print("✓ تشغيل " + app_id)
        elif a.cmd == "open-url":
            if not isinstance(b, Local):
                die("فتح الروابط متاح عبر المسار المحلي فقط")
            b.launch("org.tizen.browser", meta=a.url)
            print("✓ فتح " + a.url)
        elif a.cmd == "power":
            b.power(a.state)
            print("✓ power " + a.state)
        elif a.cmd == "volume":
            b.volume(a.value)
            print("✓ volume " + a.value)
        elif a.cmd == "source":
            if not isinstance(b, Cloud):
                b.key("source")
                print("المسار المحلي يفتح قائمة المصادر فقط؛ اختر بالأسهم")
            else:
                b.source(a.name)
                print("✓ source " + a.name)
        time.sleep(0.2)  # إعطاء الشاشة وقتاً لاستلام آخر رسالة قبل الإغلاق
    except (OSError, ConnectionError) as e:
        die("فشل الاتصال بالشاشة: %s" % e)
    finally:
        b.close()


if __name__ == "__main__":
    main()
