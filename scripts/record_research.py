"""Record Track 2 (independent research) results as test fixtures.

Runs the fixed five-point research checklist from PRD Section 8 against a list of
companies using Tavily search, and saves trimmed results (url, title, short snippet,
date) as JSON fixtures. Evals replay these fixtures so tests are repeatable and free.

Usage:
    python -I scripts/record_research.py evals/fixtures/research/companies_memo.json evals/fixtures/research/real

Reads TAVILY_API_KEY from .env in the repo root. Never stores full pages.
"""
import json
import os
import sys
import time
import urllib.request
import datetime

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

CHECKLIST = [
    ("exists", "{company} {city} {product}"),
    ("founders", "{founders} {company} founder background"),
    ("market", "{product} India competitors market"),
    ("news", "{company} funding news"),
    ("red_flags", "{company} lawsuit OR shutdown OR fraud OR regulator"),
]

SNIPPET_CHARS = 300

# Sites we never use: login-walled or forbidden by their terms (LinkedIn, Instagram,
# Facebook) and sites that sell personal contact data. Same list as PRD Section 8.6.
EXCLUDE_DOMAINS = [
    "linkedin.com",
    "instagram.com",
    "facebook.com",
    "rocketreach.co",
    "zoominfo.com",
    "apollo.io",
    "contactout.com",
    "signalhire.com",
    "leadiq.com",
    "lusha.com",
]


def load_env():
    env = {}
    with open(os.path.join(ROOT, ".env"), encoding="utf-8") as f:
        for line in f:
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.rstrip("\n").split("=", 1)
                env[k.strip()] = v.strip()
    return env


def search(key, query):
    body = json.dumps(
        {"query": query, "max_results": 5, "search_depth": "basic", "exclude_domains": EXCLUDE_DOMAINS}
    ).encode()
    req = urllib.request.Request(
        "https://api.tavily.com/search",
        data=body,
        headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def main(companies_path, out_dir):
    key = load_env()["TAVILY_API_KEY"]
    companies = json.load(open(companies_path, encoding="utf-8"))["companies"]
    os.makedirs(out_dir, exist_ok=True)
    for c in companies:
        record = {
            "company": c["company"],
            "is_real": c["is_real"],
            "recorded": datetime.date.today().isoformat(),
            "warning": "Contains information from after the fund's decision. Use only to test research quality. Never use in the back test.",
            "checks": {},
        }
        for check, template in CHECKLIST:
            query = template.format(**c)
            try:
                res = search(key, query)
                results = [
                    {
                        "url": x.get("url"),
                        "title": x.get("title"),
                        "snippet": (x.get("content") or "")[:SNIPPET_CHARS],
                        "published": x.get("published_date"),
                        "score": x.get("score"),
                    }
                    for x in res.get("results", [])
                ]
                record["checks"][check] = {"query": query, "results": results}
            except Exception as e:  # recorded as a failure, never silently skipped
                record["checks"][check] = {"query": query, "error": str(e), "results": []}
            time.sleep(0.3)
        name = c["company"].lower().replace(" ", "_")
        with open(os.path.join(out_dir, name + ".json"), "w", encoding="utf-8") as f:
            json.dump(record, f, indent=2, ensure_ascii=False)
        n = sum(len(v["results"]) for v in record["checks"].values())
        print(f"{c['company']}: {n} results saved")


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
