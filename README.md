# Prediction Markets Plasma App

### Setup

You need system-wide installations of Python 3.6, Node.js 10, [Solidity 0.5.17](https://github.com/ethereum/solidity/releases/tag/v0.5.10), yarn and npm.

```
git submodule update --init --recursive

./scripts/init.sh

cd augur/packages/augur-core
# Install dependencies by following instructions from the README in this directory

cd predicate/packages/augur-core
# Install dependencies by following instructions from the README in this directory
```

### Run test
```
./scripts/test.sh
```

Note: on macOS, you'll need to use [virtualenv](https://python-guide-pt-br.readthedocs.io/en/latest/dev/virtualenvs/) or [homebrew](https://brew.sh/) Python to work around System Integrity Protection. To do this using virtualenv, run:

```bash
python3 -m venv venv
source venv/bin/activate
python3 -m pip install -r requirements.txt
python3 -m pip install pytest
```
