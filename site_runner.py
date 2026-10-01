"""Site Runner — a single-file Chromium automation prototype.

Install: python -m pip install -r requirements.txt
         python -m playwright install chromium
Run:     python site_runner.py
"""

import argparse
from pathlib import Path

from playwright.sync_api import Error, sync_playwright


BASE_DIR = Path(__file__).resolve().parent
PROFILE_DIR = BASE_DIR / ".runtime" / "browser-profile"
DEFAULT_TIMEOUT = 30_000


def open_context(playwright):
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)
    context = playwright.chromium.launch_persistent_context(
        user_data_dir=str(PROFILE_DIR), headless=False,
    )
    context.set_default_timeout(DEFAULT_TIMEOUT)
    context.set_default_navigation_timeout(DEFAULT_TIMEOUT)
    return context


def login_mode(context):
    """Pump Playwright events until the user closes all browser windows."""
    print("Browser opened.\n\nPlease log in to the required websites manually."
          "\n\nClose the browser when finished.", flush=True)
    if not context.pages:
        context.new_page()
    while context.pages:
        page = context.pages[0]
        try:
            page.wait_for_timeout(250)
        except Error:
            if not page.is_closed():
                raise


def close_context(context):
    try:
        context.close()
    except Error:
        # The user may already have closed Chromium in login mode.
        browser = context.browser
        if browser is not None and browser.is_connected():
            raise


def main():
    parser = argparse.ArgumentParser(description="Site Runner")
    parser.add_argument("command", nargs="?", choices=("run", "login"), default="run")
    args = parser.parse_args()
    with sync_playwright() as playwright:
        context = open_context(playwright)
        try:
            if args.command == "login":
                login_mode(context)
            else:
                page = context.new_page()
                page.goto("https://example.com", wait_until="domcontentloaded")
                print("Site Runner: Example completed")
        finally:
            close_context(context)


if __name__ == "__main__":
    main()
