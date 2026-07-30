# Company Hackathon video setup

This fork supports the company Hackathon Seedance gateway without changing the
default Volcengine Ark behavior.

## Configuration

Configure these values through **Settings -> AI Services -> Video -> Seedance**
or server-side `.env.local`:

```dotenv
SEEDANCE_PROVIDER=custom
SEEDANCE_AUTH_TYPE=api-key
SEEDANCE_BASE_URL=https://maas.devops.xiaohongshu.com/hackson
SEEDANCE_CREATE_PATH=/openai/doubao/contents/generations/tasks
SEEDANCE_POLL_PATH=/openai/qwen/v1/tasks/{taskId}
SEEDANCE_API_KEY=
SEEDANCE_VIDEO_MODEL=Doubao-seedance2.0
```

Never use a `VITE_` prefix for the API key. The settings keystore exposes only a
configured/not-configured boolean to the browser.

## Verified contract

Verified on 2026-07-29 with a real minimal generation:

- Create: `POST /openai/doubao/contents/generations/tasks`
- Authentication: `api-key` header
- Create response: `{ "id": "..." }`
- Poll: `GET /openai/qwen/v1/tasks/{id}`; no GET request body is required
- States observed: `running`, `succeeded`
- Result: `content.video_url`
- The signed result URL downloaded without an additional authentication header
- Smoke output: H.264 video + AAC audio, 1280x720, 24 fps, about five seconds

Reverified on 2026-07-30 after quota renewal: a 5-second 720p request with
audio disabled completed and downloaded as H.264, 1280x720, 24 fps. The
gateway rejected a 2-second 480p smoke request with HTTP 400, so use 5 seconds
at 720p for the smallest known-compatible connectivity test.

The company video gateway is separate from the company Claude endpoint and from
the local compatibility gateway at `127.0.0.1:14556`.

## Agent boundary

OpenChatCut's built-in agent may submit video jobs. External Claude Code/Codex
MCP sessions remain limited to draft-safe project and timeline operations; they
do not receive implicit authority to create quota-consuming generations.

## Connection test behavior

The Hackathon gateway does not expose a known read-only task-list/account probe.
The settings connection test therefore confirms that configuration is stored and
defers real authentication validation to the first generation. It does not create
a video merely to test a key.

## Development-server caveat

Vite restarts when `.env.local` changes. The upstream generation registry is
in-memory, so an in-flight job becomes locally untracked after such a restart.
Finish active generations before changing settings. Durable job persistence is a
separate follow-up; production desktop use does not hot-restart on settings-file
changes in the same way.
