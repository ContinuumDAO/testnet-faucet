## Testnet Token Faucet for ContinuumDAO

# Request Testnet Tokens

Requesting tokens will send your wallet address some varying balances of tokens being used for the testnet.

To accomplish this, run the following in a terminal, swapping out <WALLET_ADDRESS> with your address.

```bash
curl --location --request POST 'https://faucet.continuumdao.org/request-tokens' --header 'Content-Type: application/json' --data-raw '{"walletAddress": "<WALLET_ADDRESS>"}'
```
