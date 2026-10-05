"""Build and publish an accepted UI revision with a fresh, sanitized DB feed.

Run from a clean detached worktree of the visually accepted commit. Snapshot
bytes stay outside Git. Use the existing authenticated Wrangler environment.
"""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess
from check_public_benefits import validate

ROOT=Path(__file__).resolve().parents[1]
def run(args):
    return subprocess.run(args,cwd=ROOT,check=True,capture_output=True,text=True).stdout.strip()

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--snapshot',type=Path,required=True)
    ap.add_argument('--accepted-commit',required=True)
    ap.add_argument('--build-only',action='store_true')
    args=ap.parse_args()
    if len(args.accepted_commit)!=40 or any(c not in '0123456789abcdef' for c in args.accepted_commit):
        ap.error('accepted commit must be a full SHA')
    if run(['git','rev-parse','HEAD'])!=args.accepted_commit:
        ap.error('worktree must match the visually accepted revision')
    if run(['git','status','--porcelain','--untracked-files=normal']):
        ap.error('worktree must be clean before building')
    # Read once, validate and use an immutable copy to avoid a concurrent export.
    body=args.snapshot.read_bytes();data=json.loads(body);count=validate(data,require_live=True)
    import tempfile
    with tempfile.TemporaryDirectory(prefix='public-benefits-') as temp:
        staged=Path(temp)/'decision-data.json';staged.write_bytes(body)
        run(['python3','scripts/check_site.py'])
        run(['python3','scripts/build_cloudflare.py','--snapshot',str(staged)])
    assert (ROOT/'dist/decision-data.json').read_bytes()==body
    if not args.build_only:
        run(['npx','--no-install','wrangler','deploy'])
        from urllib.request import Request,urlopen
        request=Request('https://travel.tokuerabi.com/decision-data.json',headers={'Cache-Control':'no-cache','User-Agent':'PublicBenefitPublisher/1.0'})
        with urlopen(request,timeout=30) as response:published=response.read()
        if hashlib.sha256(published).digest()!=hashlib.sha256(body).digest():
            raise RuntimeError('public snapshot readback does not match the published data')
    print(json.dumps({'published':not args.build_only,'commit':args.accepted_commit,'records':count,'as_of':data['as_of']}))

if __name__=='__main__':main()
