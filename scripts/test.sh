#!/bin/bash

# Exit script as soon as a command fails.
set -o errexit
set -e

# Executes cleanup function at script exit.
trap cleanup EXIT
trap cleanup SIGTERM

cleanup() {
  echo "Cleaning up"
  pkill -f ganache-cli
  echo "Done"
}

yarn testrpc:main > /dev/null &
yarn testrpc:bor > /dev/null &

# waiting 5 seconds to give ganache enough time to warm up
echo "Giving 5 seconds for testrpc startup..."
sleep 5

yarn test


