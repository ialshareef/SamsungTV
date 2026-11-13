# Samsung TV Pro — instructions for Claude

The user owns a Samsung **UA65CU7000UXSA** (Crystal UHD CU7000, 2023, Tizen 7.0, KSU2E platform) and wants
Claude to control it directly. Talk to the user in Arabic.

## Controlling the TV: `tools/tvctl.py` (stdlib only, no install)

Pick the path based on where this session runs:

| Session | Path | How it authenticates |
|---|---|---|
| Cloud session (claude.ai/code) | `--via cloud` (SmartThings) | Proxy injects the token for `api.smartthings.com`. If you get 401, call `request_credential` for host `api.smartthings.com` (bearer). |
| On the user's computer (Desktop app / `claude remote-control`) | local (auto) | Token is saved in `.tv/config.json` after `setup --ip`. |

Config lives in `.tv/config.json` (gitignored — it holds the pairing token; never commit or print it).
In a fresh cloud session it will be missing. The user's TV is SmartThings device
`cf3399d0-5cb6-8cb9-9473-6a2c17d050c6` ("65\" Crystal UHD"), so run:
`python3 tools/tvctl.py setup --st-device cf3399d0-5cb6-8cb9-9473-6a2c17d050c6 --prefer cloud`.
Inputs: `dtv` (TV), `HDMI1` (PlayStation 5), `HDMI3` (PC).

Known quirk: after a cloud command, `status` keeps reporting the old volume for a while even though the TV
changed (confirmed by the user). Trust the command's COMPLETED result, not an immediate `status` read.

```bash
python3 tools/tvctl.py status
python3 tools/tvctl.py key home down down ok        # remote keys, sent in order
python3 tools/tvctl.py launch YouTube               # by name (local) or appId
python3 tools/tvctl.py --json apps                  # installed apps (local only)
python3 tools/tvctl.py volume 15 | up | down | mute
python3 tools/tvctl.py power on | off               # on: cloud, or Wake-on-LAN locally
python3 tools/tvctl.py source HDMI1                 # cloud
python3 tools/tvctl.py open-url https://...         # local only
```

What each path can do:
- **Cloud:** power on/off, volume number, mute, input source, launch by appId, keys up/down/left/right/ok/back/home/menu.
- **Local:** every remote key, list apps, launch by name, open URL, plus installing our app (`scripts/deploy.sh` with Tizen Studio's `sdb`).

Common appIds (Tizen 7): YouTube `111299001912`, Netflix `3201907018807`, Browser `org.tizen.browser`,
Samsung TV Pro (our app) `SmTvPro001.ProLauncher`.

## Safety rules
- Confirm with the user before `power off`, or any action that interrupts what someone may be watching or presenting.
- Run key sequences step by step; the TV gives no visual feedback to Claude. After each step, ask the user what the screen shows, or use `status`.
- Never touch the service/hotel menu (key sequences like `info menu mute power`) — it can damage the TV's settings.

## Project
- `app/` Tizen web launcher (Arabic, RTL, 1080p). Preview by opening `app/index.html` in a browser (keys R/G/Y/B).
- `docs/DEVICE-CU7000.md` device notes; `docs/OPTIMIZATION.md` settings guide; `docs/CLAUDE-CONNECT.md` user guide for connecting Claude.
