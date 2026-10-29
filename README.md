# VaultPath

A blockchain investigation workspace for the **Tatum x Walrus Total Recall** hackathon.
VaultPath remembers earlier cases in **Walrus Memory (Mainnet)**, recalls the relevant history
when a new case opens, and compares it with fresh on-chain evidence from **Tatum Sui Mainnet RPC**.

Stack: Next.js 15 (App Router) · TypeScript · Tailwind CSS 3 · Supabase (Postgres) · Vercel.

## Honest status

| Item | Status |
| --- | --- |
| `next build` and TypeScript typecheck | Passed in the build sandbox |
| Access gate (401 without password), not-configured handling, no secrets in client bundle | Checked locally |
| **Walrus Memory Mainnet writes and recall** | Relayer reachability confirmed by the project owner; writes, confirmation and recall still need to be proven (see section 6) |
| Tatum Sui gRPC client | Exercised against a **local mock** gRPC server over TLS (request encoding, `x-api-key` metadata, streaming, error mapping). **NOT yet verified against Tatum itself.** |
| **Tatum Sui Mainnet live check** | **Pending: run it from the deployed app. It only turns green when Tatum answers all four calls.** |
| **Supabase migration** | **NOT yet applied to a real project.** |
| 10 confirmed Mainnet memories | **Not done.** Only you can do this with your own credentials. |

Nothing in the UI reports success unless the real service answered. The Overview page computes the
hackathon proof list from stored data, so it stays "not met" until it is true.

## How it works

1. **Case Memory** writes text to Walrus Memory with `remember()` (`@mysten-incubation/memwal`).
   The relayer replies "accepted" at once and finishes encrypting and uploading in the background.
   VaultPath saves a receipt as `accepted`, and **Confirm pending writes** calls `getRememberStatus()`;
   only a relayer answer of `done` with a `blob_id` turns a receipt into `done` (stored).
2. **Investigations**: opening a case on a Sui address, then **Fetch on-chain evidence** calls
   `LedgerService/GetServiceInfo`, `LedgerService/GetCheckpoint`, `StateService/ListBalances` and `LedgerService/ListTransactions`
   over **gRPC** through `sui-mainnet-grpc.gateway.tatum.io:443`, and stores what came back.
3. **Recall and assess** runs `recall()` for the subject and its top counterparties, then compares the
   recalled text with the counterparties using a transparent rule-based score (see `lib/assess.ts`).
   Each point of the score is listed. It is a heuristic, not a model and not proof.
4. **Save finding to memory** writes the assessment back as a new memory, so the next case can recall it.

## 1. Get the code into GitHub (no local Node.js)

Repository: https://github.com/Chima30/vaultpath

1. Unzip `vaultpath.zip` on your computer (no Node.js needed; it is only files).
2. Open the repository, choose **Add file > Upload files**, and drag the *contents* of the unzipped
   folder into the page (drag the folders `app`, `components`, `lib`, `supabase` and the loose files).
3. Make sure the dotfiles `.gitignore` and `.env.example` arrived (they are hidden on some systems). If not, use
   **Add file > Create new file** and paste them in.
4. Write a commit message and choose **Commit changes** to `main`.

GitHub uploads are limited to 100 files per batch; this project is well under that. Alternative: press `.`
on the repository page to open github.dev (browser VS Code) and drag the files in there.

## 2. Supabase

1. Create a project at https://supabase.com/dashboard.
2. Open **SQL Editor**, paste `supabase/migrations/0001_init.sql`, run it.
3. Copy the project URL and the **service_role** key (Project Settings > API). The service-role key is a
   server secret: put it only in Vercel environment variables.

Access control: row-level security is enabled and forced on every table with **no policies**, and all
privileges are revoked from `anon` and `authenticated`. The browser can never read or write the database;
only server routes using the service-role key can.

## 3. Walrus Memory (Mainnet)

1. Go to https://memory.walrus.xyz/ and create a Walrus Memory account on **Mainnet**; create a
   **delegate key**. Copy the **account ID** and the **delegate private key**.
2. The hosted Mainnet relayer is `https://relayer.memory.walrus.xyz` (the default). The Walrus Foundation
   runs it as a public good without an SLA and it may apply usage limits.
3. Docs: https://docs.wal.app/walrus-memory/ (SDK reference: `/sdk/api-reference`).

Memory text is Seal-encrypted by the relayer pipeline, but the relayer sees plaintext in the default flow, and
namespace names are public onchain. Do not store personal data you cannot share.

## 4. Tatum (Sui Mainnet over gRPC)

1. Create an API key at https://dashboard.tatum.io with Sui Mainnet access.
2. Protocol: **gRPC** (HTTP/2 + TLS) at `sui-mainnet-grpc.gateway.tatum.io:443`. The key is sent as `x-api-key` gRPC metadata.
   Docs: https://docs.tatum.io/reference/sui-grpc
3. Sui JSON-RPC is deprecated and is **not used**. Sending JSON-RPC to the old `sui-mainnet.gateway.tatum.io` host is what produced `HTTP 415`.
4. Methods used (official protos from https://github.com/MystenLabs/sui-apis, compiled into `lib/sui-grpc-descriptor.json`):
   `LedgerService/GetServiceInfo` (confirms the chain is mainnet), `LedgerService/GetCheckpoint`,
   `StateService/ListBalances`, `LedgerService/ListTransactions` (sender OR affected-address filter, newest first).
5. `ListTransactions` is a recent Sui gRPC method. If Tatum's node does not serve it, the live check shows "partly working",
   evidence fetch stores balances only and reports the error. Nothing is invented.
6. The descriptor file was generated with `pbjs -t json --keep-case` (keep-case matters: without it multi-word fields such as `read_mask` are silently dropped).

## 5. Deploy on Vercel (all in the browser)

1. https://vercel.com/new, import `Chima30/vaultpath`. Framework is detected as Next.js.
2. Add the variables from `.env.example` under **Environment Variables** (names only are in the file):

| Variable | Required | Notes |
| --- | --- | --- |
| `VAULTPATH_ACCESS_PASSWORD` | yes | Without it the deployed app refuses all requests (503). Username is `vaultpath`. |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | yes | Server only |
| `MEMWAL_ACCOUNT_ID`, `MEMWAL_DELEGATE_KEY` | yes | From memory.walrus.xyz |
| `MEMWAL_RELAYER_URL` | no | Defaults to the Mainnet relayer |
| `MEMWAL_NAMESPACE` | no | Defaults to `vaultpath` |
| `TATUM_API_KEY` | yes | Server only. Same key as before |
| `TATUM_SUI_GRPC_URL` | no | Defaults to `sui-mainnet-grpc.gateway.tatum.io:443`. Leave unset |
| `TATUM_SUI_RPC_URL` | no | **Obsolete and ignored.** Delete it |

3. Deploy. Never add a `NEXT_PUBLIC_` prefix to any of these.

## 6. Prove the integrations (do these in order)

1. Overview > **Run live check** for Tatum and Walrus. Tatum lists each of its four calls with its own result; green means all four succeeded and the node reported `mainnet`. If one fails, the error shown is the real one.
2. Case Memory > write at least **10** memories. The button **Write 10 synthetic sample memories** is a shortcut
   (clearly labelled synthetic typology notes); mixing in your own real case notes is better.
3. Press **Confirm pending writes** until the vault shows 10 stored. The status endpoint also reports an independent count from the relayer.
4. Demo that history informs a later case:
   1. Open investigation 1 on any active Sui address A; **Fetch on-chain evidence**; pick a counterparty B from the list.
   2. In Case Memory, write: `Case: A review | flagged address: <full 0x address of B> | finding: <your note>`. Confirm it.
   3. Open investigation 2 on an address D that interacts with B (for example a counterparty of B).
      Fetch evidence, then **Recall memory and assess**. The recalled note appears under *Recalled history*
      and the reasoning shows `+3` for the match. Record a screen capture for your submission.
5. Check blob ids against a Walrus aggregator or the Walrus Memory dashboard before claiming anything.

## Known limitations

- One shared password protects the whole app; there are no per-user accounts.
- Recall is semantic. Hex addresses embed poorly, so write the full address in the note; the assessment then matches addresses exactly.
- Tatum's REST Data API does not list Sui for transaction history, so gRPC `ListTransactions` is the only history source here.
- The gRPC channel uses `@grpc/grpc-js` on the Vercel Node.js runtime (HTTP/2 outbound). It is not usable from the Edge runtime.
- `@mysten-incubation/memwal` is a beta SDK; pin and re-test when upgrading.

## Project layout

```
app/                 pages (Overview, Investigations, Case Memory, Settings) and app/api routes
app/api/             health, tatum/status, investigations, memory/{remember,recall,sync,status,receipts}, assessments
components/          UI and client forms (no secrets, no storage)
lib/                 server-only integrations: supabase, memwal, tatum (gRPC), assess, write-memory
lib/sui-grpc-descriptor.json   compiled official Sui protobuf definitions (do not edit by hand)
middleware.ts        access gate
supabase/migrations  SQL schema and row-level security
```
