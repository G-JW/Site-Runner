"""Site Runner — a single-file Chromium automation prototype.

Install: python -m pip install -r requirements.txt
         python -m playwright install chromium
Run:     python site_runner.py [run [site_id] | login | list]

Edit SITES and HANDLERS below to add real websites. The bundled demo is
a local test page, not a real check-in service. Login runs no handlers.
Runtime files are relative to this script, regardless of the working directory.
"""

import argparse
from datetime import datetime
import logging
from pathlib import Path
import re
from urllib.parse import quote

from playwright.sync_api import Error, expect, sync_playwright


BASE_DIR = Path(__file__).resolve().parent
PROFILE_DIR = BASE_DIR / ".runtime" / "browser-profile"
SCREENSHOT_DIR = BASE_DIR / ".runtime" / "screenshots"
DEFAULT_TIMEOUT = 30_000
LOGGER = logging.getLogger("site_runner")

# The click demo works offline and does not use any account or credentials.
DEMO_HTML = """<!doctype html><html lang="zh-CN"><meta charset="utf-8">
<title>Site Runner — Check-in Demo</title>
<h1>Site Runner 签到示例</h1><p>这是本地测试页面，不是真实网站。</p>
<button onclick="this.disabled=true;
document.getElementById('result').textContent='签到成功'">签到</button>
<p id="result" role="status">尚未签到</p></html>"""

# A site with no handler only visits its URL. Explicit runs can select disabled
# sites as well; enabled controls batch execution only.
SITES = {
    "example": {
        "name": "Example (visit only)",
        "url": "https://example.com",
        "enabled": True,
    },
    "checkin_demo": {
        "name": "Local Check-in Demo",
        "url": "data:text/html;charset=utf-8," + quote(DEMO_HTML),
        "enabled": True,
        "handler": "example",
    },
}


def setup_logging():
    logging.basicConfig(level=logging.INFO, format="[%(levelname)s] %(message)s")


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


def save_failure_screenshot(page, site_id):
    """Best effort: a closed page or failed screenshot must not stop the batch."""
    try:
        SCREENSHOT_DIR.mkdir(parents=True, exist_ok=True)
        safe_id = re.sub(r"[^a-zA-Z0-9_-]", "_", site_id) or "site"
        timestamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")
        path = SCREENSHOT_DIR / f"{safe_id}-{timestamp}.png"
        page.screenshot(path=str(path), full_page=True, timeout=DEFAULT_TIMEOUT)
        LOGGER.info("Failure screenshot: %s", path)
    except Exception as error:
        LOGGER.warning("Could not save screenshot for %s: %s", site_id, error)


def checkin_example(page):
    """Example handler: replace the button and success locator for a real site.

    Navigation has already been performed by run_site. Confirm the site's
    success message after clicking so an unsuccessful check-in is not reported
    as completed. Add login/previously-checked-in checks here when needed.
    """
    page.get_by_role("button", name="签到", exact=True).click()
    expect(page.get_by_role("status")).to_have_text("签到成功", timeout=DEFAULT_TIMEOUT)


HANDLERS = {"example": checkin_example}


def run_site(context, site_id, site):
    name = site.get("name", site_id)
    result = {"site": name, "success": False, "message": ""}
    page = None
    LOGGER.info("Running %s", name)
    try:
        page = context.new_page()
        url = site["url"]
        LOGGER.info("Opening %s", "local demo page" if url.startswith("data:") else url)
        response = page.goto(site["url"], wait_until="domcontentloaded")
        if response is not None and response.status >= 400:
            raise RuntimeError(f"HTTP {response.status}")
        handler_name = site.get("handler")
        if handler_name is not None:
            if handler_name not in HANDLERS:
                raise ValueError(f"Unknown handler: {handler_name}")
            HANDLERS[handler_name](page)
        result.update({
            "success": True,
            "message": "check-in completed" if handler_name else "visit completed",
        })
    except Exception as error:
        result["message"] = str(error) or type(error).__name__
        LOGGER.error("%s failed: %s", name, result["message"])
        if page is not None:
            save_failure_screenshot(page, site_id)
    finally:
        if page is not None:
            try:
                page.close()
            except Exception as error:
                LOGGER.warning("Could not close page for %s: %s", name, error)
    if result["success"]:
        LOGGER.info("%s completed (%s)", name, result["message"])
    return result


def run_all(context):
    return [run_site(context, site_id, site)
            for site_id, site in SITES.items() if site.get("enabled") is True]


def print_summary(results):
    success = sum(result["success"] for result in results)
    print("\n" + "=" * 32)
    print("Site Runner Result")
    print("=" * 32)
    for result in results:
        mark = "✓" if result["success"] else "✗"
        print(f"{mark} {result['site']}")
    print("-" * 32)
    print(f"Success: {success}\nFailed: {len(results) - success}\nTotal: {len(results)}")
    print("=" * 32)


def list_sites():
    width = max([len("ID")] + [len(site_id) for site_id in SITES])
    print(f"{'ID':<{width}}  {'Enabled':<7}  Name")
    for site_id, site in SITES.items():
        enabled = "yes" if site.get("enabled") is True else "no"
        print(f"{site_id:<{width}}  {enabled:<7}  {site['name']}")


def parse_args(argv=None):
    parser = argparse.ArgumentParser(description="Site Runner")
    commands = parser.add_subparsers(dest="command")
    run = commands.add_parser("run", help="Run all enabled sites or one site")
    run.add_argument("site_id", nargs="?")
    commands.add_parser("login", help="Open Chromium for manual login")
    commands.add_parser("list", help="List configured sites")
    args = parser.parse_args(argv)
    if args.command is None:
        args.command = "run"
        args.site_id = None
    return args


def main(argv=None):
    args = parse_args(argv)
    setup_logging()
    if args.command == "list":
        list_sites()
        return 0
    if args.command == "run" and args.site_id is not None and args.site_id not in SITES:
        print(f"Unknown site: {args.site_id}")
        return 1
    if args.command == "run" and args.site_id is None:
        if not any(site.get("enabled") is True for site in SITES.values()):
            LOGGER.info("No enabled sites")
            print_summary([])
            return 0
    LOGGER.info("Starting Site Runner")
    results = None
    try:
        with sync_playwright() as playwright:
            context = open_context(playwright)
            try:
                if args.command == "login":
                    login_mode(context)
                else:
                    results = ([run_site(context, args.site_id, SITES[args.site_id])]
                               if args.site_id is not None else run_all(context))
            finally:
                close_context(context)
    except KeyboardInterrupt:
        LOGGER.info("Interrupted; browser closed")
        return 130
    except Exception as error:
        LOGGER.error("Browser error: %s", error)
        LOGGER.info("For missing Chromium, run: python -m playwright install chromium")
        return 1
    finally:
        if results is not None:
            print_summary(results)
    if results is not None and any(not result["success"] for result in results):
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
