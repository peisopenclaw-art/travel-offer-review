from datetime import datetime, timezone
import json, os
from urllib.request import urlopen
from check_public_benefits import validate

def main():
    # A scheduled check reads the actual published feed, never repository placeholders.
    url=os.environ.get('PUBLIC_BENEFITS_URL','https://travel.tokuerabi.com/decision-data.json')
    with urlopen(url,timeout=20) as response:data=json.load(response)
    validate(data)
    assert data['offers'], 'published benefits feed is empty'
    stamp=datetime.fromisoformat(data['as_of'].replace('Z','+00:00'))
    age=(datetime.now(timezone.utc)-stamp).total_seconds()
    assert 0<=age<=48*3600, 'published benefits feed needs refresh'
    print(f"published benefit freshness: PASS ({data['record_count']} records)")

if __name__=='__main__':main()
