"""
Minimal plot helper for RobotLogBot.

Usage:
  python scripts/plot_series.py --csv path/to/data.csv --x _time --y BatteryVoltage --out data/plots/.../voltage.png --title "Battery"

CSV/Parquet from ClaudeScope:
  ClaudeScope query "table _time BatteryVoltage | head 5000" --format parquet --out series.parquet
  ClaudeScope query "..." --format csv --out series.csv
"""

from __future__ import annotations

import argparse
from pathlib import Path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", help="Input CSV path")
    parser.add_argument("--parquet", help="Input Parquet path")
    parser.add_argument("--x", default="_time", help="X column (default _time, converted µs→s if numeric)")
    parser.add_argument("--y", required=True, help="Comma-separated Y columns")
    parser.add_argument("--out", required=True, help="Output PNG path")
    parser.add_argument("--title", default="")
    parser.add_argument("--xlabel", default="time (s)")
    parser.add_argument("--ylabel", default="")
    args = parser.parse_args()

    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    import pandas as pd

    if args.parquet:
        df = pd.read_parquet(args.parquet)
    elif args.csv:
        df = pd.read_csv(args.csv)
    else:
        raise SystemExit("Pass --csv or --parquet")

    ys = [col.strip() for col in args.y.split(",") if col.strip()]
    missing = [col for col in [args.x, *ys] if col not in df.columns]
    if missing:
        raise SystemExit(f"Missing columns {missing}. Have: {list(df.columns)}")

    x = df[args.x]
    if pd.api.types.is_numeric_dtype(x) and x.max() > 1e6:
        x = x / 1e6  # ClaudeScope timestamps are µs

    fig, ax = plt.subplots(figsize=(10, 4), dpi=140)
    for col in ys:
        ax.plot(x, df[col], label=col, linewidth=1.2)
    ax.set_xlabel(args.xlabel)
    ax.set_ylabel(args.ylabel or (", ".join(ys) if len(ys) == 1 else "value"))
    if args.title:
        ax.set_title(args.title)
    if len(ys) > 1:
        ax.legend(loc="best", fontsize=8)
    ax.grid(True, alpha=0.3)
    fig.tight_layout()

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(out)
    plt.close(fig)
    print(out.resolve())


if __name__ == "__main__":
    main()
