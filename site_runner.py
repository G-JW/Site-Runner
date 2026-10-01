"""Site Runner — a single-file Chromium automation prototype.

Install: python -m pip install -r requirements.txt
         python -m playwright install chromium
Run:     python site_runner.py
"""

from playwright.sync_api import sync_playwright


def main():
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=False)
        try:
            page = browser.new_page()
            page.goto("https://example.com", wait_until="domcontentloaded")
            print("Site Runner: Example completed")
        finally:
            browser.close()


if __name__ == "__main__":
    main()
