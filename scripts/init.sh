#!/bin/bash

# Exit script as soon as a command fails.
set -o errexit
set -e

npm --prefix "core-contracts" install
npm --prefix "core-contracts" run template:process

yarn --cwd "augur/packages/augur-core"

cd augur/packages/augur-core
pip install -r requirements.txt

yarn --cwd "predicate/packages/augur-core"

cd -
cd predicate/packages/augur-core 
pip install -r requirements.txt
