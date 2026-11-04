#!/usr/bin/env python3
"""Manual check: repo has at least N GitVerse stars. Never treat API failures as zero stars."""
import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--minimum', type=int, default=3)
    args = parser.parse_args()
    repository = os.environ.get('REPOSITORY', '').strip()
    if len(repository.split('/')) != 2 or not all(repository.split('/')):
        raise ValueError('REPOSITORY must be owner/repo; got %r' % repository)
    owner, name = repository.split('/')
    url = 'https://api.gitverse.ru/repos/{}/{}'.format(urllib.parse.quote(owner, safe=''), urllib.parse.quote(name, safe=''))
    headers = {'Accept': 'application/vnd.gitverse.object+json;version=1', 'User-Agent': 'arena-lab-2026-check'}
    token = os.environ.get('GV_API_TOKEN', '').strip()
    if token:
        headers['Authorization'] = 'Bearer ' + token
    request = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(request, timeout=25) as response:
        data = json.load(response)
    if not isinstance(data, dict):
        raise ValueError('API returned unexpected data type')
    # Common repository API fields. Fail closed rather than silently accepting a wrong field.
    fields = ('stargazers_count', 'stars_count', 'stars')
    present = [(key, data[key]) for key in fields if key in data]
    if not present:
        raise ValueError('API did not return a recognized star count field; available fields: ' + ', '.join(sorted(data)))
    key, count = present[0]
    if type(count) is not int or count < 0:
        raise ValueError('Invalid star count in %s: %r' % (key, count))
    print('[INFO] %s: %s=%d; minimum=%d' % (repository, key, count, args.minimum))
    if count < args.minimum:
        print('[FAIL] Not enough stars: need %d more' % (args.minimum-count))
        return 1
    print('[PASS] Star threshold met')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (ValueError, KeyError, urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
        print('[ERROR] Could not verify GitVerse stars:', exc)
        sys.exit(2)
