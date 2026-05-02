#!/usr/bin/env python3
"""
Delete all ActivityWatch event data up to "now" while preserving buckets.

Enhancements:
- Interactive bucket selection at startup
- Progress bar for deletion across selected buckets
- Fully automated after initial selection
- Multi-threaded deletion for significantly faster execution
"""

import argparse
import sys
from datetime import datetime, timezone
from urllib.parse import quote
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests
from requests.adapters import HTTPAdapter
from tqdm import tqdm


def iso_utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def get_buckets(session, base_url):
    url = f"{base_url}/buckets/"
    r = session.get(url, timeout=30)
    r.raise_for_status()
    data = r.json()

    if isinstance(data, dict):
        return sorted(data.keys())

    raise RuntimeError(f"Unexpected buckets response format: {type(data).__name__}")


def select_buckets_interactively(bucket_ids):
    print("\nAvailable buckets:\n")
    for i, bucket in enumerate(bucket_ids, start=1):
        print(f"  [{i}] {bucket}")

    print("\nSelect buckets to delete from:")
    print("  - Numbers separated by commas (e.g. 1,3,5)")
    print("  - Or type 'all'")

    while True:
        choice = input("\nYour choice: ").strip().lower()

        if choice == "all":
            return bucket_ids

        try:
            indices = [int(x) for x in choice.split(",")]
            selected = [bucket_ids[i - 1] for i in indices]
            return selected
        except (ValueError, IndexError):
            print("Invalid selection. Please try again.")


def get_events_up_to(session, base_url, bucket_id, cutoff):
    bucket_q = quote(bucket_id, safe="")
    url = f"{base_url}/buckets/{bucket_q}/events"
    params = {
        "limit": -1,
        "end": cutoff,
    }
    r = session.get(url, params=params, timeout=120)
    r.raise_for_status()
    data = r.json()

    if not isinstance(data, list):
        raise RuntimeError(
            f"Unexpected events response format for bucket {bucket_id!r}: {type(data).__name__}"
        )
    return data


def delete_event(session, base_url, bucket_id, event_id):
    bucket_q = quote(bucket_id, safe="")
    url = f"{base_url}/buckets/{bucket_q}/events/{event_id}"
    r = session.delete(url, timeout=30)
    r.raise_for_status()


def main():
    parser = argparse.ArgumentParser(
        description="Delete ActivityWatch event data up to now, keeping buckets."
    )
    parser.add_argument(
        "--base-url",
        default="http://localhost:5600/api/0",
        help="Base ActivityWatch API URL",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Show what would be deleted without deleting anything",
    )
    args = parser.parse_args()

    cutoff = iso_utc_now()
    MAX_WORKERS = 20  # Number of concurrent threads

    print(f"[INFO] Cutoff time: {cutoff}")
    print(f"[INFO] API base URL: {args.base_url}")
    if args.dry_run:
        print("[INFO] Dry-run mode enabled")

    session = requests.Session()
    session.headers.update({"Accept": "application/json"})
    
    # Mount an adapter to increase the connection pool size to match our worker threads
    adapter = HTTPAdapter(pool_connections=MAX_WORKERS, pool_maxsize=MAX_WORKERS)
    session.mount("http://", adapter)
    session.mount("https://", adapter)

    try:
        all_buckets = get_buckets(session, args.base_url)
    except Exception as e:
        print(f"[ERROR] Failed to fetch buckets: {e}", file=sys.stderr)
        sys.exit(1)

    if not all_buckets:
        print("[INFO] No buckets found. Nothing to do.")
        return

    selected_buckets = select_buckets_interactively(all_buckets)

    print("\n[INFO] Selected buckets:")
    for b in selected_buckets:
        print(f"  - {b}")

    # Phase 1: collect events
    bucket_events = {}
    total_events = 0

    for bucket_id in selected_buckets:
        try:
            events = get_events_up_to(session, args.base_url, bucket_id, cutoff)
        except Exception as e:
            print(f"[ERROR] Failed to fetch events for {bucket_id}: {e}", file=sys.stderr)
            continue

        events = [e for e in events if isinstance(e, dict) and "id" in e]
        bucket_events[bucket_id] = events
        total_events += len(events)

    print(f"\n[INFO] Total events to delete: {total_events}")

    if args.dry_run or total_events == 0:
        print("[INFO] Dry-run complete. No deletions performed.")
        return

    # Phase 2: multi-threaded deletion
    progress = tqdm(
        total=total_events,
        desc="Deleting events",
        unit="evt",
        mininterval=0.1,  # Faster updates for threading
        smoothing=0.1,
    )

    deleted = 0

    # Helper function to run in the thread pool
    def task(b_id, e_id):
        try:
            delete_event(session, args.base_url, b_id, e_id)
            return True, b_id, e_id, None
        except Exception as err:
            return False, b_id, e_id, err

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = []
        # Submit all tasks to the executor
        for bucket_id, events in bucket_events.items():
            for event in events:
                futures.append(executor.submit(task, bucket_id, event["id"]))
        
        # Process results as they complete to update the progress bar smoothly
        for future in as_completed(futures):
            success, b_id, e_id, error = future.result()
            if success:
                deleted += 1
            else:
                # Use tqdm.write so it doesn't break the progress bar formatting
                tqdm.write(f"[ERROR] Failed to delete event {e_id} in {b_id}: {error}")
            
            progress.update(1)

    progress.close()

    print("\n[SUMMARY]")
    print(f"Successfully deleted: {deleted}")
    print("Buckets were preserved.")
    print("ActivityWatch continues collecting new events normally.")


if __name__ == "__main__":
    main()