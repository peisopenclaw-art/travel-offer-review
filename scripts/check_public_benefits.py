"""Validate the explicit public snapshot before deployment; never accept a DB dump."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
from urllib.parse import urlparse

FACTS = {'product_type','applicable_product_types','travel_start_date','travel_end_date','booking_start_at','booking_end_at',
         'distribution_start_at','distribution_end_at','offer_lifecycle_status','availability_status','last_verified_at',
         'minimum_spend','members_only','variant_name','condition_groups','conditions'}
def validate(data, *, require_live=False):
    assert data['schema_version']=='public-offer-v2'
    assert data['data_origin']=='postgresql-public-snapshot'
    assert data['rule_version']=='benefit-rules-v2.1'
    assert isinstance(data['offers'],list)
    ids=[]
    for offer in data['offers']:
        assert offer.get('sample') is False
        assert set(offer['eligibility_facts']) <= FACTS
        assert isinstance(offer['eligibility_facts']['conditions'],list)
        for c in offer['eligibility_facts']['conditions']:
            assert set(c)<={'condition_group_id','condition_type','operator','value_json','note'}
        for group in offer['eligibility_facts']['condition_groups']:
            assert set(group)<={'id','match_mode'}
        for link in (offer['source']['official_url'],offer['booking']['provider_url']):
            if link:
                u=urlparse(link);assert u.scheme=='https' and u.hostname and not u.username and not u.password
        if offer['benefit']['kind'] in {'points','cashback'}:
            assert offer['benefit']['rate_percent'] is None
            assert offer['benefit']['discount_amount'] is None
        ids.append(offer['id'])
    assert len(ids)==len(set(ids))
    encoded=json.dumps(data,ensure_ascii=False).lower()
    for forbidden in ('raw_payload','password=', 'postgresql://', '"dsn"', '"token"','"cookie"','"access_key"'):
        assert forbidden not in encoded
    if require_live:
        assert data['offers'], 'live snapshot must contain formal offers'
        stamp=datetime.fromisoformat(data['as_of'].replace('Z','+00:00'))
        assert stamp.tzinfo is not None
        age=(datetime.now(timezone.utc)-stamp).total_seconds()
        assert 0<=age<=3600, 'snapshot must be generated within one hour'
        assert len(data['offers'])==data['record_count']
        assert not data.get('highlights'), 'unverified highlights must not enter live data'
    return len(ids)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--snapshot',type=Path,default=Path(__file__).parents[1]/'decision-data.json');ap.add_argument('--require-live',action='store_true')
    args=ap.parse_args();n=validate(json.loads(args.snapshot.read_text()),require_live=args.require_live)
    print(f'public benefit contract: PASS ({n} records)')

if __name__=='__main__':main()
