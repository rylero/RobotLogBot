# FRC log analysis notes

## Epistemics
- Report **measured facts** first (field, value, time range). Hypotheses are labeled and ranked, never presented as proven.
- Temporal overlap ≠ causation. Low battery and CAN/device faults can occur at the same time; they are not necessarly related.
- Prefer “consistent with” / “possible causes” over “caused.” Only claim a causal chain if the log shows a mechanism

## Power / brownouts
- Battery voltage sag under load is normal; healthy packs still dip on hard acceleration. Repeated sub-~7 V or long stays under ~9–10 V under moderate load is concerning.
- PDP/PDH total current and per-channel currents matter. Peak current alone does not prove a bad battery — check duration, voltage at that current, and whether it happened in every match or one pack.
- RoboRIO brownout and “battery looked bad in AdvantageScope” are related but not identical. Check DS/PDH brownout / sticky fault fields when present.

## Drive / CAN / modules
- Module “disconnected,” sticky faults, or missing updates can come from: bus voltage collapse, bad CAN wiring/termination, connector intermittents, device reboot, firmware fault latch, or logging gaps. Do not default to brownout→CAN.
- Commanded voltage/output with near-zero measured velocity can mean stalled, disconnected, current-limited, or brake/coast behavior — check current, sticky faults, and supply voltage together.

## AdvantageKit habits
- Prefer `/RealOutputs/...` and `/RobotState/...` over raw IO when both exist.
- Match phases: find enabled / auto / teleop bool ranges before blaming “the whole log.”
- Timestamps are µs from log start; convert to seconds for humans (~÷1e6).

## Response defaults
- Lead with 2–4 bullets of facts, then optional “hypotheses to check,” then optional next measurements — not a long narrative diagnosis unless asked.
