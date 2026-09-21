# Repository rules

- GitHub `main` is the code source of truth for this static review site.
- Use task branches; do not work directly on `main`.
- Run `python3 scripts/check_site.py` before merge.
- GitHub Actions must pass before merging.
- This repository is intentionally public. Never commit secrets, tokens, cookies, private keys, runtime DBs, logs, production snapshots, or personal data.
- This repository hosts only the secret-free static affiliate-review media. The dynamic travel runtime and PostgreSQL production system are separate.
- Runtime changes for the dynamic travel system must not be made from this repository.
