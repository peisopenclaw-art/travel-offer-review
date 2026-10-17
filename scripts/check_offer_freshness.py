from datetime import datetime, timezone
import json, os
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from check_public_benefits import validate


def main():
    # Use the same readback request contract as the production publisher.
    # A 403 is an access/publishing gate, not evidence that the offers are stale.
    url = os.environ.get('PUBLIC_BENEFITS_URL', 'https://travel.tokuerabi.com/decision-data.json')
    request = Request(url, headers={
        'Cache-Control': 'no-cache',
        'User-Agent': 'PublicBenefitPublisher/1.0',
    })
    try:
        with urlopen(request, timeout=20) as response:
            data = json.load(response)
    except HTTPError as error:
        # Only non-secret routing hints; do not log response bodies or cookies.
        server = error.headers.get('Server', 'unknown')[:80]
        mitigated = error.headers.get('cf-mitigated', 'unknown')[:80]
        ray_id = error.headers.get('cf-ray', 'unknown')[:80]
        raise RuntimeError(
            f'published feed HTTP {error.code}; server={server}; '
            f'cf-mitigated={mitigated}; cf-ray={ray_id}; '
            'check Cloudflare security events and publish readback'
        ) from error

    validate(data)
    assert data['offers'], 'published benefits feed is empty'
    stamp = datetime.fromisoformat(data['as_of'].replace('Z', '+00:00'))
    age = (datetime.now(timezone.utc) - stamp).total_seconds()
    assert 0 <= age <= 48 * 3600, 'published benefits feed needs refresh'
    print(f"published benefit freshness: PASS ({data['record_count']} records)")


if __name__ == '__main__':
    main()
