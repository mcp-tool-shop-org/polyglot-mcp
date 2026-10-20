<!-- Extract of mcp-tool-shop-org/xrpl-lab README.md at 7acc67c: the module rows and track bullets that name XLS spec IDs and DepositAuth/DepositPreauth. -->

| # | Module | Track | Mode | Prerequisites | Produces |
|---|--------|-------|------|---------------|----------|
| 15 | Token Escrow (XLS-85): Locking IOUs, Not Just XRP | payments | testnet | Trust Lines 101: Issued Currencies as Relationships, Escrow 101: Time-Locked XRP | txid, report |
| 21 | Credentials 101 (XLS-70): On-Ledger KYC & Age Attestations | identity | testnet | DID 101: On-Ledger Identity | txid, report |
| 22 | Permissioned Domains & Gated DEX (XLS-80/81): Compliant, Credential-Gated Trading | identity | testnet | Credentials 101 (XLS-70): On-Ledger KYC & Age Attestations | txid, report |
| 23 | Deposit Gate (DepositAuth + DepositPreauth): Credential-Gated Treasury Deposits | identity | testnet | Credentials 101 (XLS-70): On-Ledger KYC & Age Attestations | txid, report |

- **nfts** — NFT game assets: minting, marketplace settlement (XLS-20), dynamic NFTs (XLS-46)
- **tokens** — MPT issuance & distribution (XLS-33), token freeze, clawback (XLS-39)
- **identity** — DID (XLS-40), credentials (XLS-70), permissioned DEX (XLS-80/81), deposit auth
