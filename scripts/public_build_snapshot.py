"""Keep automatic production builds from replacing live facts with an empty seed."""
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen

from check_public_benefits import validate

PUBLIC_FEED = 'https://travel.tokuerabi.com/decision-data.json'
MAX_BYTES = 8 * 1024 * 1024

def snapshot_body(root, explicit=None, environ=None, opener=None):
    env = os.environ if environ is None else environ
    production = env.get('WORKERS_CI') == '1' and env.get('WORKERS_CI_BRANCH', 'main') == 'main'
    if explicit is not None:
        body = Path(explicit).read_bytes()
    elif production:
        request = Request(PUBLIC_FEED, headers={'Cache-Control': 'no-cache', 'User-Agent': 'PublicBenefitBuild/1.0'})
        with (opener or urlopen)(request, timeout=30) as response:
            body = response.read(MAX_BYTES + 1)
        if len(body) > MAX_BYTES:
            raise ValueError('public feed exceeds the size limit')
    else:
        body = (Path(root) / 'decision-data.json').read_bytes()
    validate(json.loads(body), require_live=explicit is not None or production)
    return body
