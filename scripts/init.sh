#!/bin/bash

# Exit script as soon as a command fails.
set -o errexit
set -e

yarn

npm --prefix "core-contracts" install
npm --prefix "core-contracts" run template:process

yarn --cwd "augur/packages/augur-core"
yarn --cwd "augur" build

cd augur/packages/augur-core
source venv/bin/activate
pip install -r requirements.txt

yarn --cwd "predicate/packages/augur-core"
yarn --cwd "predicate" build

cd -
cd predicate/packages/augur-core 
source venv/bin/activate
pip install -r requirements.txt

source ~/.bashrc
