# Prediction Markets Plasma App

### Setup
```
yarn

git clone git@github.com:atvanguard/augur.git
mv augur predicate

git clone git@github.com:AugurProject/augur.git
```

### Start Main chain
```
docker run -it -d -p 8545:8545 -p 8546:8546 augurproject/dev-node-geth:latest
```

or
```
ganache-cli --account '0xfae42052f82bed612a724fec3632f325f377120592c75bb78adfcceae6470c5a,1000000000000000000000000' --account '0x48c5da6dff330a9829d843ea90c2629e8134635a294c7e62ad4466eb2ae03712,1000000000000000000000000' --gasLimit 10000000 --gasPrice 0
```

<!-- ### Start Child chain -->

### Deploy Main Augur Contracts
```
cd augur/packages/augur-core

# not sure if the following is required
source venv/bin/activate

node -r ts-node/register source/deployment/compileContracts.ts
yarn deploy:local > ../../../output/deploy.main

# Back in project home directory
node utils/addressClipper.js deploy.main addresses.main.json
```

### Deploy Predicate Contracts
```
cd predicate/packages/augur-core

# not sure if the following is required
source venv/bin/activate

node -r ts-node/register source/deployment/compileContracts.ts
yarn deploy:local > ../../../output/deploy.predicate

# Back in project home directory
node utils/addressClipper.js deploy.predicate addresses.predicate.json
```

### Run Script
```
node scripts/zeroXTrade.js
node scripts/predicateTrade.js
```
