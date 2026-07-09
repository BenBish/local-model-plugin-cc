---
name: clear-ports
description: Stop local development processes and clear occupied ports. Use when the user asks to free ports, kill dev servers, stop related processes, fix EADDRINUSE/address already in use errors, clear stale Vite/Next/Bun/Node servers, or reset local port state before running an app.
---

# Clear Ports

Stop local processes that are occupying development ports, then verify the ports are free.

## Workflow

1. Identify the target ports before killing anything.
   - Use ports the user named, ports shown in errors such as `EADDRINUSE`, or ports documented in `AGENTS.md`, `README.md`, package scripts, Docker Compose, or dev-server output.
   - If no port is discoverable, ask the user which ports to clear instead of guessing.

2. Inspect current listeners.
   - Prefer `lsof -nP -iTCP:<port> -sTCP:LISTEN` when available.
   - Use `ss -ltnp` or `netstat -ltnp` only as fallbacks.
   - Note commands and PIDs that look related to the project, such as `bun`, `node`, `vite`, `next`, `tsx`, `webpack`, `turbo`, `wrangler`, `rails`, `python`, or local Docker proxies.

3. Run the bundled script from the repo root.
   - Preview first:

     ```bash
     .agents/skills/clear-ports/scripts/clear-ports.sh --dry-run 3000 5173
     ```

   - Stop listeners and child processes:

     ```bash
     .agents/skills/clear-ports/scripts/clear-ports.sh 3000 5173
     ```

   - Include explicit orphan command substrings only when the user asked to stop related dev processes or the process tree shows orphaned runners:

     ```bash
     .agents/skills/clear-ports/scripts/clear-ports.sh --include-pattern vite --include-pattern "bun run dev" 3000 5173
     ```

4. Verify after stopping.
   - Re-run `lsof -nP -iTCP:<port> -sTCP:LISTEN` for each target port.
   - Report ports as clear only when no listener remains.
   - If a process survives graceful termination, rerun the script with `--force` for the same ports and explain which PID required it.

## Safety Rules

- Do not kill processes without a port, PID, or explicit user-approved command substring.
- Do not use broad commands such as `killall node`, `pkill node`, `pkill -f dev`, or `fuser -k` without first showing the exact targets.
- Treat system services, database servers, Docker Desktop, browsers, editors, terminals, and unrelated app servers as out of scope unless the user explicitly includes them.
- If a target process is outside the current repo and the command does not clearly match the requested app, ask before killing it.
- When sandbox approval is required for process termination, request escalation for the exact script command after the dry-run.

## Output

Use this format unless the user asks for raw command output:

```text
Cleared ports: <ports>
Stopped:
- <pid> <command> on :<port>

Still listening:
- <port>: <pid command or "none">

Notes:
- <approval needed, force kill used, or suspicious unrelated process skipped>
```
