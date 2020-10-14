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
pip install -r requirements.txt
cd -

yarn --cwd "predicate/packages/augur-core"
yarn --cwd "predicate" build

cd predicate/packages/augur-core 
pip install -r requirements.txt
cd -

yarn --cwd "augur-sidechain/packages/augur-core"
yarn --cwd "augur-sidechain" build

cd augur-sidechain/packages/augur-core 
pip install -r requirements.txt
cd -

source ~/.bashrc
