# Prediction Markets Plasma App

### Setup
```
yarn

git clone git@github.com:atvanguard/augur.git
mv augur predicate

git clone git@github.com:AugurProject/augur.git

cd augur
yarn
# Builds the ts files in sub directories, required for compiling and deploying contracts
yarn build
```

### Start Main chain
```
docker run -it -d -p 8545:8545 -p 8546:8546 augurproject/dev-node-geth:latest
```

or
```
ganache-cli --account '0xfae42052f82bed612a724fec3632f325f377120592c75bb78adfcceae6470c5a,1000000000000000000000000' --account '0x48c5da6dff330a9829d843ea90c2629e8134635a294c7e62ad4466eb2ae03712,1000000000000000000000000' --gasLimit 10000000 --gasPrice 0
```

### Start Child chain
```
ganache-cli --account '0xfae42052f82bed612a724fec3632f325f377120592c75bb78adfcceae6470c5a,1000000000000000000000000' --account '0x48c5da6dff330a9829d843ea90c2629e8134635a294c7e62ad4466eb2ae03712,1000000000000000000000000' --gasLimit 10000000 --gasPrice 0 -p 8547
```

### Deploy  Contracts
```
cd augur/packages/augur-core

# Install dependencies by following instructions from the README in this directory

source venv/bin/activate
node -r ts-node/register source/deployment/compileContracts.ts
```
:one: Main Augur
```
yarn deploy:local > ../../../output/deploy.main

# Back in project home directory
node utils/addressClipper.js deploy.main addresses.main.json
```
:two: Matic Augur
```
yarn deploy:local:matic > ../../../output/deploy.matic

# Back in project home directory
node utils/addressClipper.js deploy.matic addresses.matic.json
```

### Deploy Predicate Contracts
```
cd predicate/packages/augur-core

source venv/bin/activate

node -r ts-node/register source/deployment/compileContracts.ts
yarn deploy:local > ../../../output/deploy.predicate

# Back in project home directory
node utils/addressClipper.js deploy.predicate addresses.predicate.json
```

### Deploy Matic Plasma Contracts
(Only Registry for now)
```
yarn truffle compile
yarn truffle migrate --reset
```

### Run Script
```
node scripts/zeroXTrade.js
node scripts/predicateTrade.js
```
